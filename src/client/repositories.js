import * as React from 'react'
import { call } from './api.js'
import { GraphView } from './graph-view.js'
import { GitIcon } from './ui.js'

const h = React.createElement
export const repositorySelectionBySession = new Map()
export const targetKey = target => JSON.stringify(target ?? null)
const levelKey = (group, path) => JSON.stringify([group.id, path])

export function repositoryDisplay(entry) {
  if (entry.relativePath === '.') return { name: entry.workspaceTitle ?? entry.root.split(/[\\/]/).filter(Boolean).at(-1), parent: '', root: true }
  if (entry.target?.containing) return { name: entry.root.split(/[\\/]/).filter(Boolean).at(-1), parent: 'Containing repository', root: false }
  const parts = String(entry.relativePath ?? entry.label).split('/')
  return { name: parts.pop() || entry.label, parent: parts.join('/'), root: false }
}

function PickerSymbol({ kind, className = '' }) {
  const paths = { search: 'M11 11l3 3M12 7a5 5 0 1 1-10 0 5 5 0 0 1 10 0', folder: 'M2 4h4l2 2h6v7H2z', chevron: 'M5 6l3 3 3-3', check: 'M3 8l3 3 7-7' }
  return h('svg', { className, width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: paths[kind] }))
}

/** Only the containing repository is an implicit selection, never a sole child. */
export function initialRepository(entries, containing, remembered) {
  if (remembered) return entries.find(entry => entry.root === remembered.root) ?? (containing?.root === remembered.root ? containing : null)
  if (containing) return entries.find(entry => entry.root === containing.root) ?? containing
  return null
}

export function RepositoryGraph({ sessionId, tabInfo }) {
  const [groups, setGroups] = React.useState([])
  const [levels, setLevels] = React.useState({})
  const [expanded, setExpanded] = React.useState(new Set())
  const [selected, setSelected] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [writing, setWriting] = React.useState(false)
  const [retry, setRetry] = React.useState(0)
  const [rescanning, setRescanning] = React.useState(false)
  const trigger = React.useRef(null)
  const search = React.useRef(null)
  const panel = React.useRef(null)
  const selectionEpoch = React.useRef(0)
  const actionLock = React.useRef(false)
  // Each lifetime owns its cache and epochs: an old session cannot mutate the
  // next session's refs even when a transport ignores abort.
  const life = React.useMemo(() => ({ controller: new AbortController(), levels: {}, requests: new Map(), groups: new Map(), expanded: new Set(), epoch: 0, rescanning: false }), [sessionId, retry])
  const signal = life.controller.signal
  const close = () => { setOpen(false); trigger.current?.focus() }
  const labelFor = (entry, group) => ({ ...entry, groupId: group.id, repositoryLabel: `${group.title} / ${entry.label}`, workspaceTitle: group.title })
  const publish = () => { if (!signal.aborted) setLevels({ ...life.levels }) }
  const loadLevel = React.useCallback((group, path = '.', includeChildren = false, refresh = false) => {
    const key = levelKey(group, path)
    const old = life.levels[key]
    const pending = life.requests.get(key)
    if (!refresh && pending && (pending.includeChildren || !includeChildren)) return pending.promise
    if (!refresh && old?.node && (!includeChildren || old.loaded)) return Promise.resolve(old)
    const epoch = life.epoch
    const request = { includeChildren }
    life.levels[key] = { ...old, loading: true, error: null }; publish()
    const current = () => !signal.aborted && life.epoch === epoch && life.groups.get(group.id)?.path === group.path && life.requests.get(key) === request
    request.promise = call({ op: 'repositoryLevel', sessionId, ...(group.session ? {} : { workspaceId: group.id }), path, includeChildren, refresh }, signal)
      .then(result => {
        if (!current()) return null
        const decorate = node => ({ ...node, repository: node.repository ? labelFor(node.repository, group) : null })
        const next = { node: decorate(result.node), children: includeChildren ? (result.children ?? []).map(decorate) : old?.children ?? [], loaded: includeChildren || old?.loaded || false, loading: false, error: null }
        if (includeChildren) {
          const removed = (old?.children ?? []).filter(child => !next.children.some(node => node.path === child.path))
          const belongsToRemoved = candidate => {
            const [id, childPath] = JSON.parse(candidate)
            return id === group.id && removed.some(child => childPath === child.path || childPath.startsWith(`${child.path}/`))
          }
          for (const candidate of Object.keys(life.levels)) if (belongsToRemoved(candidate)) delete life.levels[candidate]
          for (const candidate of life.requests.keys()) if (belongsToRemoved(candidate)) life.requests.delete(candidate)
          life.expanded = new Set([...life.expanded].filter(candidate => !belongsToRemoved(candidate)))
          setExpanded(new Set(life.expanded))
          // Parent-level probes also update a cached child's own Git identity.
          for (const child of next.children) {
            const childKey = levelKey(group, child.path)
            if (life.levels[childKey]) life.levels[childKey] = { ...life.levels[childKey], node: child }
          }
        }
        life.levels[key] = next; publish(); return next
      }).catch(reason => {
        if (current()) { life.levels[key] = { ...old, loading: false, error: String(reason.message ?? reason), failedChildren: includeChildren }; publish() }
        return null
      }).finally(() => { if (life.requests.get(key) === request) life.requests.delete(key) })
    life.requests.set(key, request)
    return request.promise
  }, [sessionId, life])
  React.useEffect(() => {
    const abort = () => life.controller.abort()
    tabInfo.tab.signal?.addEventListener('abort', abort, { once: true })
    if (tabInfo.tab.signal?.aborted) abort()
    const epoch = ++selectionEpoch.current
    const registryEpoch = life.epoch
    actionLock.current = false
    setLoading(true); setError(null); setGroups([]); setLevels({}); setExpanded(new Set()); setSelected(null); setOpen(false); setQuery(''); setWriting(false); setRescanning(false)
    call({ op: 'workspaces', sessionId }, signal).then(async result => {
      if (signal.aborted || registryEpoch !== life.epoch) return
      const ordered = [...result.groups].sort((a, b) => Number(b.current) - Number(a.current))
      life.groups = new Map(ordered.map(group => [group.id, group])); setGroups(ordered)
      const local = ordered.find(group => group.id === result.currentGroupId) ?? ordered[0]
      const remembered = repositorySelectionBySession.get(sessionId)
      let entry = result.containing ? labelFor(result.containing, local ?? { id: 'session', title: 'Current session' }) : null
      if (remembered) {
        entry = null
        const group = life.groups.get(remembered.groupId)
        if (group) {
          try {
            const result = await call({ op: 'state', sessionId, target: remembered.target }, signal)
            if (result.root === remembered.root) entry = labelFor(remembered, group)
          } catch { /* Exact validation never substitutes another repository. */ }
        }
      }
      if (signal.aborted) return
      if (selectionEpoch.current === epoch && registryEpoch === life.epoch) {
        if (remembered && !entry) setError('The previously selected repository is unavailable. Choose another repository or rescan.')
        if (entry) { repositorySelectionBySession.set(sessionId, entry); setSelected(entry) }
      }
      setLoading(false)
    }).catch(reason => { if (!signal.aborted && registryEpoch === life.epoch) { if (selectionEpoch.current === epoch) setError(String(reason.message ?? reason)); setLoading(false) } })
    return () => { abort(); tabInfo.tab.signal?.removeEventListener('abort', abort) }
  }, [sessionId, life])
  React.useEffect(() => {
    if (!open) return undefined
    search.current?.focus()
    const outside = event => { if (!panel.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    // Opening the picker probes roots only, with at most two requests at once.
    const epoch = life.epoch
    const queue = groups.filter(group => !life.levels[levelKey(group, '.')])
    const worker = async () => { while (queue.length && !signal.aborted && life.epoch === epoch) await loadLevel(queue.shift()) }
    void worker(); void worker()
    return () => document.removeEventListener('pointerdown', outside)
  }, [open, groups, loadLevel])
  const choose = entry => {
    if (actionLock.current || signal.aborted) return
    selectionEpoch.current++
    repositorySelectionBySession.set(sessionId, entry); setSelected(entry); setError(null); close()
  }
  const expand = (group, node, value) => {
    if (actionLock.current || signal.aborted || life.rescanning) return
    const key = levelKey(group, node.path)
    const next = new Set(life.expanded)
    if (value) next.add(key); else next.delete(key)
    life.expanded = next; setExpanded(next)
    if (value) void loadLevel(group, node.path, true)
  }
  const rescan = async () => {
    if (actionLock.current || life.rescanning || signal.aborted) return
    life.rescanning = true; setRescanning(true)
    const selection = selectionEpoch.current
    const epoch = ++life.epoch
    life.requests.clear()
    try {
      const result = await call({ op: 'workspaces', sessionId }, signal)
      if (signal.aborted || epoch !== life.epoch) return
      const ordered = [...result.groups].sort((a, b) => Number(b.current) - Number(a.current))
      life.groups = new Map(ordered.map(group => [group.id, group]))
      // A registry change invalidates old scope data, including pending replies.
      const retained = new Set(ordered.filter(group => groups.some(old => old.id === group.id && old.path === group.path)).map(group => group.id))
      life.levels = Object.fromEntries(Object.entries(life.levels).filter(([key]) => retained.has(JSON.parse(key)[0])).map(([key, value]) => [key, { ...value, loading: false }]))
      life.expanded = new Set([...life.expanded].filter(key => retained.has(JSON.parse(key)[0])))
      setExpanded(new Set(life.expanded)); setGroups(ordered); publish()
      // Follow only visible, explicitly expanded branches. Collapsed cached
      // descendants are not refreshed, nor are newly discovered children.
      const refreshVisible = async (group, path = '.') => {
        const children = life.expanded.has(levelKey(group, path))
        const level = await loadLevel(group, path, children, true)
        if (signal.aborted || epoch !== life.epoch || !level || !children) return
        for (const child of level.children) if (life.expanded.has(levelKey(group, child.path))) await refreshVisible(group, child.path)
      }
      const queue = [...ordered]
      const worker = async () => { while (queue.length && !signal.aborted && epoch === life.epoch) await refreshVisible(queue.shift()) }
      await Promise.all([worker(), worker()])
      if (selected && !signal.aborted && selectionEpoch.current === selection) {
        let valid = false
        if (life.groups.has(selected.groupId)) {
          try { const result = await call({ op: 'state', sessionId, target: selected.target }, signal); valid = result.root === selected.root } catch { /* No fallback. */ }
        }
        if (!signal.aborted && !actionLock.current && selectionEpoch.current === selection && !valid) {
          setSelected(null); setError('The selected repository is unavailable. Choose another repository or retry.')
        }
      }
    } catch (reason) {
      if (!signal.aborted && selectionEpoch.current === selection) setError(String(reason.message ?? reason))
    } finally { if (!signal.aborted) { life.rescanning = false; setRescanning(false); setLoading(false) } }
  }
  const keyboard = event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); return }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const buttons = [...panel.current.querySelectorAll('[data-repository-option]:not(:disabled)')]
    if (!buttons.length) return
    event.preventDefault()
    const index = buttons.indexOf(document.activeElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : index < 0 ? (event.key === 'ArrowDown' ? 0 : buttons.length - 1) : Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))
    buttons[next].focus(); buttons[next].scrollIntoView({ block: 'nearest' })
  }
  const needle = query.trim().toLocaleLowerCase()
  const renderNode = (group, fallback, depth = 0) => {
    const key = levelKey(group, fallback.path)
    const state = levels[key] ?? {}
    const node = state.node ?? fallback
    const root = node.path === '.'
    const label = root ? group.title : node.path
    const isExpanded = expanded.has(key)
    const children = isExpanded ? (state.children ?? []).map(child => renderNode(group, child, depth + 1)).filter(Boolean) : []
    const matches = `${group.title}\n${root ? group.path : ''}\n${node.path}\n${node.label}`.toLocaleLowerCase().includes(needle)
    if (needle && !matches && !children.length) return null
    const entry = node.repository
    const active = Boolean(entry && selected && entry.root === selected.root && (
      targetKey(entry.target) === targetKey(selected.target) || (selected.target?.containing && selected.groupId === group.id)
    ))
    const nodeKeyboard = event => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
      event.preventDefault(); event.stopPropagation()
      expand(group, node, event.key === 'ArrowRight')
    }
    return h('div', { key, className: 'gg-repository-node' },
      h('div', { className: `gg-repository-tree-row${active ? ' is-selected' : ''}`, style: { paddingLeft: `${depth * 18}px` }, onKeyDown: nodeKeyboard },
        h('button', { type: 'button', className: `gg-repository-expand${isExpanded ? ' is-expanded' : ''}`, 'aria-label': `${isExpanded ? 'Collapse' : 'Expand'} ${label}`, 'aria-expanded': isExpanded, disabled: writing || rescanning, onClick: () => expand(group, node, !isExpanded) }, h(PickerSymbol, { kind: 'chevron' })),
        h('button', { type: 'button', className: 'gg-repository-option', 'data-repository-option': true, 'aria-label': label, ...(entry ? { 'aria-pressed': active } : { 'aria-expanded': isExpanded }), disabled: writing || (!entry && rescanning), title: entry?.root ?? (root ? group.path : node.path), onClick: () => entry ? choose(entry) : expand(group, node, !isExpanded) },
          entry ? h(GitIcon, { name: 'branch', className: 'gg-repository-row-icon' }) : h(PickerSymbol, { kind: 'folder', className: 'gg-repository-row-icon' }),
          h('span', { className: 'gg-repository-row-name' }, root ? group.title : node.label),
          root && group.current ? h('span', { className: 'gg-repository-current' }, 'Current') : null,
          active ? h(PickerSymbol, { kind: 'check', className: 'gg-repository-check' }) : null)),
      state.loading ? h('div', { className: 'gg-repository-status', role: 'status', style: { paddingLeft: `${depth * 18 + 30}px` } }, 'Loading…') : null,
      state.error ? h('div', { className: 'gg-repository-status is-error', role: 'alert', style: { paddingLeft: `${depth * 18 + 30}px` } }, state.error, h('button', { type: 'button', className: 'gg-repository-retry', disabled: writing || rescanning, 'aria-label': `Retry ${label}`, onClick: () => { if (!actionLock.current) void loadLevel(group, node.path, state.failedChildren, true) } }, 'Retry')) : null,
      children)
  }
  const rows = groups.map(group => renderNode(group, { path: '.', label: group.title, repository: null })).filter(Boolean)
  const display = selected ? repositoryDisplay(selected) : null
  return h('div', { className: 'gg-root gg-repository-workbench' },
    h('div', { className: 'gg-repository-picker', ref: panel, onKeyDown: keyboard },
      h('button', { ref: trigger, type: 'button', className: `gg-repository-trigger${open ? ' is-open' : ''}`, disabled: writing, 'aria-label': 'Select repository', 'aria-expanded': open, 'aria-haspopup': 'dialog', title: selected?.root ?? 'Browse workspace folders', onClick: () => { if (!actionLock.current) setOpen(value => !value) } },
        h(GitIcon, { name: 'branch', className: 'gg-repository-trigger-icon' }),
        h('span', { className: 'gg-repository-caption' }, selected
          ? h(React.Fragment, null, display.root ? null : h(React.Fragment, null, h('span', { className: 'gg-repository-workspace-name' }, selected.workspaceTitle), h('span', { className: 'gg-repository-slash', 'aria-hidden': true }, '/')), h('span', { className: 'gg-repository-name' }, display.name))
          : h('span', { className: 'gg-repository-placeholder' }, loading ? 'Loading workspaces…' : 'Choose a repository')),
        h(PickerSymbol, { kind: 'chevron', className: 'gg-repository-chevron' })),
      open ? h('div', { className: 'gg-repository-menu', role: 'dialog', 'aria-label': 'Repository picker' },
        h('div', { className: 'gg-repository-search' }, h(PickerSymbol, { kind: 'search', className: 'gg-repository-search-icon' }),
          h('input', { ref: search, type: 'search', placeholder: 'Find workspaces or folders…', 'aria-label': 'Find repositories', value: query, onChange: event => setQuery(event.target.value) }),
          h('button', { type: 'button', className: 'gg-repository-rescan', 'aria-label': 'Rescan', title: 'Refresh roots and expanded folders', disabled: writing || rescanning || Object.values(levels).some(level => level.loading), onClick: rescan }, h(GitIcon, { name: 'refresh' }))),
        h('div', { className: 'gg-repository-groups' }, rows.length ? rows : h('div', { className: 'gg-repository-empty' }, query ? 'No workspaces or folders match your search.' : loading ? 'Loading workspaces…' : 'No workspaces available.'))) : null),
    error ? h('div', { className: 'gg-error', role: 'alert' }, error, h('button', { className: 'gg-btn', disabled: writing, onClick: () => { if (!actionLock.current) setRetry(value => value + 1) } }, 'Retry')) : null,
    selected ? h(GraphView, { key: `${sessionId}:${selected.root}:${targetKey(selected.target)}`, tabInfo, sessionId, target: selected.target, repositoryRoot: selected.root, repositoryLabel: selected.repositoryLabel, onRunningChange: value => { actionLock.current = value; setWriting(value) } })
      : h('div', { className: 'gg-empty', role: 'status' }, loading ? 'Loading workspaces…' : 'Choose a repository above to inspect its history.'))
}
