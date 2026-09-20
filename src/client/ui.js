import * as React from 'react'

const h = React.createElement

/** Resizable, keyboard-accessible panes; orientation follows available width. */
export function SplitPane({ first, second, axis = 'auto', initial = 38, label = 'Resize panes', breakpoint = 680 }) {
  const ref = React.useRef(null)
  const [wide, setWide] = React.useState(false)
  const [ratios, setRatios] = React.useState({ horizontal: initial, vertical: initial })
  React.useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= breakpoint))
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [breakpoint])
  const horizontal = axis === 'horizontal' || (axis === 'auto' && wide)
  const direction = horizontal ? 'horizontal' : 'vertical'
  const ratio = ratios[direction]
  const change = value => setRatios(current => ({ ...current, [direction]: Math.max(18, Math.min(75, value)) }))
  return h('div', { ref, className: `gg-split gg-split-${direction}`, style: { '--gg-ratio': `${ratio}%` } },
    h('div', { className: 'gg-split-first' }, first),
    h('div', {
      className: 'gg-divider', role: 'separator', tabIndex: 0,
      'aria-label': label, 'aria-orientation': horizontal ? 'vertical' : 'horizontal',
      'aria-valuemin': 18, 'aria-valuemax': 75, 'aria-valuenow': Math.round(ratio),
      title: `${label} · Drag or use arrow keys · Double-click to reset`,
      onDoubleClick: () => change(initial),
      onKeyDown: event => {
        const backward = horizontal ? 'ArrowLeft' : 'ArrowUp'
        const forward = horizontal ? 'ArrowRight' : 'ArrowDown'
        if (event.key === backward || event.key === forward) {
          event.preventDefault(); change(ratio + (event.key === backward ? -3 : 3))
        } else if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault(); change(event.key === 'Home' ? 18 : 75)
        }
      },
      onPointerDown: event => { if (event.button === 0) { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId) } },
      onPointerMove: event => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
        const rect = ref.current.getBoundingClientRect()
        change(100 * (horizontal ? (event.clientX - rect.left) / rect.width : (event.clientY - rect.top) / rect.height))
      },
      onPointerUp: event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) },
    }),
    h('div', { className: 'gg-split-second' }, second))
}

/** Keep the active row visible after a pane resize without moving other panes. */
export function useRevealSelection(ref, selected, selector, sticky = false) {
  React.useEffect(() => {
    const container = ref.current
    if (!container) return
    const reveal = () => {
      const node = container.querySelector(selector)
      if (!node || container.clientHeight === 0) return
      const area = container.getBoundingClientRect(), row = node.getBoundingClientRect()
      const inset = sticky ? node.closest('.gg-du-group')?.querySelector('.gg-du-group-title')?.getBoundingClientRect().height || 0 : 0
      const top = area.top + inset
      if (row.top < top) container.scrollTop -= top - row.top
      else if (row.bottom > area.bottom) container.scrollTop += row.bottom - area.bottom
    }
    const observer = new ResizeObserver(reveal)
    observer.observe(container)
    reveal()
    return () => observer.disconnect()
  }, [ref, selected, selector, sticky])
}


/** Compact themed dropdown used by the diff toolbar instead of a native select. */
export function CompactDropdown({ value, options, onChange, label, title, className = '' }) {
  const [open, setOpen] = React.useState(false)
  const root = React.useRef(null)
  const selected = options.find(option => option.value === value) ?? options[0]
  React.useEffect(() => {
    if (!open) return undefined
    const closeOutside = event => { if (!root.current?.contains(event.target)) setOpen(false) }
    const closeEscape = event => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeEscape)
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeEscape) }
  }, [open])
  const choose = next => { onChange(next); setOpen(false) }
  const move = delta => {
    const index = Math.max(0, options.findIndex(option => option.value === value))
    choose(options[(index + delta + options.length) % options.length].value)
  }
  return h('div', { ref: root, className: `gg-du-dropdown ${className}${open ? ' is-open' : ''}` },
    h('button', { type: 'button', className: 'gg-du-dropdown-trigger', 'aria-label': label, 'aria-haspopup': 'listbox', 'aria-expanded': open, title,
      onClick: () => setOpen(current => !current), onKeyDown: event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); move(event.key === 'ArrowDown' ? 1 : -1) }
        else if (event.key === 'Escape') setOpen(false)
      } }, h('span', null, selected?.label ?? value), h('span', { className: 'gg-du-dropdown-chevron', 'aria-hidden': 'true' }, '⌄')),
    open ? h('div', { className: 'gg-du-dropdown-menu', role: 'listbox', 'aria-label': label }, options.map(option => h('button', {
      key: option.value, type: 'button', role: 'option', className: `gg-du-dropdown-option${option.value === value ? ' is-selected' : ''}`, 'aria-selected': option.value === value,
      onClick: () => choose(option.value),
    }, h('span', { className: 'gg-du-dropdown-check', 'aria-hidden': 'true' }, option.value === value ? '✓' : ''), h('span', null, option.label)))) : null)
}


/**
 * The small icon set this plugin draws, as inline SVG.
 *
 * Icons are drawn here rather than pulled from an icon font because the
 * sidebar's own controls are inline SVG at a fixed 16px box; matching that
 * keeps these buttons looking like the ones beside them.
 *
 * The default size is the 15px toolbar box these buttons share; the guide
 * capsule asks for its own pixel size and is passed one.
 *
 * @param props - which glyph to draw, at what size and with which class.
 * @returns the SVG element.
 */
export function GitIcon({ name, size = 15, className }) {
  const common = {
    width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
    stroke: 'currentColor', 'stroke-width': 1.4,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    ...(className === undefined ? {} : { className }),
  }
  const paths = {
    refresh: ['M13.5 8a5.5 5.5 0 1 1-1.6-3.9', 'M13.6 1.9v3.2h-3.2'],
    download: ['M8 2.4v6.9', 'M4.9 6.4 8 9.5l3.1-3.1', 'M2.9 12.7h10.2'],
    // Fetch again and take away what the remote no longer has: the same
    // download mark, with the removal drawn at its shoulder.
    prune: ['M6.6 3v6.4', 'M3.8 6.6 6.6 9.4l2.8-2.8', 'M1.9 12.7h9.4', 'M11.4 1.2l2.3 2.3', 'M13.7 1.2l-2.3 2.3'],
    changes: ['M2 8h2.5l1.6-3.4L8 11.6l1.6-3.6H14'],
    branch: ['M4 5v6', 'M4 9c0-4 8-1 8-5', 'M4 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3', 'M4 11a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3', 'M12 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3'],
    copy: ['M6 6V3.5h7.5V11H11', 'M2.5 6H10v6.5H2.5z'],
    wrap: ['M2 4h12', 'M2 8h8.5a2 2 0 1 1 0 4H8', 'M2 12h3', 'M9.5 11l1.5 1-1.5 1'],
    expand: ['M8 3v10', 'M3 8h10'],
    collapse: ['M3 8h10'],
  }
  return h('svg', common, (paths[name] ?? []).map((d, i) => h('path', { key: i, d })))
}

/**
 * The guide capsule's glyph: the tab chip's branch mark, at the guide's size.
 *
 * The guide renders an entry's icon at its own pixel size and, without one,
 * falls back to its neutral cube placeholder. The plugin wants the capsule to
 * carry what the Git tab carries, so this wrapper forwards the size and names
 * its own class for the orange ink.
 *
 * @param props - the size the guide's entry renderer asked for.
 * @returns the SVG element.
 */
export function GuideGlyph({ size }) {
  return h(GitIcon, { name: 'branch', size: size ?? 16, className: 'gg-guide-icon' })
}

/**
 * The right-click menu for a commit or a ref.
 *
 * The menu carries two kinds of entry, and the split is deliberate. The
 * writing entries arrive from the caller as action requests — they name an
 * action and are confirmed in a dialog that shows the argument list the host
 * would run — while the reading entries below them are built here: copying a
 * hash or a ref name, opening a commit, comparing two. Nothing in this file
 * runs git or decides what an action's command will be.
 *
 * @param props - the menu's position, its subject, and the actions it offers.
 * @returns the menu element, or null before a subject is chosen.
 */
export function ContextMenu({ menu, actions = [], onAction, markers, onClose, onOpenCommit, onCompare, onCompareSelected, onFlash }) {
  const ref = React.useRef(null)
  // The menu's own caller hands it a fresh `onClose` on every render. Keeping
  // the listener's dependencies on that identity would tear the listener down
  // and re-arm its timer on every render — and a menu that renders again before
  // the timer fires would end up with no listener at all, which is a menu that
  // cannot be closed. The ref carries the newest closer to a listener that is
  // installed exactly once.
  const close = React.useRef(onClose)
  close.current = onClose

  // A menu that outlives the press that dismissed it would sit over the
  // graph, so any press outside it closes it.
  //
  // The listener is attached on the next task rather than immediately: the
  // event that opened this menu is still being dispatched while the effect
  // runs, and a listener registered now would receive that same press and
  // close the menu in the same breath. Deferring also lets a right-click on
  // another row close this menu and open the next one, which is what a
  // reader expects from a context menu.
  React.useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') close.current() }
    const onPress = (event) => {
      if (ref.current !== null && ref.current.contains(event.target)) return
      close.current()
    }
    // Escape is listened for from the start: no key press opened this menu, so
    // there is no event in flight that could close it again.
    document.addEventListener('keydown', onKey)
    // A press is different. The press that opened the menu is still travelling
    // to the document while this effect runs, so a listener registered now
    // would receive that same press and close the menu in the same breath.
    // Waiting one task lets a right-click on another row close this menu and
    // open the next one, which is what a reader expects. A `contextmenu`
    // listener would have the same problem as the immediate one.
    const timer = setTimeout(() => document.addEventListener('mousedown', onPress), 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPress)
    }
  }, [])

  const commit = menu.commit
  const target = menu.ref
  const writing = onAction === undefined ? [] : actions

  const reading = []
  if (commit !== undefined) {
    reading.push(
      { label: 'Copy commit hash', run: () => { copyText(commit.hash); onFlash('Hash copied') } },
      { label: 'Copy short hash', run: () => { copyText(commit.hash.slice(0, 8)); onFlash('Short hash copied') } },
      { label: 'Copy subject', run: () => { copyText(commit.subject); onFlash('Subject copied') } },
      { label: 'Open commit details', run: () => onOpenCommit(commit) },
    )
    if (onCompare && markers.includes(commit.hash)) {
      reading.push({
        label: 'Use as comparison base',
        run: () => { onCompare(commit); onFlash('Added to the comparison') },
      })
      if (markers.length === 2) {
        reading.push({
          label: 'Compare the two marked commits',
          run: () => { onCompareSelected(); onFlash('Comparing') },
        })
      }
    } else if (onCompare) {
      reading.push({
        label: 'Mark for comparison',
        run: () => { onCompare(commit); onFlash('Marked — pick a second commit') },
      })
    }
  }
  if (target !== undefined) {
    // A ref is worth copying under the name a command would take: the short
    // name for a reader, the full path for a script. A stash has no name of its
    // own, so it is copied by the selector that identifies it.
    const noun = target.kind === 'tag' ? 'tag' : target.kind === 'stash' ? 'stash selector' : 'branch'
    reading.push(
      { label: `Copy ${noun}`, run: () => { copyText(target.label); onFlash('Name copied') } },
    )
    if (target.kind !== 'stash') {
      reading.push({ label: 'Copy full ref name', run: () => { copyText(target.path); onFlash('Ref copied') } })
    }
    if (typeof target.target === 'string' && onOpenCommit !== undefined) {
      reading.push({ label: 'Show the commit it points at', run: () => onOpenCommit({ hash: target.target }) })
    }
  }

  // The menu is placed at the pointer but kept inside the viewport, so a
  // right-click near an edge still shows every item.
  const width = 250
  const height = Math.min((writing.length + reading.length) * 26 + 40, window.innerHeight - 16)
  const left = Math.min(menu.x, Math.max(8, window.innerWidth - width - 8))
  const top = Math.min(menu.y, Math.max(8, window.innerHeight - height - 8))

  // The last line names the subject: a commit by its hash, a ref by its full
  // path, anything else by whatever the caller put in `note`.
  const note = commit !== undefined
    ? commit.hash.slice(0, 10)
    : target !== undefined ? String(target.path ?? '') : String(menu.note ?? '')

  const entry = (item, key) => h('button', {
    key,
    type: 'button',
    className: `gg-menu-item${item.danger === true ? ' is-danger' : ''}`,
    role: 'menuitem',
    onClick: () => { item.run(); onClose() },
  }, item.label)

  return h('div', {
    ref,
    className: 'gg-menu',
    style: { left: `${left}px`, top: `${top}px` },
    role: 'menu',
  }, [
    ...(writing.length === 0 ? [] : [
      h('div', { key: 'write-heading', className: 'gg-menu-heading' }, 'Actions'),
      ...writing.map((item, i) => entry({ ...item, run: () => onAction(item) }, `w${i}`)),
      h('div', { key: 'write-sep', className: 'gg-menu-sep', role: 'separator' }),
    ]),
    ...reading.map((item, i) => entry(item, `r${i}`)),
    ...(note === '' ? [] : [h('div', { key: 'note', className: 'gg-menu-note' }, note)]),
  ])
}

/**
 * Copy text to the clipboard.
 *
 * The asynchronous clipboard API is unavailable on a non-secure origin, and
 * a DSH reached over plain HTTP on a LAN address is exactly that, so the
 * older selection-based path is kept as the fallback rather than leaving the
 * action silently doing nothing.
 *
 * @param text - the text to copy.
 */
export function copyText(text) {
  try {
    if (navigator.clipboard !== undefined && window.isSecureContext === true) {
      void navigator.clipboard.writeText(text)
      return
    }
    const field = document.createElement('textarea')
    field.value = text
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.opacity = '0'
    document.body.appendChild(field)
    field.select()
    document.execCommand('copy')
    field.remove()
  } catch {
    // A refused clipboard leaves the reader exactly where they were; the
    // hash remains visible and selectable in the view.
  }
}

/**
 * Format a comparison's two sides.
 *
 * An empty later side means the working tree, which is the comparison a reader
 * makes against an agent's uncommitted work — saying so beats an arrow pointing
 * at nothing.
 *
 * @param base - the earlier revision.
 * @param head - the later revision, or an empty value for the working tree.
 * @returns the range, short enough for a summary line.
 */
export function formatRange(base, head) {
  const short = value => String(value ?? '').slice(0, 8)
  return head === '' || head === null || head === undefined
    ? `${short(base)} → working tree`
    : `${short(base)} → ${short(head)}`
}

/**
 * Format an ISO date for a reader.
 *
 * @param iso - the ISO-8601 string git produced.
 * @returns a local, complete date and time.
 */
export function formatDate(iso) {
  const when = new Date(iso)
  if (Number.isNaN(when.getTime())) return iso
  return when.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

/**
 * Format a time of day.
 *
 * A working-tree read that failed leaves no snapshot time behind, so an
 * absent or unreadable moment returns `null` instead of throwing: the view
 * reports the failure rather than dying inside a formatter.
 *
 * @param date - the moment, or nothing when there is no reading.
 * @returns the local time, or `null` when there is none to show.
 */
export function formatTime(date) {
  if (date === null || date === undefined) return null
  const when = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(when.getTime())) return null
  return when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

