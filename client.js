/**
 * Browser half of `dsh-git-graph`: the Git Graph tab of the right Sidebar.
 *
 * One tab type with two bodies, because the two questions a reader brings to a
 * repository are asked from the same place:
 *
 *   - **History** — the commit graph, a commit's details, and how that commit
 *     differs from its parent. Every answer is immutable, so it is fetched once
 *     and kept.
 *   - **Changes** — what the working tree holds right now, which is what a
 *     running agent has left uncommitted. Nothing here is kept: the point of the
 *     view is that it is read again on demand, because the answer changes
 *     between two polls.
 *
 * The graph is drawn as SVG lanes. A commit's lane is decided by the order the
 * commits arrive in and by its parents: a commit continues its first parent's
 * lane, and every additional parent starts a branch that merges back in later.
 * The layout is a pure function of the commit page, so a page that grows by
 * loading more commits is laid out from scratch rather than patched.
 *
 * This half never runs git. It asks the host half, which resolves the Session's
 * own workspace and refuses everything else.
 *
 * @module dsh-git-graph/client
 */

window.__ModuleLoader__.load({
  id: 'dsh-git-graph',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { createElement: h } = React

    /** This tab type's identity, and the key its body and title register under. */
    const ID = 'dsh-git-graph'

    /** The tab kind this package owns. */
    const KIND = 'git-graph'

    /** Exact route the host half serves. */
    const ROUTE = '/api/dsh-git-graph'

    /** Lane colours, cycled by lane index. Chosen to stay legible on both themes. */
    const LANE_COLORS = [
      '#4c9aff', '#34c759', '#ff9f0a', '#bf5af2',
      '#ff453a', '#5ac8fa', '#ffd60a', '#ff6482',
    ]

    /** Row geometry of the graph: one commit occupies one row of this height. */
    const ROW_H = 26

    /** Horizontal distance between two lanes. */
    const LANE_W = 14

    /** Left inset of the first lane. */
    const LANE_X0 = 12

    /** Radius of a commit's dot. */
    const DOT_R = 4

    /**
     * Ask the host half one question.
     *
     * @param request - the operation and its arguments.
     * @param signal - cancellation from the tab's lifetime.
     * @returns the answer, or a rejection carrying the host's message.
     */
    async function call(request, signal) {
      const response = await fetch(ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal,
      })
      const payload = await response.json().catch(() => null)
      if (payload === null) throw new Error('git-graph: the host sent no answer')
      if (payload.ok !== true) throw new Error(payload.error ?? 'git-graph: the request failed')
      return payload.result
    }

    /**
     * Lay a page of commits out as lanes.
     *
     * The walk keeps one entry per open lane. A commit claims the lane its first
     * parent already occupies — that is what makes a branch look continuous —
     * and a commit with no lane yet takes the leftmost free one. Every further
     * parent opens a lane that stays open until that parent is reached, which is
     * what draws a merge as a line returning to its own row.
     *
     * Edges are returned as the segments the renderer draws, already resolved to
     * row and lane coordinates, so the renderer holds no layout rules at all.
     *
     * @param commits - the commits in graph order, oldest page last.
     * @param hasMore - whether an older page may still continue the lines.
     * @returns the rows, the lanes each row occupies, and the edges between them.
     */
    function layout(commits, hasMore) {
      const index = new Map()
      commits.forEach((commit, row) => index.set(commit.hash, row))

      /** One open lane: the commit it is waiting for, and its colour slot. */
      const lanes = []
      const rows = []
      const edges = []

      /** Take the first lane waiting for this commit, or open one on the left. */
      const claim = (hash, row) => {
        const existing = lanes.findIndex(lane => lane.want === hash)
        if (existing !== -1) return existing
        const free = lanes.findIndex(lane => lane.want === null)
        if (free !== -1) {
          lanes[free] = { want: hash, slot: lanes[free].slot }
          return free
        }
        lanes.push({ want: hash, slot: lanes.length })
        return lanes.length - 1
      }

      commits.forEach((commit, row) => {
        const lane = claim(commit.hash, row)
        // This commit fulfils the lane's promise; it is released here and any
        // parent re-opens it below.
        lanes[lane] = { want: null, slot: lanes[lane].slot }

        const points = [{ row, lane }]
        const parents = commit.parents

        parents.forEach((parent, parentIndex) => {
          if (parentIndex === 0) {
            // The first parent inherits this commit's lane, so the mainline
            // continues straight down through the row.
            lanes[lane] = { want: parent, slot: lanes[lane].slot }
            if (index.has(parent)) {
              edges.push({ from: { row, lane }, to: { row: index.get(parent), lane }, slot: lanes[lane].slot, main: true })
            } else if (hasMore) {
              // The parent is beyond this page: the line leaves the bottom.
              edges.push({ from: { row, lane }, to: null, slot: lanes[lane].slot, main: true })
            }
            return
          }
          // A merge parent gets its own lane.
          const target = index.has(parent) ? index.get(parent) : null
          const parentLane = claim(parent, target ?? commits.length)
          if (target !== null) {
            edges.push({ from: { row, lane }, to: { row: target, lane: parentLane }, slot: lanes[parentLane].slot, main: false })
          } else if (hasMore) {
            edges.push({ from: { row, lane }, to: null, slot: lanes[parentLane].slot, main: false })
          }
          points.push({ row: target ?? row, lane: parentLane })
        })

        rows.push({ commit, lane, slot: lanes[lane]?.slot ?? lane, points })
      })

      const laneCount = Math.max(1, ...rows.map(row => row.points.length > 0
        ? Math.max(...row.points.map(point => point.lane)) + 1
        : row.lane + 1))
      return { rows, edges, laneCount }
    }

    /**
     * The lane colour for one slot.
     *
     * @param slot - the lane's colour slot.
     * @returns the CSS colour.
     */
    function laneColor(slot) {
      return LANE_COLORS[Math.abs(slot) % LANE_COLORS.length]
    }

    /**
     * Classify a ref name into the badge it should wear.
     *
     * @param ref - the raw ref token from `git log --decorate`.
     * @returns the label, its kind, and whether HEAD points here.
     */
    function parseRef(ref) {
      const text = ref.trim()
      const isHead = text.startsWith('HEAD -> ')
      const name = isHead ? text.slice('HEAD -> '.length) : text
      if (isHead) return { label: name, kind: 'head', text: 'HEAD' }
      if (name === 'HEAD') return { label: 'HEAD', kind: 'head', text: 'HEAD' }
      if (name.startsWith('tag: ')) return { label: name.slice(5), kind: 'tag', text: null }
      if (name.includes('/')) return { label: name, kind: 'remote', text: null }
      return { label: name, kind: 'branch', text: null }
    }

    /**
     * Render the per-commit badges a graph row wears.
     *
     * @param refs - the row's decoration tokens.
     * @returns the badge elements.
     */
    function RefBadges({ refs }) {
      if (refs.length === 0) return null
      return h('span', { className: 'gg-refs' }, refs.slice(0, 4).map((ref, i) => {
        const parsed = parseRef(ref)
        return h('span', {
          key: `${parsed.label}-${i}`,
          className: `gg-ref gg-ref-${parsed.kind}`,
          title: ref,
        }, parsed.text !== null ? `${parsed.text}: ${parsed.label}` : parsed.label)
      }))
    }

    /**
     * Render the SVG lane layer for the laid-out rows.
     *
     * @param props - the layout, and how tall the visible region is.
     * @returns the SVG element.
     */
    function GraphCanvas({ rows, edges, laneCount, height }) {
      const width = LANE_X0 * 2 + laneCount * LANE_W
      const x = lane => LANE_X0 + lane * LANE_W
      const y = row => row * ROW_H + ROW_H / 2

      const paths = edges.map((edge, i) => {
        const x1 = x(edge.from.lane)
        const y1 = y(edge.from.row)
        if (edge.to === null) {
          // Continues past the loaded page: a short stub leaves the row rather
          // than pretending the history ended here.
          return h('path', {
            key: `e${i}`,
            d: `M ${x1} ${y1} L ${x1} ${y1 + ROW_H * 0.6}`,
            stroke: laneColor(edge.slot),
            'stroke-width': 1.6,
            fill: 'none',
            opacity: 0.5,
            'stroke-dasharray': '3 3',
          })
        }
        const x2 = x(edge.to.lane)
        const y2 = y(edge.to.row)
        // A straight drop keeps mainline and merge lines visually distinct from
        // a lane change, which is drawn as a curve.
        const d = x1 === x2
          ? `M ${x1} ${y1} L ${x2} ${y2}`
          : `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`
        return h('path', {
          key: `e${i}`,
          d,
          stroke: laneColor(edge.slot),
          'stroke-width': edge.main ? 1.8 : 1.4,
          fill: 'none',
        })
      })

      const dots = rows.map((row, i) => {
        const cx = x(row.lane)
        const cy = y(i)
        const merge = row.commit.parents.length > 1
        return h('circle', {
          key: `d${i}`,
          cx,
          cy,
          r: merge ? DOT_R : DOT_R - 0.5,
          fill: merge ? 'var(--dsw-alias-bg-base)' : laneColor(row.slot),
          stroke: laneColor(row.slot),
          'stroke-width': merge ? 1.8 : 0,
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

    /**
     * Render one commit row: its lane cell, its labels, and its metadata.
     *
     * @param props - the row and the selection state.
     * @returns the row element.
     */
    function CommitRow({ row, selected, comparing, onSelect, onCompare }) {
      const commit = row.commit
      const when = new Date(commit.authorDate)
      const stamp = Number.isNaN(when.getTime())
        ? commit.authorDate
        : when.toLocaleString(undefined, {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit',
        })
      return h('div', {
        className: `gg-row${selected ? ' is-selected' : ''}${comparing ? ' is-comparing' : ''}`,
        role: 'button',
        tabIndex: 0,
        title: `${commit.hash}\n${commit.subject}`,
        onClick: (event) => {
          if (event.metaKey || event.ctrlKey) { onCompare(commit); return }
          onSelect(commit)
        },
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onSelect(commit)
          }
        },
      },
      h('span', { className: 'gg-row-graph', style: { height: ROW_H } }),
      h('span', { className: 'gg-row-body' },
        h('span', { className: 'gg-subject' }, commit.subject),
        h('span', { className: 'gg-row-meta' },
          h('span', { className: 'gg-hash' }, commit.hash.slice(0, 8)),
          h('span', { className: 'gg-author' }, commit.authorName),
          h('span', { className: 'gg-date' }, stamp)),
        h(RefBadges, { refs: commit.refs })))
    }

    /**
     * Render a unified patch with line-level colouring.
     *
     * The patch arrives as text because that is what git produces and what a
     * reader compares against a terminal. It is split into lines here and
     * classified by its own markers, so nothing about the format is guessed.
     *
     * @param props - the patch text and the truncation flag.
     * @returns the patch element.
     */
    function PatchView({ patch, truncated }) {
      if (patch === '') {
        return h('div', { className: 'gg-empty' }, 'No textual changes in this selection.')
      }
      const lines = patch.split('\n')
      return h('div', { className: 'gg-patch' },
        lines.map((line, i) => {
          let kind = 'ctx'
          if (line.startsWith('+++') || line.startsWith('---')) kind = 'meta'
          else if (line.startsWith('@@')) kind = 'hunk'
          else if (line.startsWith('diff ') || line.startsWith('index ')
            || line.startsWith('new file') || line.startsWith('deleted file')
            || line.startsWith('rename ') || line.startsWith('similarity ')) kind = 'meta'
          else if (line.startsWith('+')) kind = 'add'
          else if (line.startsWith('-')) kind = 'del'
          else if (line.startsWith('\\')) kind = 'note'
          return h('div', { key: i, className: `gg-line gg-line-${kind}` }, line === '' ? '\u00a0' : line)
        }),
        truncated ? h('div', { className: 'gg-truncated' }, 'The diff was cut off at the size limit.') : null)
    }

    /**
     * Render the file list of a commit or of the working tree.
     *
     * @param props - the entries, the selected path, and the click handler.
     * @returns the list element.
     */
    function FileList({ files, selectedPath, onPick, empty }) {
      if (files.length === 0) return h('div', { className: 'gg-empty' }, empty)
      return h('div', { className: 'gg-files' }, files.map((entry, i) => {
        const status = String(entry.status ?? '?').toUpperCase()
        return h('div', {
          key: `${entry.path}-${i}`,
          className: `gg-file${entry.path === selectedPath ? ' is-selected' : ''}`,
          role: 'button',
          tabIndex: 0,
          onClick: () => onPick(entry),
          onKeyDown: (event) => {
            if (event.key === 'Enter') { event.preventDefault(); onPick(entry) }
          },
        },
        h('span', { className: `gg-status gg-status-${status[0]}` }, status),
        h('span', { className: 'gg-path', title: entry.oldPath ? `${entry.oldPath} → ${entry.path}` : entry.path },
          entry.oldPath ? `${entry.oldPath} → ${entry.path}` : entry.path))
      }))
    }

    /**
     * The History view: graph, selection, commit details, and the historical diff.
     *
     * @param props - the tab's live information.
     * @returns the view.
     */
    function HistoryView({ tabInfo, sessionId }) {
      const [state, setState] = React.useState({
        status: 'loading', error: null, commits: [], refs: null, head: null,
        nextSkip: 0, exhausted: false, loadingMore: false,
      })
      const [selection, setSelection] = React.useState(null)
      const [compare, setCompare] = React.useState(null)
      const [detail, setDetail] = React.useState(null)
      const [detailError, setDetailError] = React.useState(null)
      const [picked, setPicked] = React.useState(null)
      const [patch, setPatch] = React.useState(null)
      const [patchError, setPatchError] = React.useState(null)
      const [pane, setPane] = React.useState('history')

      const signal = tabInfo.tab.signal

      /** Load the first page, and reset everything derived from it. */
      const loadFirst = React.useCallback(() => {
        setState(current => ({ ...current, status: 'loading', error: null }))
        call({ op: 'commits', sessionId, skip: 0 }, signal)
          .then((result) => {
            setState({
              status: 'ready', error: null,
              commits: result.commits, refs: result.refs, head: result.refs?.head ?? null,
              nextSkip: result.nextSkip, exhausted: result.exhausted, loadingMore: false,
            })
          })
          .catch((error) => {
            if (error.name === 'AbortError') return
            setState(current => ({ ...current, status: 'error', error: String(error.message ?? error) }))
          })
      }, [sessionId, signal])

      React.useEffect(() => { loadFirst() }, [loadFirst])

      /** Load one older page and append it. */
      const loadMore = React.useCallback(() => {
        setState((current) => {
          if (current.loadingMore || current.exhausted || current.status !== 'ready') return current
          call({ op: 'commits', sessionId, skip: current.nextSkip }, signal)
            .then((result) => {
              setState(prev => ({
                ...prev,
                commits: [...prev.commits, ...result.commits],
                nextSkip: result.nextSkip,
                exhausted: result.exhausted,
                loadingMore: false,
              }))
            })
            .catch((error) => {
              if (error.name === 'AbortError') return
              setState(prev => ({ ...prev, loadingMore: false, error: String(error.message ?? error) }))
            })
          return { ...current, loadingMore: true }
        })
      }, [sessionId, signal])

      // The detail of the selected commit, and the diff of its first file.
      React.useEffect(() => {
        if (selection === null) { setDetail(null); setPicked(null); setPatch(null); return undefined }
        let cancelled = false
        setDetailError(null)
        setDetail(null)
        setPicked(null)
        setPatch(null)
        call({ op: 'commit', sessionId, hash: selection.hash }, signal)
          .then((result) => {
            if (cancelled) return
            setDetail(result.detail)
          })
          .catch((error) => {
            if (cancelled || error.name === 'AbortError') return
            setDetailError(String(error.message ?? error))
          })
        return () => { cancelled = true }
      }, [selection, sessionId, signal])

      // The patch for the picked file, in whichever comparison is in force.
      React.useEffect(() => {
        if (picked === null) { setPatch(null); return undefined }
        let cancelled = false
        setPatchError(null)
        setPatch(null)
        const target = compare !== null && compare !== undefined ? compare : selection
        const from = compare !== null && compare !== undefined
          ? compare.hash
          : (detail?.parents?.[0] ?? '4b825dc642cb6eb9a060e54bf8d69288fbee4904')
        call({
          op: 'diff',
          sessionId,
          from,
          to: target.hash,
          path: picked.path,
          oldPath: picked.oldPath ?? undefined,
          context: 3,
        }, signal)
          .then((result) => { if (!cancelled) setPatch(result) })
          .catch((error) => {
            if (cancelled || error.name === 'AbortError') return
            setPatchError(String(error.message ?? error))
          })
        return () => { cancelled = true }
      }, [picked, selection, compare, detail, sessionId, signal])

      if (state.status === 'loading') return h('div', { className: 'gg-empty' }, 'Reading the repository…')
      if (state.status === 'error') {
        return h('div', { className: 'gg-error' },
          h('div', null, 'This session’s workspace could not be read as a Git repository.'),
          h('pre', { className: 'gg-error-detail' }, state.error))
      }

      const { rows, edges, laneCount } = layout(state.commits, !state.exhausted)
      const graphHeight = rows.length * ROW_H

      return h('div', { className: 'gg-root' },
        h('div', { className: 'gg-toolbar' },
          h('span', { className: 'gg-repo', title: state.refs?.refs?.[0]?.target ?? '' },
            state.head !== null && state.head !== undefined ? state.head : 'detached HEAD'),
          h('span', { className: 'gg-count' }, `${state.commits.length} commits`),
          h('button', {
            type: 'button',
            className: `gg-crumb${pane === 'history' ? ' is-on' : ''}`,
            onClick: () => setPane('history'),
          }, 'History'),
          h('button', {
            type: 'button',
            className: `gg-crumb${pane === 'changes' ? ' is-on' : ''}`,
            onClick: () => setPane('changes'),
          }, 'Changes'),
          h('button', { type: 'button', className: 'gg-action', onClick: loadFirst, title: 'Read the repository again' }, 'Refresh')),

        pane === 'history'
          ? h('div', { className: 'gg-history' },
            h('div', { className: 'gg-graph' },
              h('div', { className: 'gg-graph-inner', style: { height: graphHeight } },
                h(GraphCanvas, { rows, edges, laneCount, height: graphHeight }),
                h('div', { className: 'gg-rows' },
                  rows.map((row, i) => h(CommitRow, {
                    key: row.commit.hash,
                    row,
                    selected: selection?.hash === row.commit.hash,
                    comparing: compare?.hash === row.commit.hash,
                    onSelect: (commit) => { setSelection(commit); setCompare(null) },
                    onCompare: (commit) => { setCompare(commit); setSelection(commit) },
                  })))),
              state.exhausted
                ? h('div', { className: 'gg-empty gg-more' }, 'The whole history is loaded.')
                : h('button', {
                  type: 'button',
                  className: 'gg-more-btn',
                  disabled: state.loadingMore,
                  onClick: loadMore,
                }, state.loadingMore ? 'Loading…' : 'Load older commits')),

            h('div', { className: 'gg-detail' },
              selection === null
                ? h('div', { className: 'gg-empty' }, 'Pick a commit to see its details. Ctrl-click a second commit to compare.')
                : h('div', { className: 'gg-detail-wrap' },
                  h('div', { className: 'gg-detail-head' },
                    h('span', { className: 'gg-hash gg-hash-big' }, selection.hash.slice(0, 12)),
                    compare !== null && compare !== undefined
                      ? h('span', { className: 'gg-compare-note' }, `comparing with ${compare.hash.slice(0, 8)}`)
                      : null),
                  compare !== null && compare !== undefined
                    ? h('button', {
                      type: 'button',
                      className: 'gg-action',
                      onClick: () => setCompare(null),
                    }, 'Clear comparison')
                    : null,
                  detailError !== null
                    ? h('div', { className: 'gg-error' }, detailError)
                    : detail === null
                      ? h('div', { className: 'gg-empty' }, 'Loading the commit…')
                      : h('div', null,
                        h('div', { className: 'gg-msg' }, detail.message),
                        h('dl', { className: 'gg-meta' },
                          h('dt', null, 'Author'), h('dd', null, `${detail.authorName} <${detail.authorEmail}>`),
                          h('dt', null, 'Date'), h('dd', null, detail.authorDate),
                          detail.parents.length > 0
                            ? h('dt', null, `Parent${detail.parents.length > 1 ? 's' : ''}`)
                            : null,
                          detail.parents.length > 0
                            ? h('dd', null, detail.parents.map(p => p.slice(0, 12)).join(', '))
                            : null),
                        h('div', { className: 'gg-detail-label' },
                          compare !== null && compare !== undefined
                            ? `Changes from ${compare.hash.slice(0, 8)} to ${selection.hash.slice(0, 8)}`
                            : `Changed in this commit${detail.parents.length > 1 ? ' (against the first parent)' : ''}`),
                        h(FileList, {
                          files: detail.files,
                          selectedPath: picked?.path ?? null,
                          empty: 'This commit changed no files.',
                          onPick: entry => setPicked(entry),
                        }))),
              picked !== null
                ? h('div', { className: 'gg-patch-wrap' },
                  h('div', { className: 'gg-detail-label' }, picked.path),
                  patchError !== null
                    ? h('div', { className: 'gg-error' }, patchError)
                    : patch === null
                      ? h('div', { className: 'gg-empty' }, 'Loading the diff…')
                      : h(PatchView, { patch: patch.patch, truncated: patch.truncated }))
                : null))
          : h(ChangesView, { sessionId, signal }))
    }

    /**
     * The Changes view: what the working tree holds beyond HEAD right now.
     *
     * Nothing here is cached, and nothing is written. The view exists to watch
     * an agent work, so its answer is read again whenever the reader asks and
     * whenever the tab becomes visible again.
     *
     * @param props - the session and the tab's cancellation signal.
     * @returns the view.
     */
    function ChangesView({ sessionId, signal }) {
      const [state, setState] = React.useState({ status: 'loading', error: null, staged: [], unstaged: [], untracked: [] })
      const [picked, setPicked] = React.useState(null)
      const [patch, setPatch] = React.useState(null)
      const [patchError, setPatchError] = React.useState(null)

      const load = React.useCallback(() => {
        setState(current => ({ ...current, status: 'loading', error: null }))
        call({ op: 'working', sessionId }, signal)
          .then(result => setState({
            status: 'ready', error: null,
            staged: result.staged, unstaged: result.unstaged, untracked: result.untracked,
          }))
          .catch((error) => {
            if (error.name === 'AbortError') return
            setState(current => ({ ...current, status: 'error', error: String(error.message ?? error) }))
          })
      }, [sessionId, signal])

      React.useEffect(() => { load() }, [load])

      React.useEffect(() => {
        if (picked === null) { setPatch(null); return undefined }
        let cancelled = false
        setPatchError(null)
        setPatch(null)
        call({
          op: 'workingDiff',
          sessionId,
          path: picked.path,
          staged: picked.staged,
          context: 3,
        }, signal)
          .then((result) => { if (!cancelled) setPatch(result) })
          .catch((error) => {
            if (cancelled || error.name === 'AbortError') return
            setPatchError(String(error.message ?? error))
          })
        return () => { cancelled = true }
      }, [picked, sessionId, signal])

      if (state.status === 'error') {
        return h('div', { className: 'gg-error' },
          h('div', null, 'The working tree could not be read.'),
          h('pre', { className: 'gg-error-detail' }, state.error))
      }

      const groups = [
        { key: 'staged', title: 'Staged changes', files: state.staged, staged: true, empty: 'Nothing is staged.' },
        { key: 'unstaged', title: 'Changes not staged', files: state.unstaged, staged: false, empty: 'No unstaged changes.' },
        { key: 'untracked', title: 'Untracked files', files: state.untracked, staged: false, empty: 'No untracked files.' },
      ]

      return h('div', { className: 'gg-changes' },
        h('div', { className: 'gg-toolbar' },
          h('span', { className: 'gg-count' }, state.status === 'loading' ? 'reading…' : 'working tree'),
          h('button', { type: 'button', className: 'gg-action', onClick: load }, 'Refresh')),
        h('div', { className: 'gg-empty gg-hint' },
          'This is the state at the moment it was read. A running agent changes it continuously, so refresh to see the current one.'),
        groups.map(group => h('div', { key: group.key, className: 'gg-group' },
          h('div', { className: 'gg-detail-label' }, `${group.title} (${group.files.length})`),
          h(FileList, {
            files: group.files,
            selectedPath: picked?.path ?? null,
            empty: group.empty,
            onPick: entry => setPicked({ path: entry.path, staged: group.staged }),
          }))),
        picked !== null
          ? h('div', { className: 'gg-patch-wrap' },
            h('div', { className: 'gg-detail-label' },
              `${picked.path}${picked.staged ? ' — staged' : ' — not staged'}`),
            patchError !== null
              ? h('div', { className: 'gg-error' }, patchError)
              : patch === null
                ? h('div', { className: 'gg-empty' }, 'Loading the diff…')
                : h(PatchView, { patch: patch.patch, truncated: patch.truncated }))
          : null)
    }

    /**
     * The tab body: read the tab's live information and render the view.
     *
     * The framework hands the hooks in as ordinary props, not through a `hooks`
     * namespace: `useTabInfo` reads this tab's record and its cancellation
     * signal, and `sessionId` names the session the tab belongs to. The session
     * id is a prop because the tab record itself does not carry one — which is
     * also why a callback fired later still acts on the right session.
     *
     * @param props - the slot's framework-injected props.
     * @returns the view.
     */
    function GitGraphBody({ useTabInfo, sessionId, useSessions }) {
      const tabInfo = useTabInfo()
      // The workspace directory is what makes this tab's answer belong to this
      // session; without it there is nothing to read and nothing to show.
      const cwd = useSessions(sessions => sessions.byId[sessionId]?.cwd)
      if (cwd === undefined || cwd === null) {
        return h('div', { className: 'gg-empty' }, 'This session has no workspace directory yet.')
      }
      return h('div', { className: 'gg-host' }, h(HistoryView, {
        tabInfo,
        sessionId: String(sessionId),
      }))
    }

    /**
     * The tab's chip title.
     *
     * @returns the title.
     */
    function GitGraphTitle() {
      return 'Git'
    }

    /** The tab type's static definition. */
    const definition = {
      id: ID,
      kind: KIND,
      priority: 'extension',
      title: () => 'Git',
      guide: [{
        order: 20,
        title: () => 'Git graph',
        description: () => 'Commit history and uncommitted changes of this session’s workspace',
      }],
    }

    /** Styles, built once and removed with the plugin. */
    const CSS = `
.gg-host { display: flex; flex-direction: column; height: 100%; min-height: 0;
  font-size: 12px; color: var(--dsw-alias-label-primary); }
.gg-root { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.gg-toolbar { display: flex; align-items: center; gap: 6px; padding: 6px 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l1); flex: none; }
.gg-repo { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gg-count { color: var(--dsw-alias-label-secondary); font-size: 11px; margin-right: auto; }
.gg-crumb, .gg-action { font: inherit; font-size: 11px; padding: 2px 8px; cursor: pointer;
  border-radius: 6px; border: 1px solid var(--dsw-alias-border-l1);
  background: transparent; color: var(--dsw-alias-label-secondary); }
.gg-crumb.is-on { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2); }
.gg-crumb:hover, .gg-action:hover { background: var(--dsw-alias-bg-layer-2); }
.gg-history, .gg-changes { display: flex; flex-direction: column; min-height: 0; flex: 1; }
.gg-graph { overflow: auto; flex: 1 1 55%; min-height: 120px; }
.gg-graph-inner { position: relative; }
.gg-canvas { position: absolute; left: 0; top: 0; pointer-events: none; }
.gg-rows { margin-left: 0; }
.gg-row { display: flex; align-items: center; gap: 0; height: ${ROW_H}px; cursor: pointer;
  padding-right: 8px; }
.gg-row:hover { background: var(--dsw-alias-bg-layer-2); }
.gg-row.is-selected { background: var(--dsw-alias-bg-layer-2); }
.gg-row.is-comparing { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }
.gg-row-graph { flex: none; }
.gg-row-body { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;
  padding-left: 10px; }
.gg-subject { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
.gg-row-meta { display: flex; gap: 8px; flex: none; color: var(--dsw-alias-label-secondary);
  font-size: 10.5px; }
.gg-hash { font-family: ui-monospace, monospace; opacity: .85; }
.gg-refs { display: inline-flex; gap: 4px; flex: none; }
.gg-ref { font-size: 10px; padding: 0 5px; border-radius: 999px; line-height: 15px;
  border: 1px solid; white-space: nowrap; }
.gg-ref-branch { color: #34c759; border-color: rgba(52,199,89,.5); }
.gg-ref-remote { color: #4c9aff; border-color: rgba(76,154,255,.5); }
.gg-ref-tag { color: #ffd60a; border-color: rgba(255,214,10,.5); }
.gg-ref-head { color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary);
  font-weight: 600; }
.gg-more-btn { margin: 6px 8px 10px; font: inherit; font-size: 11px; padding: 4px 10px;
  cursor: pointer; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l1);
  background: transparent; color: var(--dsw-alias-label-secondary); }
.gg-detail { flex: 1 1 45%; min-height: 100px; overflow: auto; border-top: 1px solid var(--dsw-alias-border-l1); }
.gg-detail-wrap, .gg-patch-wrap { padding: 8px; }
.gg-detail-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.gg-hash-big { font-size: 12px; font-weight: 600; }
.gg-compare-note { font-size: 10.5px; color: var(--dsw-alias-brand-primary); }
.gg-msg { white-space: pre-wrap; margin: 0 0 8px; }
.gg-meta { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 0 0 8px;
  font-size: 11px; color: var(--dsw-alias-label-secondary); }
.gg-meta dt { font-weight: 600; }
.gg-meta dd { margin: 0; overflow-wrap: anywhere; }
.gg-detail-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em;
  color: var(--dsw-alias-label-secondary); margin: 8px 0 4px; }
.gg-files { display: flex; flex-direction: column; }
.gg-file { display: flex; align-items: center; gap: 8px; padding: 3px 4px; border-radius: 6px;
  cursor: pointer; min-width: 0; }
.gg-file:hover { background: var(--dsw-alias-bg-layer-2); }
.gg-file.is-selected { background: var(--dsw-alias-bg-layer-2); }
.gg-status { flex: none; width: 14px; text-align: center; font-family: ui-monospace, monospace;
  font-weight: 700; font-size: 11px; }
.gg-status-A { color: #34c759; }
.gg-status-M { color: #ff9f0a; }
.gg-status-D { color: #ff453a; }
.gg-status-R, .gg-status-C { color: #4c9aff; }
.gg-status-\\? { color: var(--dsw-alias-label-secondary); }
.gg-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
  font-family: ui-monospace, monospace; font-size: 11px; }
.gg-patch { font-family: ui-monospace, monospace; font-size: 11px; line-height: 1.5;
  background: var(--dsw-alias-bg-layer-1); border-radius: 6px; padding: 6px 0;
  overflow: auto; max-height: 45vh; }
.gg-line { padding: 0 8px; white-space: pre; }
.gg-line-add { background: rgba(52,199,89,.14); color: #7ee2a8; }
.gg-line-del { background: rgba(255,69,58,.14); color: #ff9a94; }
.gg-line-hunk { color: var(--dsw-alias-brand-primary); background: rgba(76,154,255,.08); }
.gg-line-meta { color: var(--dsw-alias-label-secondary); }
.gg-line-note { color: var(--dsw-alias-label-secondary); font-style: italic; }
.gg-empty { padding: 10px; color: var(--dsw-alias-label-secondary); font-size: 11px; }
.gg-hint { padding: 6px 8px; }
.gg-error { padding: 10px; color: var(--dsw-alias-state-error-primary); font-size: 11px; }
.gg-error-detail { white-space: pre-wrap; font-size: 10.5px; opacity: .85; margin: 6px 0 0; }
.gg-truncated { padding: 6px 8px; color: var(--dsw-alias-state-warn-primary); font-size: 10.5px; }
.gg-more { text-align: center; }
.gg-group { padding: 0 8px 8px; }
`

    /**
     * Register the tab type, its body, its title, and its styles.
     *
     * Every registration is an `ctx.effect`, so unloading this plugin removes
     * the tab type, both slots, and the stylesheet together.
     *
     * @param ctx - the client plugin context.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.sidebarRightTabs.register(definition), 'git-graph: tab type')
      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: ID,
      }, GitGraphBody)), 'git-graph: tab body')
      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab.title',
        key: ID,
      }, GitGraphTitle)), 'git-graph: tab title')
      ctx.effect(() => {
        const style = document.createElement('style')
        style.setAttribute('data-dsh-git-graph', '')
        style.textContent = CSS
        document.head.appendChild(style)
        return () => { style.remove() }
      }, 'git-graph: styles')
    }

    exports.inject = ['slots', 'sidebarRightTabs']
    exports.apply = apply
    return module.exports
  },
})
