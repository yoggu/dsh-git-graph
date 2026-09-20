import * as React from 'react'
import { commitActions, describeBadge, operationActions, refActions, stashActions, workingActions } from './actions.js'
import { call } from './api.js'
import { ACCORDION_H, ACCORDION_MAX_H, ACCORDION_MIN_H, ACCORDION_SPLIT, LANE_W, LANE_X0, ROW_H } from './constants.js'
import { ActionDialog, operationLabel } from './dialog.js'
import { openCompareTab } from './files.js'
import { layout } from './graph-layout.js'
import { CommitRow, GraphCanvas, matchesFilter } from './graph-ui.js'
import { accordionLayoutBySession, CommitAccordion, openAccordionBySession, WorkingAccordion } from './accordions.js'
import { useRepositoryWatch } from './live.js'
import { CompactDropdown, ContextMenu, formatTime, GitIcon } from './ui.js'

const h = React.createElement

/**
 * The comparison a reader is assembling, per DSH session.
 *
 * A marking has to survive a visit to a Diff tab and come back with the graph,
 * the way the open accordion does: the comparison is usually assembled by
 * looking at commits, and losing it because a file was opened in between would
 * make it unusable for the question it answers. It lives in plugin memory only,
 * is scoped by session, and is never persisted.
 */
export const markersBySession = new Map()

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

/**
 * One line describing what a fetch did.
 *
 * A fetch is the only thing this plugin does that another machine can answer,
 * so its outcome is worth saying plainly: what appeared, what moved, what is
 * gone — or that there is nothing to fetch from.
 *
 * @param result - the host's answer to the fetch request.
 * @returns a short report for the reader.
 */
export function describeFetch(result) {
  if (typeof result?.error === 'string' && result.error.length > 0) return `Fetch failed — ${result.error}`
  if (typeof result?.skipped === 'string' && result.skipped.length > 0) return result.skipped
  const parts = []
  const added = result?.added?.length ?? 0
  const updated = result?.updated?.length ?? 0
  const pruned = result?.pruned?.length ?? 0
  if (added > 0) parts.push(`${added} new branch${added === 1 ? '' : 'es'}`)
  if (updated > 0) parts.push(`${updated} updated`)
  if (pruned > 0) parts.push(`${pruned} deleted`)
  return parts.length === 0 ? 'Already up to date' : `Remote: ${parts.join(', ')}`
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
  const [fetching, setFetching] = React.useState(false)
  const [pruning, setPruning] = React.useState(false)
  const [readAt, setReadAt] = React.useState(null)
  const [revision, setRevision] = React.useState(0)
  // Which branch's history is shown, and what is being searched for. The first
  // is a host-side filter — the history is read narrowed — while the second
  // runs over what was loaded.
  const [refFilter, setRefFilter] = React.useState('')
  const [query, setQuery] = React.useState('')
  const [menu, setMenu] = React.useState(null)
  // The action the reader picked, waiting in the confirmation dialog. Nothing
  // has run while this is set.
  const [pending, setPending] = React.useState(null)
  const [notice, setNotice] = React.useState(null)
  const [repo, setRepo] = React.useState(null)
  // The commits a reader has marked for comparison, oldest mark first. Two at
  // most: the first is the base, the second the side it is compared against.
  const [markers, setMarkersState] = React.useState(() => markersBySession.get(sessionId) ?? [])
  const setMarkers = React.useCallback(value => {
    setMarkersState(current => {
      const next = typeof value === 'function' ? value(current) : value
      if (next.length === 0) markersBySession.delete(sessionId)
      else markersBySession.set(sessionId, next)
      return next
    })
  }, [sessionId])
  React.useEffect(() => { setMarkersState(markersBySession.get(sessionId) ?? []) }, [sessionId])
  const request = React.useRef(0)
  const noticeTimer = React.useRef(null)
  const graphRef = React.useRef(null)
  // The reads below are memoized, so they cannot close over the newest state;
  // this ref is how a refresh compares against what is on screen.
  const shown = React.useRef(state)
  shown.current = state
  // A notice is one line; the rest of git's account travels with it as the
  // element's tooltip rather than being cut off with no way to see it.
  const flash = (text, detail) => {
    setNotice({ text, detail: detail ?? null })
    clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 2600)
  }
  /**
   * Read what the repository is in the middle of.
   *
   * The action menus are built from this: a merge in progress offers its own
   * way out instead of actions the host would refuse.
   */
  const loadState = React.useCallback(() => call({ op: 'state', sessionId }, signal)
    // A host that answered without a state — an older build, or a route that
    // failed — leaves the graph with no action menu rather than an exception.
    .then(result => { const state = result?.state ?? null; setRepo(state); return state })
    .catch(error => { if (error.name !== 'AbortError') setRepo(null); return null }), [sessionId, signal])
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
   * @param options.ref - the branch whose history to read; defaults to the current filter.
   */
  const load = React.useCallback(async (append = false, { background = false, report = !background, announce = false, ref = refFilter } = {}) => {
    const id = ++request.current
    if (background) setChecking(true)
    else { setBusy(true); setError(null) }
    try {
      const targetCount = append ? 120 : Math.max(120, Math.min(600, Math.max(state.commits.length, restoreCount.current)))
      const result = await call({
        op: 'commits',
        sessionId,
        skip: append ? state.nextSkip : 0,
        limit: targetCount,
        ...(ref === '' ? {} : { ref }),
      }, signal)
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
        setState(current => ({ ...current, refs: result.refs ?? current.refs, stashes: result.stashes ?? current.stashes, exhausted: result.exhausted, nextSkip: result.nextSkip }))
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
  }, [sessionId, signal, state.nextSkip, state.commits.length, refFilter])
  const refresh = React.useCallback(() => {
    load(false, { background: true, report: true, announce: true })
    loadWorking()
    loadState()
    setRevision(value => value + 1)
  }, [load, loadWorking, loadState])
  /**
   * Take stock after an action ran.
   *
   * git's own account is the notice: it says "Switched to branch 'main'" or
   * lists what a merge brought in, which is more use than any sentence written
   * here. The history, the working tree and the repository state are all
   * re-read afterwards, because an action can change any of the three and the
   * watch push that would normally report it arrives by a different route.
   */
  const afterAction = React.useCallback(result => {
    setPending(null)
    const output = String(result?.output ?? '').trim()
    const [first, ...rest] = output.split('\n')
    flash(output === '' ? `${result?.summary ?? 'Action'} — done` : first, rest.join('\n'))
    load(false, { background: true, report: true })
    loadWorking()
    loadState()
    setRevision(value => value + 1)
  }, [flash, load, loadWorking, loadState])
  /**
   * Fetch from every remote.
   *
   * Pruning is a separate button rather than a hidden modifier: it deletes
   * remote-tracking refs, which is a different promise from "tell me what the
   * remote has", and a reader who wants it should be able to say so with one
   * press and see it named in the report afterwards.
   *
   * @param prune - whether to remove remote-tracking refs the remote no longer has.
   */
  const fetchRemotes = React.useCallback(async (prune = false) => {
    if (prune) setPruning(true)
    else setFetching(true)
    try {
      const result = await call({ op: 'fetch', sessionId, prune }, signal)
      if (signal.aborted) return
      if (typeof result.error === 'string' && result.error.length > 0) setError(describeFetch(result))
      else {
        setError(null)
        flash(describeFetch(result))
      }
      load(false, { background: true, report: true })
      loadWorking()
      loadState()
      setRevision(value => value + 1)
    } catch (err) {
      if (err.name !== 'AbortError') setError(String(err.message ?? err))
    } finally { setFetching(false); setPruning(false) }
  }, [sessionId, signal, load, loadWorking, loadState])
  React.useEffect(() => { load(); loadWorking(); loadState(); return () => { request.current += 1; clearTimeout(noticeTimer.current) } }, [sessionId, signal])
  // The push channel needs no indicator of its own: an arrival shows up as a
  // row, and an outage reports itself in words.
  useRepositoryWatch({
    sessionId,
    visible: tabInfo.tab.visible === true,
    onChanged: React.useCallback(() => { load(false, { background: true }); loadWorking(); loadState() }, [load, loadWorking, loadState]),
    onDegraded: React.useCallback(message => flash(`Live updates unavailable — ${message}`), []),
  })
  const workingCount = React.useMemo(() => new Set(working.files.map(file => file.path)).size, [working.files])
  const remotes = state.refs?.remotes ?? []
  // The find query narrows what is drawn, never what is loaded: the page the
  // host sent stays whole, so clearing the query brings every row back without
  // another read.
  const matched = React.useMemo(
    () => state.commits.filter(commit => matchesFilter(commit, remotes, query)),
    [state.commits, remotes, query],
  )
  const synthetic = React.useMemo(() => ({ hash: 'WORKTREE', parents: [], authorName: '', authorDate: '', refs: [], subject: `Uncommitted changes (${workingCount})`, synthetic: true, count: workingCount }), [workingCount])
  const commits = React.useMemo(() => workingCount > 0 ? [synthetic, ...matched] : matched, [workingCount, synthetic, matched])
  const graph = React.useMemo(() => layout(commits, !state.exhausted), [commits, state.exhausted])
  const selectedIndex = commits.findIndex(commit => commit.hash === selected)
  const expanded = selectedIndex >= 0
  const toggle = commit => selectAccordion(current => current === commit.hash ? null : commit.hash)
  /**
   * Mark a commit as one side of a comparison.
   *
   * A third mark drops the oldest, so the two that remain are always the two
   * most recent choices — the alternative, refusing the click, would leave a
   * reader stuck with a marking they cannot replace.
   */
  const markForComparison = React.useCallback(commit => {
    setMarkers(current => (current.some(entry => entry.hash === commit.hash)
      ? current.filter(entry => entry.hash !== commit.hash)
      : [...current, { hash: commit.hash, subject: commit.subject }].slice(-2)))
  }, [])
  const openComparison = React.useCallback((base, head) => {
    if (base === undefined || base === null) return
    openCompareTab(tabInfo, base, head)
  }, [tabInfo])
  const laneWidth = Math.max(100, LANE_X0 * 2 + graph.columnCount * LANE_W)
  const rows = graph.rows.map((row, index) => h('div', { key: row.commit.hash, className: 'gg-row-stack' },
    h(CommitRow, { row, indent: laneWidth, dense: false, remotes: state.refs?.remotes ?? [], stashes: state.stashes ?? [],
      selected: selected === row.commit.hash, comparing: markers.some(entry => entry.hash === row.commit.hash),
      onSelect: toggle, onCompare: markForComparison,
      onContextMenu: (event, commit) => setMenu({ x: event.clientX, y: event.clientY, commit }),
      onRefContextMenu: (event, badge) => {
        // A detached-HEAD badge names no ref, so it offers no ref actions and
        // the row's own menu stays closed rather than opening an empty one.
        const ref = describeBadge(badge, state.refs?.refs ?? [], state.stashes ?? [])
        if (ref !== null) setMenu({ x: event.clientX, y: event.clientY, ref })
      } }),
    selected === row.commit.hash ? (row.commit.synthetic ? h(WorkingAccordion, { files: working.files, sessionId, signal, tabInfo, onChanged: loadWorking, height: accordionHeight, split: accordionSplit, onHeightChange: setAccordionHeight, onSplitChange: setAccordionSplit }) : h(CommitAccordion, { hash: row.commit.hash, sessionId, signal, revision, tabInfo, onSelect: selectAccordion, height: accordionHeight, split: accordionSplit, onHeightChange: setAccordionHeight, onSplitChange: setAccordionSplit })) : null))
  const totalHeight = graph.rows.length * ROW_H + (expanded ? accordionHeight : 0)
  const stamp = formatTime(readAt)
  const refreshTitle = `Refresh history and working changes${stamp === null ? '' : ` — last read ${stamp}`}`
  // Which actions a menu offers depends on what was pressed: a commit, a ref
  // badge, or the uncommitted row. A half-finished operation replaces all of
  // them, because the host refuses everything else until it is resolved.
  const menuActions = React.useMemo(() => {
    if (menu === null) return []
    const context = { branch: repo?.branch ?? null, remotes: state.refs?.remotes ?? [] }
    if (menu.ref?.kind === 'stash') return stashActions(menu.ref)
    if (menu.ref !== undefined) return refActions(menu.ref, context)
    if (menu.commit === undefined) return []
    if (menu.commit.synthetic === true) return workingActions()
    return commitActions(menu.commit, context)
  }, [menu, repo, state.refs])
  const banner = repo === null ? null : repo.operation !== null
    ? h('div', { className: 'gg-op-banner', role: 'status' },
      h('span', { className: 'gg-op-text' },
        `A ${operationLabel(repo.operation)} is in progress`
        + (repo.conflicts.length === 0 ? '' : ` — ${repo.conflicts.length} conflicted file${repo.conflicts.length === 1 ? '' : 's'}`)
        + '. Other actions are refused until it is finished.'),
      operationActions(repo).map(entry => h('button', {
        key: entry.action, type: 'button', className: 'gg-btn', onClick: () => setPending(entry),
      }, entry.label)))
    : repo.locked
      ? h('div', { className: 'gg-op-banner', role: 'status' },
        h('span', { className: 'gg-op-text' }, 'Another Git process is writing to this repository (index.lock). Writes are refused until it finishes.'))
      : null
  // The branch filter and the find box. One narrows the history the host reads,
  // the other narrows the rows already here; the count says which is in effect.
  const refOptions = React.useMemo(() => {
    const refs = state.refs?.refs ?? []
    const short = prefix => refs.filter(ref => ref.kind === prefix)
    return [
      { value: '', label: 'All branches' },
      { value: 'HEAD', label: 'Current branch only' },
      ...short('branch')
        .map(ref => ({ value: ref.name, label: ref.name.replace(/^refs\/heads\//, '') }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      ...short('tag')
        .map(ref => ({ value: ref.name, label: `tag: ${ref.name.replace(/^refs\/tags\//, '')}` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ]
  }, [state.refs])
  const changeRefFilter = value => {
    setRefFilter(value)
    load(false, { background: true, report: true, ref: value })
  }
  const searching = query.trim() !== ''
  const filterBar = h('div', { className: 'gg-filter-bar' },
    h(CompactDropdown, {
      value: refFilter,
      options: refOptions,
      onChange: changeRefFilter,
      label: 'Branch filter',
      title: 'Show the history of one branch or tag',
      className: 'gg-branch-filter',
    }),
    h('input', {
      type: 'search',
      className: 'gg-find',
      value: query,
      placeholder: 'Find commits…',
      'aria-label': 'Find commits',
      onChange: event => setQuery(event.target.value),
    }),
    searching
      ? h('span', { className: 'gg-find-count', role: 'status' },
        `${matched.length} of ${state.commits.length} loaded commit${state.commits.length === 1 ? '' : 's'}`)
      : null)
  // The comparison a reader is assembling, with the two ways out of it: two
  // marks compare against each other, one mark compares against the working
  // tree — the question an agent's uncommitted work raises.
  const compareBar = markers.length === 0 ? null : h('div', { className: 'gg-compare-bar', role: 'status' },
    h('span', { className: 'gg-compare-text' }, markers.length === 1
      ? `Marked ${markers[0].hash.slice(0, 8)} — mark a second commit, or compare it with the working tree`
      : `${markers[0].hash.slice(0, 8)} → ${markers[1].hash.slice(0, 8)}`),
    markers.length === 2
      ? h('button', { type: 'button', className: 'gg-btn', onClick: () => openComparison(markers[0].hash, markers[1].hash) }, 'Compare')
      : null,
    markers.length === 1 && repo?.dirty === true
      ? h('button', { type: 'button', className: 'gg-btn', onClick: () => openComparison(markers[0].hash, '') }, 'Compare with the working tree')
      : null,
    h('button', { type: 'button', className: 'gg-btn', onClick: () => setMarkers([]) }, 'Clear'))
  return h('div', { className: 'gg-root gg-workbench' },
    notice ? h('div', { className: 'gg-notice', role: 'status', title: notice.detail ?? undefined }, notice.text) : null,
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
          (state.refs?.remotes?.length ?? 0) > 0 ? h('button', {
            className: 'gg-icon-btn gg-column-btn',
            'aria-label': 'Fetch from remotes',
            title: `Fetch from ${state.refs.remotes.join(', ')} — updates remote-tracking branches only`,
            disabled: fetching || pruning,
            onClick: () => fetchRemotes(false),
          }, fetching ? h('span', { className: 'gg-spinner', 'aria-hidden': 'true' }) : h(GitIcon, { name: 'download', size: 13 })) : null,
          (state.refs?.remotes?.length ?? 0) > 0 ? h('button', {
            className: 'gg-icon-btn gg-column-btn',
            'aria-label': 'Fetch and prune remote-tracking branches',
            title: `Fetch from ${state.refs.remotes.join(', ')} and remove the remote-tracking branches the remote no longer has`,
            disabled: fetching || pruning,
            onClick: () => fetchRemotes(true),
          }, pruning ? h('span', { className: 'gg-spinner', 'aria-hidden': 'true' }) : h(GitIcon, { name: 'prune', size: 13 })) : null,
          ),
        h('span', null, 'Description'), h('span', null, 'Date'), h('span', null, 'Author'), h('span', null, 'Commit')),
      filterBar,
      banner,
      compareBar,
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
      // The find box searches what is loaded, so a filtered-out graph is not the
      // same as an empty history and must not read like one.
      !busy && !error && state.commits.length > 0 && matched.length === 0
        ? h('div', { className: 'gg-empty' }, 'No loaded commit matches the search. Older history may still hold one — load more, or clear it.')
        : null,
      state.commits.length > 0 && !busy && !state.exhausted ? h('button', { className: 'gg-more-btn', onClick: () => load(true) }, 'Load older commits') : null),
    menu ? h(ContextMenu, {
      menu,
      actions: menuActions,
      onAction: setPending,
      markers: markers.map(entry => entry.hash),
      onCompare: markForComparison,
      onCompareSelected: () => openComparison(markers[0]?.hash, markers[1]?.hash),
      onClose: () => setMenu(null),
      onOpenCommit: toggle,
      onFlash: flash,
    }) : null,
    pending === null ? null : h(ActionDialog, {
      request: pending,
      sessionId,
      signal,
      onClose: () => setPending(null),
      onDone: afterAction,
    })))
}

