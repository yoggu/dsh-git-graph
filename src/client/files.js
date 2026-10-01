import * as React from 'react'
import { COMPARE_KIND, DIFF_KIND } from './constants.js'
import { DiffPanel } from './diff-view.js'
import { SplitPane, useRevealSelection } from './ui.js'
import { diffFileIdentity } from './diff-layout.js'

const h = React.createElement

/** Copy repository identity at navigation/confirmation boundaries, never selection globals. */
export function snapshotRepositoryScope({ target, repositoryLabel } = {}) {
  return {
    target: target === undefined ? undefined : JSON.parse(JSON.stringify(target)),
    repositoryLabel,
  }
}

/** Open every changed file in a fresh right-sidebar diff tab. */
export function openDiffTab(tabInfo, params) {
  const openTab = tabInfo?.tab?.actions?.openTab
  if (typeof openTab !== 'function') return false
  tabInfo.tab.actions.openTab(DIFF_KIND, { params: { ...params, ...snapshotRepositoryScope(params) } })
  return true
}

/**
 * Open the comparison of two revisions in its own tab.
 *
 * An empty `head` is the working tree, which is how the same view answers
 * "what has this agent changed since that commit".
 *
 * @param tabInfo - the graph tab's live information, which owns opening tabs.
 * @param base - the earlier revision.
 * @param head - the later revision, or nothing for the working tree.
 * @returns whether a tab was opened.
 */
export function openCompareTab(tabInfo, base, head, scope = {}) {
  const openTab = tabInfo?.tab?.actions?.openTab
  if (typeof openTab !== 'function') return false
  tabInfo.tab.actions.openTab(COMPARE_KIND, { params: { base, head: head ?? '', ...snapshotRepositoryScope(scope) } })
  return true
}

/** Build a stable, always-expanded folder tree from repository-relative paths. */
export function makeFileTree(files = []) {
  const root = { name: '', folders: new Map(), files: [] }
  for (const file of files) {
    const path = String(file.path ?? '')
    if (!path) continue
    const parts = path.split('/').filter(Boolean)
    let node = root
    parts.slice(0, -1).forEach(name => {
      if (!node.folders.has(name)) node.folders.set(name, { name, folders: new Map(), files: [] })
      node = node.folders.get(name)
    })
    node.files.push({ ...file, path })
  }
  return root
}

export function compactTreeFolder(folder) {
  let node = folder
  const names = [node.name]
  while (node.files.length === 0 && node.folders.size === 1) {
    node = [...node.folders.values()][0]
    names.push(node.name)
  }
  return { node, name: names.join('/') }
}

export function fileStatus(file) {
  const code = String(file.status || '?')[0].toUpperCase()
  return { code, title: ({ M: 'Modified', A: 'Added', D: 'Deleted', R: 'Renamed', C: 'Copied', U: 'Unmerged', '?': 'Untracked' })[code] || file.status || 'Changed' }
}

export function changeCounts(file) {
  const added = file.added ?? file.additions ?? file.insertions
  const removed = file.removed ?? file.deletions ?? file.deletionsCount
  return Number.isFinite(Number(added)) || Number.isFinite(Number(removed))
    ? h('span', { className: 'gg-file-counts' }, Number.isFinite(Number(added)) ? h('span', { className: 'gg-file-added' }, `+${Number(added)}`) : null, ' ', Number.isFinite(Number(removed)) ? h('span', { className: 'gg-file-removed' }, `−${Number(removed)}`) : null)
    : null
}

export function FileIcon({ path = '', folder = false }) {
  const extension = folder ? 'folder' : (String(path).split('.').pop()?.toLowerCase() || 'file')
  return h('svg', { className: `gg-file-icon gg-file-icon-${extension}`, viewBox: '0 0 16 16', 'aria-hidden': 'true' }, folder
    ? h('path', { d: 'M1.5 3.5h5l1.35 1.5h6.65v8.5h-13z' })
    : h(React.Fragment, null, h('path', { d: 'M3 1.5h6.5l3.5 3.5v9.5H3z' }), h('path', { className: 'gg-file-icon-fold', d: 'M9.5 1.5V5H13' })))
}

/**
 * One changed file's tree.
 *
 * A file row that carries a context-menu handler offers that file's own
 * actions — discarding it, for the working tree — while a click still opens
 * its diff.
 *
 * @param files - the flat file entries.
 * @param onOpen - opening one file's diff.
 * @param onContextMenu - asked to open a menu for the pressed file.
 * @param empty - what to say when there is nothing to list.
 * @returns the tree element.
 */
export function ChangedTree({ files = [], onOpen, onContextMenu, empty = 'No changed files.' }) {
  const tree = React.useMemo(() => makeFileTree(files), [files])
  const renderNode = (node, prefix = '') => {
    const folders = [...node.folders.values()].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    const entries = [...node.files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
    return [...folders.map(folder => {
      const compact = compactTreeFolder(folder)
      return h('div', { key: `${prefix}${compact.name}/`, className: 'gg-tree-folder' },
        h('div', { className: 'gg-tree-folder-name', title: `${prefix}${compact.name}/` }, h('span', { className: 'gg-tree-chevron' }, '▾'), h(FileIcon, { path: compact.name, folder: true }), h('span', null, compact.name)),
        h('div', { className: 'gg-tree-children' }, renderNode(compact.node, `${prefix}${compact.name}/`)))
    }),
    ...entries.map(file => {
      const status = fileStatus(file)
      const title = file.oldPath ? `${file.oldPath} → ${file.path}` : file.path
      return h('button', { key: `${prefix}${file.path}:${file.group || ''}`, type: 'button', className: 'gg-file gg-tree-file', title,
        'data-status': status.code, onClick: () => onOpen?.(file),
        onContextMenu: onContextMenu === undefined ? undefined : (event) => {
          event.preventDefault()
          onContextMenu(event, file)
        },
      }, h(FileIcon, { path: file.path }), h('span', { className: 'gg-sr-only' }, `${status.title}: `),
      h('span', { className: 'gg-path' }, file.oldPath && file.oldPath !== file.path ? `${file.oldPath} → ${file.path}` : file.path), changeCounts(file))
    })]
  }
  const children = renderNode(tree)
  return h('div', { className: 'gg-tree', role: 'tree' }, children.length ? children : h('div', { className: 'gg-empty' }, empty))
}

/** Files are flat entries {path, oldPath?, status, group?, staged?}; tabs are preferred. */
export function FileWorkspace({ files = [], sessionId, target, repositoryLabel, signal, base, head, mode = 'commits', revision = 0, tabInfo }) {
  const [filter, setFilter] = React.useState('')
  const [selection, setSelection] = React.useState(null)
  const rows = React.useRef(new Map())
  const listRef = React.useRef(null)
  const scope = JSON.stringify([sessionId, target, mode, base, head])
  const normalized = files.map(file => ({ ...file, group: mode === 'working' ? (file.group || (file.staged ? 'staged' : file.status === '?' ? 'untracked' : 'unstaged')) : 'commits' }))
  const query = filter.trim().toLocaleLowerCase()
  const order = ['staged', 'unstaged', 'untracked']
  const visible = normalized.filter(file => `${file.path}\n${file.oldPath || ''}`.toLocaleLowerCase().includes(query))
    .sort((a, b) => mode === 'working' ? order.indexOf(a.group) - order.indexOf(b.group) : 0)
  const picked = selection?.scope === scope ? visible.find(file => diffFileIdentity(file, mode) === selection.id) : null
  const selected = picked || visible[0] || null
  const selectedId = selected ? diffFileIdentity(selected, mode) : null
  useRevealSelection(listRef, `${scope}:${selectedId}`, '.gg-du-file.is-selected', true)
  const index = selected ? visible.findIndex(file => diffFileIdentity(file, mode) === selectedId) : -1
  React.useEffect(() => {
    if (selectedId !== null && (selection?.scope !== scope || selection?.id !== selectedId)) setSelection({ scope, id: selectedId })
  }, [scope, selectedId, selection])
  const pick = (file, focus) => {
    if (tabInfo) openDiffTab(tabInfo, mode === 'working'
      ? { target, repositoryLabel, mode: 'working', base: 'HEAD', head: '', path: file.path, oldPath: file.oldPath, group: file.group, staged: file.group === 'staged' }
      : { target, repositoryLabel, mode: 'commits', base, head, path: file.path, oldPath: file.oldPath })
    const id = diffFileIdentity(file, mode)
    setSelection({ scope, id })
    if (focus) { const node = rows.current.get(id); node?.focus(); node?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }
  }
  const move = delta => { if (visible.length) pick(visible[Math.max(0, Math.min(visible.length - 1, index + delta))], true) }
  const groups = mode === 'working' ? [['staged', 'Staged'], ['unstaged', 'Unstaged'], ['untracked', 'Untracked']] : [['commits', 'Changed files']]
  const first = h('section', { className: 'gg-du-filepane', 'aria-label': 'Changed files' },
    h('div', { className: 'gg-du-filter' }, h('input', { type: 'search', placeholder: 'Filter files…', 'aria-label': 'Filter files', value: filter, onChange: event => setFilter(event.target.value), onKeyDown: event => { if (event.key === 'ArrowDown' && visible.length) { event.preventDefault(); pick(selected || visible[0], true) } } })),
    h('div', { className: 'gg-du-controls' },
      h('button', { type: 'button', className: 'gg-du-button', disabled: index <= 0, onClick: () => move(-1) }, 'Previous'),
      h('span', { className: 'gg-du-position' }, `${index + 1} / ${visible.length}`),
      h('button', { type: 'button', className: 'gg-du-button', disabled: index < 0 || index >= visible.length - 1, onClick: () => move(1) }, 'Next')),
    h('div', { ref: listRef, className: 'gg-du-filelist', onKeyDown: event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); move(event.key === 'ArrowDown' ? 1 : -1) }
      else if ((event.key === 'Home' || event.key === 'End') && visible.length) { event.preventDefault(); pick(visible[event.key === 'Home' ? 0 : visible.length - 1], true) }
    } }, !visible.length ? h('div', { className: 'gg-empty' }, files.length ? 'No files match the filter.' : 'No changed files.') : groups.map(([group, title]) => {
      const entries = visible.filter(file => file.group === group)
      if (!entries.length) return null
      return h('section', { key: group, className: 'gg-du-group', 'aria-label': title },
        h('h4', { className: 'gg-du-group-title' }, `${title} · ${entries.length}`),
        entries.map(file => {
          const id = diffFileIdentity(file, mode)
          const title = file.oldPath ? `${file.oldPath} → ${file.path}` : file.path
          const status = fileStatus(file)
          return h('button', { key: id, type: 'button', className: `gg-du-file${id === selectedId ? ' is-selected' : ''}`, title,
            tabIndex: id === selectedId ? 0 : -1, 'aria-pressed': id === selectedId, 'data-status': status.code,
            ref: node => { if (node) rows.current.set(id, node); else rows.current.delete(id) }, onClick: () => pick(file, false),
          }, h(FileIcon, { path: file.path }), h('span', { className: 'gg-sr-only' }, `${status.title}: `), h('span', { className: 'gg-du-path' }, title))
        }))
    })))
  const second = h(DiffPanel, { sessionId, target, repositoryLabel, signal, revision, params: selected ? { target, repositoryLabel, mode, base, head, path: selected.path, oldPath: selected.oldPath, group: selected.group, staged: selected.group === 'staged' } : { target, repositoryLabel } })
  return h('div', { className: 'gg-du-workspace' }, h(SplitPane, { first, second, axis: 'auto', initial: 30, label: 'File list and diff' }))
}

