export interface RepoMeta {
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  defaultBranch: string;
  stars: number;
  forks: number;
  htmlUrl: string;
  size: number;
}

export interface RepoTreeEntry {
  /** Path relative to the repo root. e.g. `src/main.ts` */
  path: string;
  /** `blob` (file) or `tree` (directory). */
  type: "blob" | "tree";
  /** Size in bytes (only for blobs). */
  size?: number;
  /** Git object SHA. */
  sha: string;
}

export interface RepoLanguages {
  [language: string]: number;
}

export interface CommitSummary {
  sha: string;
  date: string;
  author: string | null;
  message: string;
}
