/** Parse ordinary unified patches without treating +++/--- content as headers. */
export function parseUnifiedPatch(patch) {
  const lines = String(patch ?? '').split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  const rows = [], hunks = []
  let oldLine = 0, newLine = 0, oldLeft = 0, newLeft = 0
  let additions = 0, deletions = 0, binary = false
  for (const text of lines) {
    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(text)
    const row = { text, kind: 'meta', old: null, new: null }
    if (match) {
      oldLine = Number(match[1]); newLine = Number(match[3])
      oldLeft = Number(match[2] ?? 1); newLeft = Number(match[4] ?? 1)
      row.kind = 'hunk'; row.hunk = hunks.length
      hunks.push(rows.length)
    } else if (text.startsWith('\\')) {
      row.kind = 'note'
    } else if (oldLeft > 0 && text.startsWith('-')) {
      row.kind = 'del'; row.old = oldLine++; oldLeft--; deletions++
    } else if (newLeft > 0 && text.startsWith('+')) {
      row.kind = 'add'; row.new = newLine++; newLeft--; additions++
    } else if (oldLeft > 0 && newLeft > 0 && text.startsWith(' ')) {
      row.kind = 'ctx'; row.old = oldLine++; row.new = newLine++
      oldLeft--; newLeft--
    } else {
      oldLeft = 0; newLeft = 0
      if (/^(Binary files .* differ|GIT binary patch)/.test(text)) binary = true
    }
    rows.push(row)
  }
  return { rows, hunks, additions, deletions, binary }
}

/**
 * Align a unified patch into rows suitable for a side-by-side preview.
 * Context remains paired; adjacent delete/add runs become replacement rows,
 * with null cells when one side is longer. Hunk and note rows span both
 * sides so navigation and no-newline markers remain understandable.
 */
export function planSplitRows(rows = []) {
  const planned = []
  const cell = (row, index) => row ? { text: row.text, number: row.old ?? row.new ?? null, row, index } : null
  for (let i = 0; i < rows.length;) {
    const row = rows[i]
    if (row.kind === 'meta') { i++; continue }
    if (row.kind === 'hunk') {
      planned.push({ kind: 'hunk', row, index: i })
      i++
      continue
    }
    if (row.kind === 'note') {
      planned.push({ kind: 'note', row, index: i })
      i++
      continue
    }
    if (row.kind === 'ctx') {
      planned.push({ kind: 'line', old: cell(row, i), new: cell(row, i), indices: [i] })
      i++
      continue
    }
    if (row.kind === 'del' || row.kind === 'add') {
      const start = i
      const deletes = [], adds = []
      while (i < rows.length && (rows[i].kind === 'del' || rows[i].kind === 'add')) {
        const current = rows[i]
        ;(current.kind === 'del' ? deletes : adds).push(cell(current, i))
        i++
      }
      const count = Math.max(deletes.length, adds.length)
      for (let offset = 0; offset < count; offset++) {
        const old = deletes[offset] || null
        const newer = adds[offset] || null
        planned.push({ kind: 'line', old, new: newer, indices: [old?.index, newer?.index].filter(index => index != null), replacement: !!old && !!newer })
      }
      // Defensive progress guarantee if a future row kind is introduced.
      if (i === start) i++
      continue
    }
    planned.push({ kind: 'line', old: cell(row, i), new: null, indices: [i] })
    i++
  }
  return planned
}

/** Auto keeps the established unified view until a real width is measured. */
export function resolveDiffLayout(mode = 'auto', width = null, splitAt = 900) {
  const normalized = mode === 'split' || mode === 'unified' ? mode : 'auto'
  if (normalized !== 'auto') return normalized
  return Number.isFinite(width) && width >= splitAt ? 'split' : 'unified'
}

/** Group is part of identity: the same path can be staged AND unstaged. */
export function diffFileIdentity(file, mode = 'commits') {
  const group = mode === 'working'
    ? (file.group || (file.staged ? 'staged' : file.status === '?' ? 'untracked' : 'unstaged'))
    : 'commits'
  return JSON.stringify([group, file.path])
}
