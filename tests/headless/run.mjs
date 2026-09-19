import { chromium } from 'playwright-core'
import { build } from 'esbuild'
import { readFile, writeFile, mkdir, mkdtemp, rm, access } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { PNG } from 'pngjs'
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
await put('topic.ts', 'export function topic() { return true; }\n'); git('add', '.'); git('commit', '-qm', 'Topic change')
git('checkout', '-q', 'main'); await put('main.ts', 'export const main = 1;\n'); git('add', '.'); git('commit', '-qm', 'Main change'); git('merge', '--no-ff', '-qm', 'Merge topic', 'topic')
await put('app.ts', 'export const total = 42;\n// highlighted change\nconst hostile = "<img src=x onerror=alert(1)>";\n')
await put('added.py', 'def greet(name):\n    return "Hello " + name\n')
await put('image.bin', Buffer.from([0, 9, 8, 7])); await rm(join(dir, 'deleted.py')); git('add', '-A'); git('commit', '-qm', 'Review multiple statuses')
await put('app.ts', 'export const total = 50;\n// staged\n'); git('add', 'app.ts')
await put('app.ts', 'export const total = 60;\n// unstaged\n'); await put('untracked.txt', 'Untracked content\n')
// A large real history is optional: without it the suite still exercises the
// plugin fully against the temporary repository built above.
const realRepo = process.env.GRAPH_TEST_REPO || ''
const realBefore = realRepo ? execFileSync('git', ['-C', realRepo, 'status', '--porcelain=v2'], { encoding: 'utf8' }) : ''
const dash = args => execFileSync('git', ['-C', realRepo, ...args], { encoding: 'utf8' }).trim()
const testCtx = { get(name) { return name === 'sessions' ? { get(id) { return { header: { cwd: id === 'history' && realRepo ? realRepo : dir } } } } : undefined } }
const theme = `
* { box-sizing:border-box } body { margin:0; font-family:system-ui,sans-serif; background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary) }
:root { color-scheme:dark; --dsw-alias-bg-base:#151515; --dsw-alias-bg-layer-2:#282828; --dsw-alias-label-primary:#e9e9eb; --dsw-alias-label-secondary:#a1a1ab; --dsw-alias-border-l1:#343438; --dsw-alias-border-l2:#515158; --dsw-alias-brand-primary:#639fff; --dsw-alias-state-success-primary:#72c58b; --dsw-alias-state-error-primary:#f48787; }
:root[data-theme=light] { color-scheme:light; --dsw-alias-bg-base:#fff; --dsw-alias-bg-layer-2:#f1f2f4; --dsw-alias-label-primary:#1d2330; --dsw-alias-label-secondary:#626875; --dsw-alias-border-l1:#d8dce3; --dsw-alias-border-l2:#aab2c0; --dsw-alias-brand-primary:#286bd0; --dsw-alias-state-success-primary:#16733c; --dsw-alias-state-error-primary:#ba3434; }
.fixture-shell { height:100vh; display:flex; flex-direction:column; overflow:hidden } .fixture-title { flex:none; height:34px; padding:6px 12px; border-bottom:1px solid var(--dsw-alias-border-l1); font-size:12px } .fixture-body { flex:1;min-height:0;overflow:hidden }
`
const html = `<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><title>Git plugin isolated browser test</title><style>${theme}</style></head><body><div id="root"></div><script src="/fixture.js"></script><script src="/client.js"></script></body></html>`
const candidates = [process.env.BROWSER_PATH, '/home/yoggu/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome', '/opt/brave.com/brave/brave', '/usr/bin/chromium'].filter(Boolean)
let executablePath
for (const path of candidates) { try { await access(path); executablePath = path; break } catch {} }
assert.ok(executablePath, 'Set BROWSER_PATH to an installed Chromium executable')
const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-gpu'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(10000)
const errors = [], checks = [], requests = []
page.on('pageerror', error => errors.push(error.message))
await page.route('**/*', async route => {
  const request = route.request(), path = new URL(request.url()).pathname
  if (new URL(request.url()).hostname !== 'git-plugin.test') return route.abort()
  if (path === '/api/dsh-git-graph') {
    const input = request.postDataJSON(); requests.push(input)
    try { await route.fulfill({ json: { ok: true, result: await internals.dispatch(testCtx, input) } }) }
    catch (error) { await route.fulfill({ json: { ok: false, error: error.message } }) }
  } else if (path === '/fixture.js') await route.fulfill({ contentType: 'application/javascript', body: fixtureJS })
  else if (path === '/client.js') await route.fulfill({ contentType: 'application/javascript', body: client })
  else await route.fulfill({ contentType: 'text/html', body: html })
})
const check = (label, condition) => { assert.ok(condition, label); checks.push(label); console.log(`PASS ${label}`) }
const screenshot = name => page.screenshot({ path: new URL(name, output).pathname })
const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
// Readiness is the absence of a loading state, never a visible patch: a binary,
// deleted or untracked file legitimately renders no code rows at all.
const settled = async (rootSelector = '.gg-inspector') => {
  await page.waitForFunction(selector => {
    const root = document.querySelector(selector)
    return root !== null && root.querySelector('.gg-du-panel') !== null && ![...root.querySelectorAll('.gg-empty')].some(node => /Loading/.test(node.textContent))
  }, rootSelector)
  await frame()
}
const file = path => page.locator(`.gg-inspector .gg-du-file[title=${JSON.stringify(path)}]`)
// Clicking a file and waiting for its title closes the race where the previous
// file's finished panel is still on screen while the next request is in flight.
const openFile = async path => {
  await file(path).click()
  await page.waitForFunction(expected => {
    const root = document.querySelector('.gg-inspector')
    return root?.querySelector('.gg-du-title')?.textContent === expected && ![...root.querySelectorAll('.gg-empty')].some(node => /Loading/.test(node.textContent))
  }, path)
  await frame()
}
const text = selector => page.locator(`${selector}:visible`).innerText()
try {
  await page.goto('http://git-plugin.test/')
  await settled()
  check('Actual client registers four types and Git tab icon', await page.locator('.fixture-title svg').count() === 1 && await page.evaluate(() => testState.registrations.length) === 4)
  const colors = await page.locator('.gg-du-status').evaluateAll(nodes => Object.fromEntries(nodes.map(n => [n.dataset.status, getComputedStyle(n).color])))
  check('M, A and D use distinct computed colors', colors.M && colors.A && colors.D && new Set([colors.M, colors.A, colors.D]).size === 3)
  await openFile('app.ts')
  check('Syntax highlights real TypeScript patch', await page.locator('.gg-du-code .hljs-keyword:visible').count() > 0)
  check('Hostile code is rendered as text, not DOM', await page.locator('.gg-du-code img, .gg-du-code script').count() === 0)
  check('Raw patch headers absent from code view', !/diff --git|index [0-9a-f]+|--- a\//.test(await text('.gg-inspector .gg-du-patch')))
  check('Diff metadata starts collapsed', await page.locator('.gg-du-metadata:visible').evaluate(e => !e.open))
  await page.locator('.gg-du-metadata summary:visible').click()
  check('Raw headers remain available in disclosure', (await text('.gg-du-metadata pre')).includes('diff --git'))
  await page.locator('.gg-du-metadata summary:visible').click()
  await page.getByRole('button', { name: 'Syntax highlighting', exact: true }).click()
  check('Syntax toggle switches to plain text', await page.locator('.gg-du-code .hljs-keyword:visible').count() === 0)
  await page.getByRole('button', { name: 'Syntax highlighting', exact: true }).click()
  await openFile('image.bin')
  check('Binary files show an explicit non-text message', (await text('.gg-inspector .gg-du-message')).includes('Binary file'))
  await openFile('deleted.py')
  check('Deleted file shows removals without additions', await page.locator('.gg-inspector .gg-du-del').count() > 0 && await page.locator('.gg-inspector .gg-du-add').count() === 0)
  await openFile('added.py')
  check('File selection updates inline without opening a tab', (await text('.gg-du-title')).includes('added.py') && await page.evaluate(() => testState.openTabs) === 0)
  check('File overview remains present with diff', await page.locator('.gg-inspector .gg-du-file').count() >= 3)
  const selected = await page.locator('.gg-du-file.is-selected:visible').getAttribute('title')
  await page.getByRole('button', { name: 'Refresh Git', exact: true }).click(); await settled()
  check('Refresh preserves selected file', await page.locator('.gg-du-file.is-selected:visible').getAttribute('title') === selected)
  await screenshot('synthetic-wide-dark.png')
  // Stable selected commit dot remains colored above hover/selection backgrounds.
  const firstRow = page.locator('.gg-row').first()
  await firstRow.hover()
  const graph = await page.locator('.gg-graph').boundingBox()
  const png = PNG.sync.read(await page.screenshot({ clip: { x: Math.floor(graph.x), y: Math.floor(graph.y), width: 50, height: 26 } }))
  const pixel = (13 * png.width + 12) * 4
  check('Selected + hovered graph node is actually blue in screenshot', png.data[pixel + 2] > 180 && png.data[pixel + 2] > png.data[pixel] * 1.3)
  const pointer = await page.locator('.gg-canvas').evaluate(e => getComputedStyle(e).pointerEvents)
  check('Graph SVG does not block pointer events', pointer === 'none')
  const separator = page.getByRole('separator', { name: 'Resize history and commit details', exact: true })
  await separator.focus(); const before = Number(await separator.getAttribute('aria-valuenow')); await page.keyboard.press('ArrowRight')
  check('Keyboard resizes wide split', Number(await separator.getAttribute('aria-valuenow')) > before)
  await page.setViewportSize({ width: 400, height: 900 })
  await page.waitForFunction(() => document.querySelector('.gg-workbench > .gg-mode-content .gg-split').classList.contains('gg-split-vertical'))
  check('Compact layout stacks graph and detail', await separator.getAttribute('aria-orientation') === 'horizontal')
  check('Resize preserves selected file', await page.locator('.gg-du-file.is-selected:visible').getAttribute('title') === selected)
  await screenshot('synthetic-narrow-dark.png')
  const narrow = await page.evaluate(() => {
    const bounds = s => { const r = document.querySelector(s).getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, bottom:r.bottom } }
    return { files: bounds('.gg-du-filelist'), diff: bounds('.gg-du-scroll'), first: bounds('.gg-du-file'), bodyScroll: document.documentElement.scrollWidth, width: innerWidth }
  })
  check('Compact file list has space for group header and two rows', narrow.files.height >= 90)
  check('Compact diff is visible without horizontal page overflow', narrow.diff.height >= 100 && narrow.diff.y < 900 && narrow.bodyScroll <= narrow.width)
  await page.evaluate(() => testHarness.theme('light'))
  await screenshot('synthetic-narrow-light.png')
  const light = await page.locator('.gg-du-status').evaluateAll(nodes => Object.fromEntries(nodes.map(n => [n.dataset.status, getComputedStyle(n).color])))
  check('Status colors adapt to light theme', light.M !== colors.M && light.A !== colors.A && light.D !== colors.D)
  await page.evaluate(() => { testHarness.theme('dark'); testHarness.setSession('fixture', 'git-changes') })
  await settled('.gg-root')
  const samePath = page.locator('.gg-du-file[title="app.ts"]')
  check('Partly staged file appears in both groups', await samePath.count() === 2)
  await samePath.nth(1).click(); await page.waitForFunction(() => document.querySelector('.gg-du-summary').textContent.includes('Unstaged'))
  check('Unstaged comparison stays separate from staged', (await text('.gg-du-summary')).includes('index → working tree'))
  await page.getByRole('button', { name: 'Refresh changes', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.gg-diff-summary').textContent.includes('Snapshot'))
  await frame()
  check('Working refresh preserves staged/unstaged identity', (await text('.gg-du-summary')).includes('Unstaged'))
  if (!realRepo) console.log('SKIP real-history checks (set GRAPH_TEST_REPO=/path/to/repo to enable)')
  if (realRepo) {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.evaluate(() => testHarness.setSession('history'))
    await settled()
    const reachable = Number(dash(['rev-list', '--all', '--count']))
    check('Real history loads one full first page', await page.locator('.gg-row').count() === Math.min(120, reachable))
    // Derive the merge to open from the repository rather than from a hard-coded
    // subject, so the check works on any history handed in.
    const mergeSubject = dash(['log', '--all', '--max-count=120', '--merges', '--format=%s', '-1'])
    const merge = mergeSubject ? page.locator('.gg-row').filter({ hasText: mergeSubject.slice(0, 40) }).first() : null
    if (merge) {
      await merge.scrollIntoViewIfNeeded(); await merge.click(); await settled()
      check('Real merge click updates same inspector', (await text('.gg-commit-subject')).length > 0 && await page.evaluate(() => testState.openTabs) === 0)
    } else {
      console.log('SKIP merge check (no merge commit in the first page)')
    }
    const graphScroll = await page.locator('.gg-graph').evaluate(e => e.scrollTop)
    const lastFile = page.locator('.gg-inspector .gg-du-file').last()
    const lastTitle = await lastFile.getAttribute('title')
    await lastFile.click()
    await page.waitForFunction(expected => document.querySelector('.gg-inspector .gg-du-title')?.textContent === expected, lastTitle)
    await settled()
    check('File click preserves graph scroll', await page.locator('.gg-graph').evaluate(e => e.scrollTop) === graphScroll)
    await page.getByRole('button', { name: 'Next hunk', exact: true }).click()
    check('Hunk navigation selects an actual change block', await page.locator('.gg-du-hunk.is-current:visible').count() === 1)
    await page.getByRole('button', { name: 'Wrap', exact: true }).click()
    check('Wrap toggle affects real rendered code', await page.locator('.gg-du-patch.is-wrapped:visible').count() === 1)
    await screenshot('history-wide.png')
    await page.setViewportSize({ width: 400, height: 900 })
    await page.waitForFunction(() => {
      const visibleIn = (parentSelector, childSelector, sticky) => {
        const p = document.querySelector(parentSelector), child = p.querySelector(childSelector)
        const area = p.getBoundingClientRect(), row = child.getBoundingClientRect()
        const header = sticky ? child.closest('.gg-du-group').querySelector('h4').getBoundingClientRect().height : 0
        return row.top >= area.top + header - 1 && row.bottom <= area.bottom + 1
      }
      return visibleIn('.gg-graph', '.is-selected', false) && visibleIn('.gg-inspector .gg-du-filelist', '.is-selected', true)
    })
    check('Both active commit and active file remain fully visible after shrinking', true)
    await screenshot('history-narrow.png')
    await page.locator('.gg-row.is-selected').focus(); await page.keyboard.press('ArrowDown'); await settled()
    check('Keyboard selects another commit without extra tabs', await page.evaluate(() => testState.openTabs) === 0 && (await page.locator('.gg-row.is-selected').count()) === 1)
  }
  check('No browser JavaScript exceptions', errors.length === 0)
  if (realRepo) check('Real repository working tree is unchanged', execFileSync('git', ['-C', realRepo, 'status', '--porcelain=v2'], { encoding: 'utf8' }) === realBefore)
  await writeFile(new URL('results.json', output), JSON.stringify({ passed: checks.length, checks, errors, browser: await browser.version(), executablePath, limits: 'Real client and host Git reads, substitute Cordis mount/theme. Not a live DSH routing/HMR test.', realRepo: realRepo || null, narrow, requests: requests.length }, null, 2))
  console.log(`DONE ${checks.length} browser checks; artifacts in ${output.pathname}`)
} catch (error) {
  await screenshot('failure.png').catch(() => {})
  await writeFile(new URL('results.json', output), JSON.stringify({ passed: checks.length, checks, failure: error.stack, errors }, null, 2))
  throw error
} finally {
  await browser.close()
  await rm(dir, { recursive: true, force: true })
}
