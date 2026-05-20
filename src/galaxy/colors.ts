/**
 * Map a file extension (or special key like `__dir__`) to an HSL-ish color.
 * Colors lifted (and tuned) from GitHub Linguist's palette so familiar
 * languages light up in recognisable hues.
 */
const EXT_COLORS: Record<string, string> = {
  // JS / TS
  js: "#f1e05a",
  mjs: "#f1e05a",
  cjs: "#f1e05a",
  jsx: "#f1e05a",
  ts: "#3178c6",
  tsx: "#3178c6",
  // Web
  html: "#e34c26",
  htm: "#e34c26",
  css: "#563d7c",
  scss: "#c6538c",
  sass: "#a53b70",
  less: "#1d365d",
  // Backend
  py: "#3572A5",
  rb: "#701516",
  go: "#00ADD8",
  rs: "#dea584",
  java: "#b07219",
  kt: "#A97BFF",
  swift: "#FA7343",
  c: "#555555",
  h: "#9aa0a6",
  cpp: "#f34b7d",
  cc: "#f34b7d",
  hpp: "#f34b7d",
  cs: "#178600",
  php: "#4F5D95",
  scala: "#c22d40",
  clj: "#db5855",
  ex: "#6e4a7e",
  exs: "#6e4a7e",
  erl: "#B83998",
  hs: "#5e5086",
  lua: "#000080",
  pl: "#0298c3",
  r: "#198CE7",
  m: "#438eff",
  mm: "#438eff",
  dart: "#00B4AB",
  // Data / config
  json: "#cbcb41",
  yaml: "#cb171e",
  yml: "#cb171e",
  toml: "#9c4221",
  xml: "#0060ac",
  sql: "#e38c00",
  // Shell
  sh: "#89e051",
  bash: "#89e051",
  zsh: "#89e051",
  fish: "#4aae47",
  ps1: "#012456",
  // Build / config
  dockerfile: "#384d54",
  makefile: "#427819",
  gradle: "#02303a",
  // Docs
  md: "#9aa0a6",
  mdx: "#fcb32c",
  rst: "#141414",
  txt: "#c4c4c4",
  // Images / media
  svg: "#ff9ed8",
  png: "#ff9ed8",
  jpg: "#ff9ed8",
  jpeg: "#ff9ed8",
  gif: "#ff9ed8",
  webp: "#ff9ed8",
  ico: "#ff9ed8",
  // Fonts
  ttf: "#b48dff",
  otf: "#b48dff",
  woff: "#b48dff",
  woff2: "#b48dff",
  // Lock / package
  lock: "#aaaaaa",
  // Notebooks
  ipynb: "#DA5B0B",
  // Misc
  vue: "#41b883",
  svelte: "#ff3e00",
  astro: "#ff5d01",
  graphql: "#e10098",
  gql: "#e10098",
  proto: "#a47bea",
};

const SPECIAL_FILES: Record<string, string> = {
  dockerfile: "#384d54",
  makefile: "#427819",
  cmakelists: "#DA3434",
  readme: "#9aa0a6",
  license: "#cccccc",
  changelog: "#9aa0a6",
};

const FALLBACK = "#7dd4ff";
const DIR_COLOR = "#b48dff";

export function colorForPath(path: string, isDir: boolean): string {
  if (isDir) return DIR_COLOR;

  const file = path.split("/").pop() ?? path;
  const lower = file.toLowerCase();

  // Special filenames without an extension.
  const stem = lower.split(".")[0];
  if (SPECIAL_FILES[lower]) return SPECIAL_FILES[lower];
  if (SPECIAL_FILES[stem]) return SPECIAL_FILES[stem];

  const dot = lower.lastIndexOf(".");
  if (dot < 0) return FALLBACK;
  const ext = lower.slice(dot + 1);
  return EXT_COLORS[ext] ?? FALLBACK;
}

/** Human-readable language label for a path. */
export function languageForPath(path: string, isDir: boolean): string {
  if (isDir) return "directory";
  const file = path.split("/").pop() ?? path;
  const lower = file.toLowerCase();
  const stem = lower.split(".")[0];
  if (SPECIAL_FILES[lower]) return lower;
  if (SPECIAL_FILES[stem]) return stem;
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return "other";
  return lower.slice(dot + 1);
}

/** Convert hex (#rrggbb) to a normalised [r,g,b] tuple. */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [1, 1, 1];
  const v = parseInt(m[1], 16);
  return [((v >> 16) & 0xff) / 255, ((v >> 8) & 0xff) / 255, (v & 0xff) / 255];
}

export { DIR_COLOR, FALLBACK };
