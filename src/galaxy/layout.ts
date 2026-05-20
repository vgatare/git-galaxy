import type { RepoTreeEntry } from "../github/types";
import { colorForPath, languageForPath } from "./colors";
import type { GalaxyData, GalaxyEdge, GalaxyNode } from "./types";

const ROOT_ID = "__root__";

interface NodeBuilder {
  id: string;
  path: string;
  name: string;
  kind: "dir" | "file";
  parentId: string | null;
  childrenIds: string[];
  size: number;
  subtreeSize: number;
  subtreeCount: number;
}

/** Build a tree (id-keyed map) from a flat git tree listing. */
function buildTree(entries: RepoTreeEntry[]): Map<string, NodeBuilder> {
  const nodes = new Map<string, NodeBuilder>();

  // Ensure root exists.
  nodes.set(ROOT_ID, {
    id: ROOT_ID,
    path: "",
    name: "/",
    kind: "dir",
    parentId: null,
    childrenIds: [],
    size: 0,
    subtreeSize: 0,
    subtreeCount: 0,
  });

  /** Ensure a directory path is registered as a node (creating ancestors). */
  function ensureDir(path: string): NodeBuilder {
    if (path === "") return nodes.get(ROOT_ID)!;
    let node = nodes.get(path);
    if (node) return node;

    const slash = path.lastIndexOf("/");
    const parentPath = slash < 0 ? "" : path.slice(0, slash);
    const name = slash < 0 ? path : path.slice(slash + 1);
    const parent = ensureDir(parentPath);
    node = {
      id: path,
      path,
      name,
      kind: "dir",
      parentId: parent.id,
      childrenIds: [],
      size: 0,
      subtreeSize: 0,
      subtreeCount: 0,
    };
    nodes.set(path, node);
    parent.childrenIds.push(path);
    return node;
  }

  for (const entry of entries) {
    if (entry.type === "tree") {
      ensureDir(entry.path);
    } else {
      const slash = entry.path.lastIndexOf("/");
      const parentPath = slash < 0 ? "" : entry.path.slice(0, slash);
      const name = slash < 0 ? entry.path : entry.path.slice(slash + 1);
      const parent = ensureDir(parentPath);
      const fileNode: NodeBuilder = {
        id: entry.path,
        path: entry.path,
        name,
        kind: "file",
        parentId: parent.id,
        childrenIds: [],
        size: entry.size ?? 0,
        subtreeSize: entry.size ?? 0,
        subtreeCount: 1,
      };
      nodes.set(entry.path, fileNode);
      parent.childrenIds.push(entry.path);
    }
  }

  // Compute subtree sizes/counts via post-order traversal.
  function aggregate(id: string): { size: number; count: number } {
    const node = nodes.get(id)!;
    if (node.kind === "file") {
      return { size: node.size, count: 1 };
    }
    let size = 0;
    let count = 0;
    for (const childId of node.childrenIds) {
      const r = aggregate(childId);
      size += r.size;
      count += r.count;
    }
    node.subtreeSize = size;
    node.subtreeCount = count;
    return { size, count };
  }
  aggregate(ROOT_ID);

  return nodes;
}

/** Deterministic small noise — keeps layouts reproducible per-repo. */
function hashFloat(s: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Map to [0, 1).
  return ((h >>> 0) % 100000) / 100000;
}

interface LayoutOptions {
  /** Base orbital radius at depth 1. */
  baseRadius: number;
  /** How much smaller each successive shell becomes. */
  shellShrink: number;
  /** Minimum visual radius for a star. */
  minStarRadius: number;
  /** Maximum visual radius for a star. */
  maxStarRadius: number;
}

const DEFAULT_OPTS: LayoutOptions = {
  baseRadius: 140,
  shellShrink: 0.62,
  minStarRadius: 0.35,
  maxStarRadius: 3.6,
};

/**
 * Distribute N children on a Fibonacci-sphere shell around a parent.
 * Children with larger subtrees get pushed slightly farther (so big
 * directories get more breathing room from their parent).
 */
function placeChildrenOnShell(
  parent: NodeBuilder,
  parentPos: [number, number, number],
  childrenSorted: NodeBuilder[],
  shellRadius: number,
  positions: Map<string, [number, number, number]>,
): void {
  const n = childrenSorted.length;
  if (n === 0) return;

  // Tilt seeded by parent id so each directory's plane feels distinct.
  const tiltA = hashFloat(parent.id, 1) * Math.PI * 2;
  const tiltB = hashFloat(parent.id, 7) * Math.PI;
  const cosA = Math.cos(tiltA);
  const sinA = Math.sin(tiltA);
  const cosB = Math.cos(tiltB);
  const sinB = Math.sin(tiltB);

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < n; i++) {
    const child = childrenSorted[i];

    // Phyllotaxis-on-sphere with a gentle bias toward the equator.
    const t = n === 1 ? 0.5 : i / (n - 1);
    const y = 1 - t * 2; // [-1, 1]
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i + hashFloat(child.id, 3) * 0.6;

    let dx = Math.cos(theta) * radiusAtY;
    let dy = y * 0.55; // squash the sphere into an ellipsoid for a more "disk-like" galaxy
    let dz = Math.sin(theta) * radiusAtY;

    // Tilt the local axes via two Euler-ish rotations.
    // Rotate around Y by tiltA:
    let rx = dx * cosA - dz * sinA;
    let rz = dx * sinA + dz * cosA;
    let ry = dy;
    // Rotate around X by tiltB:
    const ry2 = ry * cosB - rz * sinB;
    const rz2 = ry * sinB + rz * cosB;
    ry = ry2;
    rz = rz2;
    dx = rx;
    dy = ry;
    dz = rz2;

    // Size-aware distance multiplier.
    const sizeFactor =
      child.kind === "dir"
        ? 1 + Math.log10(Math.max(1, child.subtreeCount)) * 0.18
        : 1 + (child.size > 0 ? Math.log10(Math.max(1, child.size)) * 0.06 : 0);

    const r = shellRadius * sizeFactor;
    positions.set(child.id, [
      parentPos[0] + dx * r,
      parentPos[1] + dy * r,
      parentPos[2] + dz * r,
    ]);
  }
}

/**
 * Recursively layout the tree using nested Fibonacci-sphere shells.
 */
function layoutRecursive(
  nodes: Map<string, NodeBuilder>,
  positions: Map<string, [number, number, number]>,
  depths: Map<string, number>,
  rootId: string,
  opts: LayoutOptions,
): void {
  positions.set(rootId, [0, 0, 0]);
  depths.set(rootId, 0);

  const queue: string[] = [rootId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodes.get(id)!;
    if (node.childrenIds.length === 0) continue;

    const depth = depths.get(id) ?? 0;
    const parentPos = positions.get(id)!;

    // Sort children: directories first (biggest first), then files (biggest first).
    const sorted = node.childrenIds
      .map((cid) => nodes.get(cid)!)
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
        return b.subtreeSize + b.subtreeCount - (a.subtreeSize + a.subtreeCount);
      });

    // Shell radius shrinks with depth, but grows with child count so dense dirs spread out.
    const shrinkFactor = Math.pow(opts.shellShrink, depth);
    const dense = Math.sqrt(Math.max(1, sorted.length));
    // Minimum shell radius grows with the count of children to avoid overlap.
    const minShell = 3.5 + dense * 1.5;
    const shellRadius = Math.max(
      minShell,
      opts.baseRadius * shrinkFactor * Math.max(0.55, Math.log10(dense + 1) + 0.7),
    );

    placeChildrenOnShell(node, parentPos, sorted, shellRadius, positions);

    for (const child of sorted) {
      depths.set(child.id, depth + 1);
      queue.push(child.id);
    }
  }
}

/** Compute visual radius for a node based on subtree weight / file size. */
function visualRadius(node: NodeBuilder, opts: LayoutOptions): number {
  if (node.kind === "dir") {
    const w = Math.log10(Math.max(1, node.subtreeCount + 1));
    return Math.min(opts.maxStarRadius, opts.minStarRadius + w * 0.75);
  }
  const kb = Math.max(1, node.size) / 1024;
  const w = Math.log10(kb + 1);
  return Math.min(
    opts.maxStarRadius * 0.7,
    opts.minStarRadius + w * 0.55,
  );
}

/**
 * Convert a flat repo tree listing into a fully-positioned `GalaxyData`.
 */
export function buildGalaxy(
  entries: RepoTreeEntry[],
  options: Partial<LayoutOptions> = {},
): GalaxyData {
  const opts: LayoutOptions = { ...DEFAULT_OPTS, ...options };
  const builders = buildTree(entries);
  const positions = new Map<string, [number, number, number]>();
  const depths = new Map<string, number>();
  layoutRecursive(builders, positions, depths, ROOT_ID, opts);

  const nodes: GalaxyNode[] = [];
  const edges: GalaxyEdge[] = [];
  const byId = new Map<string, number>();

  let fileCount = 0;
  let dirCount = 0;
  let totalBytes = 0;
  let maxDepth = 0;

  for (const [id, b] of builders) {
    const pos = positions.get(id)!;
    const depth = depths.get(id) ?? 0;
    if (depth > maxDepth) maxDepth = depth;

    if (b.kind === "file") {
      fileCount++;
      totalBytes += b.size;
    } else {
      dirCount++;
    }

    const color = colorForPath(b.path, b.kind === "dir");
    const language = languageForPath(b.path, b.kind === "dir");

    const node: GalaxyNode = {
      id: b.id,
      path: b.path,
      name: b.name,
      kind: b.kind,
      parentId: b.parentId,
      childrenIds: b.childrenIds.slice(),
      size: b.size,
      subtreeSize: b.subtreeSize,
      subtreeCount: b.subtreeCount,
      color,
      language,
      x: pos[0],
      y: pos[1],
      z: pos[2],
      radius: visualRadius(b, opts),
      depth,
    };
    byId.set(id, nodes.length);
    nodes.push(node);
    if (b.parentId) edges.push({ from: b.parentId, to: id });
  }

  return {
    nodes,
    edges,
    byId,
    fileCount,
    dirCount,
    totalBytes,
    maxDepth,
  };
}

export { ROOT_ID };
