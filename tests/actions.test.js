import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { internals } from '../lib/index.js'

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

/** A repository with one commit on `main`. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'gg-actions-'))
  execFileSync('git', ['init', '-q', '-b', 'main', root])
  git(root, 'config', 'user.name', 'Action Test')
  git(root, 'config', 'user.email', 'actions@example.invalid')
  writeFileSync(join(root, 'a.txt'), 'one\n')
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'Base')
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

const planOf = (root, action, params = {}) => internals.planAction(root, { action, params })
const argvOf = async (root, action, params = {}) => (await planOf(root, action, params)).argv

test('a write is planned as the exact argument list git will receive', async () => {
  const { root, cleanup } = fixture()
  try {
    assert.deepEqual(await argvOf(root, 'branch.checkout', { name: 'main' }), ['checkout', 'main'])
    assert.deepEqual(await argvOf(root, 'branch.create', { name: 'topic', checkout: true }),
      ['checkout', '-b', 'topic'])
    assert.deepEqual(await argvOf(root, 'branch.create', { name: 'topic', startPoint: 'main' }),
      ['branch', 'topic', 'main'])
    assert.deepEqual(await argvOf(root, 'branch.delete', { name: 'topic', force: true }),
      ['branch', '-D', 'topic'])
    assert.deepEqual(await argvOf(root, 'branch.reset', { to: 'main', mode: 'hard' }),
      ['reset', '--hard', 'main'])
    assert.deepEqual(await argvOf(root, 'commit.cherryPick', { hash: 'a'.repeat(40), noCommit: true }),
      ['cherry-pick', '--no-commit', 'a'.repeat(40)])
    assert.deepEqual(await argvOf(root, 'stash.drop', { index: 2 }), ['stash', 'drop', 'stash@{2}'])
    assert.deepEqual(await argvOf(root, 'working.clean', { directories: true, ignored: true }),
      ['clean', '-f', '-d', '-x'])
    assert.deepEqual(await argvOf(root, 'working.discard', { paths: ['a.txt'] }),
      ['checkout', '--', 'a.txt'])
    assert.deepEqual(await argvOf(root, 'working.discard', { paths: ['a.txt'], source: 'head' }),
      ['checkout', 'HEAD', '--', 'a.txt'])
  } finally {
    cleanup()
  }
})

test('a message travels as one argument so a leading dash stays text', async () => {
  const { root, cleanup } = fixture()
  try {
    assert.deepEqual(await argvOf(root, 'tag.add', { name: 'v1', message: '-not-an-option' }),
      ['tag', '-a', '--message=-not-an-option', 'v1'])
    // Without a message a tag stays lightweight, which is what git does by default.
    assert.deepEqual(await argvOf(root, 'tag.add', { name: 'v1' }), ['tag', 'v1'])
    assert.deepEqual(await argvOf(root, 'branch.merge', { name: 'main', message: 'x' }),
      ['merge', '--message=x', 'main'])
  } finally {
    cleanup()
  }
})

test('a force push leases rather than overrides', async () => {
  const { root, cleanup } = fixture()
  try {
    git(root, 'remote', 'add', 'origin', 'https://example.invalid/repo.git')
    assert.deepEqual(await argvOf(root, 'branch.push', { remote: 'origin', branch: 'main', force: true }),
      ['push', '--force-with-lease', 'origin', 'main'])
    // A remote that is not configured never reaches the argument list.
    await assert.rejects(() => argvOf(root, 'branch.push', { remote: '-oProxyCommand=sh', branch: 'main' }),
      /not a configured remote/)
  } finally {
    cleanup()
  }
})

test('caller text never reaches git in an argument position', async () => {
  const { root, cleanup } = fixture()
  try {
    await assert.rejects(() => argvOf(root, 'branch.checkout', { name: '--upload-pack=touch /tmp/pwned' }),
      /refusing branch name/)
    await assert.rejects(() => argvOf(root, 'branch.create', { name: 'topic..main' }), /not a valid branch/)
    await assert.rejects(() => argvOf(root, 'branch.create', { name: 'topic@{1}' }), /refusing branch name/)
    await assert.rejects(() => argvOf(root, 'working.discard', { paths: ['/etc/passwd'] }), /must be relative/)
    await assert.rejects(() => argvOf(root, 'working.discard', { paths: ['../../etc/passwd'] }),
      /must stay inside the repository/)
    await assert.rejects(() => argvOf(root, 'branch.reset', { to: 'main', mode: 'hard; rm -rf /' }),
      /reset mode must be one of/)
    await assert.rejects(() => argvOf(root, 'stash.drop', { index: -1 }), /stash index/)
    await assert.rejects(() => argvOf(root, 'nothing.at.all', {}), /unknown action/)
    await assert.rejects(() => argvOf(root, 'commit.revert', { hash: 'HEAD' }), /refusing commit/)
  } finally {
    cleanup()
  }
})

test('a checkout really moves the branch, and a dirty tree is reported before it does', async () => {
  const { root, cleanup } = fixture()
  try {
    await internals.runAction(root, { action: 'branch.create', params: { name: 'topic' } })
    assert.equal(git(root, 'rev-parse', '--abbrev-ref', 'HEAD'), 'main')

    const result = await internals.runAction(root, { action: 'branch.checkout', params: { name: 'topic' } })
    assert.equal(git(root, 'rev-parse', '--abbrev-ref', 'HEAD'), 'topic')
    assert.equal(result.before.branch, 'main')
    assert.equal(result.after.branch, 'topic')
    assert.equal(result.movedBranch, true)

    writeFileSync(join(root, 'a.txt'), 'two\n')
    const state = await internals.repositoryState(root)
    assert.equal(state.dirty, true)
    assert.equal(state.busy, false)

    const plan = await planOf(root, 'branch.merge', { name: 'main' })
    assert.deepEqual(internals.warningsFor(plan, state), [
      'The working tree has 1 uncommitted change.',
    ])
  } finally {
    cleanup()
  }
})

test('a conflicted merge leaves the repository busy, and the way out is allowed', async () => {
  const { root, cleanup } = fixture()
  try {
    await internals.runAction(root, { action: 'branch.create', params: { name: 'feature', checkout: true } })
    writeFileSync(join(root, 'a.txt'), 'feature\n')
    git(root, 'commit', '-qam', 'Feature change')
    await internals.runAction(root, { action: 'branch.checkout', params: { name: 'main' } })
    writeFileSync(join(root, 'a.txt'), 'main\n')
    git(root, 'commit', '-qam', 'Main change')

    await assert.rejects(
      () => internals.runAction(root, { action: 'branch.merge', params: { name: 'feature' } }),
      /CONFLICT|conflict|Automatic merge failed/,
    )

    const state = await internals.repositoryState(root)
    assert.equal(state.operation, 'merge')
    assert.equal(state.busy, true)
    assert.deepEqual(state.conflicts, ['a.txt'])

    // Everything except the way out is refused, and the refusal names the
    // operation rather than leaving a reader to guess.
    const blocked = await planOf(root, 'branch.checkout', { name: 'feature' })
    assert.throws(() => internals.assertActionAllowed(blocked, state), /merge is in progress/)
    // A cherry-pick continue while a merge runs would fail inside git with a
    // message about the wrong marker, so it is refused by name here.
    const mismatched = await planOf(root, 'cherryPick.continue', {})
    assert.throws(() => internals.assertActionAllowed(mismatched, state), /does not belong to the merge/)

    const abort = await planOf(root, 'merge.abort', {})
    internals.assertActionAllowed(abort, state)
    await internals.runAction(root, { action: 'merge.abort', params: {} })
    assert.equal((await internals.repositoryState(root)).operation, null)
    assert.equal(git(root, 'status', '--porcelain'), '')
  } finally {
    cleanup()
  }
})

test('a lock held by another git process stops every write, and says which file', async () => {
  const { root, cleanup } = fixture()
  try {
    writeFileSync(join(root, '.git', 'index.lock'), '')
    const state = await internals.repositoryState(root)
    assert.equal(state.locked, true)
    assert.match(state.lockPath, /index\.lock$/)
    const plan = await planOf(root, 'branch.checkout', { name: 'main' })
    assert.throws(() => internals.assertActionAllowed(plan, state), /another Git process is writing/)
  } finally {
    cleanup()
  }
})

test('stashing and popping really round-trips a working-tree change', async () => {
  const { root, cleanup } = fixture()
  try {
    writeFileSync(join(root, 'a.txt'), 'changed\n')
    await internals.runAction(root, { action: 'working.stash', params: { message: 'wip' } })
    assert.equal(git(root, 'status', '--porcelain'), '')
    assert.match(git(root, 'stash', 'list'), /wip/)

    await internals.runAction(root, { action: 'stash.pop', params: { index: 0 } })
    assert.equal(git(root, 'status', '--porcelain'), 'M a.txt')
    assert.equal(git(root, 'stash', 'list'), '')
  } finally {
    cleanup()
  }
})

test('an action git refuses is reported in git own words, and changes nothing', async () => {
  const { root, cleanup } = fixture()
  try {
    // `clean` removes what git does not track, so a modified tracked file is
    // left alone and the command succeeds having done nothing.
    writeFileSync(join(root, 'a.txt'), 'uncommitted\n')
    writeFileSync(join(root, 'junk.txt'), 'untracked\n')
    await internals.runAction(root, { action: 'working.clean', params: {} })
    assert.equal(git(root, 'status', '--porcelain'), 'M a.txt')

    // A refusal carries git's own words rather than Node's "Command failed".
    let failing = null
    await assert.rejects(
      () => internals.runAction(root, { action: 'branch.delete', params: { name: 'main' } }),
      (error) => { failing = error; return true },
    )
    const refused = String(failing.gitStderr ?? failing.message)
    assert.match(refused, /main/)
    assert.doesNotMatch(refused, /Command failed/)
    assert.equal(git(root, 'rev-parse', '--abbrev-ref', 'HEAD'), 'main')
  } finally {
    cleanup()
  }
})

test('a continuation action is matched against the operation it belongs to', async () => {
  const { root, cleanup } = fixture()
  try {
    const rebasing = {
      operation: 'rebase', locked: false, lockPath: null, conflicts: [], dirty: false,
      changedCount: 0, head: 'a'.repeat(40), branch: 'main', detached: false, busy: true,
    }
    const continues = await planOf(root, 'rebase.continue', {})
    const aborts = await planOf(root, 'rebase.abort', {})
    const wrong = await planOf(root, 'merge.abort', {})
    const starts = await planOf(root, 'branch.checkout', { name: 'main' })

    internals.assertActionAllowed(continues, rebasing)
    internals.assertActionAllowed(aborts, rebasing)
    assert.throws(() => internals.assertActionAllowed(wrong, rebasing), /does not belong to the rebase/)
    // Starting anything new while an operation runs is refused, and the refusal
    // spells the operation the way a reader would say it.
    assert.throws(() => internals.assertActionAllowed(starts, rebasing), /a rebase is in progress/)

    const cherryPicking = { ...rebasing, operation: 'cherryPick' }
    const cherryContinue = await planOf(root, 'cherryPick.continue', {})
    // The marker is spelled `cherry-pick` to a reader but the action prefix is
    // `cherryPick`; matching one against the other is what this pins down.
    internals.assertActionAllowed(cherryContinue, cherryPicking)
    assert.throws(() => internals.assertActionAllowed(continues, cherryPicking),
      /does not belong to the cherry-pick/)
  } finally {
    cleanup()
  }
})

test('this plugin serialises its own writes, and a failure does not poison the queue', async () => {
  const order = []
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
  const first = internals.queueWrite('/one-repo', async () => { await wait(30); order.push('first') })
  const second = internals.queueWrite('/one-repo', () => { order.push('second') })
  await Promise.all([first, second])
  assert.deepEqual(order, ['first', 'second'])

  const failing = internals.queueWrite('/two-repo', async () => { throw new Error('boom') })
  const after = internals.queueWrite('/two-repo', () => 'ran anyway')
  await assert.rejects(failing, /boom/)
  assert.equal(await after, 'ran anyway')

  // Two repositories do not wait for each other.
  const other = []
  await Promise.all([
    internals.queueWrite('/three-repo', async () => { await wait(20); other.push('slow') }),
    internals.queueWrite('/four-repo', () => { other.push('fast') }),
  ])
  assert.deepEqual(other, ['fast', 'slow'])
})
