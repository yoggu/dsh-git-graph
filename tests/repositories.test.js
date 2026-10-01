import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { internals, registerRoutes, ROUTE_PATH, EVENTS_PATH } from '../lib/index.js'

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'gg-repositories-')))
  t.after(() => {
    assert.equal(resolve(root), root)
    assert.ok(root.startsWith(join(realpathSync(tmpdir()), 'gg-repositories-')))
    rmSync(root, { recursive: true, force: true })
  })
  return root
}
function repo(path) {
  mkdirSync(path, { recursive: true })
  git(path, 'init', '-q', '-b', 'main')
  git(path, 'config', 'user.name', 'Repository Test')
  git(path, 'config', 'user.email', 'repositories@example.invalid')
  git(path, 'commit', '--allow-empty', '-qm', 'Initial')
  return path
}
function context(cwd, groups = [], registryAvailable = true) {
  const sessions = new Map(cwd ? [['caller', { header: { cwd } }]] : [])
  const registry = new Map(groups.map(group => [group.id, { sessionIds: [], ...group }]))
  return {
    registry, sessions,
    get(name) {
      if (name === 'sessions') return sessions
      if (name === 'workspaceRegistry' && registryAvailable) return { list: () => [...registry.values()], get: id => registry.get(id) }
    },
  }
}
function access(options = {}) {
  return internals.createRepositoryAccess({ repoRoot: internals.repoRoot, sessionCwd: internals.sessionCwd, ...options })
}
const request = { sessionId: 'caller' }

function transport(ctx) {
  const routes = new Map()
  ctx.connection = { fetch: { register(route) {
    routes.set(route.path, route)
    return async () => routes.delete(route.path)
  } } }
  const release = registerRoutes(ctx)
  return {
    release,
    post: async body => (await routes.get(ROUTE_PATH).fetch(new Request(`http://localhost${ROUTE_PATH}`, {
      method: 'POST', body: JSON.stringify(body),
    }))).json(),
    events: (target, signal, sessionId = 'caller') => {
      const url = new URL(`http://localhost${EVENTS_PATH}`)
      url.searchParams.set('sessionId', sessionId)
      if (target !== undefined) url.searchParams.set('target', typeof target === 'string' ? target : JSON.stringify(target))
      return routes.get(EVENTS_PATH).fetch(new Request(url, { signal }))
    },
  }
}

test('workspaces works without Git or registry and discovers multiple child repositories', async t => {
  const base = fixture(t)
  const ctx = context(base, [], false)
  const api = access()
  assert.deepEqual(await api.workspaces(ctx, request), {
    groups: [{ id: 'session', title: base.split('/').at(-1), path: base, current: true, session: true }],
    currentGroupId: 'session', containing: null,
  })
  repo(join(base, 'one'))
  repo(join(base, 'two'))
  const result = await api.repositories(ctx, request)
  assert.deepEqual(result.repositories.map(item => item.relativePath), ['one', 'two'])
  assert.deepEqual(result.repositories.map(item => item.target), [{ session: true, path: 'one' }, { session: true, path: 'two' }])
  assert.deepEqual(result.warnings, [])
  assert.equal(result.truncated, false)
})

test('current workspace is the exact or deepest canonical owner; containing remains separate', async t => {
  const base = fixture(t)
  const root = repo(join(base, 'repo'))
  const cwd = join(root, 'src/deep')
  mkdirSync(cwd, { recursive: true })
  const alias = join(base, 'alias')
  symlinkSync(cwd, alias, 'dir')
  const ctx = context(alias, [
    { id: 'outer', title: 'Outer', path: root },
    { id: 'inner', title: 'Inner', path: join(root, 'src') },
  ])
  const api = access()
  const result = await api.workspaces(ctx, request)
  assert.equal(result.currentGroupId, 'inner')
  assert.deepEqual(result.groups.map(group => group.current), [false, true])
  assert.equal(result.containing.root, root)
  assert.equal(result.containing.label, 'repo (containing repository)')
  assert.deepEqual(result.containing.target, { session: true, containing: true })
  ctx.registry.set('exact', { id: 'exact', title: 'Exact', path: cwd, sessionIds: [] })
  assert.equal((await api.workspaces(ctx, request)).currentGroupId, 'exact')
  const syntheticScan = await api.repositories(ctx, request)
  assert.equal(syntheticScan.repositories.length, 1)
  assert.deepEqual(syntheticScan.repositories[0].target, { session: true, containing: true })
  const localScan = await api.repositories(ctx, { ...request, workspaceId: 'inner' })
  assert.equal(localScan.repositories[0].root, root)
  assert.deepEqual(localScan.repositories[0].target, { session: true, containing: true })
})

test('root, nested repositories and linked worktrees have distinct canonical roots', async t => {
  const base = fixture(t)
  const root = repo(join(base, 'root'))
  const nested = repo(join(root, 'nested'))
  const worktree = join(root, 'linked')
  git(root, 'worktree', 'add', '-q', '--detach', worktree)
  const api = access()
  const ctx = context(root, [{ id: 'root', title: 'Root', path: root }])
  const result = await api.repositories(ctx, { ...request, workspaceId: 'root' })
  assert.deepEqual(new Set(result.repositories.map(item => item.root)), new Set([root, nested, worktree]))
  assert.equal(result.repositories.find(item => item.root === root).relativePath, '.')
  assert.equal(result.repositories.find(item => item.root === root).label, '(workspace root)')
  assert.deepEqual(result.repositories.find(item => item.root === worktree).target, { workspaceId: 'root', path: 'linked' })
  for (const item of result.repositories) assert.equal(await api.resolveRoot(ctx, { ...request, target: item.target }), item.root)
})

test('discovery skips dependency directories, Git metadata and all child symlinks; only candidates run Git', async t => {
  const base = fixture(t)
  const group = join(base, 'group')
  mkdirSync(group)
  const visible = repo(join(group, 'visible'))
  const external = repo(join(base, 'external'))
  for (const skip of ['node_modules', '.pnpm', '.venv', 'venv', '__pycache__', '.git']) repo(join(group, skip, 'hidden'))
  symlinkSync(external, join(group, 'outside'), 'dir')
  symlinkSync(visible, join(group, 'alias'), 'dir')
  mkdirSync(join(group, 'plain'))
  mkdirSync(join(group, 'invalid'))
  writeFileSync(join(group, 'invalid/.git'), 'not a gitdir\n')
  const calls = []
  const result = await internals.scanRepositories(group, { repoRoot: async (cwd, opts) => {
    calls.push(cwd)
    return internals.repoRoot(cwd, opts)
  } })
  assert.deepEqual(result.roots, [visible])
  assert.deepEqual(new Set(calls), new Set([visible, join(group, 'invalid'), group]))
  // The group's .git directory is itself a candidate, but its contents are never traversed.
  assert.ok(result.warnings.some(warning => warning.includes('Git candidate')))
})

test('discovery bounds depth, directory count and elapsed time with explicit partial warnings', async t => {
  const base = fixture(t)
  let path = base
  for (let depth = 1; depth <= 7; depth++) {
    path = join(path, `d${depth}`)
    mkdirSync(path)
    if (depth >= 6) repo(path)
  }
  const depth = await internals.scanRepositories(base, { repoRoot: internals.repoRoot })
  assert.equal(depth.roots.length, 1, 'depth six is scanned; depth seven is not')
  assert.equal(depth.truncated, true)
  assert.ok(depth.warnings.some(warning => warning.includes('depth limit')))
  const calls = []
  const count = await internals.scanRepositories(base, {
    repoRoot: async cwd => { calls.push(cwd); return cwd },
    limits: { ...internals.DISCOVERY_LIMITS, directories: 3 },
  })
  assert.equal(count.truncated, true)
  assert.ok(count.warnings.some(warning => warning.includes('directory limit')))
  assert.deepEqual(calls, [])
  let clock = 0
  const time = await internals.scanRepositories(base, {
    repoRoot: () => assert.fail('no Git call after deadline'),
    now: () => ++clock,
    limits: { ...internals.DISCOVERY_LIMITS, milliseconds: 3 },
  })
  assert.equal(time.truncated, true)
  assert.ok(time.warnings.some(warning => warning.includes('time limit')))
  assert.deepEqual(internals.DISCOVERY_LIMITS, { depth: 6, directories: 5000, milliseconds: 10_000, concurrent: 2, cacheMilliseconds: 30_000 })
})

test('Git candidate validations receive the remaining scan timeout', async t => {
  const base = repo(fixture(t))
  const timeouts = []
  let clock = 0
  await internals.scanRepositories(base, {
    repoRoot: async (cwd, opts) => { timeouts.push(opts.timeout); return cwd },
    now: () => clock++,
    limits: { ...internals.DISCOVERY_LIMITS, milliseconds: 100 },
  })
  assert.equal(timeouts.length, 1)
  assert.ok(timeouts[0] > 0 && timeouts[0] < 100)
})

test('completed scans cache for thirty seconds; refresh bypasses and live targets never trust the cache', async t => {
  const base = fixture(t)
  const ctx = context(base)
  let clock = 0
  const api = access({ now: () => clock })
  assert.deepEqual((await api.repositories(ctx, request)).repositories, [])
  const first = repo(join(base, 'first'))
  assert.deepEqual((await api.repositories(ctx, request)).repositories, [])
  assert.equal((await api.repositories(ctx, { ...request, refresh: true })).repositories[0].root, first)
  repo(join(base, 'second'))
  clock += 30_000
  assert.equal((await api.repositories(ctx, request)).repositories.length, 2)
  assert.equal(resolve(first), join(base, 'first'))
  rmSync(first, { recursive: true, force: true })
  assert.equal((await api.repositories(ctx, request)).repositories.length, 2)
  await assert.rejects(api.resolveRoot(ctx, { ...request, target: { session: true, path: 'first' } }), /ENOENT/)
})

test('only two scans run concurrently and requests for the same scan coalesce', { timeout: 5000 }, async t => {
  const base = fixture(t)
  const roots = ['one', 'two', 'three'].map(name => repo(join(base, name)))
  const ctx = context(null, roots.map((path, i) => ({ id: String(i), title: String(i), path })))
  let running = 0
  let peak = 0
  const blocked = []
  let firstTwoReady
  let thirdReady
  const ready = new Promise(resolve => { firstTwoReady = resolve })
  const third = new Promise(resolve => { thirdReady = resolve })
  const api = access({ repoRoot: async cwd => {
    running++
    peak = Math.max(peak, running)
    if (blocked.length === 1) firstTwoReady()
    if (blocked.length === 2) thirdReady()
    await new Promise(resolve => blocked.push(resolve))
    running--
    return cwd
  } })
  const one = api.repositories(ctx, { workspaceId: '0' })
  const duplicate = api.repositories(ctx, { workspaceId: '0' })
  const two = api.repositories(ctx, { workspaceId: '1' })
  const three = api.repositories(ctx, { workspaceId: '2' })
  await ready
  assert.equal(running, 2)
  assert.equal(blocked.length, 2)
  // Await the first completed request to let the queued third scan take the slot.
  blocked[0]()
  await one
  assert.equal((await duplicate).repositories[0].root, roots[0])
  // Third starts asynchronously after the slot transfers, and signals via its gate.
  blocked[1]()
  await two
  await third
  blocked[2]()
  await three
  assert.equal(peak, 2)
})

test('registered targets read and write a workspace without any live session there; legacy stays local', async t => {
  const base = fixture(t)
  const local = repo(join(base, 'local'))
  const other = repo(join(base, 'other'))
  const ctx = context(local, [{ id: 'other', title: 'Other', path: other }])
  const http = transport(ctx)
  t.after(http.release)
  const target = { workspaceId: 'other', path: '.' }
  const scan = await http.post({ op: 'repositories', ...request, workspaceId: 'other' })
  assert.equal(scan.ok, true)
  assert.deepEqual(scan.result.repositories[0].target, target)
  assert.equal((await http.post({ op: 'working', ...request, target })).result.root, other)
  assert.equal((await http.post({ op: 'working', ...request })).result.root, local)
  const write = await http.post({ op: 'action', ...request, target, action: 'branch.create', params: { name: 'cross-workspace' } })
  assert.equal(write.ok, true)
  assert.equal(git(other, 'branch', '--list', 'cross-workspace'), 'cross-workspace')
  assert.equal(git(local, 'branch', '--list', 'cross-workspace'), '')
  ctx.sessions.clear()
  assert.equal((await http.post({ op: 'working', sessionId: 'expired', target })).ok, true)
  assert.match((await http.post({ op: 'working', ...request })).error, /unknown or expired Session/)
})

test('target validation rejects absolute paths, traversal, symlink escapes, non-roots and removed workspaces without fallback', async t => {
  const base = fixture(t)
  const root = repo(join(base, 'root'))
  const outside = repo(join(base, 'outside'))
  mkdirSync(join(root, 'src'))
  symlinkSync(outside, join(root, 'escape'), 'dir')
  const ctx = context(root, [{ id: 'registered', title: 'Registered', path: root }])
  const api = access()
  const bad = [
    null, [], {}, { root },
    { workspaceId: 'registered', path: outside },
    { session: true, path: '../outside' },
    { session: true, path: 'src/../../outside' },
    { session: true, path: 'C:\\outside' },
    { session: true, path: 'C:outside' },
    { session: true, path: '\\\\server\\share' },
    { session: true, path: 'escape' },
    { session: true, path: 'src' },
    { session: true, path: '.' , workspaceId: 'registered' },
    { session: true, containing: true, path: '.' },
    { workspaceId: 'registered', containing: true },
    { workspaceId: 'registered', session: false, path: '.' },
    { session: true, path: '.', root: outside },
  ]
  for (const target of bad) await assert.rejects(api.resolveRoot(ctx, { ...request, target }), undefined, JSON.stringify(target))
  ctx.registry.delete('registered')
  await assert.rejects(api.resolveRoot(ctx, { ...request, target: { workspaceId: 'registered', path: '.' } }), /removed workspace/)
  await assert.rejects(api.repositories(ctx, { ...request, workspaceId: 'registered' }), /removed workspace/)
  await assert.rejects(api.repositories(ctx, { ...request, workspaceId: null }), /invalid workspace/)
})

test('a missing registered workspace directory fails without falling back to the live session', async t => {
  const base = fixture(t)
  const local = repo(join(base, 'local'))
  const missing = join(base, 'missing')
  const ctx = context(local, [{ id: 'missing', title: 'Missing', path: missing }])
  const api = access()
  await assert.rejects(api.repositories(ctx, { ...request, workspaceId: 'missing' }), /ENOENT/)
  await assert.rejects(api.resolveRoot(ctx, { ...request, target: { workspaceId: 'missing', path: '.' } }), /ENOENT/)
  assert.equal(await api.resolveRoot(ctx, request), local)
})

test('only the special containing target selects a parent repository outside the session group', async t => {
  const root = repo(fixture(t))
  const cwd = join(root, 'src')
  mkdirSync(cwd)
  const api = access()
  const ctx = context(cwd, [{ id: 'src', title: 'Source', path: cwd }])
  assert.equal(await api.resolveRoot(ctx, request), root, 'legacy still resolves a subdirectory session')
  assert.equal(await api.resolveRoot(ctx, { ...request, target: { session: true, containing: true } }), root)
  await assert.rejects(api.resolveRoot(ctx, { ...request, target: { session: true, path: '.' } }), /exact Git root/)
  await assert.rejects(api.resolveRoot(ctx, { ...request, target: { workspaceId: 'src', path: '.' } }), /exact Git root/)
  ctx.sessions.clear()
  await assert.rejects(api.resolveRoot(ctx, { ...request, target: { session: true, containing: true } }), /unknown or expired Session/)
})

test('SSE uses the same explicit target security and releases cross-workspace watchers on abort and cancel', async t => {
  const base = fixture(t)
  const local = repo(join(base, 'local'))
  const other = repo(join(base, 'other'))
  const ctx = context(local, [{ id: 'other', title: 'Other', path: other }])
  const http = transport(ctx)
  t.after(http.release)
  const target = { workspaceId: 'other', path: '.' }
  const abort = new AbortController()
  const stream = await http.events(target, abort.signal)
  assert.equal(stream.headers.get('content-type'), 'text/event-stream; charset=utf-8')
  assert.deepEqual(internals.watchedDirectories(), [await internals.gitDir(other)])
  const reader = stream.body.getReader()
  assert.match(new TextDecoder().decode((await reader.read()).value), /connected/)
  abort.abort()
  assert.deepEqual(internals.watchedDirectories(), [])
  await reader.cancel()
  const cancelStream = await http.events(target)
  await cancelStream.body.cancel()
  assert.deepEqual(internals.watchedDirectories(), [])
  const earlyAbort = new AbortController()
  earlyAbort.abort()
  assert.equal((await http.events(target, earlyAbort.signal)).status, 204)
  assert.deepEqual(internals.watchedDirectories(), [])
  for (const bad of ['{bad json', null, { workspaceId: 'other', path: '..' }, { session: true, path: other }]) {
    const response = await http.events(bad)
    assert.equal((await response.json()).ok, false)
    assert.deepEqual(internals.watchedDirectories(), [])
  }
  ctx.registry.clear()
  assert.match((await (await http.events(target)).json()).error, /removed workspace/)
})
