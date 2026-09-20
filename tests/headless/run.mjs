import { chromium } from 'playwright-core'
import { build } from 'esbuild'
import { readFile, writeFile, mkdir, mkdtemp, rm, access } from 'node:fs/promises'
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
await mkdir(join(dir, 'src/components'), { recursive: true })
await put('src/topic.ts', 'export function topic() { return true; }\n'); git('add', '.'); git('commit', '-qm', 'Topic change')
git('checkout', '-q', 'main'); await put('src/main.ts', 'export const main = 1;\n'); git('add', '.'); git('commit', '-qm', 'Main change'); git('merge', '--no-ff', '-qm', 'Merge topic', 'topic')
await put('app.ts', 'export const total = 42;\n// highlighted change\nconst hostile = "<img src=x onerror=alert(1)>";\n')
await put('src/components/added.py', 'def greet(name):\n    return "Hello " + name\n')
await put('image.bin', Buffer.from([0, 9, 8, 7])); await rm(join(dir, 'deleted.py')); git('add', '-A'); git('commit', '-qm', 'Review multiple statuses')
await put('app.ts', 'export const total = 50;\n// staged\n'); git('add', 'app.ts')
await put('app.ts', 'export const total = 60;\n// unstaged\n'); await put('untracked.txt', 'Untracked content\n')
// One remote-tracking branch that agrees with its local branch, and one that has
// drifted onto a commit where no local branch of that name exists.
git('remote', 'add', 'origin', 'https://example.invalid/dsh-git-graph.git')
git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD'))
git('update-ref', 'refs/remotes/origin/dev', git('rev-parse', 'HEAD~1'))
const realRepo = process.env.GRAPH_TEST_REPO || ''
const realBefore = realRepo ? execFileSync('git', ['-C', realRepo, 'status', '--porcelain=v2'], { encoding: 'utf8' }) : ''
const testCtx = { get(name) { return name === 'sessions' ? { get(id) { return { header: { cwd: id === 'history' && realRepo ? realRepo : dir } } } } : undefined } }
const theme = `
* { box-sizing:border-box } body { margin:0; font-family:system-ui,sans-serif; background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary) }
:root { color-scheme:dark; --dsw-alias-bg-base:#151515; --dsw-alias-bg-layer-2:#282828; --dsw-alias-label-primary:#e9e9eb; --dsw-alias-label-secondary:#a1a1ab; --dsw-alias-border-l1:#343438; --dsw-alias-border-l2:#515158; --dsw-alias-brand-primary:#639fff; --dsw-alias-state-success-primary:#72c58b; --dsw-alias-state-error-primary:#f48787; --dsh-content-font-size:14px; --dsh-content-font-size-secondary:13px; }
:root[data-theme=light] { color-scheme:light; --dsw-alias-bg-base:#fff; --dsw-alias-bg-layer-2:#f1f2f4; --dsw-alias-label-primary:#1d2330; --dsw-alias-label-secondary:#626875; --dsw-alias-border-l1:#d8dce3; --dsw-alias-border-l2:#aab2c0; --dsw-alias-brand-primary:#286bd0; --dsw-alias-state-success-primary:#16733c; --dsw-alias-state-error-primary:#ba3434; }
.fixture-shell { height:100vh; display:flex; flex-direction:column; overflow:hidden } .fixture-title{height:32px;display:flex;align-items:center;padding:0 8px;border-bottom:1px solid var(--dsw-alias-border-l1)} .fixture-body{flex:1;min-height:0}
`
const html = `<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><style>${theme}</style></head><body><div id="root"></div><script src="/fixture.js"></script><script src="/client.js"></script></body></html>`
const executableCandidates = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, process.env.BROWSER_PATH, '/home/yoggu/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome', '/home/yoggu/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean)
let executablePath
for (const candidate of executableCandidates) { try { await access(candidate); executablePath = candidate; break } catch {} }
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const errors = [], checks = [], requests = []
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
    try { await internals.openEvents(testCtx, req, res) }
    catch (error) { if (!res.headersSent) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: error.message })) } else res.end() }
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
  await page.waitForFunction(expected => document.querySelector('.gg-du-title')?.textContent === expected && ![...document.querySelectorAll('.gg-empty')].some(node => /Loading/.test(node.textContent)), path)
  await frame()
}
try {
  await page.goto(origin)
  await waitGraph()
  check('Actual client registers four tab types and Git icon', await page.locator('.fixture-title svg').count() === 1 && await page.evaluate(() => testState.registrations.length) === 4)
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
  await page.locator('.gg-row').nth(1).click(); await waitAccordion('Commit details')
  check('Narrow accordion stacks the 50/50 detail columns', await page.locator('.gg-accordion').evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length === 1 && e.scrollWidth <= e.clientWidth))
  await screenshot('accordion-narrow-dark.png')
  await page.evaluate(() => testHarness.theme('light')); await frame()
  check('Light theme keeps accordion readable', await page.locator('.gg-accordion').evaluate(e => getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)'))
  await screenshot('accordion-narrow-light.png')

  // The reported case, end to end: a commit lands in the repository while the
  // graph is open, and nobody touches the view.
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.evaluate(() => testHarness.theme('dark'))
  await page.evaluate(() => testHarness.setSession('fixture', 'git-graph'))
  await waitGraph()
  const liveDot = await page.waitForFunction(() => document.querySelector('.gg-live-dot')?.dataset.live === 'on', null, { timeout: 6000 }).then(() => true).catch(() => false)
  check('The header shows that the graph follows the repository', liveDot)
  const rowsBefore = await page.locator('.gg-row').count()
  execFileSync('git', ['commit', '-q', '--allow-empty', '-m', 'Live push arrives'], { cwd: dir })
  await page.waitForFunction(() => [...document.querySelectorAll('.gg-row')].some(row => row.textContent.includes('Live push arrives')), null, { timeout: 10000 })
  await page.locator('.gg-notice').waitFor({ timeout: 2000 })
  check('A commit made while the graph is open appears without any user action', await page.locator('.gg-row').count() === rowsBefore + 1)
  check('The push reports what arrived', /new commit/.test(await page.locator('.gg-notice').innerText()))
  await screenshot('live-update.png')

  // While the tab is not on screen, the stream is closed and nothing is read.
  await page.evaluate(() => testHarness.setVisible(false)); await frame()
  check('A tab nobody is looking at closes its stream', await page.locator('.gg-live-dot[data-live="on"]').count() === 0)
  const requestsWhileHidden = requests.length
  execFileSync('git', ['commit', '-q', '--allow-empty', '-m', 'While hidden'], { cwd: dir })
  await new Promise(resolve => setTimeout(resolve, 2500))
  check('A hidden tab reads nothing while the repository changes', requests.length === requestsWhileHidden)
  await page.evaluate(() => testHarness.setVisible(true))
  // Coming back opens the stream again, whose first push of state is a fresh read.
  await page.locator('.gg-row', { hasText: 'While hidden' }).first().waitFor({ timeout: 8000 })
  check('Returning to the tab re-reads the history', requests.length > requestsWhileHidden)

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
}
