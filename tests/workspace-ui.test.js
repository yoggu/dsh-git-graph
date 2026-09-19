import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import assert from 'node:assert/strict'
import * as GitSyntax from '../scripts/syntax-entry.js'

// Execute the integrated source, not a possibly stale design snippet. React is
// not installed here; this minimal hook runner tests state/effect transitions.
const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const section = (start, end) => source.slice(source.indexOf(`    function ${start}(`), source.indexOf(`    function ${end}(`))
const h = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter(x => x != null) })
const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...[...tree.children, tree.props.first, tree.props.second].flatMap(nodes)]
const find = (tree, predicate) => nodes(tree).find(predicate)
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
// The real formatter rather than a stub, so a missing snapshot time is exercised.
const formatTime = runInNewContext(`${section('formatTime', 'sessionOf')}\nformatTime`, {})
const openAccordionBySession = new Map()
test.beforeEach(() => openAccordionBySession.clear())

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
    layout: commits => ({ rows: commits.map(commit => ({ commit })), edges: [], columnCount: 1 }),
    ROW_H: 26, LANE_X0: 12, LANE_W: 12, EMPTY_TREE: 'empty', ACCORDION_H: 300,
    GraphCanvas() {}, CommitRow() {}, GitIcon() {}, FileIcon() {}, CommitAccordion() {}, WorkingAccordion() {},
    openAccordionBySession,
    copyText() {}, formatDate: x => x, formatTime,
    window: { innerWidth: 1200, innerHeight: 800 },
    document: { addEventListener() {}, removeEventListener() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
  }
  const components = section('SplitPane', 'GitIcon').replace('    const openAccordionBySession = new Map()\n', '')
  const component = runInNewContext(`${components}\n${section('ContextMenu', 'copyText')}\n${name}`, context)
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
const tabInfo = () => ({ tab: { signal: new AbortController().signal } })

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
  const slice = source.slice(source.indexOf('    const definitions = ['), source.indexOf('    /** Styles, built once and removed with the plugin. */'))
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

test('a failed working-tree read reports itself instead of crashing the view', async () => {
  const ui = mount('ChangesView',
    { sessionId: 'a', tabInfo: { tab: { signal: new AbortController().signal } } },
    () => Promise.reject(new Error('This session is not running')))
  await ui.settle()
  const summary = find(ui.tree, node => node.props.className === 'gg-diff-summary')
  assert.equal(summary.children.join(''), 'Snapshot unavailable')
  assert.match(find(ui.tree, node => node.props.className === 'gg-error').children.join(''), /not running/)
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
  find(ui.tree, n => n.props['aria-label'] === 'Refresh Git').props.onClick(); ui.render()
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
  const refresh = find(ui.tree, n => n.props['aria-label'] === 'Refresh Git').props.onClick
  refresh(); refresh(); ui.render()
  pending[2].resolve(page(['new', 'a'])); await ui.settle()
  pending[1].resolve(page(['stale'])); await ui.settle()
  const hashes = nodes(ui.tree).filter(n => n.type?.name === 'CommitRow').map(n => n.props.row.commit.hash)
  assert.deepEqual(hashes, ['new', 'a'])
  ui.unmount()
})

test('all tab bodies reset their child on session or workspace changes', () => {
  const context = { h, sessionOf: props => props, GraphView() {}, CommitView() {}, DiffView() {}, ChangesView() {} }
  for (const [name, next] of [['GraphBody', 'CommitBody'], ['CommitBody', 'DiffBody'], ['DiffBody', 'ChangesBody'], ['ChangesBody', 'GraphTitle']]) {
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
