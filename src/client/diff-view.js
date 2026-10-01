import * as React from 'react'
import * as GitSyntax from './syntax.js'
import { call } from './api.js'
import { parseUnifiedPatch, planSplitRows, resolveDiffLayout } from './diff-layout.js'
import { CompactDropdown, GitIcon } from './ui.js'

const h = React.createElement

/** Shared inline or standalone diff. Optional params.group identifies untracked files. */
export function DiffPanel({ sessionId, signal, params = {}, target = params.target, repositoryLabel = params.repositoryLabel, revision = 0 }) {
  const [wrap, setWrap] = React.useState(true)
  const [context, setContext] = React.useState(3)
  const [syntax, setSyntax] = React.useState(true)
  const [layoutMode, setLayoutMode] = React.useState('auto')
  const [paneWidth, setPaneWidth] = React.useState(null)
  const [retry, setRetry] = React.useState(0)
  const [state, setState] = React.useState({ key: '', status: 'loading' })
  const [hunk, setHunk] = React.useState(-1)
  const hunkNodes = React.useRef([])
  const scroll = React.useRef(null)
  const panelRef = React.useRef(null)
  const mode = params.mode === 'working' ? 'working' : 'commits'
  const path = typeof params.path === 'string' ? params.path : ''
  const oldPath = typeof params.oldPath === 'string' ? params.oldPath : undefined
  const untracked = mode === 'working' && params.group === 'untracked'
  const staged = params.staged === true
  const key = JSON.stringify([sessionId, target, mode, path, oldPath, params.base, params.head, staged, untracked, context, revision, retry])
  React.useEffect(() => {
    const controller = new AbortController()
    let active = true
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) controller.abort()
    setHunk(-1)
    hunkNodes.current = []
    if (scroll.current) scroll.current.scrollTop = 0
    setState({ key, status: controller.signal.aborted ? 'cancelled' : 'loading' })
    const cleanup = () => { active = false; controller.abort(); signal?.removeEventListener('abort', abort) }
    if (untracked || !path || controller.signal.aborted) return cleanup
    const request = mode === 'working'
      ? { op: 'workingDiff', sessionId, target, path, oldPath, staged, context }
      : { op: 'diff', sessionId, target, from: params.base, to: params.head, path, oldPath, context }
    call(request, controller.signal).then(result => {
      if (active && !controller.signal.aborted) setState({ key, status: 'ready', patch: String(result.patch ?? ''), truncated: result.truncated === true })
    }).catch(error => {
      if (!active) return
      setState({ key, status: controller.signal.aborted || error.name === 'AbortError' ? 'cancelled' : 'error', error: String(error.message ?? error) })
    })
    return cleanup
  }, [key, signal])
  React.useEffect(() => {
    const node = panelRef.current
    if (!node || typeof ResizeObserver !== 'function') return undefined
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect?.width
      if (Number.isFinite(width)) setPaneWidth(width)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const current = state.key === key ? state : { status: 'loading' }
  const layout = resolveDiffLayout(layoutMode, paneWidth)
  const parsed = React.useMemo(() => parseUnifiedPatch(current.patch), [current.patch])
  const splitRows = React.useMemo(() => planSplitRows(parsed.rows), [parsed.rows])
  // Bound browser node creation even for a patch made of extremely short lines.
  const visibleRows = parsed.rows.slice(0, 12000)
  const language = GitSyntax.languageForPath(path)
  const languageLabel = language ? ({ javascript: 'JS', typescript: 'TS', python: 'PY', markdown: 'MD', json: 'JSON', css: 'CSS', html: 'HTML' }[language] || language.toUpperCase().slice(0, 4)) : 'TXT'
  const highlights = React.useMemo(() => GitSyntax.highlightRows(parsed.rows.slice(0, 12000), path, syntax), [parsed, path, syntax])
  const visibleHunks = parsed.hunks.filter(index => index < visibleRows.length)
  const metadata = parsed.rows.filter(row => row.kind === 'meta').map(row => row.text).join('\n')
  const cut = current.truncated || parsed.rows.length > visibleRows.length
  const jump = delta => {
    const next = Math.max(0, Math.min(visibleHunks.length - 1, hunk + delta))
    setHunk(next)
    const node = hunkNodes.current[next]
    if (node && scroll.current) scroll.current.scrollTop += node.getBoundingClientRect().top - scroll.current.getBoundingClientRect().top
  }
  const title = oldPath && oldPath !== path ? `${oldPath} → ${path}` : path
  const highlightedCode = row => {
    if (!row) return h('span', { className: 'gg-du-code gg-du-code-empty' }, '\u00a0')
    const tokens = highlights?.get(row.index)
    return h('span', { className: 'gg-du-code' }, row.text[0], tokens
      ? tokens.map((token, j) => h('span', { key: j, className: token.classes || undefined }, token.text))
      : row.text.slice(1) || '\u00a0')
  }
  const splitCell = (side, cell) => h('div', { className: `gg-du-side gg-du-${side}${cell ? ` gg-du-${cell.row.kind}` : ' is-empty'}` },
    h('span', { className: 'gg-du-number', 'aria-label': cell?.number == null ? undefined : `${side === 'old' ? 'Old' : 'New'} line ${cell.number}` }, cell?.number ?? null),
    highlightedCode(cell))
  const splitPatch = h('div', { className: `gg-du-patch gg-du-split${wrap ? ' is-wrapped' : ''}`, 'aria-label': 'Split diff' }, splitRows.slice(0, 12000).map((item, i) => {
    if (item.kind === 'hunk') return h('div', { key: `h${i}`, className: `gg-du-split-hunk${item.row.hunk === hunk ? ' is-current' : ''}`, ref: node => { hunkNodes.current[item.row.hunk] = node } }, item.row.text)
    if (item.kind === 'note') return h('div', { key: `n${i}`, className: 'gg-du-split-note' }, item.row.text)
    return h('div', { key: `l${i}`, className: `gg-du-split-row gg-du-${item.replacement ? 'replacement' : 'line'}` }, splitCell('old', item.old), splitCell('new', item.new))
  }))
  const unifiedPatch = h('div', { className: `gg-du-patch${wrap ? ' is-wrapped' : ''}`, 'aria-label': 'Unified diff' }, visibleRows.map((row, i) => row.kind === 'meta' ? null : h('div', {
    key: i, className: `gg-du-line gg-du-${row.kind}${row.hunk === hunk ? ' is-current' : ''}`,
    ref: row.kind === 'hunk' ? node => { hunkNodes.current[row.hunk] = node } : undefined,
  }, h('span', { className: 'gg-du-number', 'aria-label': row.old === null ? undefined : `Old line ${row.old}` }, row.old),
  h('span', { className: 'gg-du-number', 'aria-label': row.new === null ? undefined : `New line ${row.new}` }, row.new),
  h('span', { className: 'gg-du-code' }, highlights?.has(i)
    ? [row.text[0], ...highlights.get(i).map((token, j) => h('span', { key: j, className: token.classes || undefined }, token.text))]
    : row.text || '\u00a0'))))
  let body
  if (!path) body = h('div', { className: 'gg-empty' }, 'Select a file to inspect its changes.')
  else if (untracked) body = h('div', { className: 'gg-empty' }, 'Untracked file. Content preview is not available from the current Git host; this file is not included in git diff.')
  else if (current.status === 'loading') body = h('div', { className: 'gg-empty', role: 'status' }, 'Loading diff…')
  else if (current.status === 'cancelled') body = h('div', { className: 'gg-empty', role: 'status' }, 'Diff request cancelled.')
  else if (current.status === 'error') body = h('div', { className: 'gg-error', role: 'alert' }, current.error,
    h('button', { type: 'button', className: 'gg-du-button', onClick: () => setRetry(value => value + 1) }, 'Retry'))
  else body = h(React.Fragment, null,
    parsed.binary ? h('div', { className: 'gg-du-message' }, 'Binary file changed — no textual preview.') : null,
    !parsed.rows.length ? h('div', { className: 'gg-empty' }, 'No textual changes. The file may have changed since this list was read.') : null,
    parsed.rows.length > 0 && !parsed.hunks.length && !parsed.binary ? h('div', { className: 'gg-du-message' }, 'Metadata-only change (for example a rename or file mode change).') : null,
    layout === 'split' ? splitPatch : unifiedPatch,
    cut ? h('div', { className: 'gg-du-message', role: 'status' }, 'Partial diff: output reached the host or display limit. Counts describe only the returned patch.') : null)
  return h('section', { ref: panelRef, className: 'gg-du-panel', 'aria-label': title ? `Diff for ${title}` : 'Diff preview' },
    h('div', { className: 'gg-du-title', title }, repositoryLabel ? `${repositoryLabel} · ${title || 'Diff preview'}` : title || 'Diff preview'),
    h('div', { className: 'gg-du-controls' },
      h('button', { type: 'button', className: 'gg-du-button gg-du-icon-button', 'aria-label': 'Toggle word wrap', title: wrap ? 'Disable word wrap' : 'Enable word wrap', 'aria-pressed': wrap, onClick: () => setWrap(value => !value) }, h(GitIcon, { name: 'wrap', size: 14 })),
      h(CompactDropdown, { className: 'gg-du-layout-select', value: layoutMode, onChange: setLayoutMode, label: 'Diff layout', title: 'Diff layout', options: [{ value: 'auto', label: 'Auto view' }, { value: 'split', label: 'Side by side' }, { value: 'unified', label: 'Inline' }] }),
      h('button', { type: 'button', className: 'gg-du-button gg-du-language', disabled: !language, 'aria-label': 'Syntax highlighting', 'aria-pressed': syntax && !!highlights,
        title: !language ? 'Plain text: unsupported file type' : highlights ? `${language} highlighting — shown diff context only` : 'Highlighting off or diff exceeds the 200 KB / 5,000 line limit', onClick: () => setSyntax(value => !value) }, languageLabel),
      h(CompactDropdown, { className: 'gg-du-context-select', value: context, onChange: setContext, label: 'Context lines', title: 'Unchanged lines shown around each change', options: [0, 3, 10, 25, 50, 100].map(value => ({ value, label: `Context: ${value}` })) }),
      h('span', { className: 'gg-du-counts', title: cut ? 'Counts in returned partial patch' : 'Changed lines' },
        h('span', { className: 'gg-du-added' }, `+${parsed.additions}`), ' ', h('span', { className: 'gg-du-deleted' }, `−${parsed.deletions}`)),
      h('button', { type: 'button', className: 'gg-du-button gg-du-icon-button', disabled: hunk <= 0, onClick: () => jump(-1), 'aria-label': 'Previous hunk', title: 'Previous change' }, '↑'),
      h('button', { type: 'button', className: 'gg-du-button gg-du-icon-button', disabled: !visibleHunks.length || hunk >= visibleHunks.length - 1, onClick: () => jump(1), 'aria-label': 'Next hunk', title: 'Next change' }, '↓'),
      visibleHunks.length ? h('span', { className: 'gg-du-position', title: 'Current change' }, `${hunk + 1}/${visibleHunks.length}`) : null),
    h('div', { className: 'gg-du-summary' }, mode === 'working' ? (untracked ? 'Untracked' : staged ? 'Staged · HEAD → index' : 'Unstaged · index → working tree') : `${String(params.base ?? '').slice(0, 10)} → ${String(params.head ?? '').slice(0, 10)}`),
    metadata ? h('details', { className: 'gg-du-metadata', key },
      h('summary', null, 'Diff metadata'), h('pre', null, metadata)) : null,
    h('div', { ref: scroll, className: 'gg-du-scroll', tabIndex: 0, 'aria-label': 'Scrollable diff', 'aria-busy': !untracked && !!path && current.status === 'loading' }, body))
}

