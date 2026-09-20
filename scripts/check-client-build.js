import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const tsdown = require.resolve('tsdown/run')
const temp = await mkdtemp(join(tmpdir(), 'dsh-git-graph-client-'))
try {
  const result = spawnSync(process.execPath, [tsdown, '--out-dir', temp], {
    cwd: root,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    process.stderr.write(result.stdout)
    process.stderr.write(result.stderr)
    process.exit(result.status ?? 1)
  }
  const [expected, actual] = await Promise.all([
    readFile(join(temp, 'client.js')),
    readFile(join(root, 'client.js')),
  ])
  if (!expected.equals(actual)) {
    console.error('client.js is stale; run npm run build')
    process.exit(1)
  }
  console.log('client.js matches src/client')
} finally {
  await rm(temp, { recursive: true, force: true })
}
