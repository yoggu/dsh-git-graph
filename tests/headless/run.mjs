import { chromium } from 'playwright-core'
import { build } from 'esbuild'
import { readFile, writeFile, mkdir, mkdtemp, rm, access } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { internals } from '../../lib/index.js'

const root = new URL('../../', import.meta.url)
const output = new URL('../../test-artifacts/', import.meta.url)
await mkdir(output, { recursive: true })
const client = await readFile(new URL('client.js', root), 'utf8')
const fixtureJS = (await build({ entryPoints: [new URL('./fixture-entry.js', import.meta.url).pathname], bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"production"' } })).outputFiles[0].text
const dir = await mkdtemp(join(tmpdir(), 'gg-headless-'))
const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' }).trim()
const put = (path, text) => writeFile(join(dir, path), text)
await put('app.ts', 'export const total = 1;\n// base\n')
await put('deleted.py', 'print("remove me")\n')
await put('image.bin', Buffer.from([0, 1, 2, 3]))
git('init', '-q'); git('config', 'user.name', 'UI Test'); git('config', 'user.email', 'ui@example.invalid'); git('add', '.'); git('commit', '-qm', 'Base')
git('branch', '-M', 'main'); git('checkout', '-qb', 'topic')
// A tag on the oldest commit, where no branch label sits beside it: the badge
// it wears is the whole decoration, so the glyph it draws is what a reader has
// to identify it by.
git('tag', 'v1.0.0')
await mkdir(join(dir, 'src/components'), { recursive: true })
await put('src/topic.ts', 'export function topic() { return true; }\n'); git('add', '.'); git('commit', '-qm', 'Topic change')
git('checkout', '-q', 'main'); await put('src/main.ts', 'export const main = 1;\n'); git('add', '.'); git('commit', '-qm', 'Main change'); git('merge', '--no-ff', '-qm', 'Merge topic', 'topic')
await put('app.ts', 'export const total = 42;\n// highlighted change\nconst hostile = "<img src=x onerror=alert(1)>";\n')
await put('src/components/added.py', 'def greet(name):\n    return "Hello " + name\n')
await put('image.bin', Buffer.from([0, 9, 8, 7])); await rm(join(dir, 'deleted.py')); git('add', '-A'); git('commit', '-qm', 'Review multiple statuses')
await put('app.ts', 'export const total = 50;\n// staged\n'); git('add', 'app.ts')
await put('app.ts', 'export const total = 60;\n// unstaged\n'); await put('untracked.txt', 'Untracked content\n')
// A real remote on disk, so fetching is exercised without a network: one
// remote-tracking branch that agrees with its local branch, and one that has
// drifted onto a commit where no local branch of that name exists.
const remoteDir = mkdtempSync(join(tmpdir(), 'gg-remote-'))
execFileSync('git', ['init', '-q', '--bare', remoteDir])
git('remote', 'add', 'origin', remoteDir)
git('push', '-q', '-u', 'origin', 'main')
git('update-ref', 'refs/remotes/origin/dev', git('rev-parse', 'HEAD~1'))
const realRepo = process.env.GRAPH_TEST_REPO || ''
const realBefore = realRepo ? execFileSync('git', ['-C', realRepo, 'status', '--porcelain=v2'], { encoding: 'utf8' }) : ''
const collection = await mkdtemp(join(tmpdir(), 'gg-picker-'))
const otherWorkspace = await mkdtemp(join(tmpdir(), 'gg-picker-other-'))
const initPickerRepo = async (root, subject) => {
  await mkdir(root, { recursive: true })
  const run = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim()
  run('init', '-q'); run('config', 'user.name', 'Picker Test'); run('config', 'user.email', 'picker@example.invalid')
  await writeFile(join(root, 'shared.txt'), subject + '\n'); run('add', '.'); run('commit', '-qm', subject)
  return root
}
const childA = await initPickerRepo(join(collection, 'child-a'), 'Repository A')
const childB = await initPickerRepo(join(collection, 'packages/child-b'), 'Repository B')
await initPickerRepo(otherWorkspace, 'Other workspace repository')
const workspaceList = [
  { id: 'fixture-root', title: 'Fixture', path: dir },
  { id: 'collection', title: 'Plugins', path: collection },
  { id: 'other', title: 'Other project', path: otherWorkspace },
]
const testCtx = { get(name) {
  if (name === 'sessions') return { get(id) { return { header: { cwd: id === 'parent' ? collection : id === 'history' && realRepo ? realRepo : dir } } } }
  if (name === 'workspaceRegistry') return { list: () => workspaceList, get: id => workspaceList.find(workspace => workspace.id === id) }
} }
const theme = `
* { box-sizing:border-box } body { margin:0; font-family:system-ui,sans-serif; background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary) }
:root { color-scheme:dark; --dsw-alias-bg-base:#151515; --dsw-alias-bg-overlay:#282828; --dsw-alias-bg-layer-2:#282828; --dsw-alias-label-primary:#e9e9eb; --dsw-alias-label-secondary:#a1a1ab; --dsw-alias-border-l1:#343438; --dsw-alias-border-l2:#515158; --dsw-alias-brand-primary:#639fff; --dsw-alias-state-success-primary:#72c58b; --dsw-alias-state-error-primary:#f48787; --dsh-content-font-size:14px; --dsh-content-font-size-secondary:13px; }
:root[data-theme=light] { color-scheme:light; --dsw-alias-bg-base:#fff; --dsw-alias-bg-overlay:#fff; --dsw-alias-bg-layer-2:#f1f2f4; --dsw-alias-label-primary:#1d2330; --dsw-alias-label-secondary:#626875; --dsw-alias-border-l1:#d8dce3; --dsw-alias-border-l2:#aab2c0; --dsw-alias-brand-primary:#286bd0; --dsw-alias-state-success-primary:#16733c; --dsw-alias-state-error-primary:#ba3434; }
.fixture-shell { height:100vh; display:flex; flex-direction:column; overflow:hidden } .fixture-title{height:32px;display:flex;align-items:center;padding:0 8px;border-bottom:1px solid var(--dsw-alias-border-l1)} .fixture-body{flex:1;min-height:0}
`
const html = `<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><style>${theme}</style></head><body><div id="root"></div><script src="/fixture.js"></script><script src="/client.js"></script></body></html>`
const executableCandidates = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, process.env.BROWSER_PATH, '/home/yoggu/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome', '/home/yoggu/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean)
let executablePath
for (const candidate of executableCandidates) { try { await access(candidate); executablePath = candidate; break } catch {} }
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const errors = [], checks = [], requests = []
// A subscription is observable on the server, which is where it costs something.
let openStreams = 0
let delayNextCommit = false
page.on('pageerror', error => errors.push(error.message))

// The page is served by a real HTTP server rather than intercepted, so the
// plugin's own routes are exercised as shipped — including the server-sent
// events the graph follows the repository with. Interception cannot stream, and
// a mocked push channel would prove nothing about the real one.
const server = createServer(async (req, res) => {
  const address = new URL(req.url ?? '/', 'http://127.0.0.1')
  if (address.pathname === '/api/dsh-git-graph') {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    let input
    try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
    catch { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'bad request' })); return }
    requests.push(input)
    try {
      if (input.op === 'commit' && delayNextCommit) { delayNextCommit = false; await new Promise(resolve => setTimeout(resolve, 150)) }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, result: await internals.dispatch(testCtx, input) }))
    } catch (error) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: error.message }))
    }
    return
  }
  if (address.pathname === '/api/dsh-git-graph/events') {
    // The shipped handler, not a copy of it: this is the route apply() registers.
    openStreams += 1
    req.on('close', () => { openStreams -= 1 })
    const controller = new AbortController()
    res.on('close', () => controller.abort())
    try {
      const response = await internals.openEvents(testCtx, new Request(address, { signal: controller.signal }))
      res.writeHead(response.status, Object.fromEntries(response.headers))
      if (response.body === null) res.end()
      else {
        for await (const chunk of response.body) {
          if (controller.signal.aborted) break
          res.write(chunk)
        }
        res.end()
      }
    } catch (error) { if (!res.headersSent) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: error.message })) } else res.end() }
    return
  }
  const body = address.pathname === '/fixture.js' ? fixtureJS : address.pathname === '/client.js' ? client : html
  const type = address.pathname === '/fixture.js' || address.pathname === '/client.js' ? 'application/javascript' : 'text/html'
  res.writeHead(200, { 'content-type': `${type}; charset=utf-8` })
  res.end(body)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}/`
const check = (label, condition) => { assert.ok(condition, label); checks.push(label); console.log(`PASS ${label}`) }
const screenshot = name => page.screenshot({ path: new URL(name, output).pathname })
const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
const text = selector => page.locator(`${selector}:visible`).innerText()
const waitGraph = async () => {
  await page.waitForFunction(() => testState.ready && document.querySelector('.gg-column-heading') && document.querySelectorAll('.gg-row').length > 1)
  await frame()
}
const waitAccordion = async label => {
  await page.waitForFunction(expected => document.querySelector('.gg-accordion')?.getAttribute('aria-label') === expected, label)
  await frame()
}
const waitDiff = async path => {
  await page.waitForFunction(expected => {
    const title = document.querySelector('.gg-du-title')?.textContent ?? ''
    return (title === expected || title.endsWith(` · ${expected}`)) && ![...document.querySelectorAll('.gg-empty')].some(node => /Loading/.test(node.textContent))
  }, path)
  await frame()
}
try {
  await page.goto(origin)
  await waitGraph()
  // The kinds, not the count: the bundle's promise is which tabs exist, and a
  // count would have to be edited every time one is added.
  check('Actual client registers the graph, commit, diff and compare tab types and Git icon',
    await page.locator('.fixture-title svg').count() === 1
    && await page.evaluate(() => [...testState.registrations].sort().join(',')) === 'git-commit,git-compare,git-diff,git-graph')
  check('History exposes Graph, Description, Date, Author, Commit columns', (await text('.gg-column-heading')).replace(/\n/g, ' ').includes('Graph Description Date Author Commit'))
  check('Graph header has no embedded History or Changes tabs', await page.locator('.gg-modes, .gg-mode').count() === 0)
  check('Exhausted history has no fake All commits loaded button', await page.getByText('All commits loaded', { exact: true }).count() === 0)
  check('Graph uses readable UI typography', await page.locator('.gg-host').evaluate(e => getComputedStyle(e).fontSize === getComputedStyle(document.documentElement).getPropertyValue('--dsh-content-font-size').trim() && getComputedStyle(e).fontFamily === getComputedStyle(e.parentElement).fontFamily))

  const rows = page.locator('.gg-row')
  check('Dirty worktree is the first grey synthetic row', /Uncommitted changes \(2\)/i.test(await rows.first().innerText()))
  const syntheticStroke = await page.locator('.gg-canvas path').first().getAttribute('stroke')
  check('Uncommitted row has a grey graph connector', syntheticStroke === '#8b949e')
  await rows.first().click(); await waitAccordion('Uncommitted changes')
  check('Uncommitted row expands directly beneath itself', await page.locator('.gg-row-stack').first().locator('.gg-accordion').count() === 1)
  check('Partly staged path appears separately but summary counts unique paths', await page.locator('.gg-accordion .gg-tree-file[title="app.ts"]').count() === 2 && /\(2\)/.test(await rows.first().innerText()))
  const workingColors = await page.locator('.gg-accordion .gg-tree-file').evaluateAll(nodes => Object.fromEntries(nodes.map(n => [n.dataset.status, getComputedStyle(n).getPropertyValue('--gg-status-accent')])))
  check('Working files use icons plus status-color accents', await page.locator('.gg-accordion .gg-file-icon').count() > 0 && Object.values(workingColors).some(Boolean))
  await rows.first().click();
  check('Clicking the selected row collapses its accordion', await page.locator('.gg-accordion').count() === 0)

  const commitRow = rows.nth(1)
  check('Branch labels precede commit messages without overlay positioning', await commitRow.locator('.gg-description').evaluate(e => e.firstElementChild?.classList.contains('gg-refs') && getComputedStyle(e).display === 'flex' && getComputedStyle(e).position === 'static'))
  // `main` and `origin/main` sit on this commit; `origin/dev` has drifted onto the
  // commit below, where no local `dev` exists.
  check('A branch in sync with its remote folds the remote into one badge', await commitRow.locator('.gg-ref').count() === 1
    && await commitRow.locator('.gg-ref-head .gg-ref-name').innerText() === 'main'
    && await commitRow.locator('.gg-ref-head .gg-ref-remote-name').innerText() === 'origin'
    && await commitRow.locator('.gg-ref-remote-name').evaluate(e => getComputedStyle(e).fontStyle) === 'italic')
  check('A drifted remote-tracking branch keeps its own full-name badge', await rows.nth(2).locator('.gg-ref-remote .gg-ref-name').innerText() === 'origin/dev')
  // A tag is not a branch, and the shipped bundle has to draw it as a tag: the
  // glyph the tag badge carries must not be the branch mark the head badge
  // beside it wears, and it must be a real drawing (a body plus its hole)
  // rather than the empty svg an unknown icon name would produce.
  const tagBadge = page.locator('.gg-ref-tag').first()
  const tagGlyph = await tagBadge.locator('.gg-ref-icon svg path').evaluateAll(nodes => nodes.map(node => node.getAttribute('d')))
  const branchGlyph = await commitRow.locator('.gg-ref-head .gg-ref-icon svg path').evaluateAll(nodes => nodes.map(node => node.getAttribute('d')))
  check('A tag badge wears the tag glyph, not the branch mark',
    await tagBadge.locator('.gg-ref-name').innerText() === 'v1.0.0'
    && tagGlyph.length === 2 && tagGlyph.every(d => typeof d === 'string' && d.length > 0)
    && tagGlyph[0] !== branchGlyph[0])
  await screenshot('refs-tag-glyph.png')
  await screenshot('refs-combined-remote.png')
  delayNextCommit = true
  await commitRow.click()
  const loadingAccordion = page.locator('.gg-accordion-state[aria-label="Loading commit details"]')
  await loadingAccordion.waitFor()
  check('Commit loading appears top-left inside the reserved accordion', await loadingAccordion.evaluate(e => {
    const content = e.querySelector('.gg-accordion-state-content'), box = e.getBoundingClientRect(), row = e.parentElement.querySelector('.gg-row').getBoundingClientRect()
    return getComputedStyle(content).alignItems === 'flex-start' && box.top >= row.bottom && box.height > 200
  }))
  await waitAccordion('Commit details')
  check('Commit metadata and changed file tree share the resizable accordion', await page.locator('.gg-accordion-meta').count() === 1 && await page.locator('.gg-accordion-files .gg-tree').count() === 1)
  const accordion = page.locator('.gg-accordion')
  const beforeResize = await accordion.boundingBox()
  const heightHandle = page.getByRole('separator', { name: 'Resize accordion height' })
  const heightBox = await heightHandle.boundingBox()
  await heightHandle.hover(); await page.mouse.down(); await page.mouse.move(heightBox.x + 20, heightBox.y + 86, { steps: 4 }); await page.mouse.up()
  const afterHeight = await accordion.boundingBox()
  check('Accordion height grows by dragging its bottom edge', afterHeight.height > beforeResize.height + 50)
  const columnHandle = page.getByRole('separator', { name: 'Resize accordion columns' })
  const columnBox = await columnHandle.boundingBox()
  const metaBefore = await page.locator('.gg-accordion-meta').boundingBox()
  await columnHandle.hover(); await page.mouse.down(); await page.mouse.move(columnBox.x + 100, columnBox.y + 20, { steps: 4 }); await page.mouse.up()
  const metaAfter = await page.locator('.gg-accordion-meta').boundingBox()
  check('Accordion column widths change by dragging their divider', metaAfter.width > metaBefore.width + 60)
  check('Compact folder chain is rendered in changed-file tree', await page.locator('.gg-tree-folder-name').filter({ hasText: 'src/components' }).count() === 1)
  const countText = await page.locator('.gg-file-counts').allInnerTexts()
  check('Per-file additions and deletions are visible', countText.some(value => /\+\d/.test(value)) && countText.some(value => /−\d/.test(value)))
  const changed = page.locator('.gg-accordion .gg-tree-file').first()
  const changedPath = await changed.getAttribute('title')
  await changed.click(); await waitDiff(changedPath)
  check('File click opens a separate git-diff tab', await page.evaluate(() => testState.openTabs) === 1 && (await page.evaluate(() => testState.opened.at(-1).kind)) === 'git-diff')
  check('Diff tab receives commit comparison parameters', await page.evaluate(() => { const p = testState.opened.at(-1).params; return p.mode === 'commits' && !!p.base && !!p.head && !!p.path }))
  const layoutDropdown = page.getByRole('button', { name: 'Diff layout' })
  check('Compact diff controls default to wrapping and expose a themed layout dropdown', await page.locator('button[aria-label="Toggle word wrap"]').getAttribute('aria-pressed') === 'true' && (await layoutDropdown.innerText()).includes('Auto view'))
  check('Context control explains unchanged lines around changes', (await page.getByRole('button', { name: 'Context lines' }).innerText()).includes('Context: 3'))
  await layoutDropdown.click()
  check('Layout dropdown uses the plugin theme instead of a native select', await page.getByRole('listbox', { name: 'Diff layout' }).count() === 1 && await page.getByRole('option').count() === 3)
  await page.getByRole('option', { name: 'Side by side' }).click()
  check('Explicit Split renders side-by-side diff cells', await page.locator('.gg-du-split').count() === 1)
  await page.getByRole('button', { name: 'Diff layout' }).click()
  await page.getByRole('option', { name: 'Inline' }).click()
  check('Combined layout remains available', await page.locator('.gg-du-line').count() > 0)
  check('Hostile source is rendered as text, not DOM', await page.locator('.gg-du-code img, .gg-du-code script').count() === 0)

  await page.evaluate(() => testHarness.setSession('fixture', 'git-graph'))
  await waitGraph(); await waitAccordion('Commit details')
  check('Returning from a commit diff restores the open commit accordion', await page.locator('.gg-row[aria-expanded="true"]').count() === 1)
  const restoredAccordion = await page.locator('.gg-accordion').boundingBox()
  const restoredMeta = await page.locator('.gg-accordion-meta').boundingBox()
  check('Accordion height and column split persist across tab switches', Math.abs(restoredAccordion.height - afterHeight.height) < 2 && Math.abs(restoredMeta.width - metaAfter.width) < 2)
  await page.locator('.gg-row').first().click(); await waitAccordion('Uncommitted changes')
  const workingFile = page.locator('.gg-accordion .gg-tree-file[title="app.ts"]').last()
  await workingFile.click(); await waitDiff('app.ts')
  check('Working-file diff opens another independent tab', await page.evaluate(() => testState.openTabs) === 2)
  check('Working diff preserves staged versus unstaged mode', await page.evaluate(() => { const p = testState.opened.at(-1).params; return p.mode === 'working' && p.group === 'unstaged' && p.staged === false }))

  await page.evaluate(() => testHarness.setSession('fixture', 'git-graph'))
  await waitGraph(); await waitAccordion('Uncommitted changes')
  check('Returning from a working diff restores the uncommitted accordion', await page.locator('.gg-row[aria-expanded="true"]').count() === 1)
  await page.setViewportSize({ width: 420, height: 900 }); await frame()
  const squeezed = await commitRow.locator('.gg-ref-head').evaluate(e => {
    const name = e.querySelector('.gg-ref-name'), remote = e.querySelector('.gg-ref-remote-name')
    return { name: name.clientWidth / name.scrollWidth, remote: remote.clientWidth / remote.scrollWidth }
  })
  check('When space runs out the remote segment yields before the branch name', squeezed.remote < 0.4 && squeezed.name > 0.7)
  const narrowColumns = await page.locator('.gg-column-heading > span').evaluateAll(nodes => Object.fromEntries(nodes.map(node => [node.textContent.trim(), getComputedStyle(node).display])))
  check('Narrow history hides lower-priority Author and Commit columns', narrowColumns.Author === 'none' && narrowColumns.Commit === 'none' && narrowColumns.Graph !== 'none' && narrowColumns.Description !== 'none')
  // Respect larger UI typography too: the timestamp must not wrap into a
  // second line just because the narrow Date column has only 112 pixels.
  await page.evaluate(() => document.documentElement.style.setProperty('--dsh-content-font-size', '16px')); await frame()
  const metadataFitsRows = () => page.locator('.gg-row .gg-date').evaluateAll(nodes => nodes.filter(node => node.textContent.trim()).every(node => {
    const cell = node.getBoundingClientRect(), row = node.closest('.gg-row').getBoundingClientRect()
    return cell.top >= row.top - .5 && cell.bottom <= row.bottom + .5 && cell.right <= row.right + .5
  }))
  check('Narrow date cells stay on one line inside their own fixed-height row', await metadataFitsRows())
  await page.locator('.gg-row').nth(1).hover(); await frame()
  check('Hovering a narrow commit does not spill dates into adjacent rows', await metadataFitsRows())
  await screenshot('history-narrow-hover.png')
  await page.evaluate(() => document.documentElement.style.removeProperty('--dsh-content-font-size')); await frame()
  await page.locator('.gg-row').nth(1).click(); await waitAccordion('Commit details')
  check('Narrow accordion stacks the 50/50 detail columns', await page.locator('.gg-accordion').evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length === 1 && e.scrollWidth <= e.clientWidth))
  await screenshot('accordion-narrow-dark.png')
  await page.evaluate(() => testHarness.theme('light')); await frame()
  check('Light theme keeps accordion readable', await page.locator('.gg-accordion').evaluate(e => getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)'))
  await screenshot('accordion-narrow-light.png')

  // Finding a commit and narrowing to one branch: the two ways a long history
  // is made navigable, exercised against the real host.
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.evaluate(() => testHarness.setSession('fixture', 'git-graph'))
  await waitGraph()
  // The uncommitted row is not a commit: it stays whatever is searched for.
  const subjectRows = async () => (await page.locator('.gg-row .gg-subject').allInnerTexts())
    .filter(value => !value.startsWith('Uncommitted changes'))
  check('Every branch is shown until one is chosen', (await subjectRows()).some(value => value.includes('Topic change')))
  await page.locator('.gg-find').fill('Topic change')
  await frame()
  const narrowed = await subjectRows()
  check('The find box narrows the drawn rows', narrowed.length >= 1 && narrowed.every(value => value.includes('Topic change')))
  check('The find box says how much of the page it matched', /of \d+ loaded commit/.test(await text('.gg-find-count')))
  await page.locator('.gg-find').fill('nothingmatches')
  await frame()
  check('A search that matches nothing says so instead of looking empty', (await subjectRows()).length === 0 && (await text('.gg-empty')).includes('may still hold'))
  await page.locator('.gg-find').fill('')
  await frame()
  check('Clearing the search brings every row back', (await subjectRows()).some(value => value.includes('Main change')))

  await page.getByRole('button', { name: 'Branch filter' }).click()
  await page.getByRole('option', { name: 'topic', exact: true }).click()
  await page.waitForFunction(() => ![...document.querySelectorAll('.gg-subject')].some(node => node.textContent.includes('Main change')), null, { timeout: 8000 })
  check('Choosing a branch reads only that branch’s history', !(await subjectRows()).some(value => value.includes('Main change')))
  await page.getByRole('button', { name: 'Branch filter' }).click()
  await page.getByRole('option', { name: 'All branches' }).click()
  await page.waitForFunction(() => [...document.querySelectorAll('.gg-subject')].some(node => node.textContent.includes('Main change')), null, { timeout: 8000 })
  check('Going back to all branches restores the whole history', (await subjectRows()).some(value => value.includes('Main change')))

  // Comparing two commits: mark both, then open the comparison.
  const before = await page.locator('.gg-row').count()
  await page.locator('.gg-row').nth(1).click({ modifiers: ['Control'] })
  await frame()
  check('Marking a commit shows what is being compared', await page.locator('.gg-compare-bar').count() === 1)
  await page.locator('.gg-row').nth(2).click({ modifiers: ['Control'] })
  await frame()
  check('A marked row is drawn as one side of the comparison', await page.locator('.gg-row.is-comparing').count() === 2)
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await frame()
  check('Comparing two commits opens a compare tab', await page.evaluate(() => testState.opened.at(-1).kind) === 'git-compare')
  check('The compare tab carries both revisions', await page.evaluate(() => { const p = testState.opened.at(-1).params; return /^[0-9a-f]{40}$/.test(p.base) && /^[0-9a-f]{40}$/.test(p.head) && p.base !== p.head }))
  // The comparison lists its files the way the rest of the plugin does.
  await page.locator('.gg-du-file:visible').first().waitFor({ timeout: 8000 })
  check('The comparison lists the files that differ', await page.locator('.gg-du-file:visible').count() > 0)
  check('The comparison states which two revisions it shows', /→/.test(await text('.gg-du-summary')))
  const comparedFile = page.locator('.gg-du-file:visible').first()
  const comparedPath = await comparedFile.getAttribute('title')
  await comparedFile.click(); await waitDiff(comparedPath)
  check('A file in the comparison opens the same diff viewer', await page.evaluate(() => { const p = testState.opened.at(-1).params; return p.mode === 'commits' && p.base !== p.head && typeof p.path === 'string' }))
  await page.evaluate(() => testHarness.setSession('fixture', 'git-graph'))
  await waitGraph()
  check('The comparison left the history itself untouched', await page.locator('.gg-row').count() === before)
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await frame()
  check('Clearing the comparison removes the bar', await page.locator('.gg-compare-bar').count() === 0)

  // The writing actions in a real browser: the menu, the dialog, and the exact
  // command the host would run. Every one of these is cancelled, so the fixture
  // repository must come out of this section byte for byte as it went in.
  const beforeWrites = execFileSync('git', ['-C', dir, 'status', '--porcelain=v2'], { encoding: 'utf8' })
  await page.locator('.gg-row').nth(2).click({ button: 'right' })
  await page.locator('.gg-menu').waitFor({ timeout: 5000 })
  const commitMenu = await page.locator('.gg-menu-item').allInnerTexts()
  check('Right-clicking a commit offers the writing actions',
    commitMenu.includes('Create branch here…') && commitMenu.includes('Cherry-pick onto this branch') && commitMenu.includes('Copy commit hash'))
  await page.getByRole('menuitem', { name: 'Create branch here…' }).click()
  await page.locator('.gg-dialog').waitFor({ timeout: 5000 })
  check('Choosing one opens a confirmation dialog', (await text('.gg-dialog-title')).includes('Create a branch at'))
  check('The dialog will not run while a required field is empty', await page.locator('.gg-dialog button[type=submit]').isDisabled())
  await page.locator('.gg-dialog input[type=text]').first().fill('probe/branch')
  await page.locator('.gg-argv').waitFor({ timeout: 5000 })
  check('The dialog shows the command the host would run', (await text('.gg-argv')).includes('git checkout -b probe/branch'))
  check('Once the field is filled the action can be confirmed', !(await page.locator('.gg-dialog button[type=submit]').isDisabled()))
  check('The dialog names where the repository stands', /on \w+ · /.test(await text('.gg-dialog-state')))
  await page.getByRole('button', { name: 'Cancel' }).click()
  await page.locator('.gg-dialog').waitFor({ state: 'detached', timeout: 5000 })
  check('Cancelling runs nothing',
    execFileSync('git', ['-C', dir, 'status', '--porcelain=v2'], { encoding: 'utf8' }) === beforeWrites
    && git('branch', '--list', 'probe/branch') === '')

  // Escape is the other way out, and it must work while the field has focus.
  await page.locator('.gg-row').nth(2).click({ button: 'right' })
  await page.locator('.gg-menu').waitFor({ timeout: 5000 })
  await page.getByRole('menuitem', { name: 'Revert this commit' }).click()
  await page.locator('.gg-dialog').waitFor({ timeout: 5000 })
  await page.keyboard.press('Escape')
  await page.locator('.gg-dialog').waitFor({ state: 'detached', timeout: 5000 })
  check('Escape closes the dialog without running anything',
    execFileSync('git', ['-C', dir, 'status', '--porcelain=v2'], { encoding: 'utf8' }) === beforeWrites)

  // A file's own action depends on where that file stands.
  if (await page.locator('.gg-accordion[aria-label="Uncommitted changes"]').count() === 0) {
    await page.locator('.gg-row').first().click()
  }
  await waitAccordion('Uncommitted changes')
  await page.locator('.gg-accordion .gg-tree-file[title="untracked.txt"]').click({ button: 'right' })
  await page.locator('.gg-menu').waitFor({ timeout: 5000 })
  const fileMenu = await page.locator('.gg-menu-item').allInnerTexts()
  check('An untracked file is offered for deletion, not for restore',
    fileMenu.some(label => label.startsWith('Delete untracked.txt')) && !fileMenu.some(label => /Discard/.test(label)))
  // Escape closes a menu wherever focus happens to be, which is what a reader
  // reaches for first — and the press that opened the menu must not close it.
  await page.keyboard.press('Escape')
  await frame()
  check('Escape closes the file menu', await page.locator('.gg-menu').count() === 0)
  await page.locator('.gg-row').nth(2).click({ button: 'right' })
  await page.locator('.gg-menu').waitFor({ timeout: 5000 })
  await page.keyboard.press('Escape')
  await frame()
  check('Escape closes the commit menu too', await page.locator('.gg-menu').count() === 0)
  check('Closing the menus ran nothing',
    execFileSync('git', ['-C', dir, 'status', '--porcelain=v2'], { encoding: 'utf8' }) === beforeWrites)

  // The reported case, end to end: a commit lands in the repository while the
  // graph is open, and nobody touches the view.
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.evaluate(() => testHarness.theme('dark'))
  await page.evaluate(() => testHarness.setSession('fixture', 'git-graph'))
  await waitGraph()
  const waitFor = async (predicate, timeout = 8000) => {
    const until = Date.now() + timeout
    while (Date.now() < until) { if (await predicate()) return true; await new Promise(resolve => setTimeout(resolve, 100)) }
    return false
  }
  check('A visible tab subscribes to the repository', await waitFor(() => Promise.resolve(openStreams === 1)))
  const rowsBefore = await page.locator('.gg-row').count()
  execFileSync('git', ['commit', '-q', '--allow-empty', '-m', 'Live push arrives'], { cwd: dir })
  await page.waitForFunction(() => [...document.querySelectorAll('.gg-row')].some(row => row.textContent.includes('Live push arrives')), null, { timeout: 10000 })
  await page.locator('.gg-notice').waitFor({ timeout: 2000 })
  check('A commit made while the graph is open appears without any user action', await page.locator('.gg-row').count() === rowsBefore + 1)
  check('The push reports what arrived', /new commit/.test(await page.locator('.gg-notice').innerText()))
  await screenshot('live-update.png')

  // While the tab is not on screen, the stream is closed and nothing is read.
  await page.evaluate(() => testHarness.setVisible(false)); await frame()
  check('A tab nobody is looking at closes its stream', await waitFor(() => Promise.resolve(openStreams === 0)))
  const requestsWhileHidden = requests.length
  execFileSync('git', ['commit', '-q', '--allow-empty', '-m', 'While hidden'], { cwd: dir })
  await new Promise(resolve => setTimeout(resolve, 2500))
  check('A hidden tab reads nothing while the repository changes', requests.length === requestsWhileHidden)
  await page.evaluate(() => testHarness.setVisible(true))
  // Coming back opens the stream again, whose first push of state is a fresh read.
  await page.locator('.gg-row', { hasText: 'While hidden' }).first().waitFor({ timeout: 8000 })
  check('Returning to the tab re-reads the history', requests.length > requestsWhileHidden)

  // Fetch is the one action that leaves this machine. A branch that exists only
  // on the remote must arrive without the working tree being touched.
  execFileSync('git', ['-C', remoteDir, 'branch', 'remote-only', 'main'])
  const worktreeBefore = execFileSync('git', ['status', '--porcelain=v2'], { cwd: dir, encoding: 'utf8' })
  const headBefore = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim()
  await page.getByRole('button', { name: 'Fetch from remotes' }).click()
  await page.waitForFunction(() => document.body.textContent.includes('origin/remote-only'), null, { timeout: 15000 })
  await frame()
  check('Fetch discovers a branch that only the remote had', await page.locator('.gg-ref-name', { hasText: 'origin/remote-only' }).count() >= 1)
  check('The fetch reports what it found', /new branch/.test(await page.locator('.gg-notice').innerText()))
  // The toolbar keeps two buttons; pruning lives with the remote-tracking refs
  // it removes, which is where a stale one is visible in the first place. The
  // fixture holds one such ref on purpose (`origin/dev`).
  check('The toolbar keeps one refresh and one fetch button',
    await page.locator('.gg-column-actions button').count() === 2)
  await page.locator('.gg-ref-remote').first().click({ button: 'right' })
  await page.locator('.gg-menu').waitFor({ timeout: 5000 })
  const remoteMenu = await page.locator('.gg-menu-item').allInnerTexts()
  check('A remote badge offers to fetch and prune',
    remoteMenu.includes('Fetch all remotes and prune remote-tracking branches'))
  // Fetching needs no decision, so its entry runs rather than asking first —
  // which this menu spells without an ellipsis.
  check('The fetch entry is the one that runs without a dialog',
    !remoteMenu.some(label => label.startsWith('Fetch all remotes and prune') && label.endsWith('…')))
  await page.getByRole('menuitem', { name: 'Fetch all remotes and prune remote-tracking branches' }).click()
  check('Pruning from the menu does not open a dialog', await page.locator('.gg-dialog').count() === 0)
  await page.waitForFunction(() => /deleted/.test(document.querySelector('.gg-notice')?.textContent ?? ''), null, { timeout: 10000 })
  check('Pruning fetches and reports the refs it removed', /1 deleted/.test(await text('.gg-notice')))
  // `requests` is recorded on this side of the wire, not in the page.
  check('Pruning sent the flag the host reads', requests.some(request => request.op === 'fetch' && request.prune === true))
  // The report is flashed before the refs are re-read, so the badge is awaited
  // rather than sampled.
  const prunedGone = await page.waitForFunction(
    () => ![...document.querySelectorAll('.gg-ref-remote')].some(node => node.textContent.includes('origin/dev')),
    null, { timeout: 8000 },
  ).then(() => true).catch(() => false)
  check('The pruned remote-tracking branch is gone from the graph', prunedGone)
  check('A fetch leaves the working tree and HEAD alone', execFileSync('git', ['status', '--porcelain=v2'], { cwd: dir, encoding: 'utf8' }) === worktreeBefore && execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim() === headBefore)
  await screenshot('fetch-discovers-branch.png')

  // No recursive discovery: workspace folders first, explicit one-level expansion.
  await page.evaluate(() => testHarness.setSession('parent'))
  await page.getByRole('button', { name: 'Select repository', exact: true }).waitFor()
  await page.waitForFunction(() => document.querySelector('.gg-repository-trigger')?.textContent.includes('Choose a repository'))
  check('Non-Git parent does not load or auto-select a child repository', await page.locator('.gg-row').count() === 0)
  const childRequests = () => requests.filter(request => request.op === 'repositoryLevel' && request.sessionId === 'parent' && request.includeChildren === true)
  await page.getByRole('button', { name: 'Select repository', exact: true }).click()
  await page.getByRole('button', { name: 'Expand Plugins', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Other project', exact: true }).waitFor()
  await page.waitForFunction(() => document.querySelector('.gg-repository-option[aria-label="Other project"]')?.hasAttribute('aria-pressed'))
  check('Unselected folders are not marked as the active repository', await page.locator('.gg-repository-tree-row.is-selected, .gg-repository-check').count() === 0)
  check('Opening picker initially shows only workspace folders', await page.getByRole('button', { name: 'child-a', exact: true }).count() === 0 && await page.getByRole('button', { name: 'packages/child-b', exact: true }).count() === 0)
  check('Opening picker reads no child directories', childRequests().length === 0)
  check('Picker has no scan notices or extra footer clutter', await page.locator('.gg-repository-notices, .gg-repository-footer').count() === 0)
  await screenshot('repository-picker-workspaces.png')
  await page.getByRole('button', { name: 'Expand Plugins', exact: true }).click()
  await page.getByRole('button', { name: 'child-a', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Expand packages', exact: true }).waitFor()
  check('Expanding workspace reads exactly one level', childRequests().length === 1 && childRequests()[0].path === '.' && await page.getByRole('button', { name: 'packages/child-b', exact: true }).count() === 0)
  await page.getByRole('button', { name: 'Collapse Plugins', exact: true }).click()
  await page.getByRole('button', { name: 'child-a', exact: true }).waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: 'Expand Plugins', exact: true }).click()
  await page.getByRole('button', { name: 'child-a', exact: true }).waitFor()
  check('Collapse and reopen reuses the loaded directory level', childRequests().length === 1)
  await page.getByRole('button', { name: 'child-a', exact: true }).click()
  await page.locator('.gg-row', { hasText: 'Repository A' }).waitFor()
  check('Child repository opens without switching session', (await page.locator('.gg-repository-trigger').innerText()).includes('child-a'))
  await page.locator('.gg-row', { hasText: 'Repository A' }).click()
  await page.locator('.gg-tree-file[title="shared.txt"]').click()
  await page.locator('.gg-du-code', { hasText: 'Repository A' }).waitFor()
  const pinnedDiff = await page.evaluate(() => testState.opened.at(-1).params)
  check('Diff tab snapshots child repository target', pinnedDiff.target.workspaceId === 'collection' && pinnedDiff.target.path === 'child-a')
  await page.evaluate(() => testHarness.setSession('parent'))
  await page.locator('.gg-row', { hasText: 'Repository A' }).waitFor()
  await page.getByRole('button', { name: 'Select repository', exact: true }).click()
  const beforeSearch = childRequests().length
  await page.getByRole('searchbox', { name: 'Find repositories' }).fill('child-b')
  await frame()
  check('Searching unloaded folders does not trigger deeper scans', childRequests().length === beforeSearch && await page.getByRole('button', { name: 'packages/child-b', exact: true }).count() === 0)
  await page.getByRole('searchbox', { name: 'Find repositories' }).fill('')
  const rootExpand = page.getByRole('button', { name: 'Expand Plugins', exact: true })
  if (await rootExpand.count()) await rootExpand.click()
  await page.getByRole('button', { name: 'Expand packages', exact: true }).waitFor()
  const beforeNested = childRequests().length
  await page.getByRole('button', { name: 'Expand packages', exact: true }).click()
  await page.getByRole('button', { name: 'packages/child-b', exact: true }).waitFor()
  check('Expanding a folder loads only its immediate next level', childRequests().length === beforeNested + 1 && childRequests().at(-1).path === 'packages')
  await page.getByRole('searchbox', { name: 'Find repositories' }).fill('child-b')
  await page.getByRole('button', { name: 'packages/child-b', exact: true }).waitFor()
  check('Search filters loaded nested folders without broad discovery', await page.getByRole('button', { name: 'child-a', exact: true }).count() === 0)
  await page.getByRole('button', { name: 'packages/child-b', exact: true }).focus()
  await page.keyboard.press('Enter')
  await page.locator('.gg-row', { hasText: 'Repository B' }).waitFor()
  check('Keyboard selection switches child history and isolates old rows', await page.locator('.gg-row', { hasText: 'Repository A' }).count() === 0)
  await page.getByRole('button', { name: 'Select repository', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Find repositories' }).fill('Other project')
  await page.getByRole('button', { name: 'Other project', exact: true }).click()
  await page.locator('.gg-row', { hasText: 'Other workspace repository' }).waitFor()
  check('Other workspace root opens without a new session', requests.some(request => request.op === 'commits' && request.sessionId === 'parent' && request.target?.workspaceId === 'other'))
  await page.evaluate(params => testHarness.setSession('parent', 'git-diff', params), pinnedDiff)
  await page.locator('.gg-du-code', { hasText: 'Repository A' }).waitFor()
  check('Previously opened diff remains bound to original repo', !(await page.locator('.gg-du-panel').innerText()).includes('Other workspace repository'))
  await page.evaluate(() => testHarness.setSession('parent'))
  await page.locator('.gg-row', { hasText: 'Other workspace repository' }).waitFor()
  check('Repository selection survives a visit to another tab', (await page.locator('.gg-repository-trigger').innerText()).includes('Other project'))
  check('Only selected repo is watched', openStreams === 1)
  check('Client never invokes legacy recursive discovery', !requests.some(request => request.op === 'repositories'))
  await screenshot('repository-picker-graph.png')
  await page.getByRole('button', { name: 'Select repository', exact: true }).click()
  await page.getByRole('button', { name: 'Expand Plugins', exact: true }).waitFor()
  check('Picker uses a compact bounded popover instead of a full-width overlay', await page.locator('.gg-repository-menu').evaluate(node => { const rect = node.getBoundingClientRect(); return rect.width <= 422 && rect.height <= 522 }))
  check('Dark picker uses the application surface rather than the grey overlay token', await page.locator('.gg-repository-menu').evaluate(node => getComputedStyle(node).backgroundColor) === 'rgb(21, 21, 21)')
  check('Search focus is indicated by the search row, not a heavy native input outline', await page.getByRole('searchbox', { name: 'Find repositories' }).evaluate(node => getComputedStyle(node).outlineStyle) === 'none')
  await screenshot('repository-picker-dark.png')
  await page.evaluate(() => testHarness.theme('light')); await frame()
  check('Repository picker follows the light theme', await page.locator('.gg-repository-menu').evaluate(node => getComputedStyle(node).backgroundColor) === 'rgb(255, 255, 255)')
  await screenshot('repository-picker-light.png')
  await page.getByRole('searchbox', { name: 'Find repositories' }).press('Escape')
  check('Escape closes picker and restores trigger focus', await page.locator('.gg-repository-menu').count() === 0 && await page.getByRole('button', { name: 'Select repository', exact: true }).evaluate(node => document.activeElement === node))
  await page.evaluate(() => testHarness.theme('dark'))

  check('No browser JavaScript exceptions', errors.length === 0)
  if (realRepo) check('Real repository working tree is unchanged', execFileSync('git', ['-C', realRepo, 'status', '--porcelain=v2'], { encoding: 'utf8' }) === realBefore)
  await writeFile(new URL('results.json', output), JSON.stringify({ passed: checks.length, checks, errors, browser: await browser.version(), executablePath, limits: 'Real client and host Git reads, substitute Cordis mount/theme. Not a live DSH routing/HMR test.', realRepo: realRepo || null, requests: requests.length }, null, 2))
  console.log(`DONE ${checks.length} browser checks; artifacts in ${output.pathname}`)
} catch (error) {
  await screenshot('failure.png').catch(() => {})
  await writeFile(new URL('results.json', output), JSON.stringify({ passed: checks.length, checks, failure: error.stack, errors }, null, 2))
  throw error
} finally {
  // The browser owns the push stream: waiting on the server first would wait
  // for a connection the browser is still holding open.
  await browser.close()
  server.closeAllConnections?.()
  await new Promise(resolve => server.close(resolve))
  await rm(dir, { recursive: true, force: true })
  await rm(remoteDir, { recursive: true, force: true })
  await rm(collection, { recursive: true, force: true })
  await rm(otherWorkspace, { recursive: true, force: true })
}
