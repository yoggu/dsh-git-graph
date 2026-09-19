/**
 * Parser tests for `dsh-git-graph`.
 *
 * The parsers read git's own output, which is where this plugin is most likely
 * to be wrong and least likely to be caught by reading the code. Each case here
 * is a shape git actually produces, taken from a real repository rather than
 * from the format documentation.
 *
 * Run with: node --test tests/
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { internals } from '../lib/index.js'

/**
 * Build a real repository to read from.
 *
 * Parsers are tested against output git produced, not against a string a test
 * author believes git would produce; a fixture would only restate the same
 * assumption the parser makes.
 *
 * @param files - path/content pairs for the first commit.
 * @returns the repository's directory.
 */
function repo(files) {
  const dir = mkdtempSync(join(tmpdir(), 'gg-test-'))
  const run = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' })
  run('init', '-q')
  run('config', 'user.email', 'test@example.com')
  run('config', 'user.name', 'Test')
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, content)
  }
  run('add', '-A')
  run('commit', '-qm', 'initial')
  return dir
}

test('parseNameStatus keeps a filename with a space intact', () => {
  const parsed = internals.parseNameStatus('M\u0000a file with spaces.txt\u0000')
  assert.deepEqual(parsed, [{ status: 'M', path: 'a file with spaces.txt', oldPath: null, score: '' }])
})

test('parseNameStatus reads a rename as two paths, not two entries', () => {
  const parsed = internals.parseNameStatus('R100\u0000old.txt\u0000new.txt\u0000')
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].status, 'R')
  assert.equal(parsed[0].oldPath, 'old.txt')
  assert.equal(parsed[0].path, 'new.txt')
})

test('parseStatusV2 separates staged, unstaged and untracked', () => {
  const dir = repo({ 'tracked.txt': 'one\n', 'space name.txt': 'x\n' })
  const run = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' })
  writeFileSync(join(dir, 'tracked.txt'), 'one\ntwo\n')
  writeFileSync(join(dir, 'space name.txt'), 'y\n')
  writeFileSync(join(dir, 'untracked.txt'), 'new\n')
  run('add', 'tracked.txt')

  const raw = execFileSync('git', ['status', '--porcelain=v2', '-z', '--untracked-files=all', '--no-renames'], { cwd: dir, encoding: 'utf8' })
  const parsed = internals.parseStatusV2(raw)
  assert.deepEqual(parsed.staged, [{ status: 'M', path: 'tracked.txt' }])
  assert.deepEqual(parsed.unstaged, [{ status: 'M', path: 'space name.txt' }])
  assert.deepEqual(parsed.untracked, [{ status: '?', path: 'untracked.txt' }])
})

test('a partially staged file appears in both groups', () => {
  const dir = repo({ 'partial.txt': 'a\n' })
  const run = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' })
  writeFileSync(join(dir, 'partial.txt'), 'a\nstaged\n')
  run('add', 'partial.txt')
  writeFileSync(join(dir, 'partial.txt'), 'a\nstaged\nunstaged\n')

  const raw = execFileSync('git', ['status', '--porcelain=v2', '-z', '--untracked-files=all', '--no-renames'], { cwd: dir, encoding: 'utf8' })
  const parsed = internals.parseStatusV2(raw)
  assert.equal(parsed.staged.length, 1, 'the staged half is reported')
  assert.equal(parsed.unstaged.length, 1, 'the unstaged half is reported too')
})

test('listCommits reads parents, dates and decoration', async () => {
  const dir = repo({ 'a.txt': 'a\n' })
  const run = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' })
  writeFileSync(join(dir, 'a.txt'), 'b\n')
  run('commit', '-qam', 'second commit')

  const commits = await internals.listCommits(dir, { limit: 10, skip: 0 })
  assert.equal(commits.length, 2)
  assert.equal(commits[0].subject, 'second commit')
  assert.equal(commits[0].parents.length, 1, 'a non-root commit has one parent')
  assert.equal(commits[1].parents.length, 0, 'the root commit has none')
  assert.ok(commits[0].authorDate.includes('T'), 'dates are ISO-8601')
})

test('commitDetail compares a merge against its first parent', async () => {
  const dir = repo({ 'f.txt': 'base\n' })
  const run = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' })
  run('checkout', '-qb', 'side')
  writeFileSync(join(dir, 'f.txt'), 'side\n')
  run('commit', '-qam', 'side change')
  run('checkout', '-q', '-')
  writeFileSync(join(dir, 'other.txt'), 'main\n')
  run('add', '-A')
  run('commit', '-qm', 'main change')
  run('merge', '-q', '--no-ff', '-m', 'merge side', 'side')

  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim()
  const detail = await internals.commitDetail(dir, head)
  assert.equal(detail.parents.length, 2, 'the merge has two parents')
  // Without naming the first parent, `diff-tree` would report no files at all
  // and the merge would appear to have changed nothing.
  assert.ok(detail.files.length > 0, 'a merge reports the files it brought in')
})

test('fileDiff shows a rename as a rename', async () => {
  const dir = repo({ 'old.txt': 'one\ntwo\nthree\n' })
  const run = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' })
  const before = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim()
  run('mv', 'old.txt', 'new.txt')
  writeFileSync(join(dir, 'new.txt'), 'one\nTWO\nthree\n')
  run('commit', '-qam', 'rename and edit')
  const after = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim()

  const diff = await internals.fileDiff(dir, { from: before, to: after, path: 'new.txt', oldPath: 'old.txt', context: 3 })
  assert.ok(diff.patch.includes('rename from old.txt'), 'the rename is stated')
  assert.ok(diff.patch.includes('+TWO'), 'the real edit is shown')
  assert.ok(!diff.patch.includes('new file mode'), 'it is not reported as a new file')
})

test('showBlob reports an absent path instead of throwing', async () => {
  const dir = repo({ 'present.txt': 'here\n' })
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim()
  const present = await internals.showBlob(dir, { rev: head, path: 'present.txt' })
  assert.equal(present.text, 'here\n')
  assert.equal(present.absent, false)

  const missing = await internals.showBlob(dir, { rev: head, path: 'nope.txt' })
  assert.equal(missing.absent, true)
})

test('requireRev refuses anything that is not a revision', () => {
  assert.equal(internals.requireRev('abc123'), 'abc123')
  assert.equal(internals.requireRev('HEAD'), 'HEAD')
  for (const bad of ['--help', 'HEAD~1', 'main..other', '-D', 'a b', '']) {
    assert.throws(() => internals.requireRev(bad), `should refuse ${JSON.stringify(bad)}`)
  }
})

test('requireHash refuses a short or symbolic id', () => {
  assert.equal(internals.requireHash('a'.repeat(40)), 'a'.repeat(40))
  for (const bad of ['abc123', 'HEAD', 'a'.repeat(39), '']) {
    assert.throws(() => internals.requireHash(bad), `should refuse ${JSON.stringify(bad)}`)
  }
})

test('clampInt bounds a page size', () => {
  assert.equal(internals.clampInt(9999, 120, 1, 600), 600)
  assert.equal(internals.clampInt(-5, 120, 1, 600), 1)
  assert.equal(internals.clampInt(undefined, 120, 1, 600), 120)
  assert.equal(internals.clampInt('50', 120, 1, 600), 50)
})

test('a request naming no live session is refused', async () => {
  const ctx = { get: () => undefined }
  await assert.rejects(
    () => internals.dispatch(ctx, { op: 'commits', sessionId: 'gone' }),
    /unknown or expired Session/,
  )
})

test('an unknown operation is refused rather than guessed at', async () => {
  const ctx = {
    get: name => name === 'sessions'
      ? { get: () => ({ header: { cwd: repo({ 'x.txt': 'x\n' }) } }) }
      : undefined,
  }
  await assert.rejects(
    () => internals.dispatch(ctx, { op: 'rm -rf', sessionId: 's' }),
    /unknown operation/,
  )
})

test('a directory outside a repository reports git\'s own message', async () => {
  const plain = mkdtempSync(join(tmpdir(), 'gg-plain-'))
  await assert.rejects(() => internals.repoRoot(plain), /not a git repository/)
})
