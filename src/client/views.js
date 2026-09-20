import * as React from 'react'
import { call } from './api.js'
import { EMPTY_TREE } from './constants.js'
import { DiffPanel } from './diff-view.js'
import { FileWorkspace } from './files.js'
import { GitIcon, copyText, formatDate } from './ui.js'

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
