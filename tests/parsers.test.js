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
import { mkdtempSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
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

test('parseNumstat handles regular, binary, and rename records with newline paths', () => {
  const parsed = internals.parseNumstat([
    '3\t1\tspace name.txt',
    '-\t-\tbinary.bin',
    '2\t4\t', 'old\nname.txt', 'new\nname.txt',
  ].join('\u0000') + '\u0000')
  assert.deepEqual(parsed, [
    { path: 'space name.txt', oldPath: null, additions: 3, deletions: 1 },
    { path: 'binary.bin', oldPath: null, additions: null, deletions: null },
    { path: 'new\nname.txt', oldPath: 'old\nname.txt', additions: 2, deletions: 4 },
  ])
})

test('parseStatusV2 keeps type-2 rename old and new paths separate', () => {
  const parsed = internals.parseStatusV2([
    '2 R. N... 100644 100644 100644 abcdef abcdef R100 new\nname.txt',
    'old\nname.txt',
  ].join('\u0000') + '\u0000')
  assert.deepEqual(parsed.staged, [{ status: 'R', path: 'new\nname.txt', oldPath: 'old\nname.txt' }])
  assert.deepEqual(parsed.unstaged, [])
})

test('commitDetail returns addition and deletion counts for text and binary files', async () => {
  const dir = repo({ 'modified.txt': 'one\ntwo\n', 'deleted.txt': 'gone\n', 'binary.bin': Buffer.from([0, 1, 2]) })
  const run = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' })
  writeFileSync(join(dir, 'modified.txt'), 'one\nTWO\nthree\n')
  run('rm', '-q', 'deleted.txt')
  writeFileSync(join(dir, 'added.txt'), 'new\nfile\n')
  writeFileSync(join(dir, 'binary.bin'), Buffer.from([0, 1, 3]))
  run('add', '-A')
  run('commit', '-qm', 'counts')
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim()
  const files = (await internals.commitDetail(dir, head)).files
  const byPath = new Map(files.map(file => [file.path, file]))
  assert.deepEqual(byPath.get('modified.txt'), { status: 'M', path: 'modified.txt', oldPath: null, score: '', additions: 2, deletions: 1 })
  assert.deepEqual(byPath.get('added.txt'), { status: 'A', path: 'added.txt', oldPath: null, score: '', additions: 2, deletions: 0 })
  assert.deepEqual(byPath.get('deleted.txt'), { status: 'D', path: 'deleted.txt', oldPath: null, score: '', additions: 0, deletions: 1 })
  assert.equal(byPath.get('binary.bin').additions, null)
  assert.equal(byPath.get('binary.bin').deletions, null)
})

test('commitDetail preserves renamed paths and their numstat counts', async () => {
  const lines = Array.from({ length: 10 }, (_, index) => `line ${index + 1}`).join('\n') + '\n'
  const dir = repo({ 'old name\n.txt': lines })
  const run = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' })
  renameSync(join(dir, 'old name\n.txt'), join(dir, 'new name\n.txt'))
  writeFileSync(join(dir, 'new name\n.txt'), lines.replace('line 2', 'LINE TWO') + 'line 11\n')
  run('add', '-A')
  run('commit', '-qm', 'rename with counts')
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim()
  const [file] = (await internals.commitDetail(dir, head)).files
  assert.deepEqual(file, {
    status: 'R', path: 'new name\n.txt', oldPath: 'old name\n.txt', score: '079', additions: 2, deletions: 1,
  })
})

test('workingTree preserves staged rename paths and counts', async () => {
  const dir = repo({ 'old name\n.txt': 'one\ntwo\nthree\nfour\n' })
  const run = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' })
  renameSync(join(dir, 'old name\n.txt'), join(dir, 'new name\n.txt'))
  writeFileSync(join(dir, 'new name\n.txt'), 'one\nTWO\nthree\nfour\nfive\n')
  run('add', '-A')
  const result = await internals.workingTree(dir)
  assert.deepEqual(result.staged, [{
    status: 'R', path: 'new name\n.txt', oldPath: 'old name\n.txt', additions: 2, deletions: 1,
  }])
})

test('workingTree handles an unborn repository against the empty tree', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gg-unborn-'))
  const run = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' })
  run('init', '-q')
  writeFileSync(join(dir, 'new file.txt'), 'one\ntwo\n')
  run('add', 'new file.txt')
  const result = await internals.workingTree(dir)
  assert.deepEqual(result.staged, [{ status: 'A', path: 'new file.txt', additions: 2, deletions: 0 }])
  assert.deepEqual(result.unstaged, [])
})

test('workingTree reports separate staged and unstaged counts, including partial staging', async () => {
  const dir = repo({ 'partial.txt': 'base\n', 'deleted.txt': 'delete\n' })
  const run = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' })
  writeFileSync(join(dir, 'partial.txt'), 'base\nstaged\n')
  run('add', 'partial.txt')
  writeFileSync(join(dir, 'partial.txt'), 'base\nstaged\nunstaged\n')
  run('rm', '--cached', 'deleted.txt')
  writeFileSync(join(dir, 'deleted.txt'), 'delete\nrestored\n')
  writeFileSync(join(dir, 'untracked.txt'), 'u\n')
  const result = await internals.workingTree(dir)
  const staged = new Map(result.staged.map(file => [file.path, file]))
  const unstaged = new Map(result.unstaged.map(file => [file.path, file]))
  assert.deepEqual(staged.get('partial.txt'), { status: 'M', path: 'partial.txt', additions: 1, deletions: 0 })
  assert.deepEqual(unstaged.get('partial.txt'), { status: 'M', path: 'partial.txt', additions: 1, deletions: 0 })
  assert.deepEqual(staged.get('deleted.txt'), { status: 'D', path: 'deleted.txt', additions: 0, deletions: 1 })
  assert.equal(unstaged.has('deleted.txt'), false, 'restoring a staged deletion makes it untracked')
  assert.deepEqual(result.untracked, [
    { status: '?', path: 'deleted.txt', additions: null, deletions: null },
    { status: '?', path: 'untracked.txt', additions: null, deletions: null },
  ])
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
