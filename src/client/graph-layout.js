import { LANE_W, LANE_X0, ROW_H } from './constants.js'

/**
 * Topological, newest-first history. Live tracks reserve their columns until
 * their actual parent dot. The oldest incoming lane owns that dot and its
 * first-parent continuation. A shared ancestor gets a trunk and a return
 * rail: further topic branches join that rail near their child, rather than
 * allocating one permanent column per historical merge. Columns are reusable;
 * colour identities survive independently of columns.
 */
export function layout(commits, hasMore) {
  const index = new Map(commits.map((commit, row) => [commit.hash, row]))
  // Identify first-parent spines before routing. This lets fifty short
  // branches with the same base share ONE return rail while the base's
  // own spine keeps its separate, stable lane.
  const owner = new Map()
  commits.forEach(commit => {
    let hash = commit.hash
    while (hash !== undefined && !owner.has(hash)) {
      owner.set(hash, commit.hash)
      hash = commits[index.get(hash)]?.parents[0]
    }
  })
  const tracks = []
  const rows = []
  const edges = []
  let nextSlot = 0
  let columnCount = 1

  const freeColumn = () => {
    const free = tracks.findIndex(track => track === null)
    return free === -1 ? tracks.length : free
  }
  const occupy = (column, track) => {
    tracks[column] = track
    columnCount = Math.max(columnCount, column + 1)
  }

  commits.forEach((commit, row) => {
    const incoming = []
    tracks.forEach((track, column) => {
      if (track !== null && track.parent === commit.hash) incoming.push({ ...track, column })
    })
    // Age, rather than proximity or arrival order of this commit's children,
    // preserves the trunk when a topic branch reaches its shared ancestor.
    incoming.sort((a, b) => Number(b.owner === owner.get(commit.hash)) - Number(a.owner === owner.get(commit.hash)) || a.slot - b.slot || a.column - b.column)
    const column = incoming.length ? incoming[0].column : freeColumn()
    const slot = incoming.length ? incoming[0].slot : nextSlot++
    columnCount = Math.max(columnCount, column + 1)
    const point = { row, column }
    incoming.forEach(track => {
      track.edges.forEach(edge => { edge.to = point })
      tracks[track.column] = null
    })
    rows.push({ commit, column, slot })

    const seen = new Set()
    commit.parents.forEach((parent, parentIndex) => {
      if (seen.has(parent)) return
      seen.add(parent)
      const target = index.get(parent)
      // A filtered/shallow end is not an invented continuation. Only an
      // explicitly incomplete page reserves tracks for unloaded ancestors.
      if (target === undefined && !hasMore) return
      if (target !== undefined && target <= row) return
      const main = parentIndex === 0
      const waiting = []
      tracks.forEach((track, trackColumn) => {
        if (track !== null && track.parent === parent) waiting.push({ track, column: trackColumn })
      })
      waiting.sort((a, b) => a.track.slot - b.track.slot)
      // Every edge joining a rail turns INTO it immediately, so freeing its
      // old source column cannot create a hidden overlapping vertical line.
      // A first-parent spine is never sacrificed to an existing topic rail.
      const spine = owner.get(commit.hash)
      const continuesSpine = owner.get(parent) === spine
      const shared = main
        ? continuesSpine ? null : waiting.find(item => item.track.owner !== owner.get(parent))
        : waiting[0]
      const trackColumn = shared ? shared.column : main ? column : freeColumn()
      const trackSlot = shared ? shared.track.slot : main ? slot : nextSlot++
      const edge = { from: point, to: null, column: trackColumn, slot: trackSlot, main, parent }
      edges.push(edge)
      if (shared) {
        shared.track.edges.push(edge)
      } else {
        occupy(trackColumn, { parent, slot: trackSlot, owner: main ? spine : owner.get(parent), edges: [edge] })
      }
    })
    // A root without an incoming track may have occupied an appended column
    // only for its dot. Keep the free slot reusable by the next component.
    if (tracks[column] === undefined) tracks[column] = null
  })
  return { rows, edges, columnCount }
}

/**
 * A route has an independently reserved middle column. Extra-parent lines
 * leave at the merge child, while branch-source joins land at the ancestor
 * itself. Both bends fit inside the endpoint row, never half a history away.
 */
export function graphEdgePath(edge, rowCount, offsets = [], extraHeight = 0) {
  const x = column => LANE_X0 + column * LANE_W
  const y = row => row * ROW_H + ROW_H / 2 + (offsets[row] || 0)
  const x1 = x(edge.from.column)
  const y1 = y(edge.from.row)
  const trackX = x(edge.column)
  const x2 = edge.to === null ? trackX : x(edge.to.column)
  const y2 = edge.to === null ? rowCount * ROW_H + extraHeight : y(edge.to.row)
  const bend = Math.min(10, ROW_H * 0.4, Math.max(0, (y2 - y1) / 2))
  let path = `M ${x1} ${y1}`
  if (x1 !== trackX) {
    path += ` C ${x1} ${y1 + bend * 0.6} ${trackX} ${y1 + bend * 0.4} ${trackX} ${y1 + bend}`
  }
  if (trackX !== x2) {
    path += ` L ${trackX} ${y2 - bend}`
    path += ` C ${trackX} ${y2 - bend * 0.4} ${x2} ${y2 - bend * 0.6} ${x2} ${y2}`
  } else {
    path += ` L ${x2} ${y2}`
  }
  return path
}
