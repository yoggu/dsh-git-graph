import * as React from 'react'
import { call } from './api.js'
import { ACCORDION_H, ACCORDION_MAX_H, ACCORDION_MIN_H, ACCORDION_SPLIT, EMPTY_TREE } from './constants.js'
import { ChangedTree, openDiffTab } from './files.js'
import { formatDate } from './ui.js'

const h = React.createElement

// The graph tab can unmount while a file's separate Diff tab is active.
// Keep only the open row identity in plugin memory, scoped by DSH session;
// this survives tab switches without leaking into browser-persistent storage.
export const openAccordionBySession = new Map()
export const accordionLayoutBySession = new Map()

export function AccordionSurface({ id, label, height, split, onHeightChange, onSplitChange, first, second, state = false, error = false }) {
  const ref = React.useRef(null)
  const resizeHeight = event => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const rect = ref.current.getBoundingClientRect()
    onHeightChange(Math.max(ACCORDION_MIN_H, Math.min(ACCORDION_MAX_H, event.clientY - rect.top)))
  }
  const resizeSplit = event => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const rect = ref.current.getBoundingClientRect()
    onSplitChange(Math.max(25, Math.min(75, 100 * (event.clientX - rect.left) / rect.width)))
  }
  const capture = event => { if (event.button === 0) { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId) } }
  const release = event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }
  return h('div', { ref, id, className: `gg-accordion${state ? ` gg-accordion-state${error ? ' is-error' : ''}` : ''}`, role: state ? (error ? 'alert' : 'status') : undefined, 'aria-label': label,
    style: { '--gg-accordion-height': `${height}px`, '--gg-accordion-split': `${split}%` } },
    state ? h('div', { className: 'gg-accordion-state-content' }, first) : first,
    !state ? h('div', { className: 'gg-accordion-column-resizer', role: 'separator', tabIndex: 0, 'aria-label': 'Resize accordion columns', 'aria-orientation': 'vertical', 'aria-valuemin': 25, 'aria-valuemax': 75, 'aria-valuenow': Math.round(split),
      title: 'Drag to resize columns · Double-click to reset', onDoubleClick: () => onSplitChange(ACCORDION_SPLIT), onPointerDown: capture, onPointerMove: resizeSplit, onPointerUp: release, onPointerCancel: release,
      onKeyDown: event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); onSplitChange(Math.max(25, Math.min(75, split + (event.key === 'ArrowLeft' ? -3 : 3)))) } } }) : null,
    state ? null : second,
    h('div', { className: 'gg-accordion-height-resizer', role: 'separator', tabIndex: 0, 'aria-label': 'Resize accordion height', 'aria-orientation': 'horizontal', 'aria-valuemin': ACCORDION_MIN_H, 'aria-valuemax': ACCORDION_MAX_H, 'aria-valuenow': Math.round(height),
      title: 'Drag down to resize accordion · Double-click to reset', onDoubleClick: () => onHeightChange(ACCORDION_H), onPointerDown: capture, onPointerMove: resizeHeight, onPointerUp: release, onPointerCancel: release,
      onKeyDown: event => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); onHeightChange(Math.max(ACCORDION_MIN_H, Math.min(ACCORDION_MAX_H, height + (event.key === 'ArrowUp' ? -20 : 20)))) } } }))
}

export function CommitAccordion({ hash, sessionId, signal, revision = 0, onSelect, tabInfo, height, split, onHeightChange, onSplitChange }) {
  const [state, setState] = React.useState({ detail: null, error: null })
  React.useEffect(() => {
    let active = true
    setState(current => ({ detail: current.detail?.hash === hash ? current.detail : null, error: null }))
    call({ op: 'commit', sessionId, hash }, signal).then(result => { if (active) setState({ detail: result.detail, error: null }) })
      .catch(error => { if (active && error.name !== 'AbortError') setState({ detail: null, error: String(error.message ?? error) }) })
    return () => { active = false }
  }, [hash, sessionId, signal, revision])
  const detail = state.detail?.hash === hash ? state.detail : null
  if (state.error) return h(AccordionSurface, { id: `gg-accordion-${hash}`, label: 'Commit details unavailable', height, split, onHeightChange, onSplitChange, state: true, error: true,
    first: h(React.Fragment, null, h('strong', null, 'Unable to load commit details'), h('span', null, state.error)) })
  if (!detail) return h(AccordionSurface, { id: `gg-accordion-${hash}`, label: 'Loading commit details', height, split, onHeightChange, onSplitChange, state: true,
    first: h(React.Fragment, null, h('span', { className: 'gg-spinner', 'aria-hidden': 'true' }), h('span', null, 'Loading commit details…')) })
  const openFile = file => openDiffTab(tabInfo, { mode: 'commits', base: detail.parents[0] ?? EMPTY_TREE, head: detail.hash, path: file.path, oldPath: file.oldPath })
  return h(AccordionSurface, { id: `gg-accordion-${hash}`, label: 'Commit details', height, split, onHeightChange, onSplitChange,
    first: h('section', { className: 'gg-accordion-meta' },
      h('dl', { className: 'gg-meta' },
        h('dt', null, 'Commit:'), h('dd', { className: 'gg-mono' }, detail.hash),
        h('dt', null, 'Parents:'), h('dd', null, detail.parents.length ? detail.parents.map(parent => h('button', { key: parent, className: 'gg-link', onClick: () => onSelect?.(parent) }, parent.slice(0, 16))).reduce((all, item, i) => i ? [...all, ' ', item] : [item], []) : 'None'),
        h('dt', null, 'Author:'), h('dd', null, `${detail.authorName} <${detail.authorEmail}>`),
        h('dt', null, 'Author Date:'), h('dd', null, formatDate(detail.authorDate)),
        h('dt', null, 'Committer:'), h('dd', null, `${detail.committerName} <${detail.committerEmail}>`),
        h('dt', null, 'Committer Date:'), h('dd', null, formatDate(detail.committerDate))),
      h('p', { className: 'gg-accordion-message' }, detail.message)),
    second: h('section', { className: 'gg-accordion-files' }, h(ChangedTree, { files: detail.files, onOpen: openFile })) })
}

export function WorkingAccordion({ files = [], tabInfo, height, split, onHeightChange, onSplitChange }) {
  const openFile = file => openDiffTab(tabInfo, { mode: 'working', base: 'HEAD', head: '', path: file.path, oldPath: file.oldPath, group: file.group, staged: file.group === 'staged' })
  const groups = ['staged', 'unstaged', 'untracked']
  return h(AccordionSurface, { id: 'gg-accordion-WORKTREE', label: 'Uncommitted changes', height, split, onHeightChange, onSplitChange,
    first: h('section', { className: 'gg-accordion-meta' },
      h('dl', { className: 'gg-meta' }, h('dt', null, 'Status:'), h('dd', null, 'Uncommitted changes'), h('dt', null, 'Files:'), h('dd', null, files.length)),
      h('p', { className: 'gg-accordion-message' }, 'Read-only snapshot of staged, unstaged and untracked files.')),
    second: h('section', { className: 'gg-accordion-files gg-accordion-working' }, groups.map(group => {
      const entries = files.filter(file => file.group === group)
      if (!entries.length) return null
      return h('div', { key: group, className: 'gg-working-group' }, h('div', { className: 'gg-working-title' }, `${group[0].toUpperCase()}${group.slice(1)} (${entries.length})`), h(ChangedTree, { files: entries, onOpen: openFile }))
    })) })
}

