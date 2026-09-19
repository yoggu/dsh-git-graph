import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'

// Only regenerate the marked, bundled highlighter; client.js stays hand-editable.
const { outputFiles } = await build({ entryPoints: [new URL('./syntax-entry.js', import.meta.url).pathname], bundle: true, write: false, minify: true, format: 'iife', globalName: 'GitSyntax', target: ['es2022'], legalComments: 'inline' })
const file = new URL('../client.js', import.meta.url)
const source = await readFile(file, 'utf8')
const start = '    // BEGIN BUNDLED SYNTAX\n'
const end = '    // END BUNDLED SYNTAX'
const from = source.indexOf(start), to = source.indexOf(end, from)
if (from < 0 || to < 0) throw new Error('Missing bundled syntax markers in client.js')
await writeFile(file, source.slice(0, from + start.length) + outputFiles[0].text + '\n' + source.slice(to))
console.log(`Bundled highlight.js: ${outputFiles[0].contents.length} bytes (no CDN/runtime downloads)`)
