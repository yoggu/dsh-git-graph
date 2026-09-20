import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import json from 'highlight.js/lib/languages/json'
import yaml from 'highlight.js/lib/languages/yaml'
import css from 'highlight.js/lib/languages/css'
import xml from 'highlight.js/lib/languages/xml'
import bash from 'highlight.js/lib/languages/bash'
import sql from 'highlight.js/lib/languages/sql'
import markdown from 'highlight.js/lib/languages/markdown'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import java from 'highlight.js/lib/languages/java'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import ini from 'highlight.js/lib/languages/ini'
import diff from 'highlight.js/lib/languages/diff'

for (const [name, grammar] of Object.entries({ javascript, typescript, python, json, yaml, css, xml, bash, sql, markdown, go, rust, java, dockerfile, ini, diff })) hljs.registerLanguage(name, grammar)

export function languageForPath(path) {
  const name = String(path).split('/').pop().toLowerCase()
  if (name === 'dockerfile' || name.endsWith('.dockerfile') || name.startsWith('dockerfile.')) return 'dockerfile'
  if (name === '.env' || name.startsWith('.env.')) return 'ini'
  const extension = name.split('.').pop()
  return ({ js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'typescript', tsx: 'typescript', py: 'python', pyi: 'python', json: 'json', jsonc: 'json', yml: 'yaml', yaml: 'yaml', css: 'css', html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml', vue: 'xml', sh: 'bash', bash: 'bash', zsh: 'bash', sql: 'sql', md: 'markdown', markdown: 'markdown', go: 'go', rs: 'rust', java: 'java', ini: 'ini', toml: 'ini', cfg: 'ini', diff: 'diff', patch: 'diff' })[extension] || null
}

// Convert ONLY the span markup emitted by highlight.js into owned text tokens.
// No repository HTML is inserted into DOM; React escapes all token text.
function decode(text) {
  return text.replace(/&(amp|lt|gt|quot|#x27|#39);/g, (_, entity) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'", '#39': "'" })[entity])
}
export function tokenize(code, language) {
  if (!language || !hljs.getLanguage(language)) return code.split('\n').map(text => [{ text, classes: '' }])
  const html = hljs.highlight(code, { language, ignoreIllegals: true }).value
  const stack = [], lines = [[]]
  for (const part of html.split(/(<span class="[^"]*">|<\/span>)/g)) {
    if (part.startsWith('<span class="')) { stack.push(part.slice(13, -2)); continue }
    if (part === '</span>') { stack.pop(); continue }
    const chunks = decode(part).split('\n')
    chunks.forEach((text, i) => {
      if (i) lines.push([])
      if (text) lines[lines.length - 1].push({ text, classes: stack.join(' ') })
    })
  }
  return lines
}

// Old and new hunk sides are highlighted independently: removed strings/comments
// cannot leak lexical state into additions. Missing context between hunks resets it.
export function highlightRows(rows, path, enabled = true) {
  const language = languageForPath(path)
  if (!enabled || !language || rows.length > 5000 || rows.reduce((n, row) => n + row.text.length, 0) > 200000) return null
  const result = new Map()
  let group = []
  const flush = () => {
    for (const side of ['old', 'new']) {
      const selected = group.filter(({ row }) => row.kind === 'ctx' || row.kind === (side === 'old' ? 'del' : 'add'))
      if (!selected.length) continue
      const tokens = tokenize(selected.map(({ row }) => row.text.slice(1)).join('\n'), language)
      selected.forEach(({ index }, i) => result.set(index, tokens[i] || []))
    }
    group = []
  }
  try {
    rows.forEach((row, index) => {
      if (row.kind === 'hunk' || row.kind === 'meta') flush()
      else if (['add', 'del', 'ctx'].includes(row.kind)) group.push({ row, index })
    })
    flush()
    return result
  } catch { return null }
}
