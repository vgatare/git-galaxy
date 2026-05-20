export interface GalaxyNode {
  /** Stable id (path for files, "__root__" for the synthetic root). */
  id: string;
  /** Path relative to repo root. Empty for root. */
  path: string;
  /** Display name (last path segment). */
  name: string;
  /** `dir` (folder) or `file` (blob). */
  kind: "dir" | "file";
  /** Parent id, or null for root. */
  parentId: string | null;
  /** Children ids. */
  childrenIds: string[];
  /** Size in bytes (files only). */
  size: number;
  /** Total size in bytes of subtree (for dirs). */
  subtreeSize: number;
  /** Number of files in subtree (for dirs). */
  subtreeCount: number;
  /** Color hex. */
  color: string;
  /** Language label. */
  language: string;
  /** 3D position. */
  x: number;
  y: number;
  z: number;
  /** Visual radius for rendering. */
  radius: number;
  /** Depth from root (root = 0). */
  depth: number;
}

export interface GalaxyEdge {
  from: string;
  to: string;
}

export interface GalaxyData {
  nodes: GalaxyNode[];
  edges: GalaxyEdge[];
  /** Map id -> index in nodes array (handy for picking). */
  byId: Map<string, number>;
  /** Total file count (only file nodes). */
  fileCount: number;
  /** Total directory count. */
  dirCount: number;
  /** Total bytes across all files. */
  totalBytes: number;
  /** Max depth (= max recursion). */
  maxDepth: number;
}
