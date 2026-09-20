import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { internals } from '../lib/index.js'

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

/** A working repository whose `origin` is a bare repository on disk — no network. */
function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'gg-fetch-'))
  const remote = join(base, 'remote.git')
  const work = join(base, 'work')
  execFileSync('git', ['init', '-q', '--bare', remote])
  execFileSync('git', ['init', '-q', '-b', 'main', work])
  git(work, 'config', 'user.name', 'Fetch Test')
  git(work, 'config', 'user.email', 'fetch@example.invalid')
  writeFileSync(join(work, 'a.txt'), 'one\n')
  git(work, 'add', '.')
  git(work, 'commit', '-qm', 'Base')
  git(work, 'remote', 'add', 'origin', remote)
  git(work, 'push', '-q', '-u', 'origin', 'main')
  return { base, remote, work, cleanup: () => rmSync(base, { recursive: true, force: true }) }
}

const ref = (name, target = 'x') => ({ name: `refs/remotes/${name}`, target, kind: 'remote', isHead: false })
const wrap = (...refs) => ({ refs, remotes: ['origin'] })

test('the ref comparison names what a fetch changed about the remote', () => {
  const before = wrap(ref('origin/main', 'a'), ref('origin/old', 'b'), ref('origin/moved', 'c'), ref('origin/tag-ish', 'd'))
  const after = wrap(ref('origin/main', 'a'), ref('origin/moved', 'z'), ref('origin/new', 'e'), ref('origin/tag-ish', 'd'))
  assert.deepEqual(internals.diffRemoteRefs(before, after), {
    added: ['origin/new'],
    updated: ['origin/moved'],
    pruned: ['origin/old'],
  })
  assert.deepEqual(internals.diffRemoteRefs(before, before), { added: [], updated: [], pruned: [] })
  // Local branches and tags are not the remote's business.
  const withLocal = { refs: [ref('origin/main', 'a'), { name: 'refs/heads/main', target: 'zzz', kind: 'branch' }], remotes: ['origin'] }
  assert.deepEqual(internals.diffRemoteRefs(wrap(ref('origin/main', 'a')), withLocal), { added: [], updated: [], pruned: [] })
})

test('a repository without a remote is reported, not fetched', async () => {
  const base = mkdtempSync(join(tmpdir(), 'gg-fetch-none-'))
  try {
    execFileSync('git', ['init', '-q', base])
    const result = await internals.fetchRemotes(base)
    assert.deepEqual(result.remotes, [])
    assert.equal(result.skipped, 'no remote is configured')
    assert.deepEqual(result.added, [])
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('fetching discovers a branch that only exists on the remote', async () => {
  const { work, remote, cleanup } = fixture()
  try {
    // A second clone pushes a branch the first working copy has never seen.
    const other = join(work, '..', 'other')
    execFileSync('git', ['clone', '-q', remote, other])
    git(other, 'config', 'user.name', 'Other')
    git(other, 'config', 'user.email', 'other@example.invalid')
    git(other, 'checkout', '-q', '-b', 'feature/remote-only')
    writeFileSync(join(other, 'b.txt'), 'two\n')
    git(other, 'add', '.')
    git(other, 'commit', '-qm', 'Remote only')
    git(other, 'push', '-q', '-u', 'origin', 'feature/remote-only')

    assert.equal(git(work, 'for-each-ref', '--format=%(refname)', 'refs/remotes').includes('feature/remote-only'), false, 'the branch is unknown before the fetch')

    const result = await internals.fetchRemotes(work)
    assert.deepEqual(result.remotes, ['origin'])
    assert.ok(result.added.includes('origin/feature/remote-only'), `expected the new branch, got ${JSON.stringify(result.added)}`)
    assert.equal(result.error, undefined)
    assert.equal(git(work, 'for-each-ref', '--format=%(refname)', 'refs/remotes').includes('refs/remotes/origin/feature/remote-only'), true)
    // A fetch is not a merge: the working tree and HEAD are untouched.
    assert.equal(git(work, 'rev-parse', '--abbrev-ref', 'HEAD'), 'main')
    assert.equal(git(work, 'status', '--porcelain'), '')
  } finally {
    cleanup()
  }
})

test('a moved remote branch is reported as updated, and pruning removes what is gone', async () => {
  const { work, remote, cleanup } = fixture()
  try {
    const other = join(work, '..', 'other')
    execFileSync('git', ['clone', '-q', remote, other])
    git(other, 'config', 'user.name', 'Other')
    git(other, 'config', 'user.email', 'other@example.invalid')
    git(other, 'checkout', '-q', '-b', 'gone')
    writeFileSync(join(other, 'gone.txt'), 'gone\n')
    git(other, 'add', '.')
    git(other, 'commit', '-qm', 'Gone branch')
    git(other, 'push', '-q', '-u', 'origin', 'gone')
    await internals.fetchRemotes(work)
    assert.ok(git(work, 'for-each-ref', '--format=%(refname)', 'refs/remotes').includes('refs/remotes/origin/gone'))

    // The remote branch disappears, and the remote's main moves on.
    git(other, 'checkout', '-q', 'main')
    git(other, 'push', '-q', 'origin', '--delete', 'gone')
    writeFileSync(join(other, 'c.txt'), 'three\n')
    git(other, 'add', '.')
    git(other, 'commit', '-qm', 'Moved on')
    git(other, 'push', '-q', 'origin', 'main')

    const plain = await internals.fetchRemotes(work)
    assert.ok(plain.updated.includes('origin/main'), `expected origin/main to move, got ${JSON.stringify(plain.updated)}`)
    assert.deepEqual(plain.pruned, [], 'without pruning the stale ref stays behind')
    assert.deepEqual(plain.added, [])

    const pruned = await internals.fetchRemotes(work, { prune: true })
    assert.deepEqual(pruned.pruned, ['origin/gone'])
  } finally {
    cleanup()
  }
})

test('an unreachable remote reports itself instead of hanging', async () => {
  const { work, cleanup } = fixture()
  try {
    git(work, 'remote', 'set-url', 'origin', join(work, '..', 'does-not-exist.git'))
    const result = await internals.fetchRemotes(work)
    assert.ok(typeof result.error === 'string' && result.error.length > 0, 'the failure is reported')
    assert.deepEqual(result.added, [])
    assert.deepEqual(result.remotes, ['origin'], 'the configured remote is still named')
  } finally {
    cleanup()
  }
})
