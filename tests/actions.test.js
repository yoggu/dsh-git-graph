import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { internals } from '../lib/index.js'
import {
  commitActions, fileActions, operationActions, paramsFor,
  refActions, stashActions, workingActions,
} from '../src/client/actions.js'

/** Values for a request's fields that would pass its own validation. */
function filledValues(entry) {
  return Object.fromEntries((entry.fields ?? []).map(field => [field.name,
    field.type === 'checkbox' ? field.initial === true
      : field.type === 'select' ? (field.initial ?? field.options[0].value)
        : field.name === 'to' ? 'renamed' : 'probe']))
}

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
      ['push', '--force-with-lease', 'origin', 'refs/heads/main:refs/heads/main'])
    // A remote that is not configured never reaches the argument list, and one
    // whose name git would read as an option is refused even earlier.
    await assert.rejects(() => argvOf(root, 'branch.push', { remote: 'elsewhere', branch: 'main' }),
      /not a configured remote/)
    await assert.rejects(() => argvOf(root, 'branch.push', { remote: '-oProxyCommand=sh', branch: 'main' }),
      /refusing remote/)
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

test('the state, plan and action operations answer end to end through dispatch', async () => {
  const { root, cleanup } = fixture()
  try {
    // The smallest Cordis context this plugin reads: a session store that knows
    // one id and its workspace.
    const ctx = {
      get: name => (name === 'sessions'
        ? { get: id => (id === 'session' ? { header: { cwd: root } } : undefined) }
        : undefined),
    }
    const state = await internals.dispatch(ctx, { op: 'state', sessionId: 'session' })
    assert.equal(state.state.branch, 'main')
    assert.equal(state.state.busy, false)
    assert.equal(state.state.dirty, false)

    const planned = await internals.dispatch(ctx, {
      op: 'plan', sessionId: 'session', action: 'branch.create', params: { name: 'topic', checkout: true },
    })
    assert.deepEqual(planned.plan.argv, ['checkout', '-b', 'topic'])
    assert.equal(planned.blocked, null)
    assert.deepEqual(planned.warnings, [])
    // Planning runs nothing: the branch must not exist yet.
    assert.equal(git(root, 'branch', '--list', 'topic'), '')

    const result = await internals.dispatch(ctx, {
      op: 'action', sessionId: 'session', action: 'branch.create', params: { name: 'topic', checkout: true },
    })
    assert.equal(result.action, 'branch.create')
    assert.equal(result.before.branch, 'main')
    assert.equal(result.after.branch, 'topic')
    assert.match(result.output, /topic/)

    // A session that is not live is refused rather than answered from another
    // project, and an action outside the vocabulary never reaches git.
    await assert.rejects(
      () => internals.dispatch(ctx, { op: 'state', sessionId: 'gone' }),
      /unknown or expired Session/,
    )
    await assert.rejects(
      () => internals.dispatch(ctx, { op: 'action', sessionId: 'session', action: 'repo.wipe', params: {} }),
      /unknown action/,
    )
  } finally {
    cleanup()
  }
})

test('every stash is in the history and named by its position', async () => {
  const { root, cleanup } = fixture()
  try {
    writeFileSync(join(root, 'a.txt'), 'two\n')
    git(root, 'stash', 'push', '-m', 'erste')
    writeFileSync(join(root, 'a.txt'), 'three\n')
    git(root, 'stash', 'push')

    const stashes = await internals.listStashes(root)
    assert.deepEqual(stashes.map(entry => entry.index), [0, 1])
    assert.deepEqual(stashes.map(entry => entry.selector), ['stash@{0}', 'stash@{1}'])
    assert.equal(stashes.map(entry => entry.fullSelector)[1], 'refs/stash@{1}')
    assert.match(stashes[0].subject, /WIP on main/)
    assert.match(stashes[1].subject, /erste/)
    assert.match(stashes[0].date, /^\d{4}-\d{2}-\d{2}T/)

    // `--all` reaches only the newest stash, because the older ones live in
    // that ref's reflog; naming every stash as a starting point is what puts
    // them in the graph at all.
    const page = await internals.listCommits(root, { limit: 50, skip: 0, stashes })
    const hashes = page.map(commit => commit.hash)
    for (const stash of stashes) assert.ok(hashes.includes(stash.hash), `${stash.selector} must be in the history`)
    const withoutStashes = await internals.listCommits(root, { limit: 50, skip: 0 })
    assert.ok(!withoutStashes.map(commit => commit.hash).includes(stashes[1].hash))

    // A repository with no stash reports none rather than failing.
    assert.deepEqual(await internals.listStashes(join(root, 'nonexistent')), [])
  } finally {
    cleanup()
  }
})

test('a comparison lists what differs between two revisions, including the working tree', async () => {
  const { root, cleanup } = fixture()
  try {
    // A second commit that adds one file and edits another.
    writeFileSync(join(root, 'a.txt'), 'one\ntwo\n')
    writeFileSync(join(root, 'b.txt'), 'new\n')
    git(root, 'add', '.')
    git(root, 'commit', '-qm', 'Second')
    const base = git(root, 'rev-parse', 'HEAD~1')
    const head = git(root, 'rev-parse', 'HEAD')

    const between = await internals.compareRevisions(root, { from: base, to: head })
    assert.deepEqual(between.files.map(file => [file.status, file.path]).sort(), [['A', 'b.txt'], ['M', 'a.txt']])
    assert.deepEqual(
      [between.files.find(file => file.path === 'b.txt').additions, between.files.find(file => file.path === 'b.txt').deletions],
      [1, 0],
    )

    // The same commit, read against its parent, is the answer a commit view
    // gives — the comparison must agree with it.
    const detail = await internals.commitDetail(root, head)
    assert.deepEqual(
      detail.files.map(file => file.path).sort(),
      between.files.map(file => file.path).sort(),
    )

    // Comparing a revision with nothing means comparing it with the working
    // tree, which is how an agent's uncommitted work is read.
    writeFileSync(join(root, 'a.txt'), 'one\ntwo\nthree\n')
    const uncommitted = await internals.compareRevisions(root, { from: head, to: null })
    assert.deepEqual(uncommitted.files.map(file => [file.status, file.path]), [['M', 'a.txt']])

    // Comparing a revision with itself is empty rather than an error.
    assert.deepEqual((await internals.compareRevisions(root, { from: head, to: head })).files, [])
  } finally {
    cleanup()
  }
})

test('the compare and diff operations accept a working-tree side through dispatch', async () => {
  const { root, cleanup } = fixture()
  try {
    const ctx = {
      get: name => (name === 'sessions'
        ? { get: id => (id === 'session' ? { header: { cwd: root } } : undefined) }
        : undefined),
    }
    const head = git(root, 'rev-parse', 'HEAD')
    writeFileSync(join(root, 'a.txt'), 'changed\n')

    const compared = await internals.dispatch(ctx, { op: 'compare', sessionId: 'session', from: head })
    assert.equal(compared.to, null)
    assert.deepEqual(compared.files.map(file => file.path), ['a.txt'])

    const patch = await internals.dispatch(ctx, {
      op: 'diff', sessionId: 'session', from: head, to: null, path: 'a.txt',
    })
    assert.match(patch.patch, /^diff --git/)
    assert.match(patch.patch, /\+changed/)

    // A revision the plugin refuses never reaches git's argument parser.
    await assert.rejects(
      () => internals.dispatch(ctx, { op: 'compare', sessionId: 'session', from: '--upload-pack=x' }),
      /refusing revision/,
    )
  } finally {
    cleanup()
  }
})

test('a history filter is accepted only for a ref this repository has', async () => {
  const { root, cleanup } = fixture()
  try {
    git(root, 'branch', 'topic')
    git(root, 'tag', 'v1')
    const refs = await internals.listRefs(root)
    assert.equal(internals.acceptFilterRef('refs/heads/topic', refs), 'refs/heads/topic')
    assert.equal(internals.acceptFilterRef('refs/tags/v1', refs), 'refs/tags/v1')
    assert.equal(internals.acceptFilterRef('HEAD', refs), 'HEAD')
    // A name that is not a ref of this repository never reaches git, so an
    // option cannot be smuggled into the argument position the filter occupies.
    assert.throws(() => internals.acceptFilterRef('--all', refs), /refusing ref/)
    assert.throws(() => internals.acceptFilterRef('refs/heads/absent', refs), /refusing ref/)
    assert.throws(() => internals.acceptFilterRef('--output=/tmp/x', refs), /refusing ref/)
    assert.throws(() => internals.acceptFilterRef('HEAD~3', refs), /refusing ref/)

    // Filtering really narrows the history to the named ref.
    git(root, 'checkout', '-q', '-b', 'side')
    writeFileSync(join(root, 'side.txt'), 's\n')
    git(root, 'add', '.')
    git(root, 'commit', '-qm', 'Side only')
    const all = await internals.listCommits(root, { limit: 20, skip: 0 })
    const only = await internals.listCommits(root, { limit: 20, skip: 0, ref: 'refs/heads/main' })
    assert.ok(all.length > only.length)
    assert.ok(!only.some(commit => commit.subject === 'Side only'))
  } finally {
    cleanup()
  }
})

test('the commits operation reports and applies the filter through dispatch', async () => {
  const { root, cleanup } = fixture()
  try {
    const ctx = {
      get: name => (name === 'sessions'
        ? { get: id => (id === 'session' ? { header: { cwd: root } } : undefined) }
        : undefined),
    }
    git(root, 'branch', 'topic')
    const filtered = await internals.dispatch(ctx, {
      op: 'commits', sessionId: 'session', limit: 20, ref: 'refs/heads/topic',
    })
    assert.equal(filtered.ref, 'refs/heads/topic')
    assert.ok(filtered.commits.length > 0)
    assert.deepEqual(filtered.refs.refs.map(entry => entry.name).sort(),
      ['refs/heads/main', 'refs/heads/topic'])

    const unfiltered = await internals.dispatch(ctx, { op: 'commits', sessionId: 'session', limit: 20 })
    assert.equal(unfiltered.ref, null)

    await assert.rejects(
      () => internals.dispatch(ctx, { op: 'commits', sessionId: 'session', limit: 20, ref: '--all' }),
      /refusing ref/,
    )
  } finally {
    cleanup()
  }
})

test('destructive file actions treat Git pathspec magic as a literal filename', async () => {
  const { root, cleanup } = fixture()
  const magic = ':(top)**'
  try {
    writeFileSync(join(root, magic), 'magic\n')
    git(root, '-c', 'literal.pathspecs=true', 'add', '--', magic)
    git(root, 'commit', '-qm', 'Add literal magic filename')
    writeFileSync(join(root, 'a.txt'), 'modified\n')
    writeFileSync(join(root, magic), 'modified magic\n')
    await internals.runAction(root, { action: 'working.discard', params: { paths: [magic] } })
    assert.equal(git(root, 'status', '--porcelain', '--', 'a.txt'), 'M a.txt',
      'discarding the magic-looking path must not discard another file')
    assert.equal(readFileSync(join(root, magic), 'utf8'), 'magic\n', 'the literal file was restored')
    await internals.runAction(root, { action: 'working.remove', params: { paths: [magic] } })
    assert.equal(existsSync(join(root, magic)), false)
    assert.equal(existsSync(join(root, 'a.txt')), true)
  } finally {
    cleanup()
  }
})

test('a file git does not track is deleted rather than restored', async () => {
  const { root, cleanup } = fixture()
  try {
    // `checkout --` refuses all three of these, which is why they have their
    // own actions: an untracked file, an untracked directory, and a file that
    // was staged but never committed.
    writeFileSync(join(root, 'loose.txt'), 'untracked\n')
    writeFileSync(join(root, 'added.txt'), 'staged\n')
    git(root, 'add', 'added.txt')
    mkdirSync(join(root, 'dir'), { recursive: true })
    writeFileSync(join(root, 'dir', 'inner.txt'), 'inner\n')

    // The plan names the path, and running it removes exactly that path.
    const planned = await planOf(root, 'working.clean', { paths: ['loose.txt'] })
    assert.deepEqual(planned.argv, ['clean', '-f', '--', 'loose.txt'])
    assert.equal(planned.destructive, true)
    await internals.runAction(root, { action: 'working.clean', params: { paths: ['loose.txt'] } })
    assert.equal(existsSync(join(root, 'loose.txt')), false)
    assert.equal(existsSync(join(root, 'added.txt')), true, 'a named path must not take its neighbours with it')

    // A named directory goes without `-d`, which is what git does.
    await internals.runAction(root, { action: 'working.clean', params: { paths: ['dir'] } })
    assert.equal(existsSync(join(root, 'dir')), false)

    // A staged addition is taken out of the index and off the disk.
    assert.equal(git(root, 'status', '--porcelain'), 'A  added.txt')
    const removal = await planOf(root, 'working.remove', { paths: ['added.txt'] })
    assert.deepEqual(removal.argv, ['rm', '-f', '--', 'added.txt'])
    await internals.runAction(root, { action: 'working.remove', params: { paths: ['added.txt'] } })
    assert.equal(existsSync(join(root, 'added.txt')), false)
    assert.equal(git(root, 'status', '--porcelain'), '')

    // And the restore path still refuses a path outside the repository.
    await assert.rejects(() => planOf(root, 'working.clean', { paths: ['../escape'] }), /inside the repository/)
    await assert.rejects(() => planOf(root, 'working.remove', { paths: [] }), /file paths is required/)
  } finally {
    cleanup()
  }
})

test('every action a menu can offer is one the host can plan', async () => {
  const { root, cleanup } = fixture()
  try {
    git(root, 'remote', 'add', 'origin', 'https://example.invalid/repo.git')
    const hash = git(root, 'rev-parse', 'HEAD')
    const ctx = { branch: 'main', remotes: ['origin'] }
    // Every subject a menu is built for, so a leaf action with a typo — or one
    // whose parameters the host would refuse — fails here rather than in a
    // dialog in front of a reader.
    const offered = [
      ...commitActions({ hash, subject: 'x' }, ctx),
      ...refActions({ kind: 'head', label: 'main' }, ctx),
      ...refActions({ kind: 'branch', label: 'feature' }, ctx),
      ...refActions({ kind: 'remote', label: 'main', remote: 'origin' }, ctx),
      ...refActions({ kind: 'tag', label: 'v1' }, ctx),
      ...stashActions({ kind: 'stash', label: 'stash@{0}', index: 0 }),
      ...workingActions(),
      ...fileActions({ path: 'a.txt', status: 'M', group: 'unstaged' }),
      ...fileActions({ path: 'a.txt', status: 'M', group: 'staged' }),
      // A staged *addition* is the one file state whose discard is a removal.
      ...fileActions({ path: 'added.txt', status: 'A', group: 'staged' }),
      ...fileActions({ path: 'loose.txt', status: '?', group: 'untracked' }),
      ...operationActions({ operation: 'merge' }),
      ...operationActions({ operation: 'rebase' }),
      ...operationActions({ operation: 'cherryPick' }),
      ...operationActions({ operation: 'revert' }),
      ...operationActions({ operation: 'am' }),
      ...operationActions({ operation: 'bisect' }),
    ]
    assert.ok(offered.length >= 30, `expected a full vocabulary, got ${offered.length}`)
    for (const entry of offered) {
      const params = paramsFor(entry, filledValues(entry))
      await planOf(root, entry.action, params)
    }
    // And the list names the actions the objective promised, so a menu that
    // stopped offering one of them is caught rather than merely not planned.
    const ids = new Set(offered.map(entry => entry.action))
    for (const required of [
      'branch.create', 'branch.checkout', 'branch.delete', 'branch.rename', 'branch.merge',
      'branch.rebase', 'branch.reset', 'branch.pull', 'branch.push', 'branch.fetchIntoLocal',
      'tag.add', 'tag.delete', 'tag.push',
      'commit.checkout', 'commit.cherryPick', 'commit.revert', 'commit.reset',
      'working.stash', 'working.clean', 'working.discard', 'working.remove', 'working.reset',
      'stash.apply', 'stash.pop', 'stash.drop', 'stash.branch',
    ]) {
      assert.ok(ids.has(required), `${required} must be reachable from a menu`)
    }
  } finally {
    cleanup()
  }
})

test('an action queued behind another re-checks the repository before it runs', async () => {
  const { root, cleanup } = fixture()
  const running = []
  let release
  let held
  try {
    git(root, 'tag', 'victim')
    git(root, 'checkout', '-q', '-b', 'feature')
    writeFileSync(join(root, 'a.txt'), 'feature\n')
    git(root, 'commit', '-qam', 'Feature')
    git(root, 'checkout', '-q', 'main')
    writeFileSync(join(root, 'a.txt'), 'main\n')
    git(root, 'commit', '-qam', 'Main')

    // runAction validates asynchronously before joining the write queue, so
    // invocation order (or a sleep) cannot establish enqueue order. Observe the
    // actual queue tail instead, without mocking Git or changing either action.
    async function enqueue(request) {
      const previous = internals.writeQueues.get(root)
      const action = internals.runAction(root, request)
      running.push(action)
      let validationError
      action.catch(error => { validationError = error })
      const deadline = performance.now() + 5_000
      while (internals.writeQueues.get(root) === previous) {
        if (validationError) throw validationError
        assert.ok(performance.now() < deadline, `${request.action} did not join the held queue`)
        await new Promise(resolve => setTimeout(resolve, 1))
      }
      return { action }
    }

    // Both initial checks see a clean repository, but merge is guaranteed to
    // enter the held queue first. Only the in-queue re-check can stop deletion.
    const started = new Promise(resolve => {
      held = internals.queueWrite(root, () => new Promise(unblock => {
        release = unblock
        resolve()
      }))
    })
    await started
    const { action: merging } = await enqueue({ action: 'branch.merge', params: { name: 'feature' } })
    const { action: deleting } = await enqueue({ action: 'tag.delete', params: { name: 'victim' } })
    release()
    const [merged, deleted] = await Promise.allSettled([merging, deleting])
    await held

    assert.equal(merged.status, 'rejected', 'the merge conflicts, as the fixture intends')
    assert.match(merged.reason.message, /CONFLICT|conflict|Automatic merge failed/)
    assert.equal(deleted.status, 'rejected', 'a tag must not be deleted while a merge is half-finished')
    assert.match(deleted.reason.message, /merge is in progress/)
    assert.equal(git(root, 'tag', '--list', 'victim'), 'victim')
  } finally {
    release?.()
    await Promise.allSettled(running)
    if (held) await held
    cleanup()
  }
})

test('a name git would read as an option is refused wherever it would appear', async () => {
  const { root, cleanup } = fixture()
  try {
    // A repository is untrusted input, and its configuration can name a remote
    // anything — including something git reads as an option. `git push --force
    // main` really does parse as "force, then a remote called main", which is
    // how a bare name would bypass the force checkbox.
    git(root, 'config', 'remote.--force.url', 'https://example.invalid/x.git')
    git(root, 'config', 'remote.--force.fetch', '+refs/heads/*:refs/remotes/x/*')
    assert.ok(git(root, 'remote').split('\n').includes('--force'), 'git really does list it')

    await assert.rejects(() => planOf(root, 'branch.push', { remote: '--force', branch: 'main' }),
      /refusing remote/)
    await assert.rejects(() => planOf(root, 'branch.pull', { remote: '--force' }), /refusing remote/)
    await assert.rejects(() => planOf(root, 'branch.fetchIntoLocal', { remote: '--force', branch: 'main' }),
      /refusing remote/)
    await assert.rejects(() => planOf(root, 'tag.push', { name: 'v1', remote: '--force' }), /refusing remote/)

    // …and the browser is never offered it in the first place.
    const refs = await internals.listRefs(root)
    assert.ok(!refs.remotes.includes('--force'))
  } finally {
    cleanup()
  }
})

test('a branch is pushed by full refspec, so its name cannot force anything', async () => {
  const { root, cleanup } = fixture()
  try {
    git(root, 'remote', 'add', 'origin', 'https://example.invalid/repo.git')
    // `+foo` is a legal branch name and the spelling of a forced refspec at the
    // same time; with a bare name, pushing it without the force checkbox would
    // force the remote anyway.
    assert.equal(git(root, 'check-ref-format', '--branch', '+foo'), '+foo')
    const pushed = await planOf(root, 'branch.push', { remote: 'origin', branch: '+foo' })
    assert.deepEqual(pushed.argv, ['push', 'origin', 'refs/heads/+foo:refs/heads/+foo'])
    assert.equal(pushed.destructive, false, 'nothing about that push is forced')

    const fetched = await planOf(root, 'branch.fetchIntoLocal', { remote: 'origin', branch: '+foo', force: true })
    assert.deepEqual(fetched.argv, ['fetch', 'origin', '+refs/heads/+foo:refs/heads/+foo'])
  } finally {
    cleanup()
  }
})

test('a held lock stops the way out of an operation too', async () => {
  const { root, cleanup } = fixture()
  try {
    writeFileSync(join(root, '.git', 'MERGE_HEAD'), `${'a'.repeat(40)}\n`)
    writeFileSync(join(root, '.git', 'index.lock'), '')
    const state = await internals.repositoryState(root)
    assert.equal(state.operation, 'merge')
    assert.equal(state.locked, true)
    // Both would write the index, so git would refuse them a moment later
    // anyway — with a message about a lock file instead of about the merge.
    for (const action of ['merge.abort', 'branch.checkout', 'stash.apply']) {
      const plan = await planOf(root, action, action === 'branch.checkout' ? { name: 'main' } : action === 'stash.apply' ? { index: 0 } : {})
      assert.throws(() => internals.assertActionAllowed(plan, state), /another Git process is writing/)
    }
  } finally {
    cleanup()
  }
})

test('an interrupted patch application is named as one, and has its own ways out', async () => {
  const { root, cleanup } = fixture()
  try {
    // `git am` and a plain `git rebase` share `rebase-apply`; only the first
    // leaves an `applying` file, and `git rebase --abort` is not the command
    // that ends it.
    execFileSync('git', ['-C', root, 'update-ref', 'HEAD', git(root, 'rev-parse', 'HEAD')], { encoding: 'utf8' })
    mkdirSync(join(root, '.git', 'rebase-apply'), { recursive: true })
    writeFileSync(join(root, '.git', 'rebase-apply', 'applying'), '')
    const am = await internals.repositoryState(root)
    assert.equal(am.operation, 'am')

    for (const action of ['am.continue', 'am.skip', 'am.abort']) {
      const plan = await planOf(root, action, {})
      assert.equal(plan.argv[0], 'am')
      internals.assertActionAllowed(plan, am)
    }
    // A rebase action does not belong to it, and says so by name.
    const rebase = await planOf(root, 'rebase.abort', {})
    assert.throws(() => internals.assertActionAllowed(rebase, am), /does not belong to the git am/)

    // Without the `applying` file it is a rebase, as before.
    rmSync(join(root, '.git', 'rebase-apply', 'applying'))
    assert.equal((await internals.repositoryState(root)).operation, 'rebase')

    // A bisect offers the one thing that ends it.
    rmSync(join(root, '.git', 'rebase-apply'), { recursive: true, force: true })
    writeFileSync(join(root, '.git', 'BISECT_LOG'), '')
    const bisecting = await internals.repositoryState(root)
    assert.equal(bisecting.operation, 'bisect')
    const reset = await planOf(root, 'bisect.reset', {})
    assert.deepEqual(reset.argv, ['bisect', 'reset'])
    internals.assertActionAllowed(reset, bisecting)
  } finally {
    cleanup()
  }
})

test('a stash position must be a whole number, not something Number() likes', async () => {
  const { root, cleanup } = fixture()
  try {
    for (const value of [null, '', false, true, [], {}, '0x1', '1.5', '-1', 'zwei']) {
      await assert.rejects(() => planOf(root, 'stash.drop', { index: value }), /stash index/,
        `${JSON.stringify(value)} must not address a stash`)
    }
    // The spellings that really are a position still work: a number, and the
    // decimal spelling of one, padded or not.
    assert.deepEqual((await planOf(root, 'stash.drop', { index: 0 })).argv, ['stash', 'drop', 'stash@{0}'])
    assert.deepEqual((await planOf(root, 'stash.drop', { index: '2' })).argv, ['stash', 'drop', 'stash@{2}'])
    assert.deepEqual((await planOf(root, 'stash.drop', { index: ' 3 ' })).argv, ['stash', 'drop', 'stash@{3}'])
  } finally {
    cleanup()
  }
})

test('undoing a rename takes the three commands no single one replaces', async () => {
  const { root, cleanup } = fixture()
  try {
    writeFileSync(join(root, 'old.txt'), 'content\n')
    git(root, 'add', 'old.txt')
    git(root, 'commit', '-qm', 'Add a file')
    git(root, 'mv', 'old.txt', 'new.txt')
    assert.equal(git(root, 'status', '--porcelain'), 'R  old.txt -> new.txt')

    const plan = await planOf(root, 'working.undorename', { oldPath: 'old.txt', path: 'new.txt' })
    assert.deepEqual(plan.steps, [
      ['reset', '-q', 'HEAD', '--', 'old.txt', 'new.txt'],
      ['checkout', '--', 'old.txt'],
      ['clean', '-q', '-f', '--', 'new.txt'],
    ])
    assert.match(plan.summary, /^git reset -q HEAD -- old\.txt new\.txt\ngit checkout -- old\.txt\ngit clean -q -f -- new\.txt$/)

    // None of them alone would do it, which is why there are three.
    await assert.rejects(async () => {
      await planOf(root, 'working.discard', { paths: ['new.txt'], source: 'head' })
      await internals.runAction(root, { action: 'working.discard', params: { paths: ['new.txt'], source: 'head' } })
    }, /pathspec|did not match/)

    const result = await internals.runAction(root, { action: 'working.undorename', params: { oldPath: 'old.txt', path: 'new.txt' } })
    assert.equal(result.action, 'working.undorename')
    assert.equal(git(root, 'status', '--porcelain'), '', 'the tree is back to HEAD')
    assert.equal(existsSync(join(root, 'old.txt')), true)
    assert.equal(existsSync(join(root, 'new.txt')), false)
  } finally {
    cleanup()
  }
})

test('push, pull and fetch-into-local really move refs against a real remote', async () => {
  const base = mkdtempSync(join(tmpdir(), 'gg-net-'))
  const remote = join(base, 'remote.git')
  const root = join(base, 'work')
  try {
    execFileSync('git', ['init', '-q', '--bare', remote])
    execFileSync('git', ['init', '-q', '-b', 'main', root])
    git(root, 'config', 'user.name', 'Net Test')
    git(root, 'config', 'user.email', 'net@example.invalid')
    writeFileSync(join(root, 'a.txt'), 'one\n')
    git(root, 'add', '.')
    git(root, 'commit', '-qm', 'Base')
    git(root, 'remote', 'add', 'origin', remote)
    git(root, 'push', '-q', '-u', 'origin', 'main')

    // Push: a local commit reaches the remote.
    writeFileSync(join(root, 'a.txt'), 'two\n')
    git(root, 'commit', '-qam', 'Second')
    await internals.runAction(root, { action: 'branch.push', params: { remote: 'origin', branch: 'main' } })
    assert.equal(git(remote, 'rev-parse', 'refs/heads/main'), git(root, 'rev-parse', 'HEAD'))

    // Fetch-into-local: a branch that only exists on the remote comes down as a
    // local branch, which is the whole point of that action.
    git(root, 'checkout', '-q', '-b', 'topic')
    writeFileSync(join(root, 'b.txt'), 'b\n')
    git(root, 'add', '.')
    git(root, 'commit', '-qm', 'Topic')
    git(root, 'push', '-q', 'origin', 'topic')
    git(root, 'checkout', '-q', 'main')
    git(root, 'branch', '-q', '-D', 'topic')
    await internals.runAction(root, {
      action: 'branch.fetchIntoLocal', params: { remote: 'origin', branch: 'topic' },
    })
    assert.equal(git(root, 'rev-parse', 'refs/heads/topic'), git(remote, 'rev-parse', 'refs/heads/topic'))

    // Pull: a commit made in another working copy arrives here.
    const other = join(base, 'other')
    // `-b main` because a bare repository made by `init` still points HEAD at
    // `master`, and a clone of it would arrive with an empty working tree.
    execFileSync('git', ['clone', '-q', '-b', 'main', remote, other])
    git(other, 'config', 'user.name', 'Elsewhere')
    git(other, 'config', 'user.email', 'elsewhere@example.invalid')
    writeFileSync(join(other, 'a.txt'), 'from elsewhere\n')
    git(other, 'commit', '-qam', 'Elsewhere')
    git(other, 'push', '-q', 'origin', 'main')
    await internals.runAction(root, { action: 'branch.pull', params: { remote: 'origin', branch: 'main' } })
    assert.equal(git(root, 'rev-parse', 'HEAD'), git(remote, 'rev-parse', 'refs/heads/main'))
    assert.equal(git(root, 'show', 'HEAD:a.txt', '--no-patch').trim() !== '', true)

    // Tags: pushing one publishes it, deleting one removes it locally.
    git(root, 'tag', 'v1')
    await internals.runAction(root, { action: 'tag.push', params: { name: 'v1', remote: 'origin' } })
    assert.equal(git(remote, 'tag', '--list', 'v1'), 'v1')
    await internals.runAction(root, { action: 'tag.delete', params: { name: 'v1' } })
    assert.equal(git(root, 'tag', '--list', 'v1'), '')

    // Branches: create, rename and delete, each really taking effect.
    await internals.runAction(root, { action: 'branch.create', params: { name: 'probe' } })
    assert.equal(git(root, 'branch', '--list', 'probe'), 'probe')
    await internals.runAction(root, { action: 'branch.rename', params: { name: 'probe', to: 'probe2' } })
    assert.equal(git(root, 'branch', '--list', 'probe2'), 'probe2')
    await internals.runAction(root, { action: 'branch.delete', params: { name: 'probe2' } })
    assert.equal(git(root, 'branch', '--list', 'probe2'), '')
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('revert and cherry-pick really change the tree they act on', async () => {
  const { root, cleanup } = fixture()
  try {
    // A commit on a side branch, to be picked onto the main line.
    git(root, 'checkout', '-q', '-b', 'side')
    writeFileSync(join(root, 'picked.txt'), 'picked\n')
    git(root, 'add', '.')
    git(root, 'commit', '-qm', 'Pick me')
    const picked = git(root, 'rev-parse', 'HEAD')
    git(root, 'checkout', '-q', 'main')

    await internals.runAction(root, { action: 'commit.cherryPick', params: { hash: picked } })
    assert.equal(existsSync(join(root, 'picked.txt')), true)
    assert.match(git(root, 'log', '-1', '--format=%s'), /Pick me/)

    // Reverting it takes the file away again, in a commit of its own.
    const introduced = git(root, 'rev-parse', 'HEAD')
    await internals.runAction(root, { action: 'commit.revert', params: { hash: introduced } })
    assert.equal(existsSync(join(root, 'picked.txt')), false)
    assert.match(git(root, 'log', '-1', '--format=%s'), /^Revert "Pick me"/)

    // A soft reset moves the branch without touching the tree.
    writeFileSync(join(root, 'a.txt'), 'changed\n')
    git(root, 'commit', '-qam', 'To be undone')
    const before = git(root, 'rev-parse', 'HEAD')
    // The action takes a commit id, not a revision expression — `HEAD^` is
    // refused, which is the point of `requireHash` — so the parent is resolved
    // the way a graph row would carry it.
    const parent = git(root, 'rev-parse', `${before}^`)
    const result = await internals.runAction(root, { action: 'commit.reset', params: { hash: parent, mode: 'soft' } })
    assert.equal(result.movedHead, true)
    assert.equal(git(root, 'status', '--porcelain'), 'M  a.txt', 'the change is staged, not discarded')
  } finally {
    cleanup()
  }
})

test('only authenticated Connection Fetch routes are installed and released', async () => {
  const registered = []
  const context = {
    connection: {
      fetch: {
        register(route) {
          if (registered.some(entry => entry.path === route.path)) throw new Error(`duplicate route ${route.path}`)
          registered.push(route)
          return async () => {
            const at = registered.indexOf(route)
            if (at >= 0) registered.splice(at, 1)
          }
        },
      },
    },
  }
  const release = internals.registerRoutes(context)
  assert.deepEqual(registered.map(({ path, methods, requestBody }) => ({ path, methods, requestBody })), [
    { path: '/api/dsh-git-graph', methods: ['POST'], requestBody: 'buffered' },
    { path: '/api/dsh-git-graph/events', methods: ['GET'], requestBody: 'buffered' },
  ])
  assert.throws(() => internals.registerRoutes(context), /duplicate route/)
  await release()
  assert.deepEqual(registered, [])
  const again = internals.registerRoutes(context)
  assert.equal(registered.length, 2)
  await again()
  assert.equal(registered.length, 0)

  const failing = {
    connection: {
      fetch: {
        register(route) {
          if (route.path.endsWith('/events')) throw new Error('collision')
          registered.push(route)
          return async () => { registered.splice(registered.indexOf(route), 1) }
        },
      },
    },
  }
  assert.throws(() => internals.registerRoutes(failing), /collision/)
  assert.deepEqual(registered, [], 'a half-finished apply releases its first route')
})
