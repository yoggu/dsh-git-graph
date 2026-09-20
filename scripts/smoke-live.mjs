/**
 * Ask the *running* harness what this plugin can do.
 *
 * Everything else in this repository tests the plugin from the outside: real
 * repositories, the shipped bundle, a headless browser. This one tests the
 * deployment — whether the process that is serving the page right now is
 * running the code in this working tree, which nothing else can tell you. A
 * host row is composed at startup, so a change to `lib/index.js` is invisible
 * until the harness is restarted, and "it works in the tests" is exactly the
 * wrong answer to that question.
 *
 * It never runs a writing action. It reads, and it *plans* — a plan is what the
 * confirmation dialog fetches, and it runs nothing — so pointing this at a
 * repository with work in it cannot disturb that work.
 *
 * Usage:
 *   DSH_SESSION_ID=<a live session> npm run test:live
 *   node scripts/smoke-live.mjs <session id> [web url]
 *
 * Exit codes: 0 every check passed, 1 a check failed, 2 the running host is
 * older than this working tree.
 *
 * @module dsh-git-graph/scripts/smoke-live
 */

const url = (process.argv[3] ?? process.env.DSH_WEB_URL ?? 'http://127.0.0.1:3080').replace(/\/$/, '')
const sessionId = process.argv[2] ?? process.env.DSH_SESSION_ID ?? ''

if (sessionId === '') {
  console.error('No session id. Pass one, or set DSH_SESSION_ID to a live session.')
  process.exit(1)
}

/** Older than this working tree: the route answers, but not with these operations. */
const OUTDATED = 'OUTDATED'

const failures = []
const check = (label, condition, detail) => {
  if (condition) {
    console.log(`PASS ${label}`)
    return true
  }
  failures.push(label)
  console.log(`FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`)
  return false
}

/**
 * Ask the running host one question.
 *
 * @param request - the operation and its arguments.
 * @returns the answer's result.
 * @throws when the route refuses, or when it does not know the operation.
 */
async function ask(request) {
  const response = await fetch(`${url}/api/dsh-git-graph`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...request, sessionId }),
  })
  const payload = await response.json().catch(() => null)
  if (payload === null) throw new Error(`no JSON answer (HTTP ${response.status})`)
  if (payload.ok !== true) {
    // "unknown operation" is the signature of a host that predates this file.
    if (/unknown operation/i.test(String(payload.error))) throw new Error(OUTDATED)
    throw new Error(String(payload.error))
  }
  return payload.result
}

try {
  const state = await ask({ op: 'state' })
  check('The running host knows the state operation', true)
  check('It reports the branch, the tree and any operation in progress',
    typeof state.state?.branch !== 'undefined' && typeof state.state?.dirty === 'boolean'
    && typeof state.state?.operation !== 'undefined')
  console.log(`     on ${state.state.branch ?? 'a detached HEAD'} · `
    + `${state.state.dirty ? `${state.state.changedCount} uncommitted change(s)` : 'clean'}`
    + `${state.state.operation === null ? '' : ` · ${state.state.operation} in progress`}`)

  const page = await ask({ op: 'commits', limit: 20 })
  check('It answers the history with its labels', Array.isArray(page.commits) && page.commits.length > 0 && page.refs !== null)
  check('It reports the stashes it holds', Array.isArray(page.stashes))
  console.log(`     ${page.commits.length} commits · ${page.refs.refs.length} refs · ${page.stashes.length} stash(es)`)

  const branch = page.refs.refs.find(ref => ref.kind === 'branch' && ref.name === `refs/heads/${state.state.branch}`)
  if (branch !== undefined) {
    const narrowed = await ask({ op: 'commits', limit: 20, ref: branch.name })
    check('It narrows the history to one branch', narrowed.ref === branch.name && narrowed.commits.length > 0)
  } else {
    console.log('SKIP the branch filter — HEAD is not on a local branch')
  }

  // Planning is what the confirmation dialog does. It runs nothing, and it is
  // the only way to see the argument list the host would use.
  const plan = await ask({ op: 'plan', action: 'branch.checkout', params: { name: state.state.branch ?? 'HEAD' } })
  check('It plans an action without running it', Array.isArray(plan.plan?.argv) && typeof plan.plan?.summary === 'string')
  console.log(`     ${plan.plan.summary}`)
  check('A plan says whether the repository would accept it', typeof plan.blocked === 'string' || plan.blocked === null)
  check('A plan carries what the dialog warns about', Array.isArray(plan.warnings))

  const destructive = await ask({ op: 'plan', action: 'working.clean', params: {} })
  check('A destructive action is marked as one', destructive.plan.destructive === true)

  // Validation runs before git is asked anything, so this must be refused.
  let refused = false
  try {
    await ask({ op: 'plan', action: 'branch.checkout', params: { name: '--upload-pack=touch /tmp/pwned' } })
  } catch (error) {
    refused = /refusing/.test(String(error.message))
  }
  check('A name that is not a ref is refused rather than passed to git', refused)

  if (page.commits.length >= 2) {
    const [head, parent] = page.commits
    const compared = await ask({ op: 'compare', from: parent.hash, to: head.hash })
    check('It compares two revisions', Array.isArray(compared.files))
    const uncommitted = await ask({ op: 'compare', from: head.hash })
    check('It compares a revision with the working tree', uncommitted.to === null && Array.isArray(uncommitted.files))
    console.log(`     ${parent.hash.slice(0, 8)} → ${head.hash.slice(0, 8)}: ${compared.files.length} file(s); `
      + `against the working tree: ${uncommitted.files.length}`)
  } else {
    console.log('SKIP the comparison — fewer than two commits')
  }
} catch (error) {
  if (String(error.message) === OUTDATED) {
    console.error(`\nThe host at ${url} is older than this working tree: it does not know these operations.`)
    console.error('The route is live, so the plugin is mounted — but a host row is composed at startup,')
    console.error('so a change to lib/index.js needs a restart of the harness to take effect.')
    process.exit(2)
  }
  console.error(`\nCould not reach the plugin at ${url}: ${String(error.message)}`)
  process.exit(1)
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed: ${failures.join('; ')}`)
  process.exit(1)
}
console.log(`\nThe running host at ${url} answers every operation this plugin defines.`)
