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
 * The right-click menu for a commit.
 *
 * Everything here is a read: copy a hash, open a commit, compare two. The
 * write actions a full Git client offers — checkout, merge, rebase, reset —
 * are deliberately absent, because this plugin never modifies a repository.
 *
 * @param props - the menu's position and commit, and the actions it offers.
 * @returns the menu element, or null before a commit is chosen.
 */
export function ContextMenu({ menu, markers, onClose, onOpenCommit, onCompare, onCompareSelected, onFlash }) {
  const ref = React.useRef(null)

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
    const dismiss = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return
      if (event.type !== 'keydown' && ref.current !== null && ref.current.contains(event.target)) return
      onClose()
    }
    // Only presses and Escape close it. A `contextmenu` listener would
    // close the menu on the very press that opened it, because the press is
    // still travelling to the document when this effect runs — and it would
    // also close the menu the moment a row's own handler opened the next
    // one, since both handlers see the same event.
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', dismiss)
      document.addEventListener('keydown', dismiss)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', dismiss)
      document.removeEventListener('keydown', dismiss)
    }
  }, [onClose])

  const commit = menu.commit
  const items = [
    {
      label: 'Copy commit hash',
      run: () => { copyText(commit.hash); onFlash('Hash copied') },
    },
    {
      label: 'Copy short hash',
      run: () => { copyText(commit.hash.slice(0, 8)); onFlash('Short hash copied') },
    },
    {
      label: 'Copy subject',
      run: () => { copyText(commit.subject); onFlash('Subject copied') },
    },
    {
      label: 'Open commit details',
      run: () => onOpenCommit(commit),
    },
  ]
  if (onCompare && markers.includes(commit.hash)) {
    items.push({
      label: 'Use as comparison base',
      run: () => { onCompare(commit); onFlash('Added to the comparison') },
    })
    if (markers.length === 2) {
      items.push({
        label: 'Compare the two marked commits',
        run: () => { onCompareSelected(); onFlash('Comparing') },
      })
    }
  } else if (onCompare) {
    items.push({
      label: 'Mark for comparison',
      run: () => { onCompare(commit); onFlash('Marked — pick a second commit') },
    })
  }

  // The menu is placed at the pointer but kept inside the viewport, so a
  // right-click near an edge still shows every item.
  const width = 230
  const height = items.length * 26 + 14
  const left = Math.min(menu.x, window.innerWidth - width - 8)
  const top = Math.min(menu.y, window.innerHeight - height - 8)

  return h('div', {
    ref,
    className: 'gg-menu',
    style: { left: `${left}px`, top: `${top}px` },
    role: 'menu',
  }, [
    ...items.map((item, i) => h('button', {
      key: i,
      type: 'button',
      className: 'gg-menu-item',
      role: 'menuitem',
      onClick: () => { item.run(); onClose() },
    }, item.label)),
    h('div', { key: 'note', className: 'gg-menu-note' }, commit.hash.slice(0, 10)),
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

