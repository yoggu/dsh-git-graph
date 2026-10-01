import * as React from 'react'
import { call } from './api.js'
import { EMPTY_TREE } from './constants.js'
import { DiffPanel } from './diff-view.js'
import { FileWorkspace } from './files.js'
import { copyText, formatDate, formatRange } from './ui.js'

const h = React.createElement

export function CommitInspector({ hash, sessionId, target, repositoryLabel, signal, revision = 0, onSelect, tabInfo }) {
  const key = JSON.stringify([sessionId, target, hash])
  const [state, setState] = React.useState({ key: '', detail: null, error: null })
  React.useEffect(() => {
    let active = true
    setState(current => ({ key, detail: current.key === key ? current.detail : null, error: null }))
    call({ op: 'commit', sessionId, target, hash }, signal).then(result => { if (active) setState({ key, detail: result.detail, error: null }) })
      .catch(error => { if (active && error.name !== 'AbortError') setState({ key, detail: null, error: String(error.message ?? error) }) })
    return () => { active = false }
  }, [key, signal, revision])
  const current = state.key === key ? state : { detail: null, error: null }
  const detail = current.detail?.hash === hash ? current.detail : null
  if (current.error) return h('div', { className: 'gg-error', role: 'alert' }, current.error)
  if (!detail) return h('div', { className: 'gg-empty', role: 'status' }, 'Loading commit…')
  return h('section', { className: 'gg-root gg-inspector', 'aria-label': 'Commit details' },
    repositoryLabel ? h('div', { className: 'gg-diff-summary' }, repositoryLabel) : null,
    h('details', { className: 'gg-commit-summary' },
      h('summary', { title: detail.message }, h('span', { className: 'gg-commit-subject' }, detail.message.split('\n')[0]),
        h('span', { className: 'gg-commit-caption' }, `${hash.slice(0, 8)} · ${detail.authorName} · ${formatDate(detail.authorDate)}`)),
      h('div', { className: 'gg-commit-extra' }, h('p', { className: 'gg-msg' }, detail.message),
        h('div', null, `${detail.authorName} <${detail.authorEmail}>`),
        h('button', { className: 'gg-link', onClick: () => copyText(hash) }, 'Copy commit hash'),
        detail.parents.length > 0 ? h('div', null, 'Parents: ', detail.parents.map(parent => h('button', { key: parent, className: 'gg-link', onClick: () => onSelect?.(parent) }, `${parent.slice(0, 8)} `))) : null)),
    h('div', { className: 'gg-diff-summary' }, `${detail.files.length} changed files · ${detail.parents.length > 1 ? 'Merge · compared with first parent' : detail.parents.length ? 'Compared with parent' : 'Root commit · all added files'}`),
    h(FileWorkspace, { files: detail.files, sessionId, target, repositoryLabel, signal, base: detail.parents[0] ?? EMPTY_TREE, head: detail.hash, revision, tabInfo }))
}

/** Legacy commit links use the same persistent file/diff browser. */
export function CommitView({ tabInfo, sessionId }) {
  const params = tabInfo.tab.navigation?.params ?? {}
  const { target, repositoryLabel } = params
  const initial = params.hash
  const scope = JSON.stringify([sessionId, target, initial])
  const [selection, setSelection] = React.useState({ scope, hash: initial })
  const hash = selection.scope === scope ? selection.hash : initial
  return hash ? h(CommitInspector, { key: scope, hash, sessionId, target, repositoryLabel, signal: tabInfo.tab.signal,
    onSelect: next => setSelection({ scope, hash: next }), tabInfo }) : h('div', { className: 'gg-empty' }, 'No commit selected.')
}

export function DiffView({ tabInfo, sessionId }) {
  const params = tabInfo.tab.navigation?.params ?? {}
  const { target, repositoryLabel } = params
  return h(DiffPanel, { key: JSON.stringify([sessionId, target]), sessionId, target, repositoryLabel, signal: tabInfo.tab.signal, params })
}

/** The comparison of two revisions, bound to its originating repository. */
export function CompareView({ tabInfo, sessionId }) {
  const params = tabInfo.tab.navigation?.params ?? {}
  const { target, repositoryLabel } = params
  const base = typeof params.base === 'string' ? params.base : ''
  const head = typeof params.head === 'string' ? params.head : ''
  const signal = tabInfo.tab.signal
  const revision = params.revision ?? 0
  const key = JSON.stringify([sessionId, target, base, head, revision])
  const [state, setState] = React.useState({ key: '', files: null, error: null })
  React.useEffect(() => {
    let active = true
    setState({ key, files: null, error: null })
    // An empty later side is the working tree.
    call({ op: 'compare', sessionId, target, from: base, to: head === '' ? null : head }, signal)
      .then(result => { if (active) setState({ key, files: result.files ?? [], error: null }) })
      .catch(error => {
        if (active && error.name !== 'AbortError') setState({ key, files: null, error: String(error.message ?? error) })
      })
    return () => { active = false }
  }, [key, signal])
  const current = state.key === key ? state : { files: null, error: null }
  if (current.error !== null) return h('div', { className: 'gg-error', role: 'alert' }, current.error)
  if (current.files === null) return h('div', { className: 'gg-empty', role: 'status' }, 'Reading the comparison…')
  return h('section', { className: 'gg-root gg-inspector', 'aria-label': 'Commit comparison' },
    h('div', { className: 'gg-diff-summary' },
      `${repositoryLabel ? `${repositoryLabel} · ` : ''}${current.files.length} changed file${current.files.length === 1 ? '' : 's'} · ${formatRange(base, head)}`),
    current.files.length === 0
      ? h('div', { className: 'gg-empty' }, 'These two revisions are identical.')
      : h(FileWorkspace, { key: JSON.stringify([sessionId, target, base, head]), files: current.files, sessionId, target, repositoryLabel, signal, base, head, revision, mode: 'commits', tabInfo }))
}
