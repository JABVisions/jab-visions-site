/**
 * Places the nodes of one tree branch on a diagram: a row per tier, every
 * node at a horizontal position 0–1, and the prerequisite edges between
 * them. Root nodes spread evenly; a deeper node hangs under the midpoint of
 * its parents, the way a skill tree reads, and a row that would crowd is
 * re-spaced evenly in the same order.
 */
export interface LayoutNode {
  id: string;
  tier: number;
  requires: string[];
}

export interface PlacedNode<T extends LayoutNode> {
  node: T;
  /** 0-based row, tier 1 at the top. */
  row: number;
  /** Horizontal centre, 0–1. */
  x: number;
}

export interface TreeEdge {
  from: string;
  to: string;
}

export interface BranchLayout<T extends LayoutNode> {
  rows: PlacedNode<T>[][];
  edges: TreeEdge[];
  byId: Map<string, PlacedNode<T>>;
}

/** Cards narrower than this fraction of the row would overlap; rows closer than it are re-spaced. */
const MIN_GAP = 0.26;

export function layoutBranch<T extends LayoutNode>(nodes: readonly T[]): BranchLayout<T> {
  const ids = new Set(nodes.map((node) => node.id));
  const tiers = [...new Set(nodes.map((node) => node.tier))].sort((a, b) => a - b);
  const rowOf = new Map(tiers.map((tier, i) => [tier, i]));
  const byId = new Map<string, PlacedNode<T>>();
  const rows: PlacedNode<T>[][] = tiers.map(() => []);

  for (const tier of tiers) {
    const row = rowOf.get(tier)!;
    const members = nodes.filter((node) => node.tier === tier);
    const placed: PlacedNode<T>[] = members.map((node, i) => {
      const parents = node.requires.map((req) => byId.get(req)).filter((p): p is PlacedNode<T> => Boolean(p));
      const x = parents.length ? parents.reduce((sum, p) => sum + p.x, 0) / parents.length : (i + 1) / (members.length + 1);
      return { node, row, x };
    });
    placed.sort((a, b) => a.x - b.x || members.indexOf(a.node) - members.indexOf(b.node));
    let crowded = false;
    for (let i = 1; i < placed.length; i += 1) if (placed[i].x - placed[i - 1].x < MIN_GAP) crowded = true;
    if (crowded) placed.forEach((p, i) => (p.x = (i + 1) / (placed.length + 1)));
    for (const p of placed) {
      p.x = Math.min(0.86, Math.max(0.14, p.x));
      byId.set(p.node.id, p);
    }
    rows[row] = placed;
  }

  const edges: TreeEdge[] = [];
  for (const node of nodes) {
    for (const req of node.requires) if (ids.has(req)) edges.push({ from: req, to: node.id });
  }
  return { rows, edges, byId };
}
