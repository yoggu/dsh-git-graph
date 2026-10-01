import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { internals, EVENTS_PATH } from '../lib/index.js'

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
const settle = () => new Promise(resolve => setTimeout(resolve, 1300))

function fixture(t) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'gg-worktree-watch-')))
  t.after(() => {
    assert.equal(resolve(base), base)
    assert.ok(base.startsWith(join(realpathSync(tmpdir()), 'gg-worktree-watch-')))
    rmSync(base, { recursive: true, force: true })
  })
  const main = join(base, 'main')
  const linked = join(base, 'linked')
  mkdirSync(main)
  git(main, 'init', '-q', '-b', 'main')
  git(main, 'config', 'user.name', 'Worktree Watch Test')
  git(main, 'config', 'user.email', 'worktree-watch@example.invalid')
  writeFileSync(join(main, 'tracked.txt'), 'one\n')
  git(main, 'add', '.')
  git(main, 'commit', '-qm', 'Initial')
  git(main, 'worktree', 'add', '-q', '-b', 'linked-topic', linked)
  return { main, linked }
}

async function watch(ctx, sessionId) {
  const abort = new AbortController()
  const stream = await internals.openEvents(ctx, new Request(`http://localhost${EVENTS_PATH}?sessionId=${sessionId}`, { signal: abort.signal }))
  const reader = stream.body.getReader()
  let written = ''
  const drain = (async () => {
    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      written += decoder.decode(value)
    }
  })()
  return {
    changes: () => [...written.matchAll(/^event: changed$/gm)].length,
    close: async () => { abort.abort(); await drain; await reader.cancel() },
  }
}

test('linked worktree SSE watches private state and common refs, coalesces commits, and cleans both groups', { timeout: 10_000 }, async t => {
  const { main, linked } = fixture(t)
  const sessions = new Map([
    ['main', { header: { cwd: main } }],
    ['linked', { header: { cwd: linked } }],
  ])
  const ctx = { get: name => name === 'sessions' ? sessions : undefined }
  const common = await internals.gitDir(main)
  const privateDir = await internals.gitDir(linked)
  assert.deepEqual(await internals.gitWatchDirs(main), [common])
  assert.deepEqual(await internals.gitWatchDirs(linked), [privateDir, common])
  const linkedWatch = await watch(ctx, 'linked')
  const mainWatch = await watch(ctx, 'main')
  try {
    assert.deepEqual(new Set(internals.watchedDirectories()), new Set([privateDir, common]))
    git(main, 'branch', 'shared-ref')
    await settle()
    assert.equal(linkedWatch.changes(), 1, 'a common ref changing in another worktree wakes the linked graph')

    writeFileSync(join(linked, 'tracked.txt'), 'two\n')
    git(linked, 'add', 'tracked.txt')
    await settle()
    assert.equal(linkedWatch.changes(), 2, 'private worktree index changes remain observable')

    git(linked, 'commit', '-qm', 'Worktree commit')
    await settle()
    assert.equal(linkedWatch.changes(), 3, 'private HEAD/index and shared refs coalesce into one event')
    await linkedWatch.close()
    assert.deepEqual(internals.watchedDirectories(), [common], 'main stream keeps only the shared group alive')
    await mainWatch.close()
    assert.deepEqual(internals.watchedDirectories(), [], 'last stream closes every watcher')
  } finally {
    await linkedWatch.close()
    await mainWatch.close()
  }
})

test('canceling a linked worktree SSE body releases both canonical metadata watchers', async t => {
  const { linked } = fixture(t)
  const ctx = { get: name => name === 'sessions' ? new Map([['linked', { header: { cwd: linked } }]]) : undefined }
  const stream = await internals.openEvents(ctx, new Request(`http://localhost${EVENTS_PATH}?sessionId=linked`))
  assert.equal(internals.watchedDirectories().length, 2)
  await stream.body.cancel()
  assert.deepEqual(internals.watchedDirectories(), [])
})
