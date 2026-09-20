import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import assert from 'node:assert/strict'
import * as GitSyntax from '../src/client/syntax.js'
import { diffFileIdentity, parseUnifiedPatch, planSplitRows, resolveDiffLayout } from '../src/client/diff-layout.js'

// Execute the modular source with a minimal hook runner. Pure helpers are
// imported normally; component source is evaluated only to substitute React.
const componentPaths = ['ui.js', 'graph-ui.js', 'diff-view.js', 'files.js', 'accordions.js', 'live.js', 'graph-view.js', 'views.js']
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
test.beforeEach(() => { openAccordionBySession.clear(); FakeEventSource.reset() })

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
    EMPTY_TREE: 'empty', DIFF_KIND: 'git-diff', ACCORDION_H: 300,
    EVENTS_ROUTE: '/api/dsh-git-graph/events',
    ACCORDION_MIN_H: 180, ACCORDION_MAX_H: 720, ACCORDION_SPLIT: 50,
    openAccordionBySession, accordionLayoutBySession: new Map(),
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
    "const CHANGES_ID = 'changes', CHANGES_KIND = 'changes'",
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
    if (request.op === 'working') return Promise.resolve({ staged: [], unstaged: [], untracked: [] })
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
    if (request.op === 'working') return Promise.resolve({ staged: [], unstaged: [], untracked: [] })
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
    if (request.op === 'working') return Promise.resolve({ staged: [], unstaged: [], untracked: [] })
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

test('history context menu does not expose removed comparison actions', () => {
  const ui = mount('ContextMenu', { menu: { x: 100, y: 100, commit: commit('abc') }, markers: [], onClose() {}, onOpenCommit() {}, onFlash() {} })
  const labels = nodes(ui.tree).filter(n => n.props.role === 'menuitem').map(n => n.children.join(''))
  assert.equal(labels.length, 4)
  assert.ok(labels.includes('Open commit details'))
  assert.ok(labels.every(label => !/compar/i.test(label)))
  ui.unmount()
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
    if (request.op === 'working') return quietWorking()
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
    if (request.op === 'working') return quietWorking()
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
    if (request.op === 'working') return quietWorking()
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
    if (request.op === 'working') return quietWorking()
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
