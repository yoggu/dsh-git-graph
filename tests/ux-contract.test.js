import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import {
  STATUS_CONTRACT,
  statusContract,
  buildFileHierarchy,
  flattenHierarchy,
  uniqueRenderedEntries,
  uniquePathCount,
  syntheticWorkingRow,
  toggleAccordion,
  diffTabPayload,
  DIFF_LAYOUT_OPTIONS,
} from './ux-fixtures.js'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const pure = source.split('// BEGIN DIFF UI PURE HELPERS')[1]?.split('// END DIFF UI PURE HELPERS')[0]
assert.ok(pure, 'integrated client must retain the pure diff helper boundary')
const helpers = runInNewContext(`${pure}; ({ parseUnifiedPatch, diffFileIdentity, resolveDiffLayout })`)
const own = value => JSON.parse(JSON.stringify(value))

const sourceHas = pattern => pattern.test(source)

const fixtureFiles = [
  { path: 'src/zeta.ts', status: 'M' },
  { path: 'src/components/Button.tsx', status: 'A' },
  { path: 'src/components/Input.tsx', status: 'M' },
  { path: 'README.md', status: 'D' },
  { path: 'src/alpha.ts', status: 'R', oldPath: 'old-alpha.ts' },
]

test('commit click is an accordion transition and a second click collapses it', () => {
  assert.equal(toggleAccordion(null, 'abc'), 'abc')
  assert.equal(toggleAccordion('abc', 'abc'), null)
  assert.equal(toggleAccordion('abc', 'def'), 'def')
  assert.ok(sourceHas(/setSelected\(current => current === commit\.hash \? null : commit\.hash\)/)
    || sourceHas(/toggleAccordion|setExpandedCommit|expandedCommit/),
    'commit click must toggle the selected accordion row')
  assert.ok(sourceHas(/aria-expanded/) || sourceHas(/CommitInspector[\s\S]{0,500}selected/),
    'commit details must be attached to an expandable selected row')
})

test('changed files are rendered as a deterministic folder hierarchy', () => {
  const hierarchy = buildFileHierarchy([...fixtureFiles].reverse())
  assert.deepEqual(own(flattenHierarchy(hierarchy)), [
    { kind: 'file', path: 'README.md', name: 'README.md' },
    { kind: 'folder', path: 'src', name: 'src' },
    { kind: 'file', path: 'src/alpha.ts', name: 'alpha.ts' },
    { kind: 'folder', path: 'src/components', name: 'components' },
    { kind: 'file', path: 'src/components/Button.tsx', name: 'Button.tsx' },
    { kind: 'file', path: 'src/components/Input.tsx', name: 'Input.tsx' },
    { kind: 'file', path: 'src/zeta.ts', name: 'zeta.ts' },
  ])
  assert.ok(sourceHas(/buildFileHierarchy|makeFileTree|ChangedTree|folder|gg-du-folder/),
    'changed-file UI must expose folders, not only flat paths')
  assert.match(source, /sort\(/, 'folder and file siblings must be sorted deterministically')
})

test('status badges expose semantic labels and status-specific colors', () => {
  assert.deepEqual(Object.fromEntries(Object.keys(STATUS_CONTRACT).map(code => [code, statusContract(code).label])), {
    M: 'Modified', A: 'Added', D: 'Deleted', R: 'Renamed', C: 'Copied', U: 'Unmerged', '?': 'Untracked',
  })
  assert.match(source, /data-status/)
  for (const [code, detail] of Object.entries(STATUS_CONTRACT)) {
    assert.ok(source.includes(`data-status='${code}'`) || source.includes(`data-status=\"${code}\"`) || source.includes(`status-${code}`), `${code} status color hook`)
    assert.match(source, new RegExp(detail.label), `${code} semantic label`)
  }
})

test('diff counts expose +added and -deleted labels from parsed changes', () => {
  const parsed = helpers.parseUnifiedPatch('@@ -4,3 +4,2 @@\n-old one\n-old two\n+new one\n keep\n')
  assert.equal(parsed.additions, 1)
  assert.equal(parsed.deletions, 2)
  assert.match(source, /gg-du-added/)
  assert.match(source, /gg-du-deleted/)
  assert.match(source, /Changed lines/)
  assert.match(source, /\+\$\{parsed\.additions\}/)
  assert.match(source, /−\$\{parsed\.deletions\}|-\$\{parsed\.deletions\}/)
})

test('file click opens a git-diff tab with complete commit and working parameters', () => {
  const payload = diffTabPayload({ sessionId: 's1', mode: 'commits', base: 'parent', head: 'commit', path: 'src/a.ts', oldPath: 'src/old.ts' })
  assert.deepEqual(payload, { sessionId: 's1', kind: 'git-diff', params: { mode: 'commits', base: 'parent', head: 'commit', path: 'src/a.ts', oldPath: 'src/old.ts' } })
  const working = diffTabPayload({ sessionId: 's1', mode: 'working', group: 'unstaged', path: 'src/a.ts', staged: false })
  assert.deepEqual(working, { sessionId: 's1', kind: 'git-diff', params: { mode: 'working', path: 'src/a.ts', group: 'unstaged', staged: false } })
  assert.match(source, /tabInfo\.tab\.actions\.openTab|actions\.openTab|openDiffTab/, 'file click must route through tabInfo.tab.actions.openTab')
  assert.ok(/kind:\s*['"]git-diff['"]/.test(source) || (/const DIFF_KIND\s*=\s*['"]git-diff['"]/.test(source) && /openTab\(DIFF_KIND/.test(source)),
    'openTab payload must use git-diff kind')
})

test('uncommitted synthetic row is first, expandable, muted, and counts unique paths', () => {
  const entries = [
    { path: 'src/a.ts', group: 'staged', status: 'M' },
    { path: 'src/a.ts', group: 'unstaged', status: 'M' },
    { path: 'README.md', group: 'unstaged', status: 'M' },
    { path: 'new.txt', group: 'untracked', status: '?' },
  ]
  assert.equal(uniqueRenderedEntries(entries).length, 4, 'group-specific accordion rows remain distinct')
  assert.equal(uniquePathCount(entries), 3, 'summary count collapses partially-staged path duplicates')
  const row = syntheticWorkingRow(entries)
  assert.equal(row.count, 3)
  assert.equal(row.expandable, true)
  assert.match(source, /Uncommitted changes|working-tree|synthetic|WorkingAccordion/, 'history graph must prepend the synthetic row')
  assert.match(source, /expandable|aria-expanded|onClick/, 'synthetic row must expand')
})

test('diff layout selector defaults Auto and labels Combined for internal unified mode', () => {
  assert.deepEqual(DIFF_LAYOUT_OPTIONS.map(option => option.label), ['Auto', 'Split', 'Combined'])
  assert.equal(helpers.resolveDiffLayout('auto', null), 'unified')
  assert.match(source, /useState\(['"]auto['"]\)/)
  assert.match(source, /\[['"]auto['"],\s*['"]Auto['"]\]/)
  assert.match(source, /\[['"]split['"],\s*['"]Split['"]\]/)
  assert.match(source, /\[['"]unified['"],\s*['"]Combined['"]\]/)
})

test('diff tab definition is multi-instance and sidebar has no review-comment UI or storage', () => {
  const definition = source.slice(source.indexOf('id: DIFF_ID'), source.indexOf('id: CHANGES_ID'))
  assert.match(definition, /multiple:\s*true/, 'each clicked file must be able to open its own diff tab')
  assert.doesNotMatch(source, /review comment|reviewComment|review-comments|ReviewComment|commentStorage/i)
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/i)
  assert.doesNotMatch(source, /onComment|comments?\s*:/i)
})
