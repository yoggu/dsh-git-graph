import { lstat, realpath, opendir } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, sep, win32 } from 'node:path'

export const DISCOVERY_LIMITS = Object.freeze({ depth: 6, directories: 5000, milliseconds: 10_000, concurrent: 2, cacheMilliseconds: 30_000 })
// A level is complete or rejects: unlike legacy discovery, it never truncates.
export const LEVEL_LIMITS = Object.freeze({ directories: 10_000, entries: 50_000, milliseconds: 10_000, concurrent: 2, cacheMilliseconds: 15_000, cacheLevels: 32, cacheNodes: 20_000, pending: 64 })
export const SESSION_GROUP_ID = 'session'
const SKIP = new Set(['.git', 'node_modules', '.pnpm', '.venv', 'venv', '__pycache__'])
const fail = message => new Error(`dsh-git-graph: ${message}`)

export function isContained(base, path) {
  const rel = relative(base, path)
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`))
}

function relativeTarget(value) {
  // Targets use slash-separated relative paths on every platform. Reject both
  // POSIX and Windows absolute spellings, separators and traversal components.
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') ||
      value.includes('\\') || isAbsolute(value) || win32.isAbsolute(value) ||
      /^[a-z]:/i.test(value) || value.split('/').includes('..')) {
    throw fail('repository target path must be relative and stay inside its workspace')
  }
  return value
}

async function directory(path) {
  const canonical = await realpath(path)
  if (!(await lstat(canonical)).isDirectory()) throw fail('workspace is not a directory')
  return canonical
}

function entry(root, base, target) {
  const relativePath = relative(base, root).split(sep).join('/') || '.'
  const label = target.containing === true
    ? `${basename(root) || root} (containing repository)`
    : relativePath === '.' ? '(workspace root)' : relativePath
  return { target, relativePath, label, root }
}

/** Bounded filesystem discovery. Git runs only for real .git file/dir candidates. */
export async function scanRepositories(base, { repoRoot, limits = DISCOVERY_LIMITS, now = Date.now, deadline = now() + limits.milliseconds } = {}) {
  const repositories = []
  const warnings = []
  const roots = new Set()
  let truncated = false
  let visited = 0
  const pending = [{ path: base, depth: 0 }]
  const warn = message => {
    const text = message.slice(0, 1000)
    if (warnings.length < 100 && !warnings.includes(text)) warnings.push(text)
  }
  const timedOut = () => {
    if (now() < deadline) return false
    truncated = true
    warn('Repository discovery reached its time limit; results are partial.')
    return true
  }
  while (pending.length > 0) {
    if (timedOut()) break
    if (visited >= limits.directories) {
      truncated = true
      warn('Repository discovery reached its directory limit; results are partial.')
      break
    }
    const { path, depth } = pending.shift()
    visited++
    try {
      // A child replaced by a symlink after enumeration is still never followed.
      if (!(await lstat(path)).isDirectory()) continue
      const canonical = await directory(path)
      if (!isContained(base, canonical)) continue
      if (timedOut()) break
      let marker
      try { marker = await lstat(join(path, '.git')) } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      if (timedOut()) break
      if (marker?.isFile() || marker?.isDirectory()) {
        try {
          const root = await repoRoot(canonical, { timeout: Math.max(1, deadline - now()) })
          if (root === canonical && !roots.has(root)) {
            roots.add(root)
            repositories.push(root)
          } else if (root !== canonical) {
            warn(`Ignored non-root Git candidate: ${relative(base, path) || '.'}`)
          }
        } catch (error) {
          warn(`Cannot read Git candidate ${relative(base, path) || '.'}: ${error.message}`)
        }
      }
      if (timedOut()) break
      // Stream entries instead of allocating an unbounded readdir array.
      const dir = await opendir(path)
      try {
        for await (const child of dir) {
          if (timedOut()) break
          if (!child.isDirectory() || child.isSymbolicLink() || SKIP.has(child.name)) continue
          if (depth >= limits.depth) {
            truncated = true
            warn('Repository discovery reached its depth limit; results are partial.')
            continue
          }
          if (visited + pending.length >= limits.directories) {
            truncated = true
            warn('Repository discovery reached its directory limit; results are partial.')
            // Stop this directory's enumeration, but visit already queued paths.
            break
          }
          pending.push({ path: join(path, child.name), depth: depth + 1 })
        }
      } finally {
        // for-await closes on completion/break; close only if it never did.
        try { await dir.close() } catch (error) { if (error.code !== 'ERR_DIR_CLOSED') throw error }
      }
    } catch (error) {
      warn(`Cannot scan ${relative(base, path) || '.'}: ${error.message}`)
    }
  }
  return { roots: repositories.sort(), warnings, truncated }
}

/** All roots for POST and SSE are resolved here, never from browser absolute paths. */
export function createRepositoryAccess({ repoRoot, sessionCwd, limits = DISCOVERY_LIMITS, now = Date.now, levelLimits = LEVEL_LIMITS, levelFs = { lstat, realpath, opendir } }) {
  const cache = new Map()
  const inFlight = new Map()
  const waiting = []
  let active = 0
  async function limited(task) {
    if (active >= limits.concurrent) await new Promise(resolve => waiting.push(resolve))
    else active++
    try { return await task() } finally {
      // Transfer the occupied slot directly, so new requests cannot overtake it.
      const next = waiting.shift()
      if (next) next()
      else active--
    }
  }
  function requireSession(ctx, sessionId) {
    const cwd = sessionCwd(ctx, sessionId)
    if (cwd === undefined) throw fail('unknown or expired Session; no workspace to read')
    return cwd
  }
  function workspace(ctx, id) {
    if (typeof id !== 'string' || id.length === 0) throw fail('invalid workspace id')
    const registry = ctx.get('workspaceRegistry')
    const found = registry?.get(id)
    if (!found) throw fail('unknown or removed workspace')
    return found
  }
  async function containing(cwd, options) {
    try {
      const root = await repoRoot(cwd, options)
      return isContained(root, cwd) ? root : null
    } catch { return null }
  }
  function containingEntry(root, cwd) {
    return entry(root, cwd, { session: true, containing: true })
  }
  async function workspaces(ctx, request) {
    const cwd = await directory(requireSession(ctx, request.sessionId))
    const groups = (ctx.get('workspaceRegistry')?.list() ?? []).map(group => ({
      id: group.id, title: group.title, path: group.path, current: false,
    }))
    let current
    let currentPath
    for (const group of groups) {
      let path
      try { path = await directory(group.path) } catch { continue }
      if (isContained(path, cwd) && (!current || path.length > currentPath.length)) {
        current = group
        currentPath = path
      }
    }
    if (!current) {
      current = { id: SESSION_GROUP_ID, title: basename(cwd) || cwd, path: cwd, current: true, session: true }
      groups.unshift(current)
    }
    current.current = true
    const root = await containing(cwd, { timeout: limits.milliseconds })
    return { groups, currentGroupId: current.id, containing: root ? containingEntry(root, cwd) : null }
  }
  async function cachedScan(base, cwd, refresh) {
    const key = JSON.stringify([base, cwd])
    const cached = cache.get(key)
    if (!refresh && cached && now() - cached.at < limits.cacheMilliseconds) return cached.result
    if (inFlight.has(key)) return inFlight.get(key)
    const promise = limited(async () => {
      const deadline = now() + limits.milliseconds
      const root = cwd ? await containing(cwd, { timeout: Math.max(1, deadline - now()) }) : null
      const result = await scanRepositories(base, { repoRoot, limits, now, deadline })
      result.containing = root
      cache.delete(key)
      cache.set(key, { at: now(), result })
      // Completed caches are short lived and bounded even across many workspaces.
      for (const [id, item] of cache) if (now() - item.at >= limits.cacheMilliseconds) cache.delete(id)
      while (cache.size > 128) cache.delete(cache.keys().next().value)
      return result
    }).finally(() => inFlight.delete(key))
    inFlight.set(key, promise)
    return promise
  }
  async function repositories(ctx, request) {
    const registered = request.workspaceId !== undefined
    const group = registered ? workspace(ctx, request.workspaceId) : null
    const base = await directory(group ? group.path : requireSession(ctx, request.sessionId))
    let cwd = sessionCwd(ctx, request.sessionId)
    try { cwd = cwd ? await directory(cwd) : null } catch { cwd = null }
    // A cross-workspace browse needs no session in the selected workspace.
    const local = !registered || (cwd !== null && isContained(base, cwd))
    const result = await cachedScan(base, local ? cwd : null, request.refresh === true)
    const repositories = result.roots.map(root => {
      const path = relative(base, root).split(sep).join('/') || '.'
      return entry(root, base, registered ? { workspaceId: group.id, path } : { session: true, path })
    })
    if (result.containing && !isContained(base, result.containing)) {
      repositories.unshift(containingEntry(result.containing, cwd))
    }
    return { repositories, warnings: [...result.warnings], truncated: result.truncated }
  }
  const levelCache = new Map()
  const levelInFlight = new Map()
  const levelWaiting = []
  let levelActive = 0
  const identity = stat => `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`
  async function levelDirectory(path) {
    const canonical = await levelFs.realpath(path)
    const stat = await levelFs.lstat(canonical)
    if (!stat.isDirectory()) throw fail('requested path is not a directory')
    return { canonical, identity: identity(stat) }
  }
  async function levelSelection(ctx, request, path) {
    const registered = request.workspaceId !== undefined
    const source = registered ? workspace(ctx, request.workspaceId).path : requireSession(ctx, request.sessionId)
    const base = (await levelDirectory(source)).canonical
    const selected = await levelDirectory(join(base, path))
    if (!isContained(base, selected.canonical)) throw fail('repository target escapes its workspace')
    // The registry/session can disappear while realpath is awaiting I/O.
    const liveSource = registered ? workspace(ctx, request.workspaceId).path : requireSession(ctx, request.sessionId)
    if (liveSource !== source) throw fail('workspace directory changed; retry this level')
    return { base, ...selected }
  }
  function sameSelection(before, after) {
    if (before.base !== after.base || before.canonical !== after.canonical || before.identity !== after.identity) {
      throw fail('requested directory changed; retry this level')
    }
  }
  async function limitedLevel(task) {
    // Two whole levels, each with at most one filesystem/Git probe in flight.
    if (levelActive >= LEVEL_LIMITS.concurrent) await new Promise(resolve => levelWaiting.push(resolve))
    else levelActive++
    try { return await task() } finally {
      const next = levelWaiting.shift()
      if (next) next()
      else levelActive--
    }
  }
  function rememberLevel(key, result) {
    levelCache.delete(key)
    levelCache.set(key, { at: now(), result })
    let nodes = 0
    for (const [id, item] of levelCache) {
      if (now() - item.at >= levelLimits.cacheMilliseconds) levelCache.delete(id)
      else nodes += 1 + item.result.children.length
    }
    while (levelCache.size > levelLimits.cacheLevels || nodes > levelLimits.cacheNodes) {
      const id = levelCache.keys().next().value
      nodes -= 1 + levelCache.get(id).result.children.length
      levelCache.delete(id)
    }
  }
  async function readLevel(selection, includeChildren) {
    const { base, canonical } = selection
    const deadline = now() + levelLimits.milliseconds
    const checkTime = () => {
      if (now() >= deadline) throw fail('directory level exceeded its time limit; retry or open a smaller directory')
    }
    async function inspect(path) {
      checkTime()
      // Revalidate each immediate child before touching its .git. A dirent is
      // not authority if the child was replaced by a symlink after enumeration.
      const stat = await levelFs.lstat(path)
      if (!stat.isDirectory() || stat.isSymbolicLink()) return null
      const resolved = await levelFs.realpath(path)
      if (resolved !== path || !isContained(base, resolved)) return null
      if (!(await levelFs.lstat(path)).isDirectory()) return null
      checkTime()
      let marker
      try { marker = await levelFs.lstat(join(path, '.git')) } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      checkTime()
      let root = null
      if (marker?.isFile() || marker?.isDirectory()) {
        // Sequential probes and the remaining whole-level timeout bound even
        // directories containing thousands of Git candidates.
        const found = await repoRoot(path, { timeout: Math.max(1, deadline - now()) })
        checkTime()
        if (found === path && isContained(base, found)) root = found
      }
      return { directory: path, root }
    }
    const node = await inspect(canonical)
    if (!node) throw fail('requested directory changed; retry this level')
    const children = []
    if (includeChildren) {
      checkTime()
      const dir = await levelFs.opendir(canonical)
      let entries = 0
      try {
        for await (const child of dir) {
          checkTime()
          if (++entries > levelLimits.entries) throw fail('directory level has too many entries; open a smaller directory')
          if (!child.isDirectory() || child.isSymbolicLink() || SKIP.has(child.name)) continue
          if (children.length >= levelLimits.directories) throw fail('directory level has too many child directories; open a smaller directory')
          const item = await inspect(join(canonical, child.name))
          if (item) children.push(item)
        }
      } finally {
        try { await dir.close() } catch (error) { if (error.code !== 'ERR_DIR_CLOSED') throw error }
      }
      children.sort((a, b) => a.directory < b.directory ? -1 : a.directory > b.directory ? 1 : 0)
    }
    checkTime()
    return { node, children }
  }
  /** Read exactly one directory; root-only calls never enumerate or probe children. */
  async function repositoryLevel(ctx, request) {
    if (typeof request.sessionId !== 'string' || request.sessionId.length === 0) throw fail('sessionId is required')
    const path = relativeTarget(request.path === undefined ? '.' : request.path)
    for (const key of ['includeChildren', 'refresh']) {
      if (request[key] !== undefined && typeof request[key] !== 'boolean') throw fail(`${key} must be a boolean`)
    }
    const includeChildren = request.includeChildren === true
    let selected
    let result
    try {
      // Validation precedes *every* cache/in-flight lookup, never just a miss.
      selected = await levelSelection(ctx, request, path)
      const key = JSON.stringify([selected.base, selected.canonical, selected.identity, includeChildren])
      if (request.refresh === true) levelCache.delete(key)
      const cached = levelCache.get(key)
      let pending = levelInFlight.get(key)
      if (!pending && cached && now() - cached.at < levelLimits.cacheMilliseconds) result = cached.result
      else {
        if (!pending) {
          if (levelInFlight.size >= levelLimits.pending) throw fail('repository level reader is busy; retry shortly')
          pending = limitedLevel(async () => {
            sameSelection(selected, await levelSelection(ctx, request, path))
            const value = await readLevel(selected, includeChildren)
            sameSelection(selected, await levelSelection(ctx, request, path))
            rememberLevel(key, value)
            return value
          }).finally(() => levelInFlight.delete(key))
          levelInFlight.set(key, pending)
        }
        result = await pending
      }
      // Coalesced callers have their own live workspace/session boundary.
      sameSelection(selected, await levelSelection(ctx, request, path))
    } catch (error) {
      throw fail(`cannot read directory level ${JSON.stringify(path)}: ${error.message}`)
    }
    const shape = item => {
      const relativePath = relative(selected.base, item.directory).split(sep).join('/') || '.'
      const target = request.workspaceId !== undefined
        ? { workspaceId: request.workspaceId, path: relativePath }
        : { session: true, path: relativePath }
      return {
        path: relativePath,
        label: basename(item.directory) || item.directory,
        repository: item.root ? entry(item.root, selected.base, target) : null,
      }
    }
    return { node: shape(result.node), children: result.children.map(shape) }
  }
  async function resolveRoot(ctx, request) {
    const target = request.target
    if (target === undefined) return repoRoot(requireSession(ctx, request.sessionId))
    if (!target || typeof target !== 'object' || Array.isArray(target)) throw fail('invalid repository target')
    const registered = typeof target.workspaceId === 'string'
    const session = target.session === true
    if (registered === session) throw fail('repository target must name exactly one workspace or session')
    const keys = Object.keys(target)
    if (keys.some(key => !['workspaceId', 'session', 'path', 'containing'].includes(key)) ||
        (registered && ('session' in target || 'containing' in target)) ||
        (session && 'workspaceId' in target)) throw fail('invalid repository target')
    if (session && target.containing === true) {
      if ('path' in target || keys.length !== 2) throw fail('invalid containing repository target')
      const cwd = await directory(requireSession(ctx, request.sessionId))
      const root = await repoRoot(cwd)
      if (!isContained(root, cwd)) throw fail('invalid containing repository root')
      return root
    }
    if ('containing' in target) throw fail('invalid containing repository target')
    const path = relativeTarget(target.path)
    const base = await directory(registered ? workspace(ctx, target.workspaceId).path : requireSession(ctx, request.sessionId))
    const candidate = await directory(join(base, path))
    if (!isContained(base, candidate)) throw fail('repository target escapes its workspace')
    const root = await repoRoot(candidate)
    if (root !== candidate) throw fail('repository target must name an exact Git root')
    // Recheck canonical containment after Git, too. Never silently resolve a
    // subdirectory to a parent repository outside the selected workspace.
    if (!isContained(base, root)) throw fail('repository root escapes its workspace')
    return root
  }
  return { workspaces, repositories, repositoryLevel, resolveRoot }
}
