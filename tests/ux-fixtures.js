/**
 * Contract fixtures for the Git graph's selection-driven UX.
 *
 * These functions are deliberately independent of React and the host API. They
 * describe the stable data contracts that the client UI must render and route;
 * the source-level assertions in ux-contract.test.js ensure the real client
 * wires those contracts into the mounted components.
 */

export const STATUS_CONTRACT = Object.freeze({
  M: Object.freeze({ label: 'Modified', tone: 'warning' }),
  A: Object.freeze({ label: 'Added', tone: 'success' }),
  D: Object.freeze({ label: 'Deleted', tone: 'error' }),
  R: Object.freeze({ label: 'Renamed', tone: 'info' }),
  C: Object.freeze({ label: 'Copied', tone: 'info' }),
  U: Object.freeze({ label: 'Unmerged', tone: 'error' }),
  '?': Object.freeze({ label: 'Untracked', tone: 'muted' }),
})

export function statusContract(status) {
  const code = String(status ?? '?')[0].toUpperCase()
  return STATUS_CONTRACT[code] ?? { label: String(status ?? '?'), tone: 'muted' }
}

/**
 * Build a deterministic folder hierarchy. Every folder is emitted before its
 * children and sibling names are sorted with a locale-independent comparison.
 */
export function buildFileHierarchy(entries = []) {
  const root = { kind: 'folder', name: '', path: '', children: [] }
  const folders = new Map([['', root]])
  const compare = (a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  const folder = (path) => {
    if (folders.has(path)) return folders.get(path)
    const slash = path.lastIndexOf('/')
    const parentPath = slash < 0 ? '' : path.slice(0, slash)
    const node = { kind: 'folder', name: slash < 0 ? path : path.slice(slash + 1), path, children: [] }
    folders.set(path, node)
    const parent = folder(parentPath)
    parent.children.push(node)
    parent.children.sort(compare)
    return node
  }
  for (const entry of entries) {
    const path = String(entry.path ?? '')
    if (!path) continue
    const parts = path.split('/').filter(Boolean)
    const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
    const parent = folder(parentPath)
    parent.children.push({ kind: 'file', name: parts.at(-1), path, entry })
    parent.children.sort(compare)
  }
  return root
}

export function flattenHierarchy(root) {
  const result = []
  const walk = node => {
    for (const child of node.children) {
      result.push({ kind: child.kind, path: child.path, name: child.name })
      if (child.kind === 'folder') walk(child)
    }
  }
  walk(root)
  return result
}

/** Count unique rows that can be rendered in the working-tree file groups. */
export function renderedEntryKey(entry) {
  const group = entry.group ?? (entry.staged ? 'staged' : entry.status === '?' ? 'untracked' : 'unstaged')
  return JSON.stringify([group, entry.path, entry.oldPath ?? null])
}

export function uniqueRenderedEntries(entries = []) {
  return [...new Map(entries.map(entry => [renderedEntryKey(entry), entry])).values()]
}

/** The synthetic summary counts paths, not staged/unstaged render duplicates. */
export function uniquePathCount(entries = []) {
  return new Set(entries.map(entry => String(entry.path ?? ''))).size
}

export function syntheticWorkingRow(entries = []) {
  const unique = uniqueRenderedEntries(entries)
  return {
    kind: 'working-tree',
    label: 'Uncommitted changes',
    count: uniquePathCount(entries),
    tone: 'muted',
    expandable: true,
    entries: unique,
  }
}

export function toggleAccordion(openHash, clickedHash) {
  return openHash === clickedHash ? null : clickedHash
}

/** Payload shape expected by tabInfo.tab.actions.openTab. */
export function diffTabPayload({ sessionId, mode, path, oldPath = undefined, base, head, group, staged = false }) {
  const params = mode === 'working'
    ? { mode: 'working', path, ...(oldPath ? { oldPath } : {}), group, staged }
    : { mode: 'commits', base, head, path, ...(oldPath ? { oldPath } : {}) }
  return { sessionId, kind: 'git-diff', params }
}

export const DIFF_LAYOUT_OPTIONS = Object.freeze([
  Object.freeze({ value: 'auto', label: 'Auto view' }),
  Object.freeze({ value: 'split', label: 'Side by side' }),
  Object.freeze({ value: 'unified', label: 'Inline' }),
])
