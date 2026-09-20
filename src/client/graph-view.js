import * as React from 'react'
import { call } from './api.js'
import { ACCORDION_H, ACCORDION_MAX_H, ACCORDION_MIN_H, ACCORDION_SPLIT, LANE_W, LANE_X0, ROW_H } from './constants.js'
import { layout } from './graph-layout.js'
import { CommitRow, GraphCanvas } from './graph-ui.js'
import { accordionLayoutBySession, CommitAccordion, openAccordionBySession, WorkingAccordion } from './accordions.js'
import { useRepositoryWatch } from './live.js'
import { ContextMenu, formatTime, GitIcon } from './ui.js'

const h = React.createElement

/**
 * Whether two commit lists would draw the same graph.
 *
 * This is what makes a background refresh free: the host pushes on every ref
 * change, but a working-tree edit that touches no ref leaves the history
 * identical, and re-rendering an identical list would only throw away the
 * reader's scroll position. Compares the fields the rows actually draw, the way
 * VS Code Git Graph compares its commit list before it re-renders.
 *
 * @param a - the commits already on screen.
 * @param b - the commits just read.
 * @returns whether nothing visible changed.
 */
export function sameCommits(a, b) {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const left = a[i]
    const right = b[i]
    if (left.hash !== right.hash
      || left.subject !== right.subject
      || left.authorName !== right.authorName
      || left.authorDate !== right.authorDate
      || left.parents.length !== right.parents.length
      || left.parents.some((parent, index) => parent !== right.parents[index])
      || left.refs.length !== right.refs.length
      || left.refs.some((ref, index) => ref !== right.refs[index])) return false
  }
  return true
}

/**
 * How many commits are new relative to what is already drawn.
 *
 * @param previous - the commits on screen before the refresh.
 * @param next - the commits just read.
 * @returns the number of commits above the previously newest one.
 */
export function newCommitCount(previous, next) {
  const head = previous[0]?.hash
  if (head === undefined) return next.length
  const index = next.findIndex(commit => commit.hash === head)
  return index < 0 ? next.length : index
}

/** Accordion history: full-width graph rows, with one row-local expansion. */
export function GraphView({ tabInfo, sessionId }) {
  const signal = tabInfo.tab.signal
  const [state, setState] = React.useState({ commits: [], refs: null, exhausted: false, nextSkip: 0 })
  const [working, setWorking] = React.useState({ files: [], error: null })
  const restoredAccordion = React.useRef(openAccordionBySession.get(sessionId))
  const restoredLayout = React.useRef(accordionLayoutBySession.get(sessionId) ?? { height: ACCORDION_H, split: ACCORDION_SPLIT })
  const [accordionHeight, setAccordionHeightState] = React.useState(restoredLayout.current.height)
  const [accordionSplit, setAccordionSplitState] = React.useState(restoredLayout.current.split)
  const setAccordionHeight = value => { const next = Math.max(ACCORDION_MIN_H, Math.min(ACCORDION_MAX_H, value)); accordionLayoutBySession.set(sessionId, { height: next, split: accordionSplit }); setAccordionHeightState(next) }
  const setAccordionSplit = value => { const next = Math.max(25, Math.min(75, value)); accordionLayoutBySession.set(sessionId, { height: accordionHeight, split: next }); setAccordionSplitState(next) }
  React.useEffect(() => { const next = accordionLayoutBySession.get(sessionId) ?? { height: ACCORDION_H, split: ACCORDION_SPLIT }; setAccordionHeightState(next.height); setAccordionSplitState(next.split) }, [sessionId])
  const restoreCount = React.useRef(Math.max(120, Math.min(600, restoredAccordion.current?.loadedCount ?? 0)))
  const [selected, setSelected] = React.useState(() => restoredAccordion.current?.hash ?? null)
  const selectAccordion = React.useCallback(value => {
    setSelected(current => {
      const next = typeof value === 'function' ? value(current) : value
      if (next === null) openAccordionBySession.delete(sessionId)
      else openAccordionBySession.set(sessionId, { hash: next, loadedCount: Math.max(state.commits.length, openAccordionBySession.get(sessionId)?.loadedCount ?? 0) })
      return next
    })
  }, [sessionId, state.commits.length])
  const [error, setError] = React.useState(null)
  const [busy, setBusy] = React.useState(false)
  // A background refresh is not the same as loading: it must not blank the view
  // or announce itself as history being read.
  const [checking, setChecking] = React.useState(false)
  const [readAt, setReadAt] = React.useState(null)
  const [revision, setRevision] = React.useState(0)
  const [menu, setMenu] = React.useState(null)
  const [notice, setNotice] = React.useState(null)
  const request = React.useRef(0)
  const noticeTimer = React.useRef(null)
  const graphRef = React.useRef(null)
  // The reads below are memoized, so they cannot close over the newest state;
  // this ref is how a refresh compares against what is on screen.
  const shown = React.useRef(state)
  shown.current = state
  const flash = text => { setNotice(text); clearTimeout(noticeTimer.current); noticeTimer.current = setTimeout(() => setNotice(null), 2600) }
  const loadWorking = React.useCallback(() => call({ op: 'working', sessionId }, signal).then(result => {
    const files = ['staged', 'unstaged', 'untracked'].flatMap(group => (result[group] ?? []).map(entry => ({ ...entry, group, staged: group === 'staged' })))
    setWorking({ files, error: null }); setReadAt(new Date()); return files
  }).catch(err => { if (err.name !== 'AbortError') setWorking(current => ({ ...current, error: String(err.message ?? err) })); return [] }), [sessionId, signal])
  /**
   * Read the history again.
   *
   * @param append - read the next page instead of the first, for "Load older commits".
   * @param options.background - a refresh that must not blank the view or claim to be loading.
   * @param options.report - whether a failure is worth showing. A push-driven refresh stays silent.
   * @param options.announce - whether an unchanged result is still worth a word, which only a
   *   refresh the reader asked for is.
   */
  const load = React.useCallback(async (append = false, { background = false, report = !background, announce = false } = {}) => {
    const id = ++request.current
    if (background) setChecking(true)
    else { setBusy(true); setError(null) }
    try {
      const targetCount = append ? 120 : Math.max(120, Math.min(600, Math.max(state.commits.length, restoreCount.current)))
      const result = await call({ op: 'commits', sessionId, skip: append ? state.nextSkip : 0, limit: targetCount }, signal)
      if (request.current !== id || signal.aborted) return
      const previous = shown.current.commits
      const loadedCount = append ? state.commits.length + result.commits.length : result.commits.length
      const saved = openAccordionBySession.get(sessionId)
      if (saved?.hash) openAccordionBySession.set(sessionId, { ...saved, loadedCount: Math.max(saved.loadedCount ?? 0, loadedCount) })
      restoreCount.current = Math.max(restoreCount.current, loadedCount)
      setReadAt(new Date())
      if (background && !append && sameCommits(previous, result.commits)) {
        // Nothing the graph draws has changed. Keep the rendered rows — and with
        // them the reader's scroll position and open accordion — by leaving the
        // commit list identity alone.
        setState(current => ({ ...current, refs: result.refs ?? current.refs, exhausted: result.exhausted, nextSkip: result.nextSkip }))
        if (announce) flash('Up to date')
        return
      }
      setState(current => ({ ...result, refs: result.refs ?? current.refs, commits: append ? [...current.commits, ...result.commits] : result.commits }))
      // Only an arrival is news. A ref that moved, or history rewritten under an
      // unchanged head, is visible in the rows themselves — and saying so would
      // talk over the report of whatever action caused it.
      const added = previous.length === 0 ? 0 : newCommitCount(previous, result.commits)
      if (added > 0) flash(`${added} new commit${added === 1 ? '' : 's'}`)
      else if (announce) flash('History updated')
      /* selection stays closed until the reader clicks a row */
    } catch (err) {
      // A failed background refresh keeps the rows it could not replace.
      if (request.current === id && err.name !== 'AbortError' && report) setError(String(err.message ?? err))
    }
    // Whichever read finishes last owns both flags. A background push can
    // supersede a read that set `busy`, and a guard that only cleared the flag
    // it set itself would leave the spinner on forever.
    finally { if (request.current === id) { setChecking(false); setBusy(false) } }
  }, [sessionId, signal, state.nextSkip, state.commits.length])
  const refresh = React.useCallback(() => {
    load(false, { background: true, report: true, announce: true })
    loadWorking()
    setRevision(value => value + 1)
  }, [load, loadWorking])
  React.useEffect(() => { load(); loadWorking(); return () => { request.current += 1; clearTimeout(noticeTimer.current) } }, [sessionId, signal])
  const live = useRepositoryWatch({
    sessionId,
    visible: tabInfo.tab.visible === true,
    onChanged: React.useCallback(() => { load(false, { background: true }); loadWorking() }, [load, loadWorking]),
    onDegraded: React.useCallback(message => flash(`Live updates unavailable — ${message}`), []),
  })
  const workingCount = React.useMemo(() => new Set(working.files.map(file => file.path)).size, [working.files])
  const synthetic = React.useMemo(() => ({ hash: 'WORKTREE', parents: [], authorName: '', authorDate: '', refs: [], subject: `Uncommitted changes (${workingCount})`, synthetic: true, count: workingCount }), [workingCount])
  const commits = React.useMemo(() => workingCount > 0 ? [synthetic, ...state.commits] : state.commits, [workingCount, synthetic, state.commits])
  const graph = React.useMemo(() => layout(commits, !state.exhausted), [commits, state.exhausted])
  const selectedIndex = commits.findIndex(commit => commit.hash === selected)
  const expanded = selectedIndex >= 0
  const toggle = commit => selectAccordion(current => current === commit.hash ? null : commit.hash)
  const laneWidth = Math.max(100, LANE_X0 * 2 + graph.columnCount * LANE_W)
  const rows = graph.rows.map((row, index) => h('div', { key: row.commit.hash, className: 'gg-row-stack' },
    h(CommitRow, { row, indent: laneWidth, dense: false, remotes: state.refs?.remotes ?? [], selected: selected === row.commit.hash,
      onSelect: toggle, onCompare: toggle, onContextMenu: (event, commit) => setMenu({ x: event.clientX, y: event.clientY, commit }) }),
    selected === row.commit.hash ? (row.commit.synthetic ? h(WorkingAccordion, { files: working.files, tabInfo, height: accordionHeight, split: accordionSplit, onHeightChange: setAccordionHeight, onSplitChange: setAccordionSplit }) : h(CommitAccordion, { hash: row.commit.hash, sessionId, signal, revision, tabInfo, onSelect: selectAccordion, height: accordionHeight, split: accordionSplit, onHeightChange: setAccordionHeight, onSplitChange: setAccordionSplit })) : null))
  const totalHeight = graph.rows.length * ROW_H + (expanded ? accordionHeight : 0)
  const stamp = formatTime(readAt)
  const refreshTitle = `Refresh history and working changes${stamp === null ? '' : ` — last read ${stamp}`}`
  return h('div', { className: 'gg-root gg-workbench' },
    notice ? h('div', { className: 'gg-notice', role: 'status' }, notice) : null,
    h('section', { className: 'gg-root gg-history', style: { '--gg-lane-width': `${laneWidth}px` }, 'aria-label': 'Commit history' },
      h('div', { className: 'gg-section-heading gg-column-heading' },
        h('span', { className: 'gg-column-actions' },
          h('span', { className: 'gg-sr-only' }, 'Graph'),
          h('button', {
            className: 'gg-icon-btn gg-column-btn',
            'aria-label': 'Refresh history and working changes',
            title: refreshTitle,
            disabled: busy,
            onClick: refresh,
          }, busy || checking
            ? h('span', { className: 'gg-spinner', 'aria-hidden': 'true' })
            : h(GitIcon, { name: 'refresh', size: 13 })),
          h('span', {
            className: `gg-live-dot${live ? ' is-live' : ''}`,
            'data-live': live ? 'on' : 'off',
            'aria-hidden': 'true',
            title: live ? 'Watching the repository for changes' : 'Live updates unavailable — refresh manually',
          })),
        h('span', null, 'Description'), h('span', null, 'Date'), h('span', null, 'Author'), h('span', null, 'Commit')),
      error ? h('div', { className: 'gg-error', role: 'alert' }, error) : null,
      // A working-tree read can fail on its own — a repository whose history is
      // readable but whose working tree is not. Saying so keeps an empty file
      // list from reading as a clean tree.
      error === null && working.error !== null ? h('div', { className: 'gg-error', role: 'alert' }, `Working tree: ${working.error}`) : null,
      h('div', { ref: graphRef, className: 'gg-graph', style: { '--gg-lane-width': `${laneWidth}px` }, 'aria-busy': busy, onKeyDown: event => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
        event.preventDefault(); const index = selectedIndex < 0 ? 0 : selectedIndex; const next = event.key === 'Home' ? 0 : event.key === 'End' ? commits.length - 1 : Math.max(0, Math.min(commits.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))); const commit = commits[next]
        if (commit) { toggle(commit); graphRef.current.querySelectorAll('.gg-row')[next]?.focus({ preventScroll: true }); graphRef.current.querySelectorAll('.gg-row')[next]?.scrollIntoView({ block: 'nearest' }) }
      } }, h('div', { className: 'gg-graph-inner', style: { height: totalHeight } }, h(GraphCanvas, { ...graph, height: totalHeight, expandedRow: expanded ? selectedIndex : -1, expandedHeight: expanded ? accordionHeight : 0 }), h('div', { className: 'gg-rows' }, rows)),
      busy ? h('div', { className: 'gg-history-status', role: 'status' }, h('span', { className: 'gg-spinner', 'aria-hidden': 'true' }), h('span', null, state.commits.length ? 'Loading older history…' : 'Loading history…')) : null,
      !busy && !error && !state.commits.length ? h('div', { className: 'gg-empty' }, 'No commits yet. Review uncommitted files above.') : null,
      state.commits.length > 0 && !busy && !state.exhausted ? h('button', { className: 'gg-more-btn', onClick: () => load(true) }, 'Load older commits') : null),
    menu ? h(ContextMenu, { menu, markers: [], onClose: () => setMenu(null), onOpenCommit: toggle, onFlash: flash }) : null))
}

