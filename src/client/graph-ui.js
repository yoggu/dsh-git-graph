import * as React from 'react'
import { DOT_R, LANE_COLORS, LANE_W, LANE_X0, ROW_H } from './constants.js'
import { graphEdgePath } from './graph-layout.js'
import { GitIcon } from './ui.js'

const h = React.createElement

/**
 * The lane colour for one slot.
 *
 * @param slot - the lane's colour slot.
 * @returns the CSS colour.
 */
export function laneColor(slot) {
  return LANE_COLORS[Math.abs(slot) % LANE_COLORS.length]
}

/**
 * Classify a ref name into the badge it should wear.
 *
 * @param ref - the raw ref token from `git log --decorate`.
 * @returns the label, its kind, and whether HEAD points here.
 */
export function parseRef(ref, remotes) {
  const text = ref.trim()
  const isHead = text.startsWith('HEAD -> ')
  const name = isHead ? text.slice('HEAD -> '.length) : text
  // `HEAD` alone means a detached HEAD: there is no branch name to show, so
  // the badge says only that, rather than claiming a branch called HEAD.
  if (name === 'HEAD') return { label: 'HEAD', kind: 'detached', prefix: null, remote: null }
  if (isHead) return { label: name, kind: 'head', prefix: 'HEAD', remote: null }
  if (name.startsWith('tag: ')) return { label: name.slice(5), kind: 'tag', prefix: null, remote: null }
  // A stash is not a branch: `refs/stash` is the newest one and it is spelled
  // with a full ref path, which would otherwise be read as a branch of that
  // name. The position the row's badge shows comes from the stash list.
  if (name === 'refs/stash') return { label: 'stash', kind: 'stash', prefix: null, remote: null }
  // A remote-tracking name is `<remote>/<branch>`, and the remote names are
  // known, so the split is made against them rather than at the first slash:
  // `origin/feature/x` is remote `origin`, branch `feature/x`, not remote
  // `origin/feature`. Longest name first, so `my/remote` beats `my`.
  const ordered = [...(remotes ?? [])].sort((a, b) => b.length - a.length)
  for (const remote of ordered) {
    if (name.startsWith(`${remote}/`) && name.length > remote.length + 1) {
      return { label: name.slice(remote.length + 1), kind: 'remote', prefix: null, remote }
    }
  }
  return { label: name, kind: 'branch', prefix: null, remote: null }
}

/**
 * Fold a row's decoration into one badge per branch.
 *
 * Git reports a local branch and each remote-tracking branch as separate
 * tokens. Printing them all produces several pills that mostly repeat one
 * name — `main`, `origin/main`, `upstream/main` — and pushes the subject out
 * of the row.
 *
 * A remote-tracking branch that still sits on its local branch's commit says
 * nothing the local branch has not already said, so it rides along inside that
 * branch's badge as the remote's name. One that has drifted sits on another
 * commit with no local branch of that name beside it, and therefore keeps its
 * own full-name badge — which is the only case where `origin/…` is worth the
 * space. This mirrors VS Code Git Graph's combined local/remote labels.
 *
 * @param refs - the row's decoration tokens.
 * @param remotes - the configured remote names, which decide where a
 *   remote-tracking name stops being a remote and starts being a branch.
 * @param options - the row's commit id, and the stashes, so a stash badge can
 *   be named by the position it holds in the stash list rather than by the one
 *   ref name every stash shares.
 * @returns one entry per distinct branch, tag, stash or detached HEAD.
 */
export function groupRefs(refs, remotes, options = {}) {
  const priority = { head: 0, branch: 1, remote: 2, tag: 3, stash: 4, detached: 5 }
  const stashes = options.stashes ?? []
  const parsed = refs.map(ref => parseRef(ref, remotes))
  const entries = []
  // Local branches, indexed by the name a remote-tracking branch would carry.
  const local = new Map()
  const simple = (ref, title) => ({
    key: `${ref.kind}:${ref.label}`,
    kind: ref.kind,
    text: ref.label,
    label: ref.label,
    remote: null,
    title,
    remotes: [],
  })
  for (const ref of parsed) {
    if (ref.kind !== 'head' && ref.kind !== 'branch') continue
    const entry = simple(ref, ref.kind === 'head' ? `HEAD is at ${ref.label}` : ref.label)
    if (!local.has(ref.label)) local.set(ref.label, entry)
    entries.push(entry)
  }
  for (const ref of parsed) {
    if (ref.kind === 'tag') { entries.push(simple(ref, `tag ${ref.label}`)); continue }
    if (ref.kind === 'detached') { entries.push(simple(ref, ref.label)); continue }
    if (ref.kind === 'stash') {
      const entry = stashes.find(item => item.hash === options.hash)
      const label = entry === undefined ? ref.label : `stash@{${entry.index}}`
      entries.push({
        key: `stash:${label}`,
        kind: 'stash',
        text: label,
        label,
        remote: null,
        title: entry?.subject ?? 'stash',
        remotes: [],
      })
      continue
    }
    if (ref.kind !== 'remote') continue
    const text = `${ref.remote}/${ref.label}`
    const host = local.get(ref.label)
    if (host !== undefined) {
      if (!host.remotes.some(remote => remote.name === ref.remote)) {
        host.remotes.push({ name: ref.remote, full: text })
      }
      continue
    }
    entries.push({
      key: `remote:${text}`, kind: 'remote', text, label: ref.label, remote: ref.remote, title: text, remotes: [],
    })
  }
  const seen = new Set()
  return entries.filter(entry => seen.has(entry.key) ? false : (seen.add(entry.key), true))
    .sort((a, b) => (priority[a.kind] ?? 9) - (priority[b.kind] ?? 9))
}

/**
 * Render the per-commit badges a graph row wears.
 *
 * A badge that absorbed its remote-tracking branches shows each remote's name
 * after the branch name, separated by a rule and italicised — the same shape VS
 * Code Git Graph uses, so `main` next to a remote reads as one branch that is
 * in sync rather than as two branches that happen to share a name.
 *
 * A badge is also where a branch's own actions start: the press is stopped
 * here, so right-clicking a label opens the branch's menu rather than the
 * commit row's.
 *
 * @param refs - the row's already-grouped badges.
 * @param onContextMenu - asked to open a menu for the badge that was pressed.
 * @returns the badge elements.
 */
export function RefBadges({ refs, onContextMenu }) {
  if (refs.length === 0) return null
  return h('span', { className: 'gg-refs' }, refs.slice(0, 3).map(ref => h('span', {
    key: ref.key,
    className: `gg-ref gg-ref-${ref.kind}`,
    title: ref.title,
    onContextMenu: onContextMenu === undefined ? undefined : (event) => {
      event.preventDefault()
      event.stopPropagation()
      onContextMenu(event, ref)
    },
  }, h('span', { className: 'gg-ref-icon' }, h(GitIcon, { name: 'branch', size: 13 })),
  h('span', { className: 'gg-ref-name' }, ref.text),
  ...ref.remotes.map(remote => h('span', {
    key: remote.full,
    className: 'gg-ref-remote-name',
    title: remote.full,
  }, remote.name)))))
}

// BEGIN GRAPH CANVAS
export function GraphCanvas({ rows, edges, columnCount, height, expandedRow = -1, expandedHeight = 0 }) {
  const width = LANE_X0 * 2 + columnCount * LANE_W
  // The accordion occupies real row space. Keep the lane algorithm pure,
  // but shift endpoints below the open row so rails still meet their dots.
  const offsets = rows.map((_, row) => row > expandedRow ? expandedHeight : 0)
  const syntheticPath = rows[0]?.commit?.synthetic && rows.length > 1 ? h('path', {
    key: 'working-link', d: `M ${LANE_X0 + rows[0].column * LANE_W} ${ROW_H / 2} L ${LANE_X0 + rows[1].column * LANE_W} ${ROW_H + ROW_H / 2 + (offsets[1] || 0)}`,
    stroke: '#8b949e', strokeWidth: 1.8, fill: 'none', strokeLinecap: 'round', opacity: 0.85,
  }) : null
  const paths = [...(syntheticPath ? [syntheticPath] : []), ...edges.map((edge, i) => h('path', {
    key: `e${i}`,
    d: graphEdgePath(edge, rows.length, offsets, expandedRow >= 0 ? expandedHeight : 0),
    stroke: edge.from?.commit?.synthetic || rows[edge.from.row]?.commit?.synthetic
      ? '#8b949e' : laneColor(edge.slot),
    strokeWidth: edge.main ? 1.8 : 1.5,
    fill: 'none',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    opacity: edge.to === null ? 0.7 : 1,
  }))]
  const dots = rows.map((row, i) => {
    const merge = row.commit.parents.length > 1
    const color = row.commit.synthetic ? '#8b949e' : laneColor(row.slot)
    return h('circle', {
      key: `d${i}`,
      cx: LANE_X0 + row.column * LANE_W,
      cy: i * ROW_H + ROW_H / 2 + offsets[i],
      r: merge ? DOT_R : DOT_R - 0.5,
      fill: merge ? 'var(--dsw-alias-bg-base)' : color,
      stroke: color,
      strokeWidth: merge ? 1.8 : 0,
    })
  })
  return h('svg', {
    className: 'gg-canvas',
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    'aria-hidden': 'true',
  }, paths, dots)
}
// END GRAPH CANVAS

/**
 * Render one commit row: its lane cell, its labels, and its metadata.
 *
 * The row reserves the graph's own width as a fixed indent. The graph is
 * drawn in one absolutely-positioned layer over the whole list, so a row
 * that did not reserve that space would put its text underneath the lanes —
 * which is exactly what makes a lane graph unreadable.
 *
 * Badges come before the subject rather than after it. A badge is short and
 * finite; a subject is the thing that gets long, so the subject is what
 * absorbs the shortage and ellipsizes. Metadata is the first thing dropped
 * when the column is narrow, because a truncated hash or a clipped date
 * tells a reader nothing while a truncated subject still does.
 *
 * @param props - the row, the indent, the selection state, and the actions.
 * @returns the row element.
 */
export function CommitRow({ row, indent, dense, remotes, stashes, selected, comparing, onSelect, onCompare, onContextMenu, onRefContextMenu }) {
  const commit = row.commit
  const when = new Date(commit.authorDate)
  const stamp = Number.isNaN(when.getTime())
    ? commit.authorDate
    : when.toLocaleString(undefined, {
      year: '2-digit', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  const grouped = groupRefs(commit.refs, remotes, { hash: commit.hash, stashes })
  return h('div', {
    className: `gg-row${selected ? ' is-selected' : ''}${comparing ? ' is-comparing' : ''}`,
    role: 'button',
    'aria-pressed': selected,
    'aria-expanded': selected,
    'aria-controls': selected ? `gg-accordion-${commit.hash}` : undefined,
    tabIndex: selected ? 0 : -1,
    title: `${commit.hash}\n${commit.subject}\n${commit.authorName} — ${stamp}`,
    style: { '--gg-lane-width': `${indent}px`, '--gg-ref-color': commit.synthetic ? '#8b949e' : laneColor(row.slot) },
    onClick: (event) => {
      if (event.metaKey || event.ctrlKey) { onCompare(commit); return }
      onSelect(commit)
    },
    onContextMenu: (event) => {
      event.preventDefault()
      onContextMenu(event, commit)
    },
    onKeyDown: (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onSelect(commit)
      }
    },
  },
  h('span', { className: 'gg-row-body' },
    h('span', { className: 'gg-description' },
      grouped.length > 0 ? h(RefBadges, { refs: grouped, onContextMenu: onRefContextMenu }) : null,
      h('span', { className: 'gg-subject', title: commit.subject }, commit.subject)),
    h('span', { className: 'gg-row-meta' },
      h('span', { className: 'gg-author' }, commit.synthetic ? `${commit.count ?? 0} files` : commit.authorName),
      h('span', { className: 'gg-date' }, commit.synthetic ? '' : stamp),
      h('span', { className: 'gg-hash' }, commit.synthetic ? '' : commit.hash.slice(0, 8)))))
}

