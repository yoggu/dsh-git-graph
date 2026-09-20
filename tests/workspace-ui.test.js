import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import assert from 'node:assert/strict'
import * as GitSyntax from '../src/client/syntax.js'
import { commitActions, describeBadge, fileActions, initialValues, missingFields, paramsFor, refActions } from '../src/client/actions.js'
import { matchesFilter } from '../src/client/graph-ui.js'
import { diffFileIdentity, parseUnifiedPatch, planSplitRows, resolveDiffLayout } from '../src/client/diff-layout.js'

// Execute the modular source with a minimal hook runner. Pure helpers are
// imported normally; component source is evaluated only to substitute React.
const componentPaths = ['ui.js', 'graph-ui.js', 'diff-view.js', 'files.js', 'accordions.js', 'live.js', 'actions.js', 'dialog.js', 'graph-view.js', 'views.js']
const sourcePaths = [...componentPaths, 'tabs.js']
const moduleSource = path => readFileSync(new URL(`../src/client/${path}`, import.meta.url), 'utf8')
const cleanModule = text => text
  .replace(/^import .*$/gm, '')
  .replace(/^const h = React\.createElement$/gm, '')
  .replace(/^export /gm, '')
const source = sourcePaths.map(path => moduleSource(path)).join('\n') + '\n' + moduleSource('styles.js')
const cleanSource = cleanModule(sourcePaths.map(path => moduleSource(path)).join('\n'))
const runtimeSource = cleanModule(componentPaths.map(path => moduleSource(path)).join('\n'))
  .replace('const openAccordionBySession = new Map()\nconst accordionLayoutBySession = new Map()', '')
  // Both session-scoped memories belong to the test, so one scenario cannot
  // leak a marking or an open accordion into the next.
  .replace('const markersBySession = new Map()', '')
const section = (start, end) => cleanSource.slice(cleanSource.indexOf(`function ${start}(`), cleanSource.indexOf(`function ${end}(`))
const h = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter(x => x != null) })
const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...[...tree.children, tree.props.first, tree.props.second].flatMap(nodes)]
const find = (tree, predicate) => nodes(tree).find(predicate)
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }

/**
 * The push channel the graph listens on, recorded instead of dialled.
 *
 * The real `EventSource` is the browser's; what matters here is that a stream
 * exists only while the tab is visible, and that the events the host sends are
 * what drive a refresh.
 */
class FakeEventSource {
  static instances = []
  static reset() { FakeEventSource.instances = [] }
  constructor(url) { this.url = url; this.listeners = new Map(); this.closed = false; FakeEventSource.instances.push(this) }
  addEventListener(name, listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, [])
    this.listeners.get(name).push(listener)
  }
  emit(name, data = {}) { for (const listener of this.listeners.get(name) ?? []) listener({ data: JSON.stringify(data) }) }
  fail() { this.onerror?.() }
  close() { this.closed = true }
}
// The real formatter rather than a stub, so a missing snapshot time is exercised.
const formatTime = runInNewContext(`${section('formatTime', 'sessionOf')}\nformatTime`, {})
const openAccordionBySession = new Map()
const markersBySession = new Map()
test.beforeEach(() => { openAccordionBySession.clear(); markersBySession.clear(); FakeEventSource.reset() })

function mount(name, initialProps, call = () => Promise.resolve({})) {
  const slots = [], effects = []
  let index = 0, dirty = false, props = initialProps, tree
  const changed = (old, deps) => !old || !deps || deps.some((x, i) => !Object.is(x, old[i]))
  const React = {
    Fragment: 'fragment',
    useState(initial) {
      const i = index++
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial
      return [slots[i], value => { const next = typeof value === 'function' ? value(slots[i]) : value; if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true } }]
    },
    useRef(initial) { const i = index++; return slots[i] ||= { current: initial } },
    useMemo(fn, deps) { const i = index++; if (changed(slots[i]?.deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value },
    useCallback(fn, deps) { return this.useMemo(() => fn, deps) },
    useEffect(fn, deps) { const i = index++; if (changed(slots[i]?.deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() } }) },
  }
  const context = {
    React, h, call, GitSyntax, AbortController, setTimeout, clearTimeout,
    parseUnifiedPatch, planSplitRows, resolveDiffLayout, diffFileIdentity,
    layout: commits => ({ rows: commits.map((commit, row) => ({ commit, row, column: 0, slot: 0 })), edges: [], columnCount: 1 }),
    graphEdgePath: () => '',
    ROW_H: 26, LANE_X0: 12, LANE_W: 12, DOT_R: 4, LANE_COLORS: ['blue'],
    EMPTY_TREE: 'empty', DIFF_KIND: 'git-diff', COMPARE_KIND: 'git-compare', ACCORDION_H: 300,
    EVENTS_ROUTE: '/api/dsh-git-graph/events',
    ACCORDION_MIN_H: 180, ACCORDION_MAX_H: 720, ACCORDION_SPLIT: 50,
    openAccordionBySession, accordionLayoutBySession: new Map(), markersBySession,
    window: { innerWidth: 1200, innerHeight: 800, addEventListener() {}, removeEventListener() {} }, navigator: {},
    document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    EventSource: FakeEventSource,
    ResizeObserver: class { observe() {} disconnect() {} },
  }
  const component = runInNewContext(`${runtimeSource}\n${name}`, context)
  const render = () => {
    let budget = 30
    do { assert.ok(budget--, 'render must converge'); dirty = false; index = 0; tree = component(props); effects.splice(0).forEach(fn => fn()) } while (dirty)
    return tree
  }
  render()
  return {
    get tree() { return tree },
    render,
    update(next) { props = { ...props, ...next }; return render() },
    async settle() { await new Promise(resolve => setImmediate(resolve)); return render() },
    unmount() { slots.forEach(slot => slot?.cleanup?.()) },
  }
}
const fileButton = (tree, path) => find(tree, n => n.type === 'button' && n.props.title === path)
/** The wording of a subtree: `nodes` walks elements, so text is read off them. */
const textOf = tree => nodes(tree).map(node => (node.children ?? []).filter(child => typeof child === 'string').join(' ')).join(' ')
const panel = tree => find(tree, n => n.type?.name === 'DiffPanel')
const accordion = tree => find(tree, n => n.type?.name === 'CommitAccordion')
const commit = hash => ({ hash, parents: [], subject: hash, refs: [] })
const page = hashes => ({ commits: hashes.map(commit), nextSkip: hashes.length, exhausted: false, refs: {} })
const tabInfo = (visible = false) => ({ tab: { signal: new AbortController().signal, visible } })

test('commit detail loading occupies the accordion shell', () => {
  const pending = deferred()
  const ui = mount('CommitAccordion', { hash: 'abc', sessionId: 'a', signal: tabInfo().tab.signal }, () => pending.promise)
  const loading = find(ui.tree, node => node.type?.name === 'AccordionSurface')
  assert.ok(loading)
  assert.equal(loading.props.state, true)
  assert.equal(loading.props.label, 'Loading commit details')
  assert.ok(nodes(loading.props.first).some(node => node.props.className === 'gg-spinner'))
  ui.unmount()
})

test('raw diff metadata is collapsed outside the code preview', async () => {
  const ui = mount('DiffPanel', { sessionId: 'a', params: { mode: 'working', path: 'a.ts' } }, () => Promise.resolve({ patch: 'diff --git a/a.ts b/a.ts\nindex abc..def 100644\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new\n' }))
  await ui.settle()
  const details = find(ui.tree, node => node.type === 'details' && node.props.className === 'gg-du-metadata')
  assert.ok(details)
  assert.notEqual(details.props.open, true)
  const raw = nodes(details).flatMap(node => node.children.filter(child => typeof child === 'string')).join('\n')
  assert.match(raw, /diff --git/)
  const preview = find(ui.tree, node => node.props['aria-label'] === 'Unified diff')
  const text = nodes(preview).flatMap(node => node.children.filter(child => typeof child === 'string')).join('\n')
  assert.doesNotMatch(text, /diff --git|index abc|--- a\//)
  assert.match(text, /@@ -1 \+1 @@/)
  assert.match(text, /new/)
  ui.unmount()
})

test('diff toolbar defaults to wrapping and exposes compact layout and context controls', async () => {
  const ui = mount('DiffPanel', { sessionId: 'a', params: { mode: 'working', path: 'a.ts' } }, () => Promise.resolve({ patch: '@@ -1 +1 @@\n-old\n+new\n' }))
  await ui.settle()
  const wrap = find(ui.tree, node => node.type === 'button' && node.props['aria-label'] === 'Toggle word wrap')
  assert.equal(wrap.props['aria-pressed'], true)
  const select = find(ui.tree, node => node.type?.name === 'CompactDropdown' && node.props.label === 'Diff layout')
  assert.ok(select)
  assert.deepEqual(JSON.parse(JSON.stringify(select.props.options.map(option => [option.value, option.label]))), [['auto', 'Auto view'], ['split', 'Side by side'], ['unified', 'Inline']])
  const context = find(ui.tree, node => node.type?.name === 'CompactDropdown' && node.props.label === 'Context lines')
  assert.equal(context.props.value, 3)
  assert.equal(context.props.options[1].label, 'Context: 3')
  select.props.onChange('split'); ui.render()
  assert.equal(find(ui.tree, node => node.type?.name === 'CompactDropdown' && node.props.label === 'Diff layout').props.value, 'split')
  assert.ok(find(ui.tree, node => node.props['aria-label'] === 'Split diff'))
  ui.unmount()
})

test('Git tab title includes an icon and readable label', () => {
  function GitIcon() {}
  const title = runInNewContext(`${section('GraphTitle', 'CommitTitle')}\nGraphTitle`, { h, GitIcon })()
  assert.ok(nodes(title).some(node => node.type === GitIcon && node.props.name === 'branch'))
  assert.ok(nodes(title).some(node => node.children.includes('Git')))
})

test('the Git graph guide capsule carries the tab’s branch glyph', () => {
  const GitIcon = function GitIcon() {}
  const glyph = runInNewContext(`${section('GuideGlyph', 'ContextMenu')}\nGuideGlyph`, { h, GitIcon })
  const constants = [
    "const ID = 'git-graph', KIND = 'git-graph'",
    "const COMMIT_ID = 'commit', COMMIT_KIND = 'commit'",
    "const DIFF_ID = 'diff', DIFF_KIND = 'diff'",
    "const COMPARE_ID = 'compare', COMPARE_KIND = 'compare'",
  ].join('\n')
  const tabSource = cleanModule(moduleSource('tabs.js'))
  const slice = tabSource.slice(tabSource.indexOf('const definitions = ['))
  const definitions = runInNewContext(`${constants}\n${slice}\ndefinitions`, { GuideGlyph: glyph })
  const [entry] = definitions[0].guide
  assert.equal(entry.title(), 'Git graph')
  assert.equal(entry.icon, glyph)
  const icon = entry.icon({ size: 26 })
  assert.equal(icon.type, GitIcon)
  assert.equal(icon.props.name, 'branch')
  assert.equal(icon.props.size, 26)
  assert.equal(icon.props.className, 'gg-guide-icon')
  assert.match(source, /\.gg-guide-icon\s*\{[^}]*color: #ed7957;/)
})

test('a failed working-tree read reports itself instead of looking like a clean tree', async () => {
  const ui = mount('GraphView', { sessionId: 'a', tabInfo: tabInfo() }, request => request.op === 'working'
    ? Promise.reject(new Error('This session is not running'))
    : Promise.resolve(page(['a'])))
  await ui.settle()
  const alert = find(ui.tree, node => node.props.className === 'gg-error')
  assert.match(alert.children.join(''), /Working tree/)
  assert.match(alert.children.join(''), /not running/)
  ui.unmount()
})

test('a clean working tree is not an error', async () => {
  const ui = mount('GraphView', { sessionId: 'a', tabInfo: tabInfo() }, request => request.op === 'working'
    ? quietWorking()
    : Promise.resolve(page(['a'])))
  await ui.settle()
  assert.equal(find(ui.tree, node => node.props.className === 'gg-error'), undefined)
  ui.unmount()
})

test('formatTime refuses a moment that does not exist', () => {
  assert.equal(formatTime(null), null)
  assert.equal(formatTime(undefined), null)
  assert.equal(formatTime(new Date('nonsense')), null)
  assert.equal(typeof formatTime(new Date('2026-01-02T03:04:05')), 'string')
})

test('file statuses use file icons, accessible labels, and row color accents', () => {
  const ui = mount('FileWorkspace', { sessionId: 'a', files: ['M', 'A', 'D', 'R100'].map(status => ({ path: status, status })) })
  const rows = nodes(ui.tree).filter(n => n.type === 'button' && n.props.className?.startsWith('gg-du-file'))
  assert.deepEqual(rows.map(n => n.props['data-status']), ['M', 'A', 'D', 'R'])
  assert.equal(nodes(ui.tree).filter(n => n.type?.name === 'FileIcon').length, 4)
  const labels = nodes(ui.tree).filter(n => n.props.className === 'gg-sr-only').flatMap(n => n.children)
  assert.deepEqual(labels, ['Modified: ', 'Added: ', 'Deleted: ', 'Renamed: '])
  for (const status of ['M', 'A', 'D']) assert.ok(source.includes(`.gg-du-file[data-status='${status}']`))
})

test('SVG sits above interaction backgrounds without intercepting clicks', () => {
  assert.match(source, /\.gg-graph-inner\s*\{\s*isolation: isolate;/)
  assert.match(source, /\.gg-canvas\s*\{\s*z-index: 2;/)
  assert.match(source, /\.gg-rows\s*\{\s*z-index: 1;/)
  assert.match(source, /\.gg-canvas\s*\{[^}]*pointer-events: none/s)
})

test('history loading uses a progress status and exhausted history has no fake button', async () => {
  const pending = deferred()
  const ui = mount('GraphView', { sessionId: 'a', tabInfo: tabInfo() }, request => request.op === 'working'
    ? Promise.resolve({ staged: [], unstaged: [], untracked: [] })
    : pending.promise)
  assert.ok(find(ui.tree, node => node.props.className === 'gg-history-status' && node.props.role === 'status'))
  assert.ok(find(ui.tree, node => node.props.className === 'gg-spinner'))
  pending.resolve({ commits: [commit('one')], nextSkip: 1, exhausted: true, refs: { head: 'main', remotes: [] } })
  await ui.settle()
  assert.equal(find(ui.tree, node => node.props.className === 'gg-more-btn'), undefined)
  ui.unmount()
})

test('history renders a full-width table with row-local accordions', async () => {
  const ui = mount('GraphView',
    { sessionId: 'a', tabInfo: tabInfo() },
    request => Promise.resolve(request.op === 'working'
      ? { staged: [], unstaged: [], untracked: [] }
      : { commits: [], nextSkip: 0, exhausted: true, refs: { head: 'main', remotes: [] } }))
  await ui.settle()
  assert.equal(find(ui.tree, node => node.type?.name === 'SplitPane'), undefined)
  const heading = find(ui.tree, node => node.props.className === 'gg-section-heading gg-column-heading')
  assert.deepEqual(nodes(heading).flatMap(node => node.children.filter(child => typeof child === 'string')), ['Graph', 'Description', 'Date', 'Author', 'Commit'])
  ui.unmount()
})

test('working-file selection survives refreshed object identities and ordering', () => {
  const ui = mount('FileWorkspace', { sessionId: 'a', mode: 'working', files: [{ path: 'a', group: 'staged' }, { path: 'b', group: 'unstaged' }] })
  fileButton(ui.tree, 'b').props.onClick(); ui.render()
  ui.update({ revision: 1, files: [{ path: 'b', group: 'unstaged', status: 'M' }, { path: 'a', group: 'staged' }] })
  assert.equal(panel(ui.tree).props.params.path, 'b')
  assert.equal(panel(ui.tree).props.params.staged, false)
})

test('same path staged and unstaged remain separate selections; deleted selection falls back', () => {
  const ui = mount('FileWorkspace', { sessionId: 'a', mode: 'working', files: [{ path: 'a', group: 'staged' }, { path: 'a', group: 'unstaged' }] })
  nodes(ui.tree).filter(n => n.type === 'button' && n.props.title === 'a')[1].props.onClick(); ui.render()
  assert.equal(panel(ui.tree).props.params.staged, false)
  ui.update({ files: [{ path: 'a', group: 'staged' }] })
  assert.equal(panel(ui.tree).props.params.staged, true)
})

test('file selection is scoped to session and commit', () => {
  const files = [{ path: 'a' }, { path: 'b' }]
  const ui = mount('FileWorkspace', { sessionId: 'one', head: 'first', files })
  fileButton(ui.tree, 'b').props.onClick(); ui.render()
  ui.update({ sessionId: 'two' })
  assert.equal(panel(ui.tree).props.params.path, 'a')
  fileButton(ui.tree, 'b').props.onClick(); ui.render()
  ui.update({ head: 'second' })
  assert.equal(panel(ui.tree).props.params.path, 'a')
})

test('history refresh keeps the open accordion while replacing commit objects', async () => {
  const pending = []
  const ui = mount('GraphView', { sessionId: 'one', tabInfo: tabInfo() }, request => {
    const other = aside(request)
    if (other !== null) return other
    const p = deferred(); pending.push(p); return p.promise
  })
  pending[0].resolve(page(['a', 'b'])); await ui.settle()
  const row = find(ui.tree, n => n.type?.name === 'CommitRow' && n.props.row.commit.hash === 'b')
  assert.ok(row, nodes(ui.tree).map(n => `${n.type?.name || n.type}: ${n.children.filter(x => typeof x === 'string').join(' ')}`).join('\n'))
  row.props.onSelect(commit('b')); ui.render()
  find(ui.tree, n => n.props['aria-label'] === 'Refresh history and working changes').props.onClick(); ui.render()
  assert.equal(accordion(ui.tree).props.hash, 'b')
  pending[1].resolve(page(['new', 'a', 'b'])); await ui.settle()
  assert.equal(accordion(ui.tree).props.hash, 'b')
  ui.unmount()
})

test('open accordion survives graph remount per session without browser storage', async () => {
  const respond = request => Promise.resolve(request.op === 'working'
    ? { staged: [], unstaged: [], untracked: [] }
    : page(['a', 'b']))
  const first = mount('GraphView', { sessionId: 'one', tabInfo: tabInfo() }, respond)
  await first.settle()
  find(first.tree, n => n.type?.name === 'CommitRow' && n.props.row.commit.hash === 'b').props.onSelect(commit('b'))
  first.render(); first.unmount()

  const restored = mount('GraphView', { sessionId: 'one', tabInfo: tabInfo() }, respond)
  await restored.settle()
  assert.equal(accordion(restored.tree).props.hash, 'b')
  find(restored.tree, n => n.type?.name === 'CommitRow' && n.props.row.commit.hash === 'b').props.onSelect(commit('b'))
  restored.render(); restored.unmount()

  const collapsed = mount('GraphView', { sessionId: 'one', tabInfo: tabInfo() }, respond)
  await collapsed.settle()
  assert.equal(accordion(collapsed.tree), undefined)
  collapsed.unmount()

  const isolated = mount('GraphView', { sessionId: 'two', tabInfo: tabInfo() }, respond)
  await isolated.settle()
  assert.equal(accordion(isolated.tree), undefined)
  isolated.unmount()
})

test('older-page accordion restores after remount by reloading the saved depth', async () => {
  const hashes = Array.from({ length: 135 }, (_, index) => `commit-${index}`)
  const calls = []
  const respond = request => {
    const other = aside(request)
    if (other !== null) return other
    calls.push(request)
    const commits = hashes.slice(request.skip, request.skip + request.limit).map(commit)
    return Promise.resolve({ commits, nextSkip: request.skip + commits.length, exhausted: request.skip + commits.length >= hashes.length, refs: {} })
  }
  const first = mount('GraphView', { sessionId: 'deep', tabInfo: tabInfo() }, respond)
  await first.settle()
  find(first.tree, n => n.type === 'button' && n.children.includes('Load older commits')).props.onClick()
  await first.settle()
  find(first.tree, n => n.type?.name === 'CommitRow' && n.props.row.commit.hash === 'commit-130').props.onSelect(commit('commit-130'))
  first.render(); first.unmount()

  const restored = mount('GraphView', { sessionId: 'deep', tabInfo: tabInfo() }, respond)
  await restored.settle()
  assert.equal(accordion(restored.tree).props.hash, 'commit-130')
  assert.ok(calls.at(-1).limit >= 135)
  restored.unmount()
})

test('late diff response cannot overwrite a newer file selection', async () => {
  const pending = []
  const ui = mount('DiffPanel', { sessionId: 'one', params: { mode: 'working', path: 'old' } }, (request, signal) => { const p = deferred(); pending.push({ ...p, signal }); return p.promise })
  ui.update({ params: { mode: 'working', path: 'new' } })
  assert.equal(pending[0].signal.aborted, true)
  pending[1].resolve({ patch: '@@ -0,0 +1 @@\n+NEW\n' }); await ui.settle()
  pending[0].resolve({ patch: '@@ -0,0 +1 @@\n+STALE\n' }); await ui.settle()
  const text = nodes(ui.tree).flatMap(n => n.children.filter(x => typeof x === 'string')).join('\n')
  assert.match(text, /NEW/)
  assert.doesNotMatch(text, /STALE/)
  ui.unmount()
})

test('late history response cannot overwrite newer refresh', async () => {
  const pending = []
  const ui = mount('GraphView', { sessionId: 'one', tabInfo: tabInfo() }, request => {
    const other = aside(request)
    if (other !== null) return other
    const p = deferred(); pending.push(p); return p.promise
  })
  pending[0].resolve(page(['a'])); await ui.settle()
  // Two invocations from the same render also model a queued rapid input.
  const refresh = find(ui.tree, n => n.props['aria-label'] === 'Refresh history and working changes').props.onClick
  refresh(); refresh(); ui.render()
  pending[2].resolve(page(['new', 'a'])); await ui.settle()
  pending[1].resolve(page(['stale'])); await ui.settle()
  const hashes = nodes(ui.tree).filter(n => n.type?.name === 'CommitRow').map(n => n.props.row.commit.hash)
  assert.deepEqual(hashes, ['new', 'a'])
  ui.unmount()
})

test('all tab bodies reset their child on session or workspace changes', () => {
  const context = { h, sessionOf: props => props, GraphView() {}, CommitView() {}, DiffView() {} }
  for (const [name, next] of [['GraphBody', 'CommitBody'], ['CommitBody', 'DiffBody'], ['DiffBody', 'GraphTitle']]) {
    const component = runInNewContext(`${section(name, next)}\n${name}`, context)
    const render = (sessionId, cwd) => component({ sessionId, cwd, useTabInfo: tabInfo }).children[0]
    const first = render('one', '/a').props.key
    assert.ok(first, `${name} must key its child`)
    assert.notEqual(first, render('two', '/a').props.key)
    assert.notEqual(first, render('one', '/b').props.key)
  }
})

test('comparison appears in the context menu only where the graph wired it', () => {
  // A caller that offers no comparison gets the four reading entries and
  // nothing that pretends to compare — the menu is built from what it is
  // given, not from what it could do.
  const plain = mount('ContextMenu', { menu: { x: 100, y: 100, commit: commit('abc') }, markers: [], onClose() {}, onOpenCommit() {}, onFlash() {} })
  const plainLabels = nodes(plain.tree).filter(n => n.props.role === 'menuitem').map(n => n.children.join(''))
  assert.equal(plainLabels.length, 4)
  assert.ok(plainLabels.includes('Open commit details'))
  assert.ok(plainLabels.every(label => !/compar/i.test(label)))
  plain.unmount()

  // The graph does wire it, so one commit can be marked…
  const marked = []
  const single = mount('ContextMenu', {
    menu: { x: 1, y: 1, commit: commit('abc') },
    markers: [], onCompare: picked => marked.push(picked.hash), onClose() {}, onOpenCommit() {}, onFlash() {},
  })
  const entries = nodes(single.tree).filter(n => n.props.role === 'menuitem')
  const mark = entries.find(n => n.children.join('') === 'Mark for comparison')
  assert.ok(mark, 'a commit must be markable')
  mark.props.onClick()
  assert.deepEqual(marked, ['abc'])
  single.unmount()

  // …a marked commit is offered as the base rather than marked twice…
  const base = mount('ContextMenu', {
    menu: { x: 1, y: 1, commit: commit('abc') },
    markers: ['abc'], onCompare() {}, onClose() {}, onOpenCommit() {}, onFlash() {},
  })
  const baseLabels = nodes(base.tree).filter(n => n.props.role === 'menuitem').map(n => n.children.join(''))
  assert.ok(baseLabels.includes('Use as comparison base'))
  assert.ok(!baseLabels.includes('Compare the two marked commits'), 'one mark is not a comparison yet')
  base.unmount()

  // …and two marks are, which is the entry that opens the comparison.
  let compared = 0
  const pair = mount('ContextMenu', {
    menu: { x: 1, y: 1, commit: commit('def') },
    markers: ['abc', 'def'], onCompare() {}, onCompareSelected: () => { compared++ }, onClose() {}, onOpenCommit() {}, onFlash() {},
  })
  const pairEntries = nodes(pair.tree).filter(n => n.props.role === 'menuitem')
  const open = pairEntries.find(n => n.children.join('') === 'Compare the two marked commits')
  assert.ok(open, 'two marks must be comparable')
  open.props.onClick()
  assert.equal(compared, 1)
  pair.unmount()
})

test('a commit list that would draw the same graph is recognised as unchanged', () => {
  const { sameCommits, newCommitCount } = runInNewContext(`${runtimeSource}\n;({ sameCommits, newCommitCount })`, {})
  const base = ['a', 'b'].map(hash => ({ hash, parents: [hash + '-p'], subject: hash, authorName: 'A', authorDate: '2024-01-01', refs: ['HEAD -> main'] }))
  const copy = JSON.parse(JSON.stringify(base))
  assert.equal(sameCommits(base, copy), true, 'equal content is one graph, even as fresh objects')
  assert.equal(sameCommits(base, base), true)
  assert.equal(sameCommits(base, [...copy.slice(0, 1)]), false, 'a shorter list draws different rows')
  const movedRef = JSON.parse(JSON.stringify(base)); movedRef[0].refs = ['HEAD -> main', 'origin/main']
  assert.equal(sameCommits(base, movedRef), false, 'a ref that moved must reach the rows')
  const reworded = JSON.parse(JSON.stringify(base)); reworded[1].subject = 'other'
  assert.equal(sameCommits(base, reworded), false)
  const reparented = JSON.parse(JSON.stringify(base)); reparented[0].parents = ['other-parent']
  assert.equal(sameCommits(base, reparented), false)
  assert.equal(newCommitCount(base.map(c => ({ hash: c.hash })), ['new', 'a', 'b'].map(hash => ({ hash }))), 1)
  assert.equal(newCommitCount([], [{ hash: 'x' }]), 1)
})

const quietWorking = () => Promise.resolve({ staged: [], unstaged: [], untracked: [] })

/** A repository with nothing in progress: the state a graph builds its menu from. */
const idleState = {
  head: 'a'.repeat(40), branch: 'main', detached: false, operation: null,
  locked: false, lockPath: null, dirty: false, changedCount: 0, conflicts: [],
}

/**
 * Answer the two requests that are not the history read.
 *
 * Every graph render asks what the working tree holds and what the repository
 * is in the middle of — the second is what the action menu is built from. A
 * responder written to model only the history read would leave those hanging
 * and count them among the reads it does model, so the tests that count reads
 * route them through here instead.
 *
 * @param request - the request the graph made.
 * @returns the answer, or `null` for a request the caller models itself.
 */
const aside = request => request.op === 'working'
  ? quietWorking()
  : request.op === 'state' ? Promise.resolve({ state: idleState }) : null

test('a hidden tab holds no push stream, a visible one subscribes to its session', async () => {
  const respond = request => request.op === 'working' ? quietWorking() : Promise.resolve(page(['a']))
  const hidden = mount('GraphView', { sessionId: 'one', tabInfo: tabInfo(false) }, respond)
  await hidden.settle()
  assert.equal(FakeEventSource.instances.length, 0, 'a tab nobody is looking at costs the host nothing')
  hidden.unmount()

  const shown = mount('GraphView', { sessionId: 'one', tabInfo: tabInfo(true) }, respond)
  await shown.settle()
  assert.equal(FakeEventSource.instances.length, 1)
  assert.match(FakeEventSource.instances[0].url, /\/api\/dsh-git-graph\/events\?sessionId=one/)
  shown.unmount()
  assert.equal(FakeEventSource.instances[0].closed, true, 'leaving the tab closes the stream')
})

test('a pushed change reloads the history, and a push that changes nothing stays quiet', async () => {
  const pending = []
  const ui = mount('GraphView', { sessionId: 'one', tabInfo: tabInfo(true) }, request => {
    const other = aside(request)
    if (other !== null) return other
    const next = deferred(); pending.push(next); return next.promise
  })
  pending[0].resolve(page(['a'])); await ui.settle()
  const source = FakeEventSource.instances[0]

  source.emit('ready'); ui.render()
  assert.equal(pending.length, 2, 'opening the stream re-reads once, in case changes were missed')
  pending[1].resolve(page(['a'])); await ui.settle()
  assert.equal(find(ui.tree, node => node.props.className === 'gg-notice'), undefined, 'a push that changes nothing says nothing')

  source.emit('changed'); ui.render()
  assert.equal(pending.length, 3)
  pending[2].resolve(page(['new', 'a'])); await ui.settle()
  const notice = find(ui.tree, node => node.props.className === 'gg-notice')
  assert.match(notice.children.join(''), /1 new commit/)

  const hashes = nodes(ui.tree).filter(node => node.type?.name === 'CommitRow').map(node => node.props.row.commit.hash)
  assert.deepEqual(hashes, ['new', 'a'])
  ui.unmount()
})

test('a background push failure keeps the rows it could not replace', async () => {
  const pending = []
  const ui = mount('GraphView', { sessionId: 'one', tabInfo: tabInfo(true) }, request => {
    const other = aside(request)
    if (other !== null) return other
    const next = deferred(); pending.push(next); return next.promise
  })
  pending[0].resolve(page(['a'])); await ui.settle()
  FakeEventSource.instances[0].emit('changed'); ui.render()
  pending[1].reject(new Error('repository unavailable')); await ui.settle()
  assert.equal(find(ui.tree, node => node.props.role === 'alert'), undefined, 'a background failure is not shouted about')
  assert.deepEqual(nodes(ui.tree).filter(node => node.type?.name === 'CommitRow').map(node => node.props.row.commit.hash), ['a'])
  ui.unmount()
})

test('a push that lands while the first read is in flight does not leave the spinner on', async () => {
  const pending = []
  const ui = mount('GraphView', { sessionId: 'one', tabInfo: tabInfo(true) }, request => {
    const other = aside(request)
    if (other !== null) return other
    const next = deferred(); pending.push(next); return next.promise
  })
  assert.ok(find(ui.tree, node => node.props.className === 'gg-history-status'), 'the first read is loading')
  FakeEventSource.instances[0].emit('changed'); ui.render()
  pending[1].resolve(page(['a'])); await ui.settle()
  pending[0].resolve(page(['a'])); await ui.settle()
  assert.equal(find(ui.tree, node => node.props.className === 'gg-history-status'), undefined, 'the superseded read must not strand its spinner')
  ui.unmount()
})

test('a channel that never opens gives up instead of retrying forever', async () => {
  const ui = mount('GraphView', { sessionId: 'one', tabInfo: tabInfo(true) }, request => request.op === 'working' ? quietWorking() : Promise.resolve(page(['a'])))
  await ui.settle()
  const source = FakeEventSource.instances[0]
  source.fail(); ui.render()
  assert.equal(source.closed, false, 'a single failure is worth a retry')
  source.fail(); source.fail(); ui.render()
  assert.equal(source.closed, true, 'a channel that never opened is given up on')
  assert.match(find(ui.tree, node => node.props.className === 'gg-notice').children.join(''), /not answering/)
  ui.unmount()
})

test('a working channel is left to the browser to repair', async () => {
  const ui = mount('GraphView', { sessionId: 'one', tabInfo: tabInfo(true) }, request => request.op === 'working' ? quietWorking() : Promise.resolve(page(['a'])))
  await ui.settle()
  const source = FakeEventSource.instances[0]
  source.emit('ready'); ui.render()
  for (let i = 0; i < 5; i++) source.fail()
  ui.render()
  assert.equal(source.closed, false, 'a stream that had worked is left for the browser to repair')
  ui.unmount()
})

test('a degraded watch is closed and reported instead of looking alive', async () => {
  const ui = mount('GraphView', { sessionId: 'one', tabInfo: tabInfo(true) }, request => request.op === 'working' ? quietWorking() : Promise.resolve(page(['a'])))
  await ui.settle()
  const source = FakeEventSource.instances[0]
  source.emit('degraded', { message: 'ENOSPC: inotify watch limit reached' })
  ui.render()
  assert.equal(source.closed, true, 'a watcher that failed must not be left pretending')
  const notice = find(ui.tree, node => node.props.className === 'gg-notice')
  assert.match(notice.children.join(''), /Live updates unavailable/)
  assert.match(notice.children.join(''), /ENOSPC/)
  ui.unmount()
})

test('the header refresh is a button with a spinner, not a clickable heading', async () => {
  const pending = []
  const ui = mount('GraphView', { sessionId: 'one', tabInfo: tabInfo(false) }, request => {
    const other = aside(request)
    if (other !== null) return other
    const next = deferred(); pending.push(next); return next.promise
  })
  const button = find(ui.tree, node => node.props['aria-label'] === 'Refresh history and working changes')
  assert.equal(button.type, 'button')
  assert.match(button.props.title, /^Refresh history and working changes/)
  await ui.settle()
  button.props.onClick(); ui.render()
  assert.ok(find(ui.tree, node => node.props.className === 'gg-spinner'), 'a refresh shows progress on the button')
  pending[1].resolve(page(['a'])); await ui.settle()
  assert.match(find(ui.tree, node => node.props['aria-label'] === 'Refresh history and working changes').props.title, /last read/)
  ui.unmount()
})

test('a fetch report says what happened, and says nothing when nothing did', () => {
  const { describeFetch } = runInNewContext(`${runtimeSource}\n;({ describeFetch })`, {})
  assert.equal(describeFetch({ added: [], updated: [], pruned: [], remotes: ['origin'] }), 'Already up to date')
  assert.equal(describeFetch({ added: ['origin/a'], updated: [], pruned: [], remotes: ['origin'] }), 'Remote: 1 new branch')
  assert.equal(describeFetch({ added: ['origin/a', 'origin/b'], updated: [], pruned: [], remotes: ['origin'] }), 'Remote: 2 new branches')
  assert.equal(describeFetch({ added: [], updated: ['origin/main'], pruned: ['origin/gone'], remotes: ['origin'] }), 'Remote: 1 updated, 1 deleted')
  assert.equal(describeFetch({ added: [], updated: [], pruned: [], skipped: 'no remote is configured' }), 'no remote is configured')
  assert.equal(describeFetch({ error: 'fatal: could not read from remote' }), 'Fetch failed — fatal: could not read from remote')
})

/* -------------------------------------------------------------------------
 * Writing actions
 *
 * The graph offers them, the dialog confirms them, and the host is the only
 * thing that decides what they run. These tests pin the three seams: which
 * entries a menu gets, that the command shown is the one the host planned, and
 * that a repository which cannot accept an action says so before it runs.
 * ---------------------------------------------------------------------- */

test('a commit menu offers the writing actions above the reading ones', () => {
  const picked = []
  const ui = mount('ContextMenu', {
    menu: { x: 10, y: 10, commit: commit('abc') },
    actions: [{ action: 'commit.revert', label: 'Revert this commit', danger: true, params: {} }],
    onAction: entry => picked.push(entry.action),
    markers: [], onClose() {}, onOpenCommit() {}, onFlash() {},
  })
  const entries = nodes(ui.tree).filter(node => node.props.role === 'menuitem')
  assert.deepEqual(entries.map(node => node.children.join('')), [
    'Revert this commit',
    'Copy commit hash',
    'Copy short hash',
    'Copy subject',
    'Open commit details',
  ])
  assert.match(entries[0].props.className, /is-danger/)
  entries[0].props.onClick()
  assert.deepEqual(picked, ['commit.revert'], 'the entry hands the action request to the dialog, and runs nothing')
  ui.unmount()
})

test('a badge names the exact ref it stands for', () => {
  const refs = [
    { name: 'refs/remotes/origin/main', target: 'b'.repeat(40), kind: 'remote' },
    { name: 'refs/tags/v1.0.0', target: 'c'.repeat(40), kind: 'tag' },
  ]
  const remote = describeBadge({ kind: 'remote', label: 'main', remote: 'origin' }, refs)
  assert.equal(remote.path, 'refs/remotes/origin/main')
  assert.equal(remote.full, 'origin/main')
  assert.equal(remote.target, 'b'.repeat(40))
  const tag = describeBadge({ kind: 'tag', label: 'v1.0.0' }, refs)
  assert.equal(tag.path, 'refs/tags/v1.0.0')
  assert.equal(tag.label, 'v1.0.0')
  // A detached HEAD names no ref, so it gets no ref menu.
  assert.equal(describeBadge({ kind: 'detached', label: 'HEAD' }, refs), null)
})

test('the actions a menu offers never send an empty field as a value', () => {
  const hash = 'a'.repeat(40)
  const entries = commitActions({ hash, subject: 'x' }, { branch: 'main', remotes: ['origin'] })
  assert.ok(entries.every(entry => typeof entry.action === 'string' && typeof entry.title === 'string'))

  const tag = entries.find(entry => entry.action === 'tag.add')
  assert.deepEqual(initialValues(tag), { name: '', message: '' })
  assert.deepEqual(missingFields(tag, initialValues(tag)), ['Tag name'])
  assert.deepEqual(missingFields(tag, { name: 'v1', message: '' }), [])
  // An empty message is left out rather than sent as an empty string, which
  // would turn a lightweight tag into an annotated one.
  assert.deepEqual(paramsFor(tag, { name: 'v1', message: '' }), { hash, name: 'v1' })
  assert.deepEqual(paramsFor(tag, { name: 'v1', message: 'Release' }), { hash, name: 'v1', message: 'Release' })

  // A checkbox that is off is still sent, because the host reads `true`.
  const branch = entries.find(entry => entry.action === 'commit.createBranch')
  assert.deepEqual(paramsFor(branch, { name: 'x', checkout: false }), { hash, name: 'x', checkout: false })
})

test('the current branch offers push and pull; another branch offers checkout, merge and delete', () => {
  const ctx = { branch: 'main', remotes: ['origin'] }
  const current = refActions({ kind: 'head', label: 'main' }, ctx).map(entry => entry.action)
  assert.deepEqual(current, ['branch.push', 'branch.pull'])

  const other = refActions({ kind: 'branch', label: 'feature' }, ctx).map(entry => entry.action)
  assert.deepEqual(other, ['branch.checkout', 'branch.merge', 'branch.rebase', 'branch.rename', 'branch.delete'])
  assert.ok(!other.includes('branch.delete') === false)

  // Without a remote there is nothing to push to, so those entries are absent
  // rather than offered and then refused.
  assert.deepEqual(refActions({ kind: 'head', label: 'main' }, { branch: 'main', remotes: [] }), [])
})

test('the dialog shows the command the host planned, and where the repository stands', async () => {
  const requests = []
  const ui = mount('ActionDialog', {
    request: { action: 'commit.revert', title: 'Revert aaaaaaaa', params: { hash: 'a'.repeat(40) } },
    sessionId: 'one',
    signal: tabInfo().tab.signal,
    onClose() {},
    onDone() {},
  }, request => {
    requests.push(request)
    return request.op === 'plan'
      ? Promise.resolve({
        plan: { summary: 'git revert --no-edit aaaaaaaa' },
        state: idleState,
        warnings: ['This discards commits or files and cannot be undone from this view.'],
        blocked: null,
      })
      : Promise.resolve({ output: 'nothing ran yet' })
  })
  await ui.settle()

  assert.equal(requests[0].op, 'plan', 'the dialog asks before it offers to run anything')
  assert.equal(requests[0].action, 'commit.revert')
  // Spread into this realm: the object was built inside the evaluated module.
  assert.deepEqual({ ...requests[0].params }, { hash: 'a'.repeat(40) })
  assert.equal(requests.length, 1, 'planning is not running')
  assert.equal(find(ui.tree, node => node.props.className === 'gg-argv').children.join(''), 'git revert --no-edit aaaaaaaa')
  assert.match(find(ui.tree, node => node.props.className === 'gg-dialog-state').children.join(''), /on main · clean working tree/)
  assert.equal(find(ui.tree, node => node.props.className === 'gg-dialog-warnings').children.length, 1)
  assert.equal(find(ui.tree, node => node.type === 'button' && node.props.type === 'submit').props.disabled, false)
  ui.unmount()
})

test('confirming the dialog runs the action and reports what git said', async () => {
  const done = []
  const seen = []
  const ui = mount('ActionDialog', {
    request: { action: 'working.stash', title: 'Stash uncommitted changes', params: {} },
    sessionId: 'one',
    signal: tabInfo().tab.signal,
    onClose() {},
    onDone: result => done.push(result),
  }, request => {
    seen.push(request.op)
    return request.op === 'plan'
      ? Promise.resolve({ plan: { summary: 'git stash push' }, state: idleState, warnings: [], blocked: null })
      : Promise.resolve({ output: 'Saved working directory and index state' })
  })
  await ui.settle()
  find(ui.tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} })
  await ui.settle()

  assert.deepEqual(seen, ['plan', 'action'])
  assert.deepEqual(done, [{ output: 'Saved working directory and index state' }])
  ui.unmount()
})

test('an action the repository cannot accept is refused before it runs', async () => {
  const seen = []
  const ui = mount('ActionDialog', {
    request: { action: 'branch.checkout', title: 'Check out feature', params: { name: 'feature' } },
    sessionId: 'one',
    signal: tabInfo().tab.signal,
    onClose() {},
    onDone() {},
  }, request => {
    seen.push(request.op)
    return Promise.resolve({
      plan: { summary: 'git checkout feature' },
      state: { ...idleState, operation: 'merge', busy: true, conflicts: ['a.txt'], dirty: true, changedCount: 1 },
      warnings: ['The working tree has 1 uncommitted change.'],
      blocked: 'dsh-git-graph: a merge is in progress.',
    })
  })
  await ui.settle()

  assert.match(find(ui.tree, node => node.props.className === 'gg-blocked').children.join(''), /merge is in progress/)
  assert.match(find(ui.tree, node => node.props.className === 'gg-dialog-state').children.join(''), /merge in progress · 1 conflicted file/)
  assert.equal(find(ui.tree, node => node.type === 'button' && node.props.type === 'submit').props.disabled, true)
  find(ui.tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} })
  await ui.settle()
  assert.deepEqual(seen, ['plan'], 'a refused action is never sent to the host')
  ui.unmount()
})

test('a half-finished operation replaces the action menu with its way out', async () => {
  const ui = mount('GraphView', { sessionId: 'one', tabInfo: tabInfo() }, request => {
    const other = aside(request)
    if (other !== null && request.op !== 'state') return other
    if (request.op === 'state') {
      return Promise.resolve({
        state: { ...idleState, operation: 'merge', busy: true, dirty: true, changedCount: 1, conflicts: ['a.txt'] },
      })
    }
    if (request.op === 'plan') return Promise.resolve({ plan: { summary: 'git merge --abort' }, state: idleState, warnings: [], blocked: null })
    return Promise.resolve(page(['a']))
  })
  await ui.settle()

  const banner = find(ui.tree, node => node.props.className === 'gg-op-banner')
  assert.ok(banner, 'the banner must be rendered')
  const abort = nodes(banner).find(node => node.type === 'button')
  assert.equal(abort.children.join(''), 'Abort the merge')
  abort.props.onClick()
  await ui.settle()
  // A GraphView mount renders its children as descriptors, so what this pins is
  // that the banner hands the right request to the dialog — the dialog's own
  // drawing is covered by the ActionDialog tests above.
  const dialog = nodes(ui.tree).find(node => node.type?.name === 'ActionDialog')
  assert.ok(dialog, 'the way out opens the confirmation dialog')
  assert.equal(dialog.props.request.action, 'merge.abort')
  assert.equal(dialog.props.request.danger, true)
  ui.unmount()
})

test('a file in the working tree offers to discard its changes', async () => {
  const ui = mount('WorkingAccordion', {
    files: [{ path: 'a.txt', status: 'M', group: 'unstaged' }],
    sessionId: 'one',
    signal: tabInfo().tab.signal,
    tabInfo: tabInfo(),
    height: 300,
    split: 50,
    onHeightChange() {},
    onSplitChange() {},
  }, request => request.op === 'plan'
    ? Promise.resolve({ plan: { summary: 'git checkout -- a.txt' }, state: idleState, warnings: [], blocked: null })
    : Promise.resolve({}))
  // The list itself is a child component, which this harness renders as a
  // descriptor; calling its handler is exactly what the list would do.
  const tree = nodes(ui.tree).find(node => node.type?.name === 'ChangedTree')
  assert.ok(tree, 'the working tree must list its files')
  assert.equal(typeof tree.props.onContextMenu, 'function')
  tree.props.onContextMenu({ preventDefault() {}, clientX: 5, clientY: 5 }, { path: 'a.txt', status: 'M', group: 'unstaged' })
  ui.render()

  const menu = nodes(ui.tree).find(node => node.type?.name === 'ContextMenu')
  assert.ok(menu, 'the file menu opens')
  // Spread into this realm: the entries were built inside the evaluated module.
  assert.deepEqual([...menu.props.actions].map(entry => entry.label), ['Discard changes in a.txt…'])
  assert.equal(menu.props.actions[0].danger, true)
  menu.props.onAction(menu.props.actions[0])
  await ui.settle()

  const dialog = nodes(ui.tree).find(node => node.type?.name === 'ActionDialog')
  assert.ok(dialog, 'the file menu opens the confirmation dialog')
  assert.equal(dialog.props.request.action, 'working.discard')
  assert.equal(dialog.props.request.danger, true)
  // Through JSON: the parameters were built inside the evaluated module.
  // `source` is not among them — it is the field the dialog collects, and an
  // unstaged file starts by restoring from the index.
  assert.deepEqual(JSON.parse(JSON.stringify(dialog.props.request.params)), { paths: ['a.txt'] })
  const source = [...dialog.props.request.fields].find(field => field.name === 'source')
  assert.equal(source.initial, 'index')
  ui.unmount()
})

test('a stash badge offers apply, pop, branch and drop, each naming its position', async () => {
  const stashHash = 'b'.repeat(40)
  const ui = mount('GraphView', { sessionId: 'one', tabInfo: tabInfo() }, request => {
    const other = aside(request)
    if (other !== null) return other
    if (request.op === 'plan') {
      return Promise.resolve({ plan: { summary: 'git stash pop stash@{1}' }, state: idleState, warnings: [], blocked: null })
    }
    return Promise.resolve({
      ...page(['a']),
      commits: [
        { hash: stashHash, parents: [], subject: 'WIP on main: base', authorName: 'A', authorDate: '2024-01-01T00:00:00Z', refs: ['refs/stash'] },
        commit('a'),
      ],
      stashes: [{ index: 1, hash: stashHash, selector: 'stash@{1}', subject: 'On main: erste', date: '2024-01-01T00:00:00.000Z' }],
    })
  })
  await ui.settle()

  const row = nodes(ui.tree).find(node => node.type?.name === 'CommitRow' && node.props.row.commit.hash === stashHash)
  assert.ok(row, 'the stash commit is a row of the graph')
  row.props.onRefContextMenu({ clientX: 1, clientY: 1 }, {
    kind: 'stash', label: 'stash@{1}', text: 'stash@{1}', remote: null, remotes: [],
  })
  ui.render()

  const menu = nodes(ui.tree).find(node => node.type?.name === 'ContextMenu')
  assert.ok(menu, 'the stash badge opens a menu')
  assert.deepEqual([...menu.props.actions].map(entry => entry.action),
    ['stash.apply', 'stash.pop', 'stash.branch', 'stash.drop'])
  // Every entry names the position it acts on, which is the whole point: two
  // stashes differ by nothing else.
  assert.deepEqual([...menu.props.actions].map(entry => /stash@\{1\}/.test(entry.label)), [true, true, true, true])
  assert.equal([...menu.props.actions][3].danger, true, 'dropping one is destructive')

  menu.props.onAction([...menu.props.actions][1])
  await ui.settle()
  const dialog = nodes(ui.tree).find(node => node.type?.name === 'ActionDialog')
  assert.ok(dialog, 'popping opens the confirmation dialog')
  assert.equal(dialog.props.request.action, 'stash.pop')
  assert.deepEqual(JSON.parse(JSON.stringify(dialog.props.request.params)), { index: 1 })
  ui.unmount()
})

test('marking two commits opens a comparison of exactly those two revisions', async () => {
  const opened = []
  const signal = new AbortController().signal
  const tabInfo = {
    tab: {
      signal,
      visible: false,
      actions: { openTab: (kind, options) => opened.push({ kind, params: options?.params }) },
    },
  }
  const ui = mount('GraphView', { sessionId: 'one', tabInfo }, request => {
    const other = aside(request)
    if (other !== null) return other
    return Promise.resolve(page(['a', 'b']))
  })
  await ui.settle()
  assert.equal(find(ui.tree, node => node.props.className === 'gg-compare-bar'), undefined,
    'nothing is being compared until something is marked')

  const rowFor = hash => nodes(ui.tree).find(node => node.type?.name === 'CommitRow' && node.props.row.commit.hash === hash)
  rowFor('a').props.onCompare(commit('a'))
  ui.render()
  const bar = find(ui.tree, node => node.props.className === 'gg-compare-bar')
  assert.ok(bar, 'marking a commit shows what is being compared')
  assert.match(textOf(bar), /Marked a/)

  rowFor('b').props.onCompare(commit('b'))
  ui.render()
  const buttons = nodes(find(ui.tree, node => node.props.className === 'gg-compare-bar'))
    .filter(node => node.type === 'button')
  assert.deepEqual(buttons.map(node => node.children.join('')), ['Compare', 'Clear'])
  buttons[0].props.onClick()
  // Through JSON: the parameters were built inside the evaluated module.
  assert.deepEqual(JSON.parse(JSON.stringify(opened)), [{ kind: 'git-compare', params: { base: 'a', head: 'b' } }])

  // Clearing the marking takes the bar away again.
  buttons[1].props.onClick()
  ui.render()
  assert.equal(find(ui.tree, node => node.props.className === 'gg-compare-bar'), undefined)
  ui.unmount()
})

test('one mark can be compared with the working tree when there is work in it', async () => {
  const opened = []
  const tabInfo = {
    tab: {
      signal: new AbortController().signal,
      visible: false,
      actions: { openTab: (kind, options) => opened.push({ kind, params: options?.params }) },
    },
  }
  const ui = mount('GraphView', { sessionId: 'one', tabInfo }, request => {
    if (request.op === 'working') return Promise.resolve({ staged: [], unstaged: [{ path: 'a.txt', status: 'M' }], untracked: [] })
    if (request.op === 'state') return Promise.resolve({ state: { ...idleState, dirty: true, changedCount: 1 } })
    return Promise.resolve(page(['a']))
  })
  await ui.settle()
  nodes(ui.tree).find(node => node.type?.name === 'CommitRow').props.onCompare(commit('a'))
  ui.render()

  const buttons = nodes(find(ui.tree, node => node.props.className === 'gg-compare-bar')).filter(node => node.type === 'button')
  const workingTree = buttons.find(node => node.children.join('') === 'Compare with the working tree')
  assert.ok(workingTree, 'a dirty tree is worth comparing against')
  workingTree.props.onClick()
  // An empty later side is the working tree; the view sends it as such.
  assert.deepEqual(JSON.parse(JSON.stringify(opened)), [{ kind: 'git-compare', params: { base: 'a', head: '' } }])
  ui.unmount()
})

test('a find query matches what a row actually shows', () => {
  const remotes = ['origin']
  const entry = {
    hash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    subject: 'Fix the parser for nested lists',
    authorName: 'Anna Beispiel',
    authorEmail: 'anna@example.invalid',
    refs: ['HEAD -> main', 'origin/main', 'tag: v1.2.0'],
  }
  assert.ok(matchesFilter(entry, remotes, ''), 'an empty query matches everything')
  assert.ok(matchesFilter(entry, remotes, '   '))
  assert.ok(matchesFilter(entry, remotes, 'parser'))
  assert.ok(matchesFilter(entry, remotes, 'ANNA'), 'the search is case-insensitive')
  assert.ok(matchesFilter(entry, remotes, 'a1b2c3'), 'a hash prefix is searchable')
  assert.ok(matchesFilter(entry, remotes, 'anna parser'), 'every term must match')
  assert.ok(!matchesFilter(entry, remotes, 'anna release'), 'a term that matches nothing excludes the row')
  // The labels a reader can see are searchable too.
  assert.ok(matchesFilter(entry, remotes, 'main'))
  assert.ok(matchesFilter(entry, remotes, 'v1.2.0'))
  assert.ok(!matchesFilter(entry, remotes, 'origin/release'))
})

test('the find box narrows the drawn rows without dropping what was loaded', async () => {
  const ui = mount('GraphView', { sessionId: 'one', tabInfo: tabInfo() }, request => {
    const other = aside(request)
    if (other !== null) return other
    return Promise.resolve(page(['a', 'b', 'c']))
  })
  await ui.settle()
  const drawn = () => nodes(ui.tree).filter(node => node.type?.name === 'CommitRow').map(node => node.props.row.commit.hash)
  assert.deepEqual(drawn(), ['a', 'b', 'c'])

  find(ui.tree, node => node.props.className === 'gg-find').props.onChange({ target: { value: 'b' } })
  ui.render()
  assert.deepEqual(drawn(), ['b'])
  assert.match(textOf(find(ui.tree, node => node.props.className === 'gg-find-count')), /1 of 3 loaded commits/)

  // A search that matches nothing says so rather than looking like an empty
  // history, and the rows come back from the page already held.
  find(ui.tree, node => node.props.className === 'gg-find').props.onChange({ target: { value: 'zzz' } })
  ui.render()
  assert.deepEqual(drawn(), [])
  assert.match(textOf(find(ui.tree, node => node.props.className === 'gg-empty')), /No loaded commit matches/)

  find(ui.tree, node => node.props.className === 'gg-find').props.onChange({ target: { value: '' } })
  ui.render()
  assert.deepEqual(drawn(), ['a', 'b', 'c'])
  assert.equal(find(ui.tree, node => node.props.className === 'gg-find-count'), undefined)
  ui.unmount()
})

test('choosing a branch filter reads that branch’s history instead of every ref', async () => {
  const reads = []
  const ui = mount('GraphView', { sessionId: 'one', tabInfo: tabInfo() }, request => {
    if (request.op === 'working') return Promise.resolve({ staged: [], unstaged: [], untracked: [] })
    if (request.op === 'state') return Promise.resolve({ state: idleState })
    reads.push(request)
    return Promise.resolve({
      ...page(['a']),
      refs: {
        refs: [
          { name: 'refs/heads/main', target: 'a'.repeat(40), kind: 'branch', isHead: true },
          { name: 'refs/heads/topic', target: 'b'.repeat(40), kind: 'branch', isHead: false },
          { name: 'refs/tags/v1', target: 'c'.repeat(40), kind: 'tag', isHead: false },
        ],
        remotes: [],
        head: 'main',
      },
    })
  })
  await ui.settle()
  assert.equal(reads.length, 1)
  assert.equal(reads[0].ref, undefined, 'the graph starts on every ref')

  const filter = find(ui.tree, node => node.props.className === 'gg-branch-filter')
  assert.ok(filter, 'the filter bar carries the branch chooser')
  assert.deepEqual([...filter.props.options].map(option => option.value),
    ['', 'HEAD', 'refs/heads/main', 'refs/heads/topic', 'refs/tags/v1'])

  filter.props.onChange('refs/heads/topic')
  await ui.settle()
  assert.equal(reads.length, 2)
  assert.equal(reads[1].ref, 'refs/heads/topic', 'the narrowing is the host’s, not a client-side hide')
  assert.equal(reads[1].skip, 0, 'a new filter starts at the top of that history')

  // Back to every ref: the filter is dropped from the request rather than sent
  // as an empty string.
  find(ui.tree, node => node.props.className === 'gg-branch-filter').props.onChange('')
  await ui.settle()
  assert.equal(reads.length, 3)
  assert.equal(reads[2].ref, undefined)
  ui.unmount()
})

test('a marking survives a visit to another tab, the way an open accordion does', async () => {
  const respond = request => {
    const other = aside(request)
    if (other !== null) return other
    return Promise.resolve(page(['a', 'b']))
  }
  const first = mount('GraphView', { sessionId: 'one', tabInfo: tabInfo() }, respond)
  await first.settle()
  nodes(first.tree).find(node => node.type?.name === 'CommitRow').props.onCompare(commit('a'))
  first.render()
  assert.ok(find(first.tree, node => node.props.className === 'gg-compare-bar'))
  first.unmount()

  // A fresh mount of the same session — what returning from a Diff tab does —
  // still knows which commit was marked.
  const back = mount('GraphView', { sessionId: 'one', tabInfo: tabInfo() }, respond)
  await back.settle()
  assert.ok(find(back.tree, node => node.props.className === 'gg-compare-bar'),
    'the marking must come back with the graph')
  const clear = nodes(find(back.tree, node => node.props.className === 'gg-compare-bar'))
    .find(node => node.type === 'button' && node.children.join('') === 'Clear')
  clear.props.onClick()
  back.render()
  assert.equal(find(back.tree, node => node.props.className === 'gg-compare-bar'), undefined)
  back.unmount()

  // …and another session never sees it.
  const other = mount('GraphView', { sessionId: 'two', tabInfo: tabInfo() }, respond)
  await other.settle()
  assert.equal(find(other.tree, node => node.props.className === 'gg-compare-bar'), undefined)
  other.unmount()
})

test('a file’s action matches where the file stands', () => {
  // Git refuses `checkout --` for a file it does not track and for one that was
  // staged but never committed; both are removed instead, and each dialog says
  // why rather than failing with a message about a pathspec.
  const untracked = fileActions({ path: 'loose.txt', status: '?', group: 'untracked' })
  assert.deepEqual(untracked.map(entry => entry.action), ['working.clean'])
  assert.match(untracked[0].label, /^Delete loose\.txt/)
  assert.match(untracked[0].note, /does not track/)
  assert.equal(untracked[0].danger, true)

  const added = fileActions({ path: 'added.txt', status: 'A', group: 'staged' })
  assert.deepEqual(added.map(entry => entry.action), ['working.remove'])
  assert.match(added[0].label, /Unstage and delete added\.txt/)
  assert.equal(added[0].danger, true)

  // Everything else is restored, from the index or from HEAD depending on
  // whether it is staged.
  const unstaged = fileActions({ path: 'a.txt', status: 'M', group: 'unstaged' })
  assert.deepEqual(unstaged.map(entry => entry.action), ['working.discard'])
  const unstagedSource = [...unstaged[0].fields].find(field => field.name === 'source')
  assert.equal(unstagedSource.initial, 'index')

  const staged = fileActions({ path: 'a.txt', status: 'M', group: 'staged' })
  const stagedSource = [...staged[0].fields].find(field => field.name === 'source')
  assert.equal(stagedSource.initial, 'head')
})
