import type {
  CommitSummary,
  RepoLanguages,
  RepoMeta,
  RepoTreeEntry,
} from "./types";

const API_ROOT = "https://api.github.com";

export class GitHubError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "GitHubError";
  }
}

interface FetchOptions {
  token?: string;
  signal?: AbortSignal;
}

async function ghFetch<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  const res = await fetch(`${API_ROOT}${path}`, {
    headers,
    signal: options.signal,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) detail = body.message;
    } catch {
      /* ignore */
    }
    throw new GitHubError(detail, res.status);
  }
  return (await res.json()) as T;
}

export interface RepoSlug {
  owner: string;
  name: string;
}

/** Parse a wide variety of repo references into `{owner, name}`. */
export function parseRepoInput(raw: string): RepoSlug | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Try URL form first.
  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && /^[a-zA-Z0-9-_.]+$/.test(parts[0])) {
      return { owner: parts[0], name: parts[1].replace(/\.git$/, "") };
    }
  } catch {
    /* not a URL */
  }

  // Plain `owner/repo` form.
  const m = trimmed.match(/^([a-zA-Z0-9-_.]+)\s*\/\s*([a-zA-Z0-9-_.]+)$/);
  if (m) return { owner: m[1], name: m[2].replace(/\.git$/, "") };

  return null;
}

export interface RepoSearchResult {
  fullName: string;
  owner: string;
  name: string;
  description: string | null;
  stars: number;
  language: string | null;
  isPrivate: boolean;
}

/** Search GitHub repositories by free-text query. */
export async function searchRepos(
  query: string,
  opts: FetchOptions = {},
): Promise<RepoSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const data = await ghFetch<{
    items: Array<{
      full_name: string;
      description: string | null;
      stargazers_count: number;
      language: string | null;
      private: boolean;
      owner: { login: string } | null;
      name: string;
    }>;
  }>(
    `/search/repositories?q=${encodeURIComponent(q)}&per_page=8&sort=stars&order=desc`,
    opts,
  );
  return data.items.map((it) => ({
    fullName: it.full_name,
    owner: it.owner?.login ?? it.full_name.split("/")[0],
    name: it.name,
    description: it.description,
    stars: it.stargazers_count,
    language: it.language,
    isPrivate: it.private,
  }));
}

export interface FullRepoSnapshot {
  meta: RepoMeta;
  tree: RepoTreeEntry[];
  truncated: boolean;
  languages: RepoLanguages;
  commits: CommitSummary[];
}

export async function fetchRepoMeta(
  slug: RepoSlug,
  opts: FetchOptions = {},
): Promise<RepoMeta> {
  const data = await ghFetch<{
    name: string;
    full_name: string;
    description: string | null;
    default_branch: string;
    stargazers_count: number;
    forks_count: number;
    html_url: string;
    size: number;
    owner: { login: string };
  }>(`/repos/${slug.owner}/${slug.name}`, opts);
  return {
    owner: data.owner.login,
    name: data.name,
    fullName: data.full_name,
    description: data.description,
    defaultBranch: data.default_branch,
    stars: data.stargazers_count,
    forks: data.forks_count,
    htmlUrl: data.html_url,
    size: data.size,
  };
}

export async function fetchRepoTree(
  slug: RepoSlug,
  branch: string,
  opts: FetchOptions = {},
): Promise<{ tree: RepoTreeEntry[]; truncated: boolean }> {
  const data = await ghFetch<{
    tree: Array<{
      path: string;
      type: "blob" | "tree" | "commit";
      size?: number;
      sha: string;
    }>;
    truncated: boolean;
  }>(
    `/repos/${slug.owner}/${slug.name}/git/trees/${encodeURIComponent(
      branch,
    )}?recursive=1`,
    opts,
  );
  const tree: RepoTreeEntry[] = data.tree
    .filter((e) => e.type === "blob" || e.type === "tree")
    .map((e) => ({
      path: e.path,
      type: e.type as "blob" | "tree",
      size: e.size,
      sha: e.sha,
    }));
  return { tree, truncated: data.truncated };
}

export async function fetchRepoLanguages(
  slug: RepoSlug,
  opts: FetchOptions = {},
): Promise<RepoLanguages> {
  return ghFetch<RepoLanguages>(
    `/repos/${slug.owner}/${slug.name}/languages`,
    opts,
  );
}

export async function fetchRepoCommits(
  slug: RepoSlug,
  branch: string,
  perPage: number,
  opts: FetchOptions = {},
): Promise<CommitSummary[]> {
  const data = await ghFetch<
    Array<{
      sha: string;
      commit: {
        author: { name: string | null; date: string } | null;
        message: string;
      };
      author: { login: string } | null;
    }>
  >(
    `/repos/${slug.owner}/${slug.name}/commits?sha=${encodeURIComponent(
      branch,
    )}&per_page=${perPage}`,
    opts,
  );
  return data.map((c) => ({
    sha: c.sha,
    date: c.commit.author?.date ?? "",
    author: c.author?.login ?? c.commit.author?.name ?? null,
    message: c.commit.message.split("\n", 1)[0],
  }));
}

export async function fetchFullSnapshot(
  slug: RepoSlug,
  opts: FetchOptions = {},
  onProgress?: (msg: string) => void,
): Promise<FullRepoSnapshot> {
  onProgress?.("Resolving repository…");
  const meta = await fetchRepoMeta(slug, opts);

  onProgress?.("Charting the file tree…");
  const treeResult = await fetchRepoTree(slug, meta.defaultBranch, opts);

  onProgress?.("Reading language palette…");
  const languages = await fetchRepoLanguages(slug, opts).catch(() => ({}));

  onProgress?.("Sampling commit history…");
  const commits = await fetchRepoCommits(
    slug,
    meta.defaultBranch,
    100,
    opts,
  ).catch(() => []);

  return {
    meta,
    tree: treeResult.tree,
    truncated: treeResult.truncated,
    languages,
    commits,
  };
}
