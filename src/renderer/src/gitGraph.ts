/**
 * Lane layout for the commit graph in the Log window (like `git log --graph`
 * or TortoiseGit's Graph column). Pure so it can be unit tested.
 */

/** A line inside one row; `y` is 0 (top), 0.5 (dot), or 1 (bottom); `x` is a lane index. */
export interface GraphSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Lane whose color the line uses. */
  lane: number;
}

export interface GraphRow {
  /** Lane of this commit's dot. */
  col: number;
  isMerge: boolean;
  segments: GraphSegment[];
}

export interface GitGraph {
  rows: GraphRow[];
  /** Widest number of lanes used by any row. */
  laneCount: number;
}

/**
 * Assigns each commit (newest first, as `git log` prints them) to a lane and
 * computes the line segments drawn in its row. Parents outside the list (e.g.
 * beyond the log limit or filtered out by a path) simply end their lane.
 */
export function computeGitGraph(commits: ReadonlyArray<{ hash: string; parents: string[] }>): GitGraph {
  const known = new Set(commits.map(c => c.hash));
  let lanes: Array<string | null> = [];
  let laneCount = 0;
  const rows: GraphRow[] = [];

  for (const commit of commits) {
    const before = lanes.slice();
    let col = lanes.indexOf(commit.hash);
    if (col === -1) {
      // A branch tip nobody pointed at yet: take the first free lane.
      col = lanes.indexOf(null);
      if (col === -1) {
        col = lanes.length;
        lanes.push(null);
      }
    }

    const segments: GraphSegment[] = [];
    // Incoming lines: lanes waiting for this commit converge on its dot; others pass through.
    before.forEach((hash, i) => {
      if (hash === null) return;
      segments.push(
        hash === commit.hash
          ? { x1: i, y1: 0, x2: col, y2: 0.5, lane: i }
          : { x1: i, y1: 0, x2: i, y2: 0.5, lane: i },
      );
    });
    lanes = lanes.map(h => (h === commit.hash ? null : h));

    // Outgoing lines to parents: the first parent continues this lane when it can.
    const parents = commit.parents.filter(p => known.has(p));
    parents.forEach((parent, idx) => {
      let lane = lanes.indexOf(parent);
      if (lane === -1) {
        lane = idx === 0 && lanes[col] === null ? col : lanes.indexOf(null);
        if (lane === -1) {
          lane = lanes.length;
          lanes.push(null);
        }
        lanes[lane] = parent;
      }
      segments.push({ x1: col, y1: 0.5, x2: lane, y2: 1, lane: idx === 0 ? col : lane });
    });

    // Lanes that existed above this row continue to the next one (including lanes a parent joins).
    lanes.forEach((hash, i) => {
      if (hash !== null && before[i] === hash) {
        segments.push({ x1: i, y1: 0.5, x2: i, y2: 1, lane: i });
      }
    });

    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();
    laneCount = Math.max(laneCount, before.length, lanes.length, col + 1);
    rows.push({ col, isMerge: commit.parents.length > 1, segments });
  }
  return { rows, laneCount };
}

/** Lane colors, cycled by lane index. */
export const GRAPH_COLORS = ['#3b82f6', '#e5534b', '#22a06b', '#d97706', '#8b5cf6', '#0d9488', '#db2777', '#64748b'];
