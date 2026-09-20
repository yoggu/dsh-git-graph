import * as React from 'react'
import { call } from './api.js'
import { EMPTY_TREE } from './constants.js'
import { DiffPanel } from './diff-view.js'
import { FileWorkspace } from './files.js'
import { GitIcon, copyText, formatDate, formatRange } from './ui.js'

const h = React.createElement

export function CommitInspector({ hash, sessionId, signal, revision = 0, onSelect, tabInfo }) {
  const [state, setState] = React.useState({ detail: null, error: null })
  React.useEffect(() => {
    let active = true
    setState(current => ({ detail: current.detail?.hash === hash ? current.detail : null, error: null }))
    call({ op: 'commit', sessionId, hash }, signal).then(result => { if (active) setState({ detail: result.detail, error: null }) })
      .catch(error => { if (active && error.name !== 'AbortError') setState({ detail: null, error: String(error.message ?? error) }) })
    return () => { active = false }
  }, [hash, sessionId, signal, revision])
  const detail = state.detail?.hash === hash ? state.detail : null
  if (state.error) return h('div', { className: 'gg-error', role: 'alert' }, state.error)
  if (!detail) return h('div', { className: 'gg-empty', role: 'status' }, 'Loading commit…')
  return h('section', { className: 'gg-root gg-inspector', 'aria-label': 'Commit details' },
    h('details', { className: 'gg-commit-summary' },
      h('summary', { title: detail.message }, h('span', { className: 'gg-commit-subject' }, detail.message.split('\n')[0]),
        h('span', { className: 'gg-commit-caption' }, `${hash.slice(0, 8)} · ${detail.authorName} · ${formatDate(detail.authorDate)}`)),
      h('div', { className: 'gg-commit-extra' }, h('p', { className: 'gg-msg' }, detail.message),
        h('div', null, `${detail.authorName} <${detail.authorEmail}>`),
        h('button', { className: 'gg-link', onClick: () => copyText(hash) }, 'Copy commit hash'),
        detail.parents.length > 0 ? h('div', null, 'Parents: ', detail.parents.map(parent => h('button', { key: parent, className: 'gg-link', onClick: () => onSelect?.(parent) }, `${parent.slice(0, 8)} `))) : null)),
    h('div', { className: 'gg-diff-summary' }, `${detail.files.length} changed files · ${detail.parents.length > 1 ? 'Merge · compared with first parent' : detail.parents.length ? 'Compared with parent' : 'Root commit · all added files'}`),
    h(FileWorkspace, { files: detail.files, sessionId, signal, base: detail.parents[0] ?? EMPTY_TREE, head: detail.hash, revision, tabInfo }))
}

/** Legacy commit links use the same persistent file/diff browser. */
export function CommitView({ tabInfo, sessionId }) {
  const initial = tabInfo.tab.navigation?.params?.hash
  const [hash, setHash] = React.useState(initial)
  React.useEffect(() => setHash(initial), [initial])
  return hash ? h(CommitInspector, { hash, sessionId, signal: tabInfo.tab.signal, onSelect: setHash, tabInfo }) : h('div', { className: 'gg-empty' }, 'No commit selected.')
}

export function DiffView({ tabInfo, sessionId }) {
  return h(DiffPanel, { sessionId, signal: tabInfo.tab.signal, params: tabInfo.tab.navigation?.params ?? {} })
}

/**
 * The comparison of two revisions.
 *
 * This is the question the graph could not answer before: a commit's accordion
 * always reads that commit against its first parent, while a reader comparing
 * a feature branch with `main`, a release with HEAD, or a commit with the
 * working tree is asking about two positions they chose themselves. The file
 * list comes from one `compare` request, and each file opens the same diff
 * viewer the rest of the plugin uses, with those two revisions as its sides.
 *
 * @param props - the tab's information and the session.
 * @returns the comparison view.
 */
export function CompareView({ tabInfo, sessionId }) {
  const params = tabInfo.tab.navigation?.params ?? {}
  const base = typeof params.base === 'string' ? params.base : ''
  const head = typeof params.head === 'string' ? params.head : ''
  const signal = tabInfo.tab.signal
  const revision = params.revision ?? 0
  const [state, setState] = React.useState({ files: null, error: null })
  React.useEffect(() => {
    let active = true
    setState({ files: null, error: null })
    // An empty later side is the working tree, which is how the same view
    // answers "what has changed since that commit".
    call({ op: 'compare', sessionId, from: base, to: head === '' ? null : head }, signal)
      .then(result => { if (active) setState({ files: result.files ?? [], error: null }) })
      .catch(error => {
        if (active && error.name !== 'AbortError') setState({ files: null, error: String(error.message ?? error) })
      })
    return () => { active = false }
  }, [base, head, sessionId, signal, revision])
  if (state.error !== null) return h('div', { className: 'gg-error', role: 'alert' }, state.error)
  if (state.files === null) return h('div', { className: 'gg-empty', role: 'status' }, 'Reading the comparison…')
  return h('section', { className: 'gg-root gg-inspector', 'aria-label': 'Commit comparison' },
    h('div', { className: 'gg-diff-summary' },
      `${state.files.length} changed file${state.files.length === 1 ? '' : 's'} · ${formatRange(base, head)}`),
    state.files.length === 0
      ? h('div', { className: 'gg-empty' }, 'These two revisions are identical.')
      : h(FileWorkspace, { files: state.files, sessionId, signal, base, head, mode: 'commits', tabInfo }))
}
