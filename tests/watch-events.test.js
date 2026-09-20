import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { internals } from '../lib/index.js'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/** A stand-in for an open server-sent-event response. */
function fakeStream() {
  return {
    writableEnded: false,
    destroyed: false,
    written: '',
    write(chunk) { this.written += chunk; return true },
    events() { return [...this.written.matchAll(/^event: (\w+)$/gm)].map(match => match[1]) },
  }
}

function tempRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'gg-watch-'))
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
  git('init', '-q')
  git('config', 'user.name', 'Watch Test')
  git('config', 'user.email', 'watch@example.invalid')
  writeFileSync(join(dir, 'a.txt'), 'one\n')
  git('add', '.')
  git('commit', '-qm', 'Base')
  git('branch', '-M', 'main')
  return { dir, git }
}

test('only a ref-worthy path inside the Git directory wakes the browser', () => {
  for (const path of ['HEAD', 'index', 'packed-refs', 'config', 'ORIG_HEAD', 'MERGE_HEAD', 'FETCH_HEAD', 'refs/heads/main', 'refs/remotes/origin/main', 'refs/tags/v1', 'refs/stash']) {
    assert.equal(internals.isRefChange(path), true, `${path} must be watched`)
  }
  for (const path of ['', 'objects/ab/cdef', 'objects/pack/pack-1.idx', 'logs/HEAD', 'logs/refs/heads/main', 'hooks/pre-commit', 'index.lock.tmp/ignored?']) {
    assert.equal(internals.isRefChange(path), false, `${path} must not be watched`)
  }
  // Windows separators arrive as backslashes from fs.watch.
  assert.equal(internals.isRefChange('refs\\heads\\main'), true)
  assert.equal(internals.isRefChange('objects\\ab'), false)
  assert.equal(internals.isRefChange(undefined), false)
})

test('a commit on disk becomes exactly one pushed change, and the watch stops with its last stream', async () => {
  const { dir, git } = tempRepo()
  const path = await internals.gitDir(dir)
  const stream = fakeStream()
  try {
    internals.addWatchClient(path, stream)
    assert.deepEqual(internals.watchedDirectories(), [path])
    await sleep(400)
    assert.deepEqual(stream.events(), [], 'nothing is pushed before the repository changes')

    git('commit', '-q', '--allow-empty', '-m', 'probe')
    await sleep(1800)
    assert.deepEqual(stream.events(), ['changed'], 'one burst of file events collapses into one push')

    git('checkout', '-q', '-b', 'topic')
    await sleep(1800)
    assert.deepEqual(stream.events(), ['changed', 'changed'], 'a branch switch pushes again')
  } finally {
    internals.removeWatchClient(stream)
    rmSync(dir, { recursive: true, force: true })
  }
  assert.deepEqual(internals.watchedDirectories(), [], 'the watcher is gone once nobody listens')
})

test('two streams share one watcher, and it outlives the first of them', async () => {
  const { dir, git } = tempRepo()
  const path = await internals.gitDir(dir)
  const first = fakeStream()
  const second = fakeStream()
  try {
    internals.addWatchClient(path, first)
    internals.addWatchClient(path, second)
    assert.deepEqual(internals.watchedDirectories(), [path], 'one directory is watched once, not once per stream')

    internals.removeWatchClient(first)
    assert.deepEqual(internals.watchedDirectories(), [path], 'the second stream keeps the watch alive')

    git('commit', '-q', '--allow-empty', '-m', 'shared')
    await sleep(1800)
    assert.deepEqual(first.events(), [], 'a closed stream is not written to')
    assert.deepEqual(second.events(), ['changed'])
  } finally {
    internals.removeWatchClient(first)
    internals.removeWatchClient(second)
    rmSync(dir, { recursive: true, force: true })
  }
  assert.deepEqual(internals.watchedDirectories(), [])
})

test('a linked worktree is watched through the Git directory git names', async () => {
  const { dir, git } = tempRepo()
  const linked = join(dir, '..', `linked-${process.pid}`)
  try {
    execFileSync('git', ['worktree', 'add', '-q', '--detach', linked], { cwd: dir, encoding: 'utf8' })
    const linkedDir = await internals.gitDir(linked)
    assert.notEqual(linkedDir, await internals.gitDir(dir), 'a linked worktree has its own Git directory')
    assert.ok(linkedDir.includes('worktrees'), `expected a worktrees path, got ${linkedDir}`)
  } finally {
    rmSync(linked, { recursive: true, force: true })
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a directory that is not a repository is refused rather than watched', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gg-watch-bare-'))
  try {
    await assert.rejects(() => internals.gitDir(dir))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('staging a file is a change, and so is an unstaged edit to the index', async () => {
  const { dir, git } = tempRepo()
  const path = await internals.gitDir(dir)
  const stream = fakeStream()
  try {
    internals.addWatchClient(path, stream)
    await sleep(400)
    writeFileSync(join(dir, 'a.txt'), 'two\n')
    mkdirSync(join(dir, 'nested'), { recursive: true })
    writeFileSync(join(dir, 'nested/b.txt'), 'b\n')
    git('add', '-A')
    await sleep(1800)
    assert.deepEqual(stream.events(), ['changed'], 'staging pushes exactly once')
  } finally {
    internals.removeWatchClient(stream)
    rmSync(dir, { recursive: true, force: true })
  }
})
