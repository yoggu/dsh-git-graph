import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseUnifiedPatch as parse,
  diffFileIdentity as identity,
  planSplitRows,
  resolveDiffLayout,
} from '../src/client/diff-layout.js'
const own = value => JSON.parse(JSON.stringify(value))

test('unified numbering, counts, omitted counts and multiple hunks', () => {
  const patch = 'diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -4,3 +4,3 @@ fn\n same\n-before\n+after\n tail\n@@ -20 +20 @@\n-a\n+b\n'
  const p = parse(patch)
  assert.equal(p.additions, 2)
  assert.equal(p.deletions, 2)
  assert.equal(p.hunks.length, 2)
  assert.deepEqual(own(p.rows.filter(r => r.old !== null).map(r => r.old)), [4, 5, 6, 20])
  assert.deepEqual(own(p.rows.filter(r => r.new !== null).map(r => r.new)), [4, 5, 6, 20])
})

test('zero-length ranges and content resembling file headers', () => {
  const p = parse('@@ -0,0 +1,2 @@\n+++ actually content\n+\n@@ -4,2 +5,0 @@\n--- content too\n-\n')
  assert.equal(p.additions, 2)
  assert.equal(p.deletions, 2)
  assert.equal(p.rows[1].kind, 'add')
  assert.equal(p.rows[4].kind, 'del')
  assert.equal(p.rows[1].old, null)
  assert.equal(p.rows[4].new, null)
})

test('no-newline notes do not advance either counter', () => {
  const p = parse('@@ -1 +1 @@\n-old\n\\ No newline at end of file\n+new\n\\ No newline at end of file\n')
  assert.equal(p.rows[2].kind, 'note')
  assert.equal(p.rows[3].new, 1)
  assert.equal(p.additions, 1)
})

test('empty, metadata, binary and incomplete patches are safe', () => {
  assert.equal(parse('').rows.length, 0)
  assert.equal(parse('rename from a\nrename to b\n').hunks.length, 0)
  assert.equal(parse('Binary files a/a and b/a differ\n').binary, true)
  assert.equal(parse('GIT binary patch\nliteral 4\n').binary, true)
  const p = parse('@@ -1,3 +1,3 @@\n line\n-par')
  assert.equal(p.deletions, 1)
  assert.equal(p.rows[2].text, '-par')
})

test('text is preserved including CR and HTML, never interpreted', () => {
  const p = parse('@@ -0,0 +1 @@\n+<img onerror="bad()">\r\n')
  assert.equal(p.rows[1].text, '+<img onerror="bad()">\r')
})

test('split planning pairs replacements and pads unequal runs', () => {
  const p = parse('@@ -1,4 +1,3 @@\n keep\n-old one\n-old two\n+new one\n tail\n')
  const rows = planSplitRows(p.rows)
  const replacement = rows.filter(row => row.replacement)
  assert.equal(replacement.length, 1)
  assert.equal(replacement[0].old.row.kind, 'del')
  assert.equal(replacement[0].new.row.kind, 'add')
  const padded = rows.find(row => row.old?.row.text === '-old two')
  assert.equal(padded.new, null)
  assert.ok(rows.some(row => row.kind === 'hunk'))
})

test('layout selector preserves explicit modes and uses unified on narrow auto', () => {
  assert.equal(resolveDiffLayout('split', 300), 'split')
  assert.equal(resolveDiffLayout('unified', 1800), 'unified')
  assert.equal(resolveDiffLayout('auto', 899), 'unified')
  assert.equal(resolveDiffLayout('auto', 900), 'split')
  assert.equal(resolveDiffLayout('auto', null), 'unified')
})

test('group plus path identity keeps simultaneous staged/unstaged distinct', () => {
  assert.notEqual(identity({ path: 'a', group: 'staged' }, 'working'), identity({ path: 'a', group: 'unstaged' }, 'working'))
  assert.equal(identity({ path: 'a', staged: true }, 'working'), identity({ path: 'a', group: 'staged' }, 'working'))
  assert.notEqual(identity({ path: 'b:c', group: 'a' }, 'working'), identity({ path: 'c', group: 'a:b' }, 'working'))
  assert.equal(identity({ path: 'a', status: '?' }, 'working'), identity({ path: 'a', group: 'untracked' }, 'working'))
})
