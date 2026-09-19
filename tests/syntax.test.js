import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { languageForPath, tokenize, highlightRows } from '../scripts/syntax-entry.js'

test('shipped client contains a working self-contained syntax bundle', () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const bundled = source.split('// BEGIN BUNDLED SYNTAX\n')[1].split('// END BUNDLED SYNTAX')[0]
  const syntax = runInNewContext(`${bundled}\nGitSyntax`)
  assert.equal(syntax.languageForPath('x.py'), 'python')
  assert.ok(syntax.tokenize('return 42', 'python')[0].some(token => token.classes.includes('keyword')))
})

test('recognizes project languages and leaves unknown formats plain', () => {
  for (const [path, language] of [['app.tsx', 'typescript'], ['a.py', 'python'], ['a.yml', 'yaml'], ['Dockerfile.dev', 'dockerfile'], ['production.Dockerfile', 'dockerfile'], ['.env.example', 'ini'], ['x.svg', 'xml']]) assert.equal(languageForPath(path), language)
  assert.equal(languageForPath('a.bin'), null)
})
test('syntax tokens preserve hostile text without creating HTML elements', () => {
  const code = 'const text = "<script>alert(1)</script>&quot;";\n// <img src=x onerror=alert(1)>\nconst x = 42;'
  const lines = tokenize(code, 'javascript')
  assert.equal(lines.map(line => line.map(token => token.text).join('')).join('\n'), code)
  assert.ok(lines.flat().some(token => token.classes.includes('hljs-keyword')))
  assert.ok(lines.flat().some(token => token.classes.includes('hljs-string')))
  assert.ok(lines.flat().every(token => /^[\w -]*$/.test(token.classes)))
})
test('multi-line spans retain classification and exact newlines', () => {
  const code = '/* first\nsecond */\nconst num = 2;'
  const lines = tokenize(code, 'javascript')
  assert.ok(lines[1][0].classes.includes('comment'))
  assert.equal(lines.map(line => line.map(token => token.text).join('')).join('\n'), code)
})
test('deleted lexical state does not leak into added code', () => {
  const rows = [{ kind: 'hunk', text: '@@' }, { kind: 'del', text: '-/* start a comment' }, { kind: 'add', text: '+const value = 1;' }]
  const tokens = highlightRows(rows, 'app.ts')
  assert.ok(tokens.get(2).some(token => token.classes.includes('keyword')))
  assert.ok(!tokens.get(2).some(token => token.classes.includes('comment')))
})
test('unsupported types, toggled off and oversized patches bypass syntax', () => {
  const rows = [{ kind: 'add', text: '+const a = 1' }]
  assert.equal(highlightRows(rows, 'a.bin'), null)
  assert.equal(highlightRows(rows, 'a.ts', false), null)
  assert.equal(highlightRows([{ kind: 'add', text: '+' + 'a'.repeat(200000) }], 'a.ts'), null)
})
