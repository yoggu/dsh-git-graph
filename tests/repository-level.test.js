import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { internals, registerRoutes, ROUTE_PATH } from '../lib/index.js'
import { LEVEL_LIMITS } from '../lib/repositories.js'

const request = { sessionId: 'caller' }
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'gg-level-')))
  t.after(() => {
    assert.equal(resolve(root), root)
    assert.ok(root.startsWith(join(realpathSync(tmpdir()), 'gg-level-')))
    rmSync(root, { recursive: true, force: true })
  })
  return root
}
function repo(path) {
  mkdirSync(path, { recursive: true })
  git(path, 'init', '-q', '-b', 'main')
  git(path, 'config', 'user.name', 'Level Test')
  git(path, 'config', 'user.email', 'level@example.invalid')
  git(path, 'commit', '--allow-empty', '-qm', 'Initial')
  return path
}
function fakeRepo(path) {
  mkdirSync(join(path, '.git'), { recursive: true })
  return path
}
function context(cwd, groups = []) {
  const sessions = new Map(cwd ? [['caller', { header: { cwd } }]] : [])
  const registry = new Map(groups.map(group => [group.id, group]))
  return {
    sessions, registry,
    get(name) {
      if (name === 'sessions') return sessions
      if (name === 'workspaceRegistry') return { get: id => registry.get(id), list: () => [...registry.values()] }
    },
  }
}
function access(options = {}) {
  return internals.createRepositoryAccess({ repoRoot: internals.repoRoot, sessionCwd: internals.sessionCwd, ...options })
}
function observedFs(overrides = {}) {
  const calls = { lstat: [], realpath: [], opendir: [] }
  const levelFs = {}
  for (const method of Object.keys(calls)) levelFs[method] = async (...args) => {
    calls[method].push(args[0])
    return (overrides[method] ?? fs[method])(...args)
  }
  return { calls, levelFs }
}
const node = (path, label, repository = null) => ({ path, label, repository })
function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

test('root-only defaults inspect only the named directory and its .git; never opendir or Git descendants', async t => {
  const root = repo(fixture(t))
  repo(join(root, 'child/grandchild'))
  const { calls, levelFs } = observedFs({ opendir: () => assert.fail('root-only must not enumerate') })
  const gitCalls = []
  const api = access({ levelFs, repoRoot: async (cwd, options) => {
    gitCalls.push({ cwd, options })
    return internals.repoRoot(cwd, options)
  } })
  const result = await api.repositoryLevel(context(root), request)
  assert.deepEqual(Object.keys(result), ['node', 'children'])
  assert.deepEqual(result.children, [])
  assert.equal(result.node.path, '.')
  assert.equal(result.node.label, basename(root))
  assert.deepEqual(result.node.repository, {
    target: { session: true, path: '.' }, relativePath: '.', label: '(workspace root)', root,
  })
  assert.deepEqual(gitCalls.map(call => call.cwd), [root])
  assert.ok(gitCalls[0].options.timeout > 0 && gitCalls[0].options.timeout <= LEVEL_LIMITS.milliseconds)
  assert.deepEqual(calls.opendir, [])
  assert.ok(calls.lstat.every(path => path === root || path === join(root, '.git')))
  assert.ok(calls.realpath.every(path => path === root))
  // Explicit false with refresh has the identical no-child boundary.
  await api.repositoryLevel(context(root), { ...request, includeChildren: false, refresh: true })
  assert.deepEqual(calls.opendir, [])
  assert.equal(gitCalls.length, 2)
})

test('root-only non-repositories and sessions within a containing repository never invoke Git', async t => {
  const root = repo(fixture(t))
  const cwd = join(root, 'src')
  repo(join(cwd, 'nested'))
  const { calls, levelFs } = observedFs()
  const api = access({ levelFs, repoRoot: () => assert.fail('no .git candidate') })
  assert.deepEqual(await api.repositoryLevel(context(cwd), request), { node: node('.', 'src'), children: [] })
  assert.deepEqual(calls.opendir, [])
  assert.ok(!calls.lstat.includes(join(cwd, 'nested/.git')))
})

test('each expansion enumerates exactly one level; empty folders remain navigable and no descendant probes run', async t => {
  const root = fixture(t)
  repo(join(root, 'a/b/c'))
  mkdirSync(join(root, 'empty'))
  writeFileSync(join(root, 'file'), 'ignored')
  const { calls, levelFs } = observedFs()
  const gitCalls = []
  const api = access({ levelFs, repoRoot: async (cwd, options) => {
    gitCalls.push(cwd)
    return internals.repoRoot(cwd, options)
  } })
  const ctx = context(root)
  const first = await api.repositoryLevel(ctx, { ...request, includeChildren: true })
  assert.deepEqual(first.children, [node('a', 'a'), node('empty', 'empty')])
  assert.deepEqual(calls.opendir, [root])
  assert.deepEqual(gitCalls, [])
  assert.ok(!calls.lstat.some(path => path.startsWith(join(root, 'a/b'))))
  const second = await api.repositoryLevel(ctx, { ...request, path: 'a', includeChildren: true })
  assert.deepEqual(second.node, node('a', 'a'))
  assert.deepEqual(second.children, [node('a/b', 'b')])
  assert.deepEqual(calls.opendir, [root, join(root, 'a')])
  assert.deepEqual(gitCalls, [])
  assert.ok(!calls.lstat.includes(join(root, 'a/b/c')))
  const third = await api.repositoryLevel(ctx, { ...request, path: 'a/b', includeChildren: true })
  assert.deepEqual(calls.opendir, [root, join(root, 'a'), join(root, 'a/b')])
  assert.deepEqual(gitCalls, [join(root, 'a/b/c')])
  assert.deepEqual(third.children[0].repository.target, { session: true, path: 'a/b/c' })
})

test('exact roots, nested repositories and .git-file linked worktrees preserve existing entry shape and targets', async t => {
  const base = fixture(t)
  const root = repo(join(base, 'root'))
  const nested = repo(join(root, 'nested'))
  const worktree = join(root, 'linked')
  git(root, 'worktree', 'add', '-q', '--detach', worktree)
  mkdirSync(join(root, 'plain'))
  const api = access()
  const ctx = context(null, [{ id: 'registered', title: 'Root group', path: root }])
  const result = await api.repositoryLevel(ctx, { ...request, workspaceId: 'registered', includeChildren: true })
  assert.equal(result.node.repository.root, root)
  assert.deepEqual(result.children.map(item => item.path), ['linked', 'nested', 'plain'])
  assert.equal(result.children[0].repository.root, worktree)
  assert.equal(result.children[1].repository.root, nested)
  assert.equal(result.children[2].repository, null)
  for (const item of [result.node, ...result.children.filter(item => item.repository)]) {
    assert.deepEqual(Object.keys(item.repository), ['target', 'relativePath', 'label', 'root'])
    assert.deepEqual(item.repository.target, { workspaceId: 'registered', path: item.path })
    assert.equal(await api.resolveRoot(ctx, { ...request, target: item.repository.target }), item.repository.root)
  }
})

test('expansion skips dependency/Git directories, files, .git symlinks and all immediate directory symlinks', async t => {
  const base = fixture(t)
  const root = join(base, 'root')
  mkdirSync(root)
  const visible = repo(join(root, 'visible'))
  const outside = repo(join(base, 'outside'))
  for (const name of ['.git', 'node_modules', '.pnpm', '.venv', 'venv', '__pycache__']) repo(join(root, name, 'hidden'))
  symlinkSync(outside, join(root, 'escape'), 'dir')
  symlinkSync(visible, join(root, 'alias'), 'dir')
  mkdirSync(join(root, 'marker-link'))
  symlinkSync(join(visible, '.git'), join(root, 'marker-link/.git'), 'dir')
  const { calls, levelFs } = observedFs()
  const gitCalls = []
  const api = access({ levelFs, repoRoot: async (cwd, options) => {
    gitCalls.push(cwd)
    // The root has .git metadata-shaped content, but is not an exact Git root.
    return cwd === root ? outside : internals.repoRoot(cwd, options)
  } })
  const result = await api.repositoryLevel(context(root), { ...request, includeChildren: true })
  assert.deepEqual(result.children.map(item => item.path), ['marker-link', 'visible'])
  assert.equal(result.children[0].repository, null)
  assert.equal(result.node.repository, null, 'a Git result outside the boundary is not selectable')
  assert.deepEqual(gitCalls, [root, visible])
  assert.deepEqual(calls.opendir, [root])
  assert.ok(!calls.lstat.some(path => path.includes('hidden')))
  assert.ok(!calls.realpath.includes(outside))
})

test('a directory replaced by a symlink after enumeration is not probed or followed', async t => {
  const base = fixture(t)
  const root = join(base, 'root')
  const child = fakeRepo(join(root, 'child'))
  const outside = fakeRepo(join(base, 'outside'))
  const { calls, levelFs } = observedFs({ lstat: async path => {
    if (path === child) {
      assert.equal(resolve(child), join(base, 'root/child'))
      rmSync(child, { recursive: true, force: true })
      symlinkSync(outside, child, 'dir')
    }
    return fs.lstat(path)
  } })
  const result = await access({ levelFs, repoRoot: () => assert.fail('must not run Git for replaced child') })
    .repositoryLevel(context(root), { ...request, includeChildren: true })
  assert.deepEqual(result.children, [])
  assert.ok(!calls.lstat.includes(join(child, '.git')))
  assert.ok(!calls.realpath.includes(child))
})

test('paths reject traversal, absolute spellings, NUL, malformed values and symlink escapes before cache/Git', async t => {
  const base = fixture(t)
  const root = join(base, 'root')
  const outside = fakeRepo(join(base, 'outside'))
  mkdirSync(root)
  symlinkSync(outside, join(root, 'escape'), 'dir')
  const api = access({ repoRoot: () => assert.fail('invalid request must not run Git') })
  const ctx = context(root, [{ id: 'root', path: root, title: 'Root' }])
  for (const path of ['', null, 1, [], {}, '..', '../outside', 'x/../../outside', '/tmp', 'C:\\outside', 'C:outside', '\\\\server\\share', 'bad\0path', 'escape']) {
    for (const scope of [{}, { workspaceId: 'root' }]) {
      await assert.rejects(api.repositoryLevel(ctx, { ...request, ...scope, path }), undefined, JSON.stringify(path))
    }
  }
  for (const sessionId of [undefined, null, '', 1, []]) {
    await assert.rejects(api.repositoryLevel(ctx, { sessionId, workspaceId: 'root' }), /sessionId is required/)
  }
  for (const workspaceId of [null, '', 1, [], 'removed']) await assert.rejects(api.repositoryLevel(ctx, { ...request, workspaceId }), /workspace/)
  for (const key of ['includeChildren', 'refresh']) for (const value of [null, 1, 'true', {}]) {
    await assert.rejects(api.repositoryLevel(ctx, { ...request, [key]: value }), /must be a boolean/)
  }
})

test('canonical internal aliases stay contained and normalize slash-relative node and entry paths', async t => {
  const root = fixture(t)
  const nested = repo(join(root, 'one/two'))
  symlinkSync(join(root, 'one'), join(root, 'alias'), 'dir')
  const result = await access().repositoryLevel(context(root), { ...request, path: './alias//two/.' })
  assert.equal(result.node.path, 'one/two')
  assert.equal(result.node.label, 'two')
  assert.deepEqual(result.node.repository.target, { session: true, path: 'one/two' })
  assert.equal(result.node.repository.root, nested)
})

test('cache hits still validate live registration/session and canonical requested path without fallback', async t => {
  const base = fixture(t)
  const root = repo(join(base, 'root'))
  const outside = repo(join(base, 'outside'))
  const child = repo(join(root, 'child'))
  const ctx = context(root, [{ id: 'root', path: root, title: 'Root' }])
  const api = access()
  const scoped = { ...request, workspaceId: 'root', path: 'child' }
  await api.repositoryLevel(ctx, scoped)
  ctx.registry.clear()
  await assert.rejects(api.repositoryLevel(ctx, scoped), /removed workspace/)
  ctx.registry.set('root', { id: 'root', path: root, title: 'Root' })
  assert.equal(resolve(child), join(root, 'child'))
  rmSync(child, { recursive: true, force: true })
  await assert.rejects(api.repositoryLevel(ctx, scoped), /ENOENT/)
  symlinkSync(outside, child, 'dir')
  await assert.rejects(api.repositoryLevel(ctx, scoped), /escapes its workspace/)
  await api.repositoryLevel(ctx, request)
  ctx.sessions.clear()
  await assert.rejects(api.repositoryLevel(ctx, request), /expired Session/)
  assert.equal((await api.repositoryLevel(ctx, { ...request, workspaceId: 'root' })).node.repository.root, root)
  ctx.registry.set('missing', { id: 'missing', path: join(base, 'missing') })
  await assert.rejects(api.repositoryLevel(ctx, { ...request, workspaceId: 'missing' }), /ENOENT/)
})

test('levels cache independently, refresh bypasses cached lists and TTL expires; callers cannot mutate cache', async t => {
  const root = fixture(t)
  const ctx = context(root)
  const { calls, levelFs } = observedFs()
  let clock = 0
  const api = access({ levelFs, now: () => clock })
  const expanded = { ...request, includeChildren: true }
  assert.deepEqual((await api.repositoryLevel(ctx, expanded)).children, [])
  repo(join(root, 'first'))
  assert.deepEqual((await api.repositoryLevel(ctx, expanded)).children, [])
  assert.equal(calls.opendir.length, 1)
  const refreshed = await api.repositoryLevel(ctx, { ...expanded, refresh: true })
  assert.deepEqual(refreshed.children.map(item => item.path), ['first'])
  refreshed.children[0].repository.target.path = 'corrupted'
  refreshed.children.push(node('fabricated', 'fabricated'))
  assert.deepEqual((await api.repositoryLevel(ctx, expanded)).children[0].repository.target, { session: true, path: 'first' })
  assert.equal((await api.repositoryLevel(ctx, expanded)).children.length, 1)
  const rootOnly = await api.repositoryLevel(ctx, request)
  assert.deepEqual(rootOnly.children, [])
  assert.equal(calls.opendir.length, 2, 'root-only uses its own cache and never an expanded scan')
  repo(join(root, 'second'))
  clock += LEVEL_LIMITS.cacheMilliseconds
  assert.equal((await api.repositoryLevel(ctx, expanded)).children.length, 2)
  assert.equal(calls.opendir.length, 3)
})

test('shared canonical caches reconstruct targets for each session or registered workspace caller', async t => {
  const root = fakeRepo(fixture(t))
  const ctx = context(root, [{ id: 'one', path: root }, { id: 'two', path: root }])
  let calls = 0
  const api = access({ repoRoot: async cwd => { calls++; return cwd } })
  assert.deepEqual((await api.repositoryLevel(ctx, request)).node.repository.target, { session: true, path: '.' })
  for (const workspaceId of ['one', 'two']) {
    assert.deepEqual((await api.repositoryLevel(ctx, { ...request, workspaceId })).node.repository.target, { workspaceId, path: '.' })
  }
  assert.equal(calls, 1)
  ctx.registry.delete('one')
  await assert.rejects(api.repositoryLevel(ctx, { ...request, workspaceId: 'one' }), /removed workspace/)
  assert.equal((await api.repositoryLevel(ctx, { ...request, workspaceId: 'two' })).node.repository.root, root)
})

test('a Git candidate resolving to a parent is not an exact-root repository entry', async t => {
  const root = fakeRepo(fixture(t))
  fakeRepo(join(root, 'candidate'))
  const result = await access({ repoRoot: async () => root }).repositoryLevel(context(root), { ...request, includeChildren: true })
  assert.equal(result.node.repository.root, root)
  assert.deepEqual(result.children, [node('candidate', 'candidate')])
})

test('bounded caches evict old levels and limit retained child nodes', async t => {
  const root = fixture(t)
  for (const name of ['one', 'two', 'three']) fakeRepo(join(root, name))
  const calls = []
  const api = access({ repoRoot: async cwd => { calls.push(cwd); return cwd }, levelLimits: { ...LEVEL_LIMITS, cacheLevels: 2, cacheNodes: 2 } })
  const ctx = context(root)
  for (const path of ['one', 'two', 'three', 'one']) await api.repositoryLevel(ctx, { ...request, path })
  assert.deepEqual(calls.map(path => basename(path)), ['one', 'two', 'three', 'one'])
  await api.repositoryLevel(ctx, { ...request, includeChildren: true })
  const before = calls.length
  await api.repositoryLevel(ctx, { ...request, includeChildren: true })
  assert.equal(calls.length, before + 3, 'a level over the cache-node budget is returned but not retained')
})

test('only two levels/probes run concurrently; same-level calls including refresh coalesce', { timeout: 5000 }, async t => {
  const root = fixture(t)
  const roots = ['one', 'two', 'three'].map(name => fakeRepo(join(root, name)))
  const ready = deferred()
  const thirdReady = deferred()
  const release = new Map()
  let active = 0
  let peak = 0
  const calls = []
  const api = access({ repoRoot: async cwd => {
    calls.push(cwd)
    active++
    peak = Math.max(peak, active)
    const gate = deferred()
    release.set(cwd, gate.resolve)
    if (release.size === 2) ready.resolve()
    if (release.size === 3) thirdReady.resolve()
    await gate.promise
    active--
    return cwd
  } })
  const ctx = context(root)
  const first = api.repositoryLevel(ctx, { ...request, path: 'one' })
  const duplicate = api.repositoryLevel(ctx, { ...request, path: 'one', refresh: true })
  const second = api.repositoryLevel(ctx, { ...request, path: 'two' })
  const third = api.repositoryLevel(ctx, { ...request, path: 'three' })
  await ready.promise
  assert.equal(active, 2)
  assert.equal(calls.length, 2)
  release.get(roots[0])()
  await first
  assert.equal((await duplicate).node.repository.root, roots[0])
  await thirdReady.promise
  assert.equal(calls.length, 3)
  release.get(roots[1])()
  release.get(roots[2])()
  await Promise.all([second, third])
  assert.equal(peak, 2)
  assert.deepEqual(new Set(calls), new Set(roots))
})

test('refresh in flight takes precedence over stale cache for subsequent ordinary callers', { timeout: 5000 }, async t => {
  const root = fakeRepo(fixture(t))
  const entered = deferred()
  const release = deferred()
  let calls = 0
  const api = access({ repoRoot: async cwd => {
    if (++calls === 2) { entered.resolve(); await release.promise }
    return cwd
  } })
  const ctx = context(root)
  await api.repositoryLevel(ctx, request)
  const refreshing = api.repositoryLevel(ctx, { ...request, refresh: true })
  await entered.promise
  const normal = api.repositoryLevel(ctx, request)
  release.resolve()
  assert.deepEqual(await refreshing, await normal)
  assert.equal(calls, 2)
})

test('queued and coalesced levels reject removed workspaces before probing or returning', { timeout: 5000 }, async t => {
  const root = fixture(t)
  const groups = ['one', 'two', 'three'].map(id => ({ id, path: fakeRepo(join(root, id)) }))
  const ctx = context(null, groups)
  const entered = deferred()
  const release = deferred()
  const calls = []
  const api = access({ repoRoot: async cwd => {
    calls.push(cwd)
    if (calls.length === 2) entered.resolve()
    await release.promise
    return cwd
  } })
  const first = api.repositoryLevel(ctx, { ...request, workspaceId: 'one' })
  const second = api.repositoryLevel(ctx, { ...request, workspaceId: 'two' })
  const queued = api.repositoryLevel(ctx, { ...request, workspaceId: 'three' })
  const duplicate = api.repositoryLevel(ctx, { ...request, workspaceId: 'three' })
  const queuedFailure = assert.rejects(queued, /removed workspace/)
  const duplicateFailure = assert.rejects(duplicate, /removed workspace/)
  const secondFailure = assert.rejects(second, /removed workspace/)
  await entered.promise
  ctx.registry.delete('three')
  ctx.registry.delete('two')
  release.resolve()
  await Promise.all([first, secondFailure, queuedFailure, duplicateFailure])
  assert.equal(calls.length, 2, 'removed queued workspace is not probed')
})

test('unreadable requested directories report inline-retry errors and failures never cache incomplete lists', async t => {
  const root = fixture(t)
  mkdirSync(join(root, 'child'))
  let blocked = true
  const denied = Object.assign(new Error('permission denied opening directory'), { code: 'EACCES' })
  const { calls, levelFs } = observedFs({ opendir: path => blocked ? Promise.reject(denied) : fs.opendir(path) })
  const api = access({ levelFs })
  const ctx = context(root)
  await assert.rejects(api.repositoryLevel(ctx, { ...request, includeChildren: true }), /cannot read directory level.*permission denied/)
  blocked = false
  assert.deepEqual((await api.repositoryLevel(ctx, { ...request, includeChildren: true })).children, [node('child', 'child')])
  assert.equal(calls.opendir.length, 2)
})

test('many immediate directories are complete, streamed and sequential; directory/entry limits fail rather than truncate', async t => {
  const root = fixture(t)
  for (let i = 0; i < 200; i++) mkdirSync(join(root, `dir-${String(i).padStart(3, '0')}`))
  fakeRepo(join(root, 'dir-099'))
  fakeRepo(join(root, 'dir-199'))
  const calls = []
  let active = 0
  const api = access({ repoRoot: async cwd => {
    assert.equal(++active, 1, 'probes within one level are sequential')
    calls.push(cwd)
    await Promise.resolve()
    active--
    return cwd
  } })
  const ctx = context(root)
  const result = await api.repositoryLevel(ctx, { ...request, includeChildren: true })
  assert.equal(result.children.length, 200)
  assert.deepEqual(result.children.map(item => item.path), Array.from({ length: 200 }, (_, i) => `dir-${String(i).padStart(3, '0')}`))
  assert.deepEqual(new Set(calls), new Set([join(root, 'dir-099'), join(root, 'dir-199')]))
  for (const levelLimits of [{ ...LEVEL_LIMITS, directories: 10 }, { ...LEVEL_LIMITS, entries: 10 }]) {
    await assert.rejects(access({ levelLimits }).repositoryLevel(ctx, { ...request, includeChildren: true }), /too many.*(directories|entries)/)
  }
})

test('candidate timeouts receive a positive remaining bound and timeout failures reject the whole level', async t => {
  const root = fakeRepo(fixture(t))
  const ctx = context(root)
  let clock = 0
  let timeout
  const api = access({ now: () => clock++, levelLimits: { ...LEVEL_LIMITS, milliseconds: 100 }, repoRoot: async (cwd, options) => {
    timeout = options.timeout
    clock += 100
    return cwd
  } })
  await assert.rejects(api.repositoryLevel(ctx, request), /time limit/)
  assert.ok(timeout > 0 && timeout < 100)
  const gitFailure = access({ repoRoot: async () => { throw new Error('Git candidate timed out') } })
  await assert.rejects(gitFailure.repositoryLevel(ctx, request), /cannot read directory level.*Git candidate timed out/)
  const expired = access({ now: () => clock++, levelLimits: { ...LEVEL_LIMITS, milliseconds: 1 }, repoRoot: () => assert.fail('deadline already expired') })
  await assert.rejects(expired.repositoryLevel(ctx, request), /time limit/)
})

test('read errors part-way through iteration reject and close the stream instead of caching partial children', async t => {
  const root = fixture(t)
  mkdirSync(join(root, 'one'))
  let closed = 0
  const api = access({ levelFs: { ...fs, opendir: async () => ({
    async *[Symbol.asyncIterator]() {
      yield { name: 'one', isDirectory: () => true, isSymbolicLink: () => false }
      throw new Error('directory enumeration failed')
    },
    close: async () => { closed++ },
  }) } })
  for (let attempt = 0; attempt < 2; attempt++) await assert.rejects(api.repositoryLevel(context(root), { ...request, includeChildren: true }), /enumeration failed/)
  assert.equal(closed, 2)
})

test('pending level requests are bounded and overload errors are retryable', { timeout: 5000 }, async t => {
  const root = fixture(t)
  fakeRepo(join(root, 'one'))
  fakeRepo(join(root, 'two'))
  const entered = deferred()
  const release = deferred()
  const api = access({ levelLimits: { ...LEVEL_LIMITS, pending: 1 }, repoRoot: async cwd => {
    entered.resolve()
    await release.promise
    return cwd
  } })
  const ctx = context(root)
  const first = api.repositoryLevel(ctx, { ...request, path: 'one' })
  await entered.promise
  await assert.rejects(api.repositoryLevel(ctx, { ...request, path: 'two' }), /busy; retry/)
  release.resolve()
  await first
  assert.equal((await api.repositoryLevel(ctx, { ...request, path: 'two' })).node.path, 'two')
})

test('POST dispatch accepts the exact repositoryLevel contract before Git root resolution; legacy API remains recursive', async t => {
  const root = fixture(t)
  repo(join(root, 'folder/deeper'))
  const ctx = context(root, [{ id: 'registered', title: 'Registered', path: root }])
  const routes = new Map()
  ctx.connection = { fetch: { register(route) {
    routes.set(route.path, route)
    return async () => routes.delete(route.path)
  } } }
  t.after(registerRoutes(ctx))
  const post = async body => {
    const response = await routes.get(ROUTE_PATH).fetch(new Request(`http://localhost${ROUTE_PATH}`, { method: 'POST', body: JSON.stringify(body) }))
    return response.json()
  }
  const first = await post({ op: 'repositoryLevel', ...request })
  assert.deepEqual(first, { ok: true, result: { node: node('.', basename(root)), children: [] } })
  const expanded = await post({ op: 'repositoryLevel', ...request, workspaceId: 'registered', path: '.', includeChildren: true, refresh: true })
  assert.deepEqual(expanded, { ok: true, result: { node: node('.', basename(root)), children: [node('folder', 'folder')] } })
  const nested = await post({ op: 'repositoryLevel', ...request, workspaceId: 'registered', path: 'folder', includeChildren: true })
  assert.equal(nested.ok, true)
  assert.deepEqual(nested.result.children[0].repository.target, { workspaceId: 'registered', path: 'folder/deeper' })
  const legacy = await post({ op: 'repositories', ...request })
  assert.deepEqual(Object.keys(legacy.result), ['repositories', 'warnings', 'truncated'])
  assert.deepEqual(legacy.result.repositories.map(item => item.relativePath), ['folder/deeper'])
  const invalid = await post({ op: 'repositoryLevel', ...request, path: '..' })
  assert.equal(invalid.ok, false)
  assert.match(invalid.error, /relative/)
})
