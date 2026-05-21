import type { GalaxyData, GalaxyNode } from "../galaxy/types";
import type { RepoMeta } from "../github/types";
import { formatBytes, formatNumber } from "./format";

/**
 * In-galaxy content viewer. Pops a translucent glassmorphic panel over the
 * canvas so files and directories can be read without leaving for GitHub.
 *
 *  - Text files: rendered as code with gutter line numbers.
 *  - Markdown / READMEs: rendered through a tiny inline markdown formatter
 *    (no dependency — keeps the bundle small).
 *  - Images: rendered as <img> from raw.githubusercontent.com.
 *  - Directories: render their README inline (if present) plus a file
 *    listing of immediate children, colored by language.
 *  - Binary or oversized files: a friendly stub with a fallback GitHub link.
 */

const IMAGE_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "ico",
  "bmp",
  "avif",
]);
const MARKDOWN_EXTS = new Set(["md", "markdown", "mdx", "mdown", "mkdn"]);
const README_PATTERNS = ["readme.md", "readme.mdx", "readme", "readme.txt"];
const MAX_TEXT_BYTES = 800_000;
const MAX_LISTING_CHILDREN = 200;

export interface ViewerElements {
  root: HTMLElement;
  card: HTMLElement;
  title: HTMLElement;
  subtitle: HTMLElement;
  body: HTMLElement;
  closeBtn: HTMLElement;
  githubLink: HTMLAnchorElement;
}

export interface ViewerCallbacks {
  /** Called when the user picks a child in a directory listing. */
  onPickNode(nodeId: string): void;
}

export interface ViewerHandle {
  open(node: GalaxyNode, meta: RepoMeta, galaxy: GalaxyData): void;
  close(): void;
  isOpen(): boolean;
}

export function createViewer(
  els: ViewerElements,
  callbacks: ViewerCallbacks,
): ViewerHandle {
  let abortController: AbortController | null = null;
  let currentToken = 0;

  function close(): void {
    if (abortController) abortController.abort();
    abortController = null;
    els.root.classList.add("hidden");
    els.body.innerHTML = "";
  }

  els.closeBtn.addEventListener("click", close);

  // Click on the dimmed backdrop (root, outside the card) closes the viewer.
  els.root.addEventListener("pointerdown", (e) => {
    if (e.target === els.root) close();
  });

  function setHeader(node: GalaxyNode, meta: RepoMeta): void {
    els.title.textContent = node.name || meta.fullName;
    const swatch = `<span class="viewer-swatch" style="background:${node.color}"></span>`;
    if (node.kind === "file") {
      els.subtitle.innerHTML = `${swatch}<span class="viewer-path">${escapeHtml(node.path)}</span><span class="viewer-meta">${node.language} · ${formatBytes(node.size)}</span>`;
    } else {
      const pathLabel = node.path || `${meta.fullName} root`;
      els.subtitle.innerHTML = `${swatch}<span class="viewer-path">${escapeHtml(pathLabel)}</span><span class="viewer-meta">${formatNumber(node.subtreeCount)} files · ${formatBytes(node.subtreeSize)}</span>`;
    }
    const href = node.kind === "file" && node.path
      ? `${meta.htmlUrl}/blob/${meta.defaultBranch}/${node.path}`
      : node.path
        ? `${meta.htmlUrl}/tree/${meta.defaultBranch}/${node.path}`
        : meta.htmlUrl;
    els.githubLink.href = href;
  }

  function rawUrl(meta: RepoMeta, path: string): string {
    return `https://raw.githubusercontent.com/${meta.owner}/${meta.name}/${meta.defaultBranch}/${path}`;
  }

  async function fetchText(url: string, signal: AbortSignal): Promise<string> {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.text();
  }

  function findReadmeChild(node: GalaxyNode, galaxy: GalaxyData): GalaxyNode | null {
    for (const childId of node.childrenIds) {
      const idx = galaxy.byId.get(childId);
      if (idx === undefined) continue;
      const c = galaxy.nodes[idx];
      if (c.kind !== "file") continue;
      if (README_PATTERNS.includes(c.name.toLowerCase())) return c;
    }
    return null;
  }

  /**
   * Rewrite relative URLs in rendered HTML so they resolve against the
   * raw/raw-githubusercontent URL of the file's directory. Without this
   * relative images and links in a README would be broken inside the viewer.
   */
  function resolveRelativeLinks(html: string, meta: RepoMeta, baseDir: string): string {
    const tpl = document.createElement("template");
    tpl.innerHTML = html;
    const rawBase = `https://raw.githubusercontent.com/${meta.owner}/${meta.name}/${meta.defaultBranch}/${baseDir ? baseDir + "/" : ""}`;
    const blobBase = `${meta.htmlUrl}/blob/${meta.defaultBranch}/${baseDir ? baseDir + "/" : ""}`;
    const treeBase = `${meta.htmlUrl}/tree/${meta.defaultBranch}/${baseDir ? baseDir + "/" : ""}`;
    function isAbsolute(u: string): boolean {
      return (
        /^[a-zA-Z]+:\/\//.test(u) || u.startsWith("//") || u.startsWith("#") || u.startsWith("mailto:")
      );
    }
    function resolve(rel: string, base: string): string {
      try {
        return new URL(rel.replace(/^\.\//, ""), base).toString();
      } catch {
        return rel;
      }
    }
    tpl.content.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src") || "";
      if (src && !isAbsolute(src)) img.setAttribute("src", resolve(src, rawBase));
    });
    tpl.content.querySelectorAll("a").forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (!href || isAbsolute(href)) return;
      // .md / no-extension → tree/blob view; otherwise blob.
      const isDirLike = href.endsWith("/");
      a.setAttribute("href", resolve(href, isDirLike ? treeBase : blobBase));
    });
    return tpl.innerHTML;
  }

  async function showFile(
    node: GalaxyNode,
    meta: RepoMeta,
    token: number,
  ): Promise<void> {
    const ext = (node.name.split(".").pop() || "").toLowerCase();
    els.body.innerHTML = `<div class="viewer-loading">Fetching ${escapeHtml(node.name)}…</div>`;

    if (IMAGE_EXTS.has(ext)) {
      if (token !== currentToken) return;
      els.body.innerHTML = "";
      const wrap = document.createElement("div");
      wrap.className = "viewer-image-wrap";
      const img = document.createElement("img");
      img.src = rawUrl(meta, node.path);
      img.alt = node.name;
      img.loading = "eager";
      img.className = "viewer-image";
      img.addEventListener("error", () => {
        if (token !== currentToken) return;
        els.body.innerHTML = `<div class="viewer-msg">Couldn't load image. <a href="${els.githubLink.href}" target="_blank" rel="noopener noreferrer">View on GitHub →</a></div>`;
      });
      wrap.appendChild(img);
      els.body.appendChild(wrap);
      return;
    }

    if (node.size > MAX_TEXT_BYTES) {
      els.body.innerHTML = `<div class="viewer-msg">This file is <strong>${formatBytes(node.size)}</strong>, too large to display inline. <a href="${els.githubLink.href}" target="_blank" rel="noopener noreferrer">View on GitHub →</a></div>`;
      return;
    }

    if (abortController) abortController.abort();
    abortController = new AbortController();
    try {
      const text = await fetchText(rawUrl(meta, node.path), abortController.signal);
      if (token !== currentToken) return;
      if (looksBinary(text)) {
        els.body.innerHTML = `<div class="viewer-msg">Binary file. <a href="${els.githubLink.href}" target="_blank" rel="noopener noreferrer">View on GitHub →</a></div>`;
        return;
      }
      if (MARKDOWN_EXTS.has(ext)) {
        els.body.innerHTML = "";
        const md = document.createElement("article");
        md.className = "viewer-markdown";
        const fileDir = node.path.includes("/") ? node.path.replace(/\/[^/]*$/, "") : "";
        md.innerHTML = resolveRelativeLinks(renderMarkdown(text), meta, fileDir);
        els.body.appendChild(md);
      } else {
        els.body.innerHTML = "";
        els.body.appendChild(renderCodeBlock(text, ext));
      }
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      if (token !== currentToken) return;
      els.body.innerHTML = `<div class="viewer-msg">Couldn't load file: ${escapeHtml(
        (err as Error).message,
      )}. <a href="${els.githubLink.href}" target="_blank" rel="noopener noreferrer">View on GitHub →</a></div>`;
    }
  }

  async function showDirectory(
    node: GalaxyNode,
    meta: RepoMeta,
    galaxy: GalaxyData,
    token: number,
  ): Promise<void> {
    els.body.innerHTML = "";

    // README first (if any) — directly fetched.
    const readme = findReadmeChild(node, galaxy);
    if (readme && readme.size <= MAX_TEXT_BYTES) {
      const readmeWrap = document.createElement("section");
      readmeWrap.className = "viewer-section";
      const h = document.createElement("h2");
      h.className = "viewer-section-title";
      h.textContent = readme.name;
      readmeWrap.appendChild(h);
      const md = document.createElement("article");
      md.className = "viewer-markdown viewer-markdown--inline";
      md.innerHTML = `<div class="viewer-loading">Loading ${escapeHtml(readme.name)}…</div>`;
      readmeWrap.appendChild(md);
      els.body.appendChild(readmeWrap);
      if (abortController) abortController.abort();
      abortController = new AbortController();
      const readmeDir = readme.path.includes("/") ? readme.path.replace(/\/[^/]*$/, "") : "";
      fetchText(rawUrl(meta, readme.path), abortController.signal)
        .then((text) => {
          if (token !== currentToken) return;
          md.innerHTML = resolveRelativeLinks(renderMarkdown(text), meta, readmeDir);
        })
        .catch((err) => {
          if ((err as { name?: string }).name === "AbortError") return;
          if (token !== currentToken) return;
          md.innerHTML = `<div class="viewer-msg">Couldn't load ${escapeHtml(readme.name)}.</div>`;
        });
    }

    // File listing
    const listingWrap = document.createElement("section");
    listingWrap.className = "viewer-section";
    const lh = document.createElement("h2");
    lh.className = "viewer-section-title";
    lh.textContent = readme ? "Contents" : `${node.name || meta.fullName} · contents`;
    listingWrap.appendChild(lh);

    const list = document.createElement("ul");
    list.className = "viewer-listing";
    const childIds = node.childrenIds.slice(0, MAX_LISTING_CHILDREN);
    // Sort: dirs first, alpha
    const childNodes = childIds
      .map((id) => galaxy.nodes[galaxy.byId.get(id) ?? -1])
      .filter((n): n is GalaxyNode => !!n)
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    for (const child of childNodes) {
      const li = document.createElement("li");
      li.className = `viewer-listing-row viewer-listing-row--${child.kind}`;
      li.style.setProperty("--row-tint", child.color);
      const left = document.createElement("button");
      left.type = "button";
      left.className = "viewer-listing-name";
      left.innerHTML = `<span class="viewer-listing-icon" aria-hidden="true">${
        child.kind === "dir" ? "▸" : "·"
      }</span><span class="viewer-listing-swatch" style="background:${child.color}"></span>${escapeHtml(child.name)}`;
      left.addEventListener("click", () => callbacks.onPickNode(child.id));
      li.appendChild(left);
      const right = document.createElement("span");
      right.className = "viewer-listing-meta";
      right.textContent = child.kind === "file"
        ? formatBytes(child.size)
        : `${formatNumber(child.subtreeCount)} files`;
      li.appendChild(right);
      list.appendChild(li);
    }
    if (node.childrenIds.length > MAX_LISTING_CHILDREN) {
      const more = document.createElement("li");
      more.className = "viewer-listing-row viewer-listing-row--more";
      more.textContent = `+${formatNumber(node.childrenIds.length - MAX_LISTING_CHILDREN)} more`;
      list.appendChild(more);
    }
    listingWrap.appendChild(list);
    els.body.appendChild(listingWrap);
  }

  return {
    open(node, meta, galaxy) {
      currentToken++;
      const myToken = currentToken;
      setHeader(node, meta);
      els.root.classList.remove("hidden");
      els.body.scrollTop = 0;
      if (node.kind === "file") {
        void showFile(node, meta, myToken);
      } else {
        void showDirectory(node, meta, galaxy, myToken);
      }
    },
    close,
    isOpen() {
      return !els.root.classList.contains("hidden");
    },
  };
}

// ---- helpers ------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function looksBinary(text: string): boolean {
  // Heuristic: scan a sample for null bytes or excessive non-printables.
  const len = Math.min(text.length, 2000);
  let bad = 0;
  for (let i = 0; i < len; i++) {
    const c = text.charCodeAt(i);
    if (c === 0) return true;
    // Allow tab/newline/cr + printable range
    if ((c < 9 || (c > 13 && c < 32)) && c !== 27) bad++;
  }
  return bad / Math.max(1, len) > 0.05;
}

function renderCodeBlock(text: string, ext: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "viewer-code";
  wrap.dataset.lang = ext;
  const lines = text.split("\n");
  // Render at most 5000 lines for sanity; show a hint if truncated.
  const MAX_LINES = 5000;
  const truncated = lines.length > MAX_LINES;
  const shown = truncated ? lines.slice(0, MAX_LINES) : lines;
  // Gutter
  const gutter = document.createElement("div");
  gutter.className = "viewer-gutter";
  let gutterHtml = "";
  for (let i = 0; i < shown.length; i++) {
    gutterHtml += `${i + 1}\n`;
  }
  gutter.textContent = gutterHtml;
  const code = document.createElement("pre");
  code.className = "viewer-pre";
  code.textContent = shown.join("\n");
  wrap.appendChild(gutter);
  wrap.appendChild(code);
  if (truncated) {
    const note = document.createElement("div");
    note.className = "viewer-msg viewer-msg--inline";
    note.textContent = `Showing first ${MAX_LINES} of ${lines.length} lines.`;
    wrap.appendChild(note);
  }
  return wrap;
}

// ---- Tiny markdown renderer --------------------------------------------
// Handles headings, paragraphs, bold/italic/code, lists, blockquotes,
// links, images, code blocks, and horizontal rules. Not spec-perfect, but
// good enough for READMEs.

function renderMarkdown(src: string): string {
  // Normalize line endings.
  let text = src.replace(/\r\n?/g, "\n");

  // Extract fenced code blocks first so we don't process them as text.
  const codeBlocks: string[] = [];
  text = text.replace(/```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g, (_m, lang, body) => {
    const idx = codeBlocks.length;
    codeBlocks.push(
      `<pre class="viewer-md-code" data-lang="${escapeHtml(lang || "")}"><code>${escapeHtml(body.replace(/\n$/, ""))}</code></pre>`,
    );
    return `\u0000CODE${idx}\u0000`;
  });

  // Note: we deliberately do NOT escape raw HTML — markdown allows inline HTML
  // (e.g. <picture>, <p align="center"> are common in READMEs). The final
  // output is sanitized via sanitizeHtml() before being inserted.

  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Heading
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level}>${inlineMd(h[2].trim())}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line.trim()) && line.trim().length > 0) {
      out.push("<hr />");
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${inlineMd(buf.join(" "))}</blockquote>`);
      continue;
    }

    // List (unordered + ordered)
    const ulMatch = /^([-*+])\s+(.+)$/.exec(line);
    const olMatch = /^(\d+)[.)]\s+(.+)$/.exec(line);
    if (ulMatch || olMatch) {
      const ordered = !!olMatch;
      const items: string[] = [];
      while (i < lines.length) {
        const u = /^([-*+])\s+(.+)$/.exec(lines[i]);
        const o = /^(\d+)[.)]\s+(.+)$/.exec(lines[i]);
        if (ordered && o) {
          items.push(`<li>${inlineMd(o[2])}</li>`);
          i++;
        } else if (!ordered && u) {
          items.push(`<li>${inlineMd(u[2])}</li>`);
          i++;
        } else {
          break;
        }
      }
      out.push(ordered ? `<ol>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`);
      continue;
    }

    // Code block placeholder
    if (/\u0000CODE\d+\u0000/.test(line)) {
      out.push(line);
      i++;
      continue;
    }

    // Blank line — paragraph break.
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph: collect until blank line or block start.
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      if (/^(#{1,6})\s+/.test(lines[i])) break;
      if (/^[-*+]\s+/.test(lines[i])) break;
      if (/^\d+[.)]\s+/.test(lines[i])) break;
      if (/^>\s?/.test(lines[i])) break;
      if (/\u0000CODE\d+\u0000/.test(lines[i])) break;
      buf.push(lines[i]);
      i++;
    }
    out.push(`<p>${inlineMd(buf.join(" "))}</p>`);
  }

  let html = out.join("\n");
  // Restore code blocks.
  html = html.replace(/\u0000CODE(\d+)\u0000/g, (_m, idx) => codeBlocks[Number(idx)]);
  return sanitizeHtml(html);
}

/**
 * Lightweight HTML sanitizer used after markdown rendering. Parses the
 * candidate HTML with the browser's own parser, then removes nodes &
 * attributes that could execute JS. Allows the common formatting tags
 * READMEs depend on.
 */
function sanitizeHtml(html: string): string {
  const FORBIDDEN_TAGS = new Set([
    "SCRIPT",
    "STYLE",
    "IFRAME",
    "OBJECT",
    "EMBED",
    "LINK",
    "META",
    "BASE",
    "FORM",
    "INPUT",
    "BUTTON",
    "TEXTAREA",
  ]);
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const toRemove: Element[] = [];
  const walker = document.createTreeWalker(
    tpl.content,
    NodeFilter.SHOW_ELEMENT,
  );
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const el = node as Element;
    if (FORBIDDEN_TAGS.has(el.tagName)) {
      toRemove.push(el);
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value;
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
      } else if (
        (name === "href" || name === "src" || name === "xlink:href") &&
        /^\s*javascript:/i.test(value)
      ) {
        el.removeAttribute(attr.name);
      }
    }
    // Open all links in a new tab.
    if (el.tagName === "A") {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    }
  }
  for (const el of toRemove) el.remove();
  return tpl.innerHTML;
}

function inlineMd(s: string): string {
  let out = s;
  // Images: ![alt](url)
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, alt, url) => {
    return `<img src="${url}" alt="${alt}" loading="lazy" />`;
  });
  // Links: [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, txt, url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${txt}</a>`;
  });
  // Inline code: `code`
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Bold: **text** or __text__
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  // Italic: *text* or _text_
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");
  return out;
}
