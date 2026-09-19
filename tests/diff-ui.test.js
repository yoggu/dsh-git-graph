import { readFileSync, existsSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import assert from 'node:assert/strict'

// Keep these markers when inserting the snippet into client.js. No browser needed.
const snippet = new URL('../diff-workspace.snippet.js', import.meta.url)
const source = readFileSync(existsSync(snippet) ? snippet : new URL('../client.js', import.meta.url), 'utf8')
const helpers = source.split('// BEGIN DIFF UI PURE HELPERS')[1]?.split('// END DIFF UI PURE HELPERS')[0]
assert.ok(helpers, 'Diff UI helper markers must remain in client.js after integration')
const { parseUnifiedPatch: parse, diffFileIdentity: identity } = runInNewContext(`${helpers}; ({ parseUnifiedPatch, diffFileIdentity })`)
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

test('group plus path identity keeps simultaneous staged/unstaged distinct', () => {
  assert.notEqual(identity({ path: 'a', group: 'staged' }, 'working'), identity({ path: 'a', group: 'unstaged' }, 'working'))
  assert.equal(identity({ path: 'a', staged: true }, 'working'), identity({ path: 'a', group: 'staged' }, 'working'))
  assert.notEqual(identity({ path: 'b:c', group: 'a' }, 'working'), identity({ path: 'c', group: 'a:b' }, 'working'))
  assert.equal(identity({ path: 'a', status: '?' }, 'working'), identity({ path: 'a', group: 'untracked' }, 'working'))
})
