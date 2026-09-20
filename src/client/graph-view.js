import * as React from 'react'
import { call } from './api.js'
import { ACCORDION_H, ACCORDION_MAX_H, ACCORDION_MIN_H, ACCORDION_SPLIT, LANE_W, LANE_X0, ROW_H } from './constants.js'
import { layout } from './graph-layout.js'
import { CommitRow, GraphCanvas } from './graph-ui.js'
import { accordionLayoutBySession, CommitAccordion, openAccordionBySession, WorkingAccordion } from './accordions.js'
import { ContextMenu } from './ui.js'

const h = React.createElement

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
  const [revision, setRevision] = React.useState(0)
  const [menu, setMenu] = React.useState(null)
  const [notice, setNotice] = React.useState(null)
  const request = React.useRef(0)
  const noticeTimer = React.useRef(null)
  const graphRef = React.useRef(null)
  const loadWorking = React.useCallback(() => call({ op: 'working', sessionId }, signal).then(result => {
    const files = ['staged', 'unstaged', 'untracked'].flatMap(group => (result[group] ?? []).map(entry => ({ ...entry, group, staged: group === 'staged' })))
    setWorking({ files, error: null }); return files
  }).catch(err => { if (err.name !== 'AbortError') setWorking(current => ({ ...current, error: String(err.message ?? err) })); return [] }), [sessionId, signal])
  const load = React.useCallback(async (append = false) => {
    const id = ++request.current
    setBusy(true); setError(null)
    try {
      const targetCount = append ? 120 : Math.max(120, Math.min(600, Math.max(state.commits.length, restoreCount.current)))
      const result = await call({ op: 'commits', sessionId, skip: append ? state.nextSkip : 0, limit: targetCount }, signal)
      if (request.current !== id || signal.aborted) return
      const loadedCount = append ? state.commits.length + result.commits.length : result.commits.length
      const saved = openAccordionBySession.get(sessionId)
      if (saved?.hash) openAccordionBySession.set(sessionId, { ...saved, loadedCount: Math.max(saved.loadedCount ?? 0, loadedCount) })
      restoreCount.current = Math.max(restoreCount.current, loadedCount)
      setState(current => ({ ...result, refs: result.refs ?? current.refs, commits: append ? [...current.commits, ...result.commits] : result.commits }))
      /* selection stays closed until the reader clicks a row */
    } catch (err) { if (request.current === id && err.name !== 'AbortError') setError(String(err.message ?? err)) }
    finally { if (request.current === id) setBusy(false) }
  }, [sessionId, signal, state.nextSkip, state.commits.length])
  React.useEffect(() => { load(); loadWorking(); return () => { request.current += 1; clearTimeout(noticeTimer.current) } }, [sessionId, signal])
  const workingCount = React.useMemo(() => new Set(working.files.map(file => file.path)).size, [working.files])
  const synthetic = React.useMemo(() => ({ hash: 'WORKTREE', parents: [], authorName: '', authorDate: '', refs: [], subject: `Uncommitted changes (${workingCount})`, synthetic: true, count: workingCount }), [workingCount])
  const commits = React.useMemo(() => workingCount > 0 ? [synthetic, ...state.commits] : state.commits, [workingCount, synthetic, state.commits])
  const graph = React.useMemo(() => layout(commits, !state.exhausted), [commits, state.exhausted])
  const selectedIndex = commits.findIndex(commit => commit.hash === selected)
  const expanded = selectedIndex >= 0
  const flash = text => { setNotice(text); clearTimeout(noticeTimer.current); noticeTimer.current = setTimeout(() => setNotice(null), 1800) }
  const toggle = commit => selectAccordion(current => current === commit.hash ? null : commit.hash)
  const laneWidth = Math.max(100, LANE_X0 * 2 + graph.columnCount * LANE_W)
  const rows = graph.rows.map((row, index) => h('div', { key: row.commit.hash, className: 'gg-row-stack' },
    h(CommitRow, { row, indent: laneWidth, dense: false, remotes: state.refs?.remotes ?? [], selected: selected === row.commit.hash,
      onSelect: toggle, onCompare: toggle, onContextMenu: (event, commit) => setMenu({ x: event.clientX, y: event.clientY, commit }) }),
    selected === row.commit.hash ? (row.commit.synthetic ? h(WorkingAccordion, { files: working.files, tabInfo, height: accordionHeight, split: accordionSplit, onHeightChange: setAccordionHeight, onSplitChange: setAccordionSplit }) : h(CommitAccordion, { hash: row.commit.hash, sessionId, signal, revision, tabInfo, onSelect: selectAccordion, height: accordionHeight, split: accordionSplit, onHeightChange: setAccordionHeight, onSplitChange: setAccordionSplit })) : null))
  const totalHeight = graph.rows.length * ROW_H + (expanded ? accordionHeight : 0)
  return h('div', { className: 'gg-root gg-workbench' },
    notice ? h('div', { className: 'gg-notice', role: 'status' }, notice) : null,
    h('section', { className: 'gg-root gg-history', style: { '--gg-lane-width': `${laneWidth}px` }, 'aria-label': 'Commit history' },
      h('div', { className: 'gg-section-heading gg-column-heading' },
        h('span', null, h('button', { className: 'gg-column-refresh', 'aria-label': 'Refresh Git', title: 'Refresh history and working changes', disabled: busy, onClick: () => { load(); loadWorking(); setRevision(value => value + 1) } }, 'Graph')),
        h('span', null, 'Description'), h('span', null, 'Date'), h('span', null, 'Author'), h('span', null, 'Commit')),
      error ? h('div', { className: 'gg-error', role: 'alert' }, error) : null,
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

