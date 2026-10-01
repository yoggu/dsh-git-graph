/**
 * Host half of `dsh-git-graph`: answer Git questions about the repository that
 * belongs to the calling Session's workspace, and carry out the writing actions
 * a reader confirms.
 *
 * Three different questions arrive here, and they have different answers:
 *
 *   - **History.** Which commits exist, what a commit contains, how one commit
 *     differs from its parent, and what differs between two revisions a reader
 *     picked. Every input is an immutable commit id, so an answer stays true
 *     forever and may be cached.
 *   - **The working tree.** What is different *right now* from HEAD — what a
 *     running agent has already changed and not yet committed. This answer is
 *     true only at the instant it is produced, so it is never cached.
 *   - **Actions.** What a reader asks git to *do* — check out a branch, merge,
 *     rebase, stash, push. These are the only requests that change a repository,
 *     and the "Writing actions" section below carries their own guards rather
 *     than reusing the read path.
 *
 * Legacy requests resolve their live Session's containing repository. Explicit
 * targets select an exact Git root inside a registered workspace or the live
 * Session directory; the special containing target alone may select its parent
 * repository. POST and SSE share this resolver and never accept absolute roots.
 *
 * Every `git` invocation in this file — read or write — uses an argument list
 * assembled here. The browser chooses from named operations and validated
 * values, never from raw command text, so no request can reach git's argument
 * parser on its own terms.
 *
 * @module dsh-git-graph
 */

import { execFile } from 'node:child_process'
import { existsSync, realpathSync, watch } from 'node:fs'
import { join, resolve } from 'node:path'
import { createRepositoryAccess, scanRepositories, DISCOVERY_LIMITS, SESSION_GROUP_ID, isContained } from './repositories.js'

/** Cordis plugin name. */
export const name = 'dsh-git-graph'

/**
 * The services this plugin needs before it can answer anything.
 *
 * `connection` owns the authenticated /api channel and its origin fence.
 * `sessions` is deliberately absent. It is read through `ctx.get` per request
 * instead, because a hard dependency would keep this row from activating at all
 * in a composition that serves the browser without a session store — and a Git
 * tab that never mounts is worse than one that reports why it cannot read.
 */
export const inject = ['connection']

/** Exact Fetch route the browser half reads. */
export const ROUTE_PATH = '/api/dsh-git-graph'

/**
 * Exact route the browser half listens on for repository changes.
 *
 * This is what makes an open graph keep up without asking: the host watches the
 * Git directory and pushes one event per burst, the way VS Code Git Graph reacts
 * to its file watcher instead of polling.
 */
export const EVENTS_PATH = '/api/dsh-git-graph/events'

/** One burst of file events becomes one push — a single git action writes many files. */
const WATCH_DEBOUNCE_MS = 750

/** Keep-alive comment interval, so a quiet stream is not reaped as an idle connection. */
const WATCH_HEARTBEAT_MS = 20_000

/** Hard ceiling on one `git` invocation: a hung repository must not hang a tab. */
const GIT_TIMEOUT_MS = 20_000

/** The object id Git reserves for an empty tree (the root commit's parent). */
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

/** Hard ceiling on captured output. Past this a diff is truncated, not buffered forever. */
const MAX_BUFFER = 12 * 1024 * 1024

/** How many commits one graph page carries unless the caller asks for fewer. */
const DEFAULT_PAGE = 120

/** Upper bound on a caller's page size, so one request cannot ask for a whole history. */
const MAX_PAGE = 600

/** Upper bound on a working-tree diff, in bytes of unified patch text. */
const MAX_PATCH_BYTES = 512 * 1024

/**
 * Environment for every `git` child.
 *
 * A repository is untrusted input: it may carry configuration that would let a
 * pager, an external diff driver, a text-conversion filter, or a credential
 * prompt run. Each of those is switched off here rather than trusted, and the
 * locale is pinned so the output this file parses cannot change shape.
 */
const GIT_ENV = {
  ...process.env,
  GIT_PAGER: 'cat',
  GIT_TERMINAL_PROMPT: '0',
  GIT_OPTIONAL_LOCKS: '0',
  // Git pathspec magic (e.g. :(top)**) must never expand a selected file into
  // other files when a reader confirms one destructive file action.
  GIT_LITERAL_PATHSPECS: '1',
  GIT_CONFIG_NOSYSTEM: '1',
  LC_ALL: 'C',
  LANG: 'C',
}

/**
 * Resolve the repository root of one Session's working directory.
 *
 * `--show-toplevel` is what makes a Session opened in a subdirectory work: the
 * graph belongs to the repository, not to the directory the agent happens to be
 * standing in. The returned path is canonical, so a symlinked workspace and its
 * target resolve to the same repository.
 *
 * @param cwd - the Session's working directory.
 * @returns the canonical repository root.
 * @throws when the directory is not inside a Git working tree.
 */
async function repoRoot(cwd, opts = {}) {
  const out = await git(cwd, ['rev-parse', '--show-toplevel'], opts)
  return realpathSync(out.trim())
}

/**
 * Read the working directory recorded for a Session.
 *
 * @param ctx - the plugin's Cordis context.
 * @param sessionId - the id the request named.
 * @returns the directory, or undefined when that Session is not live.
 */
function sessionCwd(ctx, sessionId) {
  // Resolved per request rather than injected: a session store that arrives
  // after this row activates must still be able to answer.
  const sessions = ctx.get('sessions')
  if (sessions === undefined) return undefined
  const session = sessions.get(sessionId)
  if (session === undefined) return undefined
  const cwd = session.header?.cwd
  return typeof cwd === 'string' && cwd.length > 0 ? cwd : undefined
}

/**
 * Split NUL-terminated output into records.
 *
 * Paths may contain any byte except NUL, so a newline- or tab-separated format
 * would misread a real filename. Every format used below is NUL-terminated for
 * exactly that reason.
 *
 * @param text - the raw output.
 * @returns the records, with the trailing empty field dropped.
 */
function nulSplit(text) {
  const parts = text.split('\u0000')
  if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop()
  return parts
}

/** Field and record separators for commit records: chosen for absence from commit text. */
const COMMIT_SEP = '\u001f'
const COMMIT_END = '\u001e'

/**
 * Read one page of commit history.
 *
 * The page is a window over one traversal. `--topo-order` is fixed rather than
 * offered as a choice: a graph whose parents can appear above their children is
 * not a graph, and date order permits exactly that across clock skew.
 *
 * Stashes are named as extra starting points by commit id. `--all` reaches only
 * `refs/stash`, which is the newest stash; every older one lives in that ref's
 * reflog and is therefore invisible to a traversal that starts from refs. A
 * stash dropped between the read and this call cannot break the traversal
 * either, because an id is not a name that can go away.
 *
 * @param root - the repository root.
 * @param opts - how many commits to read, from where, and which stashes to include.
 * @returns the commit records, already trimmed to the requested window.
 */
async function listCommits(root, opts) {
  const { limit, skip, ref, stashes = [] } = opts
  const format = [
    '%H', '%P', '%an', '%ae', '%aI', '%cn', '%ce', '%cI', '%s', '%D',
  ].join(COMMIT_SEP) + COMMIT_END
  const args = [
    'log',
    '--topo-order',
    `--max-count=${limit}`,
    `--format=${format}`,
  ]
  if (skip > 0) args.push(`--skip=${skip}`)
  // `--all` shows every branch; a named ref narrows it to that branch's history.
  args.push(ref === undefined ? '--all' : ref)
  if (ref === undefined) args.push(...stashes.map(entry => entry.hash))
  const out = await git(root, args, { maxBuffer: MAX_BUFFER })
  return out
    .split(COMMIT_END)
    .map(record => record.trim())
    .filter(record => record.length > 0)
    .map((record) => {
      const [hash, parents, an, ae, aI, cn, ce, cI, subject, refs] = record.split(COMMIT_SEP)
      return {
        hash,
        parents: parents === '' ? [] : parents.split(' '),
        authorName: an,
        authorEmail: ae,
        authorDate: aI,
        committerName: cn,
        committerEmail: ce,
        committerDate: cI,
        subject,
        refs: refs === '' ? [] : refs.split(', '),
      }
    })
}

/**
 * Read the stash list.
 *
 * A stash is a position in a reflog rather than a named ref: only the newest
 * one is `refs/stash`, and the older ones are reachable by nothing but their
 * selector. Each entry is read with its commit id so the graph can place it and
 * the browser can name it `stash@{n}` without the host ever accepting a
 * revision expression from a caller.
 *
 * @param root - the repository working tree.
 * @returns one entry per stash, newest first.
 */
async function listStashes(root) {
  const format = ['%gd', '%H', '%gD', '%ct', '%gs'].join(COMMIT_SEP)
  const out = await git(root, ['stash', 'list', `--format=${format}`]).catch(() => '')
  return out
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map((line) => {
      const [selector, hash, fullSelector, seconds, subject] = line.split(COMMIT_SEP)
      const index = Number.parseInt(String(selector).replace(/[^0-9]/g, ''), 10)
      const stamp = Number(seconds)
      return {
        index: Number.isInteger(index) ? index : null,
        selector: String(selector ?? ''),
        fullSelector: String(fullSelector ?? ''),
        hash: String(hash ?? ''),
        subject: String(subject ?? ''),
        date: Number.isFinite(stamp) ? new Date(stamp * 1000).toISOString() : null,
      }
    })
    // A stash without a position or a commit id could be neither named nor
    // placed, so it is left out rather than half-reported.
    .filter(entry => entry.index !== null && /^[0-9a-f]{40,64}$/.test(entry.hash))
}

/**
 * Read the refs a graph may label: local branches, remote-tracking branches,
 * and tags.
 *
 * A graph that does not know where its branches point is a decoration. This
 * reads the labels rather than inferring them, so a branch with no unique
 * commit is still named.
 *
 * @param root - the repository root.
 * @returns one entry per ref, with the commit each resolves to.
 */
async function listRefs(root) {
  const format = [
    '%(refname)', '%(objectname)', '%(objecttype)', '%(*objectname)', '%(HEAD)',
  ].join(COMMIT_SEP)
  const out = await git(root, ['for-each-ref', `--format=${format}`])
  const head = (await git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => '')).trim()
  const refs = out
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map((line) => {
      const [refname, objectname, objecttype, peeled, isHead] = line.split(COMMIT_SEP)
      // An annotated tag points at a tag object; the commit it wraps is what a
      // graph places. Without this, a tag would appear to name no commit.
      const target = objecttype === 'tag' && peeled !== '' ? peeled : objectname
      return {
        name: refname,
        target,
        kind: refname.startsWith('refs/heads/') ? 'branch'
          : refname.startsWith('refs/remotes/') ? 'remote'
            : refname.startsWith('refs/tags/') ? 'tag'
              : 'other',
        isHead: isHead.trim() === '*',
      }
    })
    .filter(ref => ref.kind !== 'other')
  // The configured remote names travel with the refs. A browser cannot tell
  // `origin/feature/x` from a branch literally named `origin/feature` split at
  // its first slash, and the names are the only authority on where a remote
  // name ends and the branch begins.
  // A remote whose name begins with `-` is a name git would read as an option
  // wherever it appears, so it is left out of the list the browser offers
  // rather than offered and then refused.
  const remotes = (await git(root, ['remote']))
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('-'))
  return { refs, head: head === 'HEAD' ? null : head, remotes }
}

/**
 * Compare the remote-tracking refs before and after a fetch.
 *
 * A fetch moves refs without touching the working tree, so what a reader wants
 * to hear is what changed about the remote: branches that appeared, branches
 * that moved, and — with pruning — branches that are gone.
 *
 * @param before - the refs as `listRefs` reported them before.
 * @param after - the refs as `listRefs` reports them now.
 * @returns the remote refs that were added, updated and removed.
 */
export function diffRemoteRefs(before, after) {
  const short = name => name.replace(/^refs\/remotes\//, '')
  const earlier = new Map((before?.refs ?? []).filter(ref => ref.kind === 'remote').map(ref => [ref.name, ref.target]))
  const later = new Map((after?.refs ?? []).filter(ref => ref.kind === 'remote').map(ref => [ref.name, ref.target]))
  const added = []
  const updated = []
  const pruned = []
  for (const [name, target] of later) {
    if (!earlier.has(name)) added.push(short(name))
    else if (earlier.get(name) !== target) updated.push(short(name))
  }
  for (const name of earlier.keys()) if (!later.has(name)) pruned.push(short(name))
  return { added: added.sort(), updated: updated.sort(), pruned: pruned.sort() }
}

/**
 * Fetch from every configured remote.
 *
 * This is the plugin's one writing action, and it writes only what Git itself
 * calls remote-tracking state: refs under `refs/remotes/`. The working tree,
 * the index, HEAD and every local branch are untouched, which is why a graph
 * may offer it at all. The command is Git Graph's own — `fetch --all`, tags
 * included, pruning only when asked for — run with the prompt switched off and
 * an execution ceiling, so an unreachable or credential-hungry remote reports
 * itself instead of hanging a tab.
 *
 * @param root - the repository working tree.
 * @param opts.prune - also delete remote-tracking refs that no longer exist upstream.
 * @returns what the fetch changed.
 */
async function fetchRemotes(root, opts = {}) {
  const before = await listRefs(root)
  if (before.remotes.length === 0) return { remotes: [], added: [], updated: [], pruned: [], skipped: 'no remote is configured' }
  const args = ['fetch', '--all']
  if (opts.prune === true) args.push('--prune')
  try {
    await git(root, args)
  } catch (error) {
    return {
      remotes: before.remotes,
      added: [], updated: [], pruned: [],
      error: String(error?.gitStderr ?? error?.message ?? error),
    }
  }
  const after = await listRefs(root)
  return { remotes: after.remotes, ...diffRemoteRefs(before, after) }
}

/**
 * Read one commit in full: its message, its parents, and the files it changed.
 *
 * The file list is a comparison against the first parent, which is what a
 * reader means by "what this commit changed" on a merge. `--find-renames`
 * reports a rename as a rename, so a moved file does not read as one deletion
 * plus one addition.
 *
 * @param root - the repository root.
 * @param hash - the commit to describe.
 * @returns the commit's metadata and its changed paths.
 */
async function commitDetail(root, hash) {
  const meta = (await git(root, [
    'show', '--no-patch',
    `--format=%H${COMMIT_SEP}%P${COMMIT_SEP}%an${COMMIT_SEP}%ae${COMMIT_SEP}%aI${COMMIT_SEP}%cn${COMMIT_SEP}%ce${COMMIT_SEP}%cI${COMMIT_SEP}%D${COMMIT_SEP}%B`,
    hash,
  ])).replace(/\n+$/, '')
  const [fullHash, parents, an, ae, aI, cn, ce, cI, refs, message] = meta.split(COMMIT_SEP)

  const parentList = parents === '' ? [] : parents.split(' ')
  // The changed paths are always read as "this commit against one chosen
  // parent", never as the bare commit. For a merge, `diff-tree <merge>` reports
  // nothing at all — git treats the merge as having no diff of its own — so the
  // first parent is named explicitly to get the ordinary answer a reader
  // expects. A root commit has no parent, and `--root` makes git show its whole
  // tree as an addition instead of refusing.
  const against = parentList.length === 0 ? null : parentList[0]
  const statusArgs = against === null
    ? [
      'diff-tree', '--no-commit-id', '--name-status', '--no-ext-diff', '--no-textconv', '-r', '--find-renames', '-z', '--root', fullHash,
    ]
    : [
      'diff', '--name-status', '--no-ext-diff', '--no-textconv', '-z', '--find-renames', against, fullHash,
    ]
  const numstatArgs = against === null
    ? [
      'diff-tree', '--no-commit-id', '--numstat', '--no-ext-diff', '--no-textconv', '-r', '--find-renames', '-z', '--root', fullHash,
    ]
    : [
      'diff', '--numstat', '--no-ext-diff', '--no-textconv', '-z', '--find-renames', against, fullHash,
    ]
  const [statusOut, numstatOut] = await Promise.all([
    git(root, statusArgs),
    git(root, numstatArgs),
  ])
  const files = mergeFileStats(parseNameStatus(statusOut), parseNumstat(numstatOut))

  return {
    hash: fullHash,
    parents: parentList,
    authorName: an,
    authorEmail: ae,
    authorDate: aI,
    committerName: cn,
    committerEmail: ce,
    committerDate: cI,
    refs: refs === '' ? [] : refs.split(', '),
    message,
    files,
  }
}

/**
 * Parse `--name-status -z` output.
 *
 * The NUL-separated form alternates status and path, except for a rename or a
 * copy, which carry the old path and the new one. Reading it positionally is
 * what keeps a filename containing a tab or a newline intact.
 *
 * @param text - the raw output.
 * @returns one entry per changed path.
 */
function parseNameStatus(text) {
  const fields = nulSplit(text)
  const files = []
  for (let i = 0; i < fields.length; i += 1) {
    const status = fields[i]
    if (status === '') continue
    const code = status[0]
    if (code === 'R' || code === 'C') {
      const from = fields[i + 1]
      const to = fields[i + 2]
      i += 2
      files.push({ status: code, path: to, oldPath: from, score: status.slice(1) })
      continue
    }
    const path = fields[i + 1]
    i += 1
    files.push({ status: code, path, oldPath: null, score: status.slice(1) })
  }
  return files
}

/**
 * Parse `--numstat -z` output.
 *
 * A normal record is `additions<TAB>deletions<TAB>path<NUL>`. With rename
 * detection Git emits `additions<TAB>deletions<TAB><NUL>oldPath<NUL>newPath<NUL>`;
 * the empty path marker is intentional and must not be discarded. Binary files
 * use `-` for one or both counters and therefore receive null counts.
 *
 * @param text - the raw NUL-separated output.
 * @returns one stat record per changed file.
 */
function parseNumstat(text) {
  const fields = nulSplit(text)
  const stats = []
  for (let i = 0; i < fields.length; i += 1) {
    const header = fields[i]
    if (header === '') continue
    const tab = header.indexOf('\t')
    if (tab < 0) continue
    const secondTab = header.indexOf('\t', tab + 1)
    if (secondTab < 0) continue
    const additionsText = header.slice(0, tab)
    const deletionsText = header.slice(tab + 1, secondTab)
    const additions = parseNumstatCount(additionsText)
    const deletions = parseNumstatCount(deletionsText)
    const firstPath = header.slice(secondTab + 1)
    if (firstPath !== '') {
      stats.push({ path: firstPath, oldPath: null, additions, deletions })
      continue
    }
    // Rename/copy output has an empty path followed by old and new names.
    const oldPath = fields[i + 1]
    const path = fields[i + 2]
    i += 2
    if (typeof oldPath !== 'string' || typeof path !== 'string') continue
    stats.push({ path, oldPath, additions, deletions })
  }
  return stats
}

/** @param text - one numstat counter. @returns a number or null for binary/unknown. */
function parseNumstatCount(text) {
  return /^\d+$/.test(text) ? Number(text) : null
}

/**
 * Merge path/status records with numstat records without trusting path text as
 * delimiters. Rename records are keyed by both names, while ordinary records
 * use their one path. Missing stats remain explicitly unknown (`null`).
 */
function mergeFileStats(files, stats) {
  const byKey = new Map()
  for (const stat of stats) {
    byKey.set(fileStatKey(stat.path, stat.oldPath), stat)
    if (stat.oldPath !== null) byKey.set(fileStatKey(stat.path, null), stat)
  }
  return files.map(file => {
    const stat = byKey.get(fileStatKey(file.path, file.oldPath))
      ?? byKey.get(fileStatKey(file.path, null))
    return {
      ...file,
      additions: stat?.additions ?? null,
      deletions: stat?.deletions ?? null,
    }
  })
}

function fileStatKey(path, oldPath) {
  return `${oldPath ?? ''}\u0000${path}`
}

/**
 * Produce a unified diff for one path between two revisions.
 *
 * `--no-ext-diff` and `--no-textconv` keep a repository's own configuration
 * from substituting a different program here, and `--no-color` keeps the text
 * plain so the browser can decide how to paint it.
 *
 * A rename needs both of its names to be compared as a rename. Naming only the
 * new path tells git the old path was never mentioned, so it reports the file
 * as wholly new and the reader loses the change that actually happened. Both
 * names are therefore passed whenever the caller knows the file was renamed,
 * which lets `--find-renames` pair them and show a real edit.
 *
 * @param root - the repository root.
 * @param spec - the two sides, the path (and its former path), and the context.
 * @returns the patch, and whether it was cut off at the size ceiling.
 */
async function fileDiff(root, spec) {
  const { from, to, path, oldPath, context, mode } = spec
  // Git spells an uncommitted comparison positionally rather than by revision:
  // no revision compares the index against the working copy, `--cached` with a
  // commit compares that commit against the index, and one revision compares it
  // against the working copy. The mode selects the spelling, because passing an
  // index position like `:0` as a revision is rejected outright.
  const args = [
    'diff', '--no-color', '--no-ext-diff', '--no-textconv',
    `--unified=${context}`,
    '--find-renames',
  ]
  if (mode === 'staged') {
    args.push('--cached', from ?? 'HEAD')
  } else if (mode === 'worktree') {
    // No revision at all: index against working copy.
  } else {
    if (from !== null && from !== undefined) args.push(from)
    if (to !== null && to !== undefined) args.push(to)
  }
  args.push('--')
  if (typeof oldPath === 'string' && oldPath.length > 0 && oldPath !== path) args.push(oldPath)
  args.push(path)
  const out = await git(root, args, { maxBuffer: MAX_PATCH_BYTES })
  const truncated = out.length >= MAX_PATCH_BYTES
  return { patch: truncated ? out.slice(0, MAX_PATCH_BYTES) : out, truncated }
}

/**
 * Report what the working tree holds beyond HEAD.
 *
 * This is the answer that describes an agent's uncommitted work, and it is read
 * fresh every time: the index, the tracked files, and the untracked ones are
 * three separate truths that a running process changes continuously.
 *
 * @param root - the repository root.
 * @returns the staged and unstaged changes, and the files git does not track.
 */
async function workingTree(root) {
  // `-z` with an explicit format: a rename arrives as its own record rather
  // than as an arrow-joined string that cannot be split safely.
  const statusOut = await git(root, [
    '-c', 'core.fsmonitor=false', 'status', '--porcelain=v2', '-z', '--untracked-files=all', '--renames',
  ])
  // Keep staged and unstaged comparisons separate: a partially staged file has
  // two different answers, and a rename's old path belongs to both sides.
  const head = (await git(root, ['rev-parse', '--verify', 'HEAD']).catch(() => EMPTY_TREE)).trim() || EMPTY_TREE
  const [stagedStatsOut, unstagedStatsOut] = await Promise.all([
    git(root, [
      'diff', '--cached', '--numstat', '--no-ext-diff', '--no-textconv', '--find-renames', '-z', head,
    ]),
    git(root, [
      'diff', '--numstat', '--no-ext-diff', '--no-textconv', '--find-renames', '-z',
    ]),
  ])
  const { staged, unstaged, untracked } = parseStatusV2(statusOut)
  return {
    staged: mergeFileStats(staged, parseNumstat(stagedStatsOut)),
    unstaged: mergeFileStats(unstaged, parseNumstat(unstagedStatsOut)),
    // Git deliberately does not diff an untracked path. Keep an explicit
    // unknown count instead of reading arbitrary workspace content.
    untracked: untracked.map(file => ({ ...file, additions: null, deletions: null })),
  }
}

/**
 * Parse `git status --porcelain=v2 -z` output.
 *
 * Version 2 is used because version 1 encodes the two sides of a change in two
 * letters whose meaning shifts with the file's tracked state, while version 2
 * states the staged and unstaged state separately and in named fields.
 *
 * @param text - the raw NUL-separated output.
 * @returns the three groups a reader expects: staged, unstaged, untracked.
 */
function parseStatusV2(text) {
  const records = nulSplit(text)
  const staged = []
  const unstaged = []
  const untracked = []
  for (let i = 0; i < records.length; i += 1) {
    const record = records[i]
    // An ordinary changed entry is `1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>`.
    // The path is the last field and is taken from the end, so spaces, tabs and
    // newlines in a filename remain part of the path.
    if (record.startsWith('1 ')) {
      const fields = record.split(' ')
      const xy = fields[1] ?? '..'
      const path = fields.slice(8).join(' ')
      addStatusSides(staged, unstaged, xy, path, null)
      continue
    }
    // A rename/copy entry is `2 <XY> <sub> <mH> <mI> <mW> <hH> <hI>
    // <score> <path>`, followed by the old path as its own NUL record.
    if (record.startsWith('2 ')) {
      const fields = record.split(' ')
      const xy = fields[1] ?? '..'
      const path = fields.slice(9).join(' ')
      const oldPath = records[i + 1]
      i += 1
      addStatusSides(staged, unstaged, xy, path, oldPath ?? null)
      continue
    }
    // An untracked entry is `? <path>`.
    if (record.startsWith('? ')) {
      untracked.push({ status: '?', path: record.slice(2) })
    }
  }

  return { staged, unstaged, untracked }
}

function addStatusSides(staged, unstaged, xy, path, oldPath) {
  const x = xy[0]
  const y = xy[1]
  const extra = oldPath === null ? {} : { oldPath }
  if (x !== '.') staged.push({ status: x, path, ...extra })
  if (y !== '.') unstaged.push({ status: y, path, ...extra })
}

/**
 * Read a whole file at one revision.
 *
 * Reading from a revision rather than from disk is what makes "the file as it
 * was in this commit" correct even when the working tree has moved on. A binary
 * file is reported as such rather than decoded into replacement characters, and
 * a path that does not exist at that revision is reported as absent.
 *
 * @param root - the repository root.
 * @param spec - the revision and path.
 * @returns the file's text, or a marker when it is binary or absent.
 */
async function showBlob(root, spec) {
  const { rev, path } = spec
  let out
  try {
    out = await git(root, ['show', `${rev}:${path}`], { encoding: 'utf8' })
  } catch (error) {
    const message = String(error?.gitStderr ?? error?.message ?? '')
    // "exists on disk, but not in <rev>" and "path does not exist" are the two
    // ways git says this side is absent. Neither is a failure of the request.
    if (/does not exist|exists on disk, but not in|unknown revision|invalid object name/i.test(message)) {
      return { text: '', binary: false, absent: true }
    }
    throw error
  }
  const binary = out.includes('\u0000')
  return { text: binary ? '' : out, binary, absent: false }
}

/* -------------------------------------------------------------------------
 * Writing actions
 *
 * Everything above reads. What follows is the other half: the named actions a
 * graph offers by right-clicking a commit or a branch. The same rule holds as
 * for reads — the browser names an operation, never a command line — but the
 * consequence of a mistake is different, so three things guard it:
 *
 *   - a repository that is in the middle of a Git operation, or that carries an
 *     `index.lock`, is left alone rather than written to behind git's back;
 *   - this plugin serializes its own writes per repository, so two clicks
 *     cannot race each other for the index;
 *   - every argument is validated here, and `--` separates names from paths, so
 *     a branch called `--force` cannot become an option.
 * ---------------------------------------------------------------------- */

/**
 * Environment for a `git` child that may change the repository.
 *
 * A write needs the same untrusted-repository shielding as a read, plus one
 * thing more: an action started from a sidebar has no terminal, so any editor
 * git would open — a rebase's todo list, a merge message, an interactive add —
 * must answer itself instead of waiting for a human who cannot type into it.
 * `true` is the editor that does nothing and succeeds, which accepts the text
 * git already has and lets the action finish.
 */
const GIT_WRITE_ENV = {
  ...GIT_ENV,
  GIT_EDITOR: 'true',
  GIT_SEQUENCE_EDITOR: 'true',
}

/**
 * Ceiling for one writing invocation.
 *
 * A read is local and answers in milliseconds; a push, pull or fetch crosses
 * the network and may legitimately take a while, so the read ceiling would
 * abort transfers that are still making progress.
 */
const GIT_WRITE_TIMEOUT_MS = 120_000

/** Longest text of git's own output carried back to the browser for a notice. */
const MAX_OUTPUT_TEXT = 4_000

/** Longest user-supplied message carried into a commit, tag or stash. */
const MAX_MESSAGE_LENGTH = 8_000

/**
 * Run one `git` command and report both streams.
 *
 * @param cwd - the directory to run in.
 * @param args - the argument list, built by this file and never from request text.
 * @param opts - environment, ceiling, output limit and encoding.
 * @returns the captured stdout and stderr, or a rejection carrying git's message.
 */
function gitRun(cwd, args, opts = {}) {
  const {
    maxBuffer = MAX_BUFFER,
    encoding = 'utf8',
    env = GIT_ENV,
    timeout = GIT_TIMEOUT_MS,
  } = opts
  return new Promise((resolve, reject) => {
    execFile('git', ['--no-pager', '-C', cwd, ...args], {
      cwd,
      env,
      timeout,
      maxBuffer,
      encoding,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      const out = String(stdout ?? '')
      const err = String(stderr ?? '')
      if (error === null || error === undefined) {
        resolve({ stdout: out, stderr: err })
        return
      }
      // A non-zero exit is git's own verdict — "not a repository", "unknown
      // revision", "no such path", "would be overwritten by checkout". It is
      // reported as such, with git's message.
      //
      // Which stream carries that message depends on the command, not on
      // whether it failed: a refused checkout explains itself on stderr, while
      // a conflicted merge prints "CONFLICT (content): …" on stdout and leaves
      // stderr empty. Reading only stderr would replace the one sentence a
      // reader needs with Node's "Command failed".
      const message = err.trim() || out.trim() || String(error.message ?? error)
      const failure = new Error(message)
      failure.gitStderr = message
      failure.stdout = out
      failure.stderr = err
      reject(failure)
    })
  })
}

/**
 * Run one read-only `git` command in a repository.
 *
 * @param cwd - the repository working tree.
 * @param args - the argument list, built here and never from request text.
 * @param opts - optional output ceiling and text encoding.
 * @returns the captured stdout, or a rejection carrying git's own message.
 */
function git(cwd, args, opts = {}) {
  return gitRun(cwd, args, opts).then(result => result.stdout)
}

/**
 * Run one mutating `git` command.
 *
 * Git reports the outcome of a write on whichever stream it feels like — a
 * checkout says "Switched to branch" on stderr, a merge says its summary on
 * stdout — so both are captured and joined. That text is what the reader sees
 * as the result of the action, and it is git's own words rather than a
 * paraphrase written here.
 *
 * @param root - the repository working tree.
 * @param args - the argument list, built by the action table.
 * @returns git's own account of what it did.
 */
async function gitWrite(root, args) {
  const { stdout, stderr } = await gitRun(root, args, {
    env: GIT_WRITE_ENV,
    timeout: GIT_WRITE_TIMEOUT_MS,
  })
  return [stderr, stdout]
    .map(text => text.trim())
    .filter(text => text.length > 0)
    .join('\n')
    .slice(0, MAX_OUTPUT_TEXT)
}

/**
 * One queue per repository, so this plugin's own writes never race each other.
 *
 * Two actions started in quick succession would otherwise contend for
 * `.git/index.lock`, and the loser would report a lock error a reader cannot
 * act on. Serializing here keeps git's own locking free to arbitrate with
 * everyone else — an agent, a terminal — working in the same tree.
 */
const writeQueues = new Map()

/**
 * Run one write after every write already queued for this repository.
 *
 * @param root - the repository working tree.
 * @param task - the write to perform.
 * @returns the task's own result or failure.
 */
function queueWrite(root, task) {
  const previous = writeQueues.get(root) ?? Promise.resolve()
  const run = previous.then(task)
  // The queue tail never rejects: a failed action must not poison the writes
  // behind it, and its error belongs to the caller of this one action only.
  const settled = run.then(() => {}, () => {})
  writeQueues.set(root, settled)
  settled.then(() => {
    if (writeQueues.get(root) === settled) writeQueues.delete(root)
  })
  return run
}

/**
 * The markers a repository carries while a multi-step Git operation is only
 * half done. Their presence is the difference between "you may start a merge"
 * and "you must finish the one you are in".
 *
 * The name is the prefix of the actions that belong to that operation —
 * `cherryPick.continue`, `rebase.abort` — because that is what the refusal has
 * to match an action against. It is not the spelling a reader should see;
 * `OPERATION_LABELS` carries that.
 */
const OPERATION_MARKERS = [
  ['MERGE_HEAD', 'merge'],
  ['CHERRY_PICK_HEAD', 'cherryPick'],
  ['REVERT_HEAD', 'revert'],
  ['REBASE_HEAD', 'rebase'],
  ['BISECT_LOG', 'bisect'],
]

/** How each half-finished operation is named to a reader. */
const OPERATION_LABELS = {
  merge: 'merge',
  cherryPick: 'cherry-pick',
  revert: 'revert',
  rebase: 'rebase',
  bisect: 'bisect',
  am: 'git am',
}

/**
 * Where HEAD is, and which branch it is on.
 *
 * @param root - the repository working tree.
 * @returns the commit id and branch name, each `null` when there is none.
 */
async function headState(root) {
  const [headOut, branchOut] = await Promise.all([
    git(root, ['rev-parse', 'HEAD']).catch(() => ''),
    git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => ''),
  ])
  const branch = branchOut.trim()
  return {
    head: headOut.trim() === '' ? null : headOut.trim(),
    branch: branch === '' || branch === 'HEAD' ? null : branch,
  }
}

/**
 * What a repository is in the middle of, and whether it is safe to write.
 *
 * This is the answer the action menu is built from: the browser disables
 * actions on the same facts the host refuses them on, so a reader is never
 * offered a button whose only outcome is an error.
 *
 * @param root - the repository working tree.
 * @returns the current operation, the lock, the tree's cleanliness and HEAD.
 */
async function repositoryState(root) {
  const dir = await gitDir(root)
  const at = name => join(dir, name)
  let operation = null
  for (const [marker, name] of OPERATION_MARKERS) {
    if (existsSync(at(marker))) { operation = name; break }
  }
  if (operation === null && existsSync(at('rebase-merge'))) operation = 'rebase'
  // `rebase-apply` is shared: a plain `git rebase` uses it, and so does
  // `git am`, which says which it is by leaving an `applying` file behind. The
  // commands that finish one are not the commands that finish the other.
  if (operation === null && existsSync(at('rebase-apply'))) {
    operation = existsSync(at('rebase-apply/applying')) ? 'am' : 'rebase'
  }
  const locked = existsSync(at('index.lock'))
  const [place, status, conflicts] = await Promise.all([
    headState(root),
    git(root, ['-c', 'core.fsmonitor=false', 'status', '--porcelain']).catch(() => ''),
    git(root, ['diff', '--name-only', '--diff-filter=U']).catch(() => ''),
  ])
  const changed = status.split('\n').filter(line => line.trim().length > 0)
  return {
    ...place,
    detached: place.branch === null && place.head !== null,
    operation,
    locked,
    lockPath: locked ? at('index.lock') : null,
    dirty: changed.length > 0,
    changedCount: changed.length,
    conflicts: conflicts.split('\n').map(line => line.trim()).filter(line => line.length > 0),
    // A write that moves HEAD or the index is refused while either is true.
    busy: operation !== null || locked,
    gitDir: dir,
  }
}

/**
 * Require a name Git itself accepts as a branch or tag.
 *
 * The check is git's own — `check-ref-format` — rather than a pattern written
 * here, because the rules are subtle (no `..`, no trailing `.lock`, no leading
 * or trailing slash, no control characters) and a name that passed this file
 * but not git would fail halfway through a write. A leading dash is refused
 * before git sees it: an argument that starts with `-` is an option, not a
 * name, and that is the one check git cannot make on this file's behalf.
 *
 * @param root - the repository working tree.
 * @param value - the caller's name.
 * @param label - the field name, for the error and the summary.
 * @returns the validated name.
 * @throws when git would not accept it.
 */
async function requireRefName(root, value, label) {
  const text = requireString(value, label)
  if (text.startsWith('-')) throw new Error(`dsh-git-graph: refusing ${label} ${text}`)
  if (text.includes('@{')) throw new Error(`dsh-git-graph: refusing ${label} ${text}`)
  if (text.length > 255) throw new Error(`dsh-git-graph: ${label} is too long`)
  try {
    await git(root, ['check-ref-format', '--branch', text])
  } catch {
    throw new Error(`dsh-git-graph: ${label} ${text} is not a valid branch or tag name`)
  }
  return text
}

/**
 * Require a revision this plugin is willing to name.
 *
 * A target is either a commit id — what a graph row carries — or an existing
 * ref name, what a badge carries. Both shapes are validated; neither is free
 * text, so `--help` or a ref range cannot reach git's argument parser.
 *
 * @param root - the repository working tree.
 * @param value - the caller's target.
 * @param label - the field name, for the error.
 * @returns the validated revision.
 * @throws when it is neither a commit id nor a valid ref name.
 */
async function requireTarget(root, value, label) {
  const text = requireString(value, label)
  if (/^[0-9a-f]{4,64}$/.test(text)) return text
  return requireRefName(root, text, label)
}

/**
 * Require a path that stays inside the repository.
 *
 * Paths reach git only after `--`, and only in the shapes git itself printed as
 * a changed file. An absolute path, or one that walks upwards, names something
 * the repository does not own, so both are refused here rather than passed on
 * and refused by git with a message about the index.
 *
 * @param value - the caller's path.
 * @param label - the field name, for the error.
 * @returns the validated path.
 * @throws when it leaves the working tree.
 */
function requirePath(value, label) {
  const text = requireString(value, label)
  if (text.startsWith('-')) throw new Error(`dsh-git-graph: refusing ${label} ${text}`)
  if (text.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(text)) {
    throw new Error(`dsh-git-graph: ${label} must be relative to the repository`)
  }
  if (text.split(/[\\/]/).includes('..')) {
    throw new Error(`dsh-git-graph: ${label} must stay inside the repository`)
  }
  return text
}

/**
 * Require one of the repository's own remote names.
 *
 * The name is checked against `git remote` rather than against a pattern,
 * because a remote name reaches a `push` or `fetch` argument position where a
 * leading dash would be read as an option.
 *
 * @param root - the repository working tree.
 * @param value - the caller's remote name.
 * @param label - the field name, for the error.
 * @returns the validated remote name.
 * @throws when no such remote is configured.
 */
async function requireRemote(root, value, label = 'remote') {
  const text = requireString(value, label)
  // A remote name lands in an argument position, and git reads a name that
  // begins with `-` as an option: a repository that configured a remote called
  // `--force` would quietly turn a plain push into a forced one, and `git push
  // --force main` then fails with a message about `main` not being a
  // repository. The membership check below cannot catch that, because such a
  // remote really is configured.
  if (text.startsWith('-')) throw new Error(`dsh-git-graph: refusing ${label} ${text}`)
  const known = (await git(root, ['remote']))
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
  if (!known.includes(text)) throw new Error(`dsh-git-graph: ${text} is not a configured remote`)
  return text
}

/**
 * Require one of a fixed set of spellings.
 *
 * The value selects which fixed argument git receives, so the caller's text
 * never reaches the argument list — only the mapped constant does.
 *
 * @param value - the caller's choice.
 * @param allowed - the accepted values, mapped to the argument each produces.
 * @param label - the field name, for the error.
 * @returns the mapped argument.
 * @throws when the choice is not one of them.
 */
function requireChoice(value, allowed, label) {
  const text = requireString(value, label)
  if (!Object.prototype.hasOwnProperty.call(allowed, text)) {
    throw new Error(`dsh-git-graph: ${label} must be one of ${Object.keys(allowed).join(', ')}`)
  }
  return allowed[text]
}

/**
 * Read an optional message.
 *
 * The message travels as `--message=<text>`, one argument, so a message that
 * begins with a dash cannot be mistaken for an option — which `-m <text>`
 * would risk for exactly the messages a reader is most likely to write.
 *
 * @param value - the caller's message.
 * @returns the argument to append, or `null` when there is no message.
 * @throws when it is longer than this plugin will carry.
 */
function optionalMessage(value) {
  if (value === undefined || value === null) return null
  const text = String(value)
  if (text.trim().length === 0) return null
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`dsh-git-graph: message is longer than ${MAX_MESSAGE_LENGTH} characters`)
  }
  return `--message=${text}`
}

/**
 * Read a stash index.
 *
 * `stash@{n}` is built here from an integer, never assembled from request text:
 * the entry point into a stash is a position in a list this host read, not a
 * revision expression a caller may write.
 *
 * @param value - the caller's index.
 * @returns the stash revision.
 * @throws when it is not a small non-negative integer.
 */
function requireStashIndex(value) {
  // `Number(null)`, `Number('')` and `Number(false)` are all 0, so coercing
  // would let a malformed request silently address the newest stash — and this
  // is the position of the thing being dropped.
  const n = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : Number.NaN
  if (!Number.isInteger(n) || n < 0 || n > 1_000) {
    throw new Error('dsh-git-graph: stash index must be a whole number')
  }
  return `stash@{${n}}`
}

/**
 * Read a list of paths.
 *
 * @param value - the caller's paths.
 * @param label - the field name, for the error.
 * @returns the validated paths, in the caller's order.
 * @throws when the list is empty or any path leaves the repository.
 */
function requirePaths(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`dsh-git-graph: ${label} is required`)
  }
  if (value.length > 500) {
    throw new Error(`dsh-git-graph: too many ${label}`)
  }
  return value.map(entry => requirePath(entry, label))
}

/** The three ways `git reset` can move HEAD and the index. */
const RESET_MODES = { soft: '--soft', mixed: '--mixed', hard: '--hard' }

/**
 * Turn one named action into the exact argument list it will run.
 *
 * This is the whole vocabulary of what this plugin can change about a
 * repository. Each case validates its own inputs and returns fixed arguments —
 * there is no path through this function that forwards caller text to git in an
 * argument position.
 *
 * The returned flags are what the confirmation dialog and the refusal rules are
 * built from: `destructive` means data can be lost, `writesTree` means the
 * working tree changes and a dirty tree is worth mentioning first, and
 * `continuesOperation` marks the actions that are the way *out* of a
 * half-finished operation and therefore allowed while one is in progress.
 *
 * @param root - the repository working tree.
 * @param request - the action name and its parameters.
 * @returns the validated plan.
 * @throws when the action is unknown or a parameter is not acceptable.
 */
async function planAction(root, request) {
  const id = requireString(request.action, 'action')
  const p = request.params ?? {}
  const plan = (argv, summary, flags = {}) => ({
    id,
    argv,
    summary,
    // Most actions are one command. A few are a sequence — undoing a rename
    // takes three, because no single git invocation does it — and the sequence
    // is what the dialog shows and what runs, in order, inside one queue slot.
    steps: Array.isArray(flags.steps) && flags.steps.length > 0 ? flags.steps : null,
    destructive: flags.destructive === true,
    writesTree: flags.writesTree === true,
    writesRefs: flags.writesRefs === true,
    continuesOperation: flags.continuesOperation === true,
  })

  switch (id) {
    case 'branch.create': {
      const name = await requireRefName(root, p.name, 'branch name')
      const start = p.startPoint === undefined || p.startPoint === null || p.startPoint === ''
        ? null
        : await requireTarget(root, p.startPoint, 'start point')
      const checkout = p.checkout === true
      const argv = checkout
        ? ['checkout', '-b', name, ...(start === null ? [] : [start])]
        : ['branch', name, ...(start === null ? [] : [start])]
      return plan(argv, `git ${argv.join(' ')}`, { writesTree: checkout, writesRefs: true })
    }
    case 'branch.checkout': {
      const name = await requireTarget(root, p.name, 'branch name')
      return plan(['checkout', name], `git checkout ${name}`, { writesTree: true })
    }
    case 'branch.delete': {
      const name = await requireRefName(root, p.name, 'branch name')
      const force = p.force === true
      return plan(['branch', force ? '-D' : '-d', name], `git branch ${force ? '-D' : '-d'} ${name}`,
        { destructive: force, writesRefs: true })
    }
    case 'branch.rename': {
      const name = await requireRefName(root, p.name, 'branch name')
      const to = await requireRefName(root, p.to, 'new branch name')
      return plan(['branch', '-m', name, to], `git branch -m ${name} ${to}`, { writesRefs: true })
    }
    case 'branch.merge': {
      const name = await requireTarget(root, p.name, 'branch name')
      const message = optionalMessage(p.message)
      const argv = [
        'merge',
        ...(p.noFastForward === true ? ['--no-ff'] : []),
        ...(p.squash === true ? ['--squash'] : []),
        ...(message === null ? [] : [message]),
        name,
      ]
      return plan(argv, `git ${argv.join(' ')}`, { writesTree: true, writesRefs: true })
    }
    case 'branch.rebase': {
      const onto = await requireTarget(root, p.onto, 'revision')
      return plan(['rebase', onto], `git rebase ${onto}`,
        { destructive: true, writesTree: true, writesRefs: true })
    }
    case 'branch.reset': {
      const mode = requireChoice(p.mode, RESET_MODES, 'reset mode')
      const to = await requireTarget(root, p.to, 'revision')
      return plan(['reset', mode, to], `git reset ${mode} ${to}`,
        { destructive: mode === '--hard', writesTree: mode === '--hard', writesRefs: true })
    }
    case 'branch.pull': {
      const remote = p.remote === undefined || p.remote === null || p.remote === ''
        ? null
        : await requireRemote(root, p.remote)
      const branch = p.branch === undefined || p.branch === null || p.branch === ''
        ? null
        : await requireRefName(root, p.branch, 'branch name')
      const argv = [
        'pull',
        '--no-edit',
        ...(p.ffOnly === true ? ['--ff-only'] : []),
        ...(remote === null ? [] : [remote]),
        ...(branch === null ? [] : [branch]),
      ]
      return plan(argv, `git ${argv.join(' ')}`, { writesTree: true, writesRefs: true })
    }
    case 'branch.push': {
      const remote = await requireRemote(root, p.remote)
      const branch = await requireRefName(root, p.branch, 'branch name')
      const force = p.force === true
      // The branch travels as a full refspec rather than a bare name. A branch
      // called `+foo` is legal, and git would read that bare name as the
      // spelling of a forced refspec — the force checkbox would be bypassed by
      // the name of the thing being pushed.
      const refspec = `refs/heads/${branch}:refs/heads/${branch}`
      const argv = [
        'push',
        // `--force-with-lease` rather than `--force`: it refuses when the remote
        // has moved since this repository last saw it, which is the difference
        // between replacing your own history and someone else's.
        ...(force ? ['--force-with-lease'] : []),
        ...(p.setUpstream === true ? ['--set-upstream'] : []),
        remote,
        refspec,
      ]
      return plan(argv, `git push ${[...argv.slice(1, -1), branch].join(' ')}`, { destructive: force, writesRefs: true })
    }
    case 'branch.fetchIntoLocal': {
      const remote = await requireRemote(root, p.remote)
      const branch = await requireRefName(root, p.branch, 'branch name')
      const force = p.force === true
      // The refspec is assembled from two validated names; the leading `+` is
      // what permits a non-fast-forward update of the local branch.
      // Full refspecs on both sides: `+foo` is a legal branch name *and* the
      // spelling of a forced refspec, so a bare name is ambiguous.
      const refspec = `${force ? '+' : ''}refs/heads/${branch}:refs/heads/${branch}`
      return plan(['fetch', remote, refspec], `git fetch ${remote} ${refspec}`,
        { destructive: force, writesRefs: true })
    }
    case 'tag.add': {
      const name = await requireRefName(root, p.name, 'tag name')
      const message = optionalMessage(p.message)
      const target = p.hash === undefined || p.hash === null || p.hash === ''
        ? null
        : await requireTarget(root, p.hash, 'hash')
      const annotated = p.annotated === true || message !== null
      const argv = [
        'tag',
        ...(annotated ? ['-a'] : []),
        ...(message === null ? [] : [message]),
        name,
        ...(target === null ? [] : [target]),
      ]
      return plan(argv, `git ${argv.join(' ')}`, { writesRefs: true })
    }
    case 'tag.delete': {
      const name = await requireRefName(root, p.name, 'tag name')
      return plan(['tag', '-d', name], `git tag -d ${name}`, { destructive: true, writesRefs: true })
    }
    case 'tag.push': {
      const name = await requireRefName(root, p.name, 'tag name')
      const remote = await requireRemote(root, p.remote)
      const argv = ['push', remote, `refs/tags/${name}`]
      return plan(argv, `git ${argv.join(' ')}`, { writesRefs: true })
    }
    case 'commit.checkout': {
      const hash = requireHash(p.hash)
      return plan(['checkout', hash], `git checkout ${hash.slice(0, 8)}`, { writesTree: true })
    }
    case 'commit.cherryPick': {
      const hash = requireHash(p.hash)
      const argv = ['cherry-pick', ...(p.noCommit === true ? ['--no-commit'] : []), hash]
      return plan(argv, `git ${argv.join(' ')}`, { writesTree: true, writesRefs: true })
    }
    case 'commit.revert': {
      const hash = requireHash(p.hash)
      const argv = ['revert', '--no-edit', ...(p.noCommit === true ? ['--no-commit'] : []), hash]
      return plan(argv, `git ${argv.join(' ')}`, { writesTree: true, writesRefs: true })
    }
    case 'commit.reset': {
      const mode = requireChoice(p.mode, RESET_MODES, 'reset mode')
      const hash = requireHash(p.hash)
      return plan(['reset', mode, hash], `git reset ${mode} ${hash.slice(0, 8)}`,
        { destructive: mode === '--hard', writesTree: mode === '--hard', writesRefs: true })
    }
    case 'commit.createBranch': {
      const name = await requireRefName(root, p.name, 'branch name')
      const hash = requireHash(p.hash)
      const checkout = p.checkout === true
      const argv = checkout ? ['checkout', '-b', name, hash] : ['branch', name, hash]
      return plan(argv, `git ${argv.join(' ')}`, { writesTree: checkout, writesRefs: true })
    }
    case 'working.stash': {
      const message = optionalMessage(p.message)
      const argv = [
        'stash', 'push',
        ...(p.includeUntracked === true ? ['--include-untracked'] : []),
        ...(p.keepIndex === true ? ['--keep-index'] : []),
        ...(message === null ? [] : [message]),
      ]
      return plan(argv, `git ${argv.join(' ')}`, { writesTree: true, writesRefs: true })
    }
    case 'working.discard': {
      const paths = requirePaths(p.paths, 'file paths')
      // Without a revision, `checkout --` restores from the index and leaves
      // what is staged alone; naming HEAD restores both the index and the
      // working copy to the last commit.
      const fromHead = p.source === 'head'
      const argv = ['checkout', ...(fromHead ? ['HEAD'] : []), '--', ...paths]
      return plan(argv, `git ${argv.join(' ')}`,
        { destructive: true, writesTree: true })
    }
    case 'working.reset': {
      const mode = requireChoice(p.mode, { mixed: '--mixed', hard: '--hard' }, 'reset mode')
      return plan(['reset', mode], `git reset ${mode}`,
        { destructive: mode === '--hard', writesTree: true })
    }
    case 'working.clean': {
      // Named paths are cleaned whatever their kind — a named directory goes
      // without `-d` — which is what makes this the way to discard a file git
      // does not track at all.
      const paths = p.paths === undefined || p.paths === null ? null : requirePaths(p.paths, 'file paths')
      const argv = [
        'clean',
        '-f',
        ...(p.directories === true ? ['-d'] : []),
        ...(p.ignored === true ? ['-x'] : []),
        ...(paths === null ? [] : ['--', ...paths]),
      ]
      return plan(argv, `git ${argv.join(' ')}`, { destructive: true, writesTree: true })
    }
    case 'working.undorename': {
      // A staged rename is one change to git and two paths to a reader. No
      // single command undoes it: `checkout HEAD -- <old> <new>` is refused
      // because the new path is not in that tree, and `reset --hard` cannot be
      // given paths at all. Restoring the index for both paths, bringing the
      // old file back from it, and removing the new one leaves the tree exactly
      // as HEAD describes it.
      const oldPath = requirePath(p.oldPath, 'old path')
      const path = requirePath(p.path, 'file path')
      const steps = [
        ['reset', '-q', 'HEAD', '--', oldPath, path],
        ['checkout', '--', oldPath],
        ['clean', '-q', '-f', '--', path],
      ]
      return plan(steps[0], steps.map(step => `git ${step.join(' ')}`).join('\n'),
        { destructive: true, writesTree: true, steps })
    }
    case 'working.remove': {
      // A file that was added to the index but never committed has nothing in
      // HEAD to restore it from, so `checkout --` cannot discard it: taking it
      // out of the index and off the disk is what discarding means there.
      const paths = requirePaths(p.paths, 'file paths')
      const argv = ['rm', '-f', '--', ...paths]
      return plan(argv, `git ${argv.join(' ')}`, { destructive: true, writesTree: true })
    }
    case 'stash.apply': {
      const stash = requireStashIndex(p.index)
      const argv = ['stash', 'apply', ...(p.reinstateIndex === true ? ['--index'] : []), stash]
      return plan(argv, `git ${argv.join(' ')}`, { writesTree: true })
    }
    case 'stash.pop': {
      const stash = requireStashIndex(p.index)
      return plan(['stash', 'pop', stash], `git stash pop ${stash}`,
        { writesTree: true, writesRefs: true })
    }
    case 'stash.drop': {
      const stash = requireStashIndex(p.index)
      return plan(['stash', 'drop', stash], `git stash drop ${stash}`,
        { destructive: true, writesRefs: true })
    }
    case 'stash.branch': {
      const stash = requireStashIndex(p.index)
      const name = await requireRefName(root, p.name, 'branch name')
      return plan(['stash', 'branch', name, stash], `git stash branch ${name} ${stash}`,
        { writesTree: true, writesRefs: true })
    }
    // The way out of a half-finished operation. These are the only actions
    // allowed while one is in progress, because they are what makes refusing
    // the others humane rather than a dead end.
    case 'merge.abort':
      return plan(['merge', '--abort'], 'git merge --abort', { continuesOperation: true, writesTree: true })
    case 'rebase.continue':
      return plan(['rebase', '--continue'], 'git rebase --continue', { continuesOperation: true, writesTree: true, writesRefs: true })
    case 'rebase.skip':
      return plan(['rebase', '--skip'], 'git rebase --skip', { continuesOperation: true, writesTree: true, writesRefs: true })
    case 'rebase.abort':
      return plan(['rebase', '--abort'], 'git rebase --abort', { continuesOperation: true, writesTree: true, writesRefs: true })
    case 'cherryPick.continue':
      return plan(['cherry-pick', '--continue'], 'git cherry-pick --continue', { continuesOperation: true, writesTree: true, writesRefs: true })
    case 'cherryPick.abort':
      return plan(['cherry-pick', '--abort'], 'git cherry-pick --abort', { continuesOperation: true, writesTree: true, writesRefs: true })
    case 'am.continue':
      return plan(['am', '--continue'], 'git am --continue', { continuesOperation: true, writesTree: true, writesRefs: true })
    case 'am.skip':
      return plan(['am', '--skip'], 'git am --skip', { continuesOperation: true, writesTree: true, writesRefs: true })
    case 'am.abort':
      return plan(['am', '--abort'], 'git am --abort', { continuesOperation: true, writesTree: true, writesRefs: true })
    // A bisect is resolved by abandoning it, which is the only thing a graph
    // can usefully offer while one is running.
    case 'bisect.reset':
      return plan(['bisect', 'reset'], 'git bisect reset', { continuesOperation: true, writesTree: true, writesRefs: true })
    case 'revert.continue':
      return plan(['revert', '--continue'], 'git revert --continue', { continuesOperation: true, writesTree: true, writesRefs: true })
    case 'revert.abort':
      return plan(['revert', '--abort'], 'git revert --abort', { continuesOperation: true, writesTree: true, writesRefs: true })
    default:
      throw new Error(`dsh-git-graph: unknown action ${id}`)
  }
}

/**
 * Refuse a write that must not start right now.
 *
 * The rules are deliberately narrow. A half-finished merge or rebase is left
 * alone — writing into one produces a repository nobody can reason about — and
 * an `index.lock` means another git process is mid-write, including a lock an
 * agent's crashed command left behind. A dirty working tree is *not* a refusal:
 * git itself decides which of those a checkout may carry across, and a reader
 * who wants to stash first can see that the tree is dirty and say so.
 *
 * @param plan - the validated action.
 * @param state - what the repository is in the middle of.
 * @throws when the action must not run.
 */
function assertActionAllowed(plan, state) {
  if (state.locked) {
    // Every action, including the ones that resolve a half-finished operation:
    // they write the index too, so a held lock means git itself would refuse
    // them a moment later — with a message about a lock file rather than about
    // what the reader was trying to do.
    throw new Error(
      `dsh-git-graph: another Git process is writing to this repository (${state.lockPath}). `
      + 'Wait for it to finish; if it crashed, remove the lock file by hand.',
    )
  }
  if (state.operation !== null && plan.continuesOperation !== true) {
    throw new Error(
      `dsh-git-graph: a ${OPERATION_LABELS[state.operation] ?? state.operation} is in progress. `
      + 'Finish it (continue or abort) before running anything else.',
    )
  }
  if (state.operation !== null && plan.continuesOperation === true && !plan.id.startsWith(state.operation)) {
    // `cherryPick.continue` while a rebase is running would fail inside git
    // with a message about the wrong marker; saying so here names the mismatch.
    throw new Error(
      `dsh-git-graph: ${plan.id} does not belong to the `
      + `${OPERATION_LABELS[state.operation] ?? state.operation} in progress`,
    )
  }
}

/**
 * What a reader should be told before an action runs.
 *
 * @param plan - the validated action.
 * @param state - what the repository is in the middle of.
 * @returns the warnings, in the order they matter.
 */
function warningsFor(plan, state) {
  const lines = []
  if (plan.destructive) lines.push('This discards commits or files and cannot be undone from this view.')
  if (plan.writesTree && state.dirty) {
    lines.push(`The working tree has ${state.changedCount} uncommitted change${state.changedCount === 1 ? '' : 's'}.`)
  }
  if (state.conflicts.length > 0) {
    lines.push(`${state.conflicts.length} file${state.conflicts.length === 1 ? ' is' : 's are'} in conflict.`)
  }
  if (plan.writesRefs && state.detached) {
    lines.push('HEAD is detached; no branch points at the current commit.')
  }
  return lines
}

/**
 * Run one action against a repository.
 *
 * @param root - the repository working tree.
 * @param request - the action name and its parameters.
 * @returns what the action was, what git said, and where HEAD ended up.
 * @throws when the action is not allowed or git refuses it.
 */
async function runAction(root, request) {
  const plan = await planAction(root, request)
  const state = await repositoryState(root)
  assertActionAllowed(plan, state)
  const before = { head: state.head, branch: state.branch }
  const steps = plan.steps ?? [plan.argv]
  // The repository is asked again inside the queue, because an action can wait
  // behind another one: what has to hold is that the repository was fit for
  // this action at the moment it ran, not at the moment it was requested. The
  // check above still earns its place by failing before the wait.
  const output = await queueWrite(root, async () => {
    assertActionAllowed(plan, await repositoryState(root))
    const answers = []
    for (const step of steps) answers.push(await gitWrite(root, step))
    return answers.filter(text => text.length > 0).join('\n')
  })
  const after = await headState(root)
  return {
    root,
    action: plan.id,
    summary: plan.summary,
    output,
    before,
    after,
    movedHead: before.head !== after.head,
    movedBranch: before.branch !== after.branch,
  }
}

/**
 * List what differs between two points in history.
 *
 * This is the question a commit view cannot answer: a commit is always read
 * against one parent, while a comparison is between two revisions a reader
 * picked — a feature branch against `main`, a release against HEAD, or the
 * working tree against any commit. The two sides are read in one pass each and
 * merged on path, the same way a single commit's files are.
 *
 * @param root - the repository working tree.
 * @param spec.from - the earlier revision.
 * @param spec.to - the later revision, or `null` for the working tree.
 * @returns the changed files, with their status and line counts.
 */
async function compareRevisions(root, spec) {
  const { from, to } = spec
  // One revision means that revision against the working tree; two mean the
  // two revisions against each other. Git spells both the same way.
  const range = to === null ? [from] : [from, to]
  const [statusOut, numstatOut] = await Promise.all([
    git(root, ['diff', '--name-status', '--no-ext-diff', '--no-textconv', '-z', '--find-renames', ...range]),
    git(root, ['diff', '--numstat', '--no-ext-diff', '--no-textconv', '-z', '--find-renames', ...range]),
  ])
  return { files: mergeFileStats(parseNameStatus(statusOut), parseNumstat(numstatOut)) }
}

/**
 * Run one named request against a repository.
 *
 * The request names an operation and its arguments; nothing here builds a
 * command from raw text. An unknown operation is refused rather than guessed
 * at, and every argument that reaches `git` is either a value this file
 * validated or a path from the repository's own output.
 *
 * @param ctx - the plugin's Cordis context.
 * @param request - the parsed request body.
 * @returns the operation's answer.
 * @throws when the Session is unknown or the repository cannot be read.
 */
const repositoryAccess = createRepositoryAccess({ repoRoot, sessionCwd })

async function dispatch(ctx, request) {
  const { op } = request
  // Workspace discovery must work even when the session directory is not Git.
  if (op === 'workspaces') return repositoryAccess.workspaces(ctx, request)
  if (op === 'repositories') return repositoryAccess.repositories(ctx, request)
  if (op === 'repositoryLevel') return repositoryAccess.repositoryLevel(ctx, request)
  const root = await repositoryAccess.resolveRoot(ctx, request)

  switch (op) {
    case 'commits': {
      const limit = clampInt(request.limit, DEFAULT_PAGE, 1, MAX_PAGE)
      const skip = clampInt(request.skip, 0, 0, 1_000_000)
      const wanted = typeof request.ref === 'string' && request.ref.length > 0 ? request.ref : undefined
      // The first page carries the labels; an appended page inherits them from
      // the page the browser already holds, so they are read once.
      const stashes = skip === 0 ? await listStashes(root) : []
      // A filter is checked against the refs this repository reported, so the
      // refs are read before the history rather than beside it. That is the
      // one place a caller's string could reach an argument position.
      const refs = skip === 0 || wanted !== undefined ? await listRefs(root) : null
      const ref = wanted === undefined ? undefined : acceptFilterRef(wanted, refs)
      const commits = await listCommits(root, {
        limit, skip, ref, stashes: skip === 0 ? stashes : [],
      })
      return {
        root,
        commits,
        refs: skip === 0 ? refs : null,
        stashes,
        ref: ref ?? null,
        nextSkip: skip + commits.length,
        exhausted: commits.length < limit,
      }
    }
    case 'commit':
      return { root, detail: await commitDetail(root, requireHash(request.hash)) }
    case 'compare': {
      // A comparison is between two positions, and one of them may be the
      // working tree — the thing an agent has changed but not committed.
      const from = requireRev(request.from)
      const to = request.to === undefined || request.to === null || request.to === ''
        ? null
        : requireRev(request.to)
      return { root, from, to, ...(await compareRevisions(root, { from, to })) }
    }
    case 'diff':
      return {
        root,
        ...(await fileDiff(root, {
          from: requireRev(request.from),
          // The later side is either a revision or the working tree, which is
          // how a comparison of a commit against uncommitted work shows a file.
          to: request.to === undefined || request.to === null || request.to === '' ? null : requireRev(request.to),
          path: requireString(request.path, 'path'),
          oldPath: typeof request.oldPath === 'string' ? request.oldPath : undefined,
          context: clampInt(request.context, 3, 0, 100),
        })),
      }
    case 'blob':
      // One side of a historical comparison, for a viewer that shows the file
      // rather than only the patch. A path absent at that revision is an
      // ordinary answer, not an error: a file added by this commit has no
      // earlier side to read.
      return {
        root,
        ...(await showBlob(root, {
          rev: requireRev(request.rev),
          path: requireString(request.path, 'path'),
        })),
      }
    case 'fetch':
      return { root, ...(await fetchRemotes(root, { prune: request.prune === true })) }
    case 'working':
      return { root, ...(await workingTree(root)) }
    case 'workingDiff': {
      // An uncommitted change is not a pair of revisions: `--cached HEAD` is
      // what the index holds beyond the last commit, and no revision at all is
      // what the working copy holds beyond the index.
      const path = requireString(request.path, 'path')
      const staged = request.staged === true
      return {
        root,
        ...(await fileDiff(root, {
          from: 'HEAD',
          to: null,
          mode: staged ? 'staged' : 'worktree',
          path,
          oldPath: typeof request.oldPath === 'string' ? request.oldPath : undefined,
          context: clampInt(request.context, 3, 0, 100),
        })),
      }
    }
    case 'workingFile':
      // The working copy of a tracked file, for the unstaged diff's right side.
      return {
        root,
        ...(await showBlob(root, { rev: 'HEAD', path: requireString(request.path, 'path') }).catch(
          async () => ({ text: '', binary: false, absent: true }),
        )),
      }
    case 'state':
      // What the action menu is built from: whether the repository is in the
      // middle of something, and whether the tree is clean.
      return { root, state: await repositoryState(root) }
    case 'plan': {
      // The confirmation dialog asks what would happen, and gets git's own
      // arguments back rather than a sentence the browser composed. A refusal
      // is part of the answer here, not an error: the dialog is exactly where
      // "not right now, because a merge is in progress" belongs.
      const proposed = await planAction(root, request)
      const state = await repositoryState(root)
      let blocked = null
      try {
        assertActionAllowed(proposed, state)
      } catch (error) {
        blocked = String(error?.message ?? error)
      }
      return { root, plan: proposed, state, warnings: warningsFor(proposed, state), blocked }
    }
    case 'action':
      return runAction(root, request)
    default:
      throw new Error(`dsh-git-graph: unknown operation ${String(op)}`)
  }
}

/**
 * Accept a history filter only when it names something this repository has.
 *
 * The filter is what narrows the graph to one branch, and it reaches git in an
 * argument position, so it is not free text: it must be one of the refs this
 * repository just reported, or `HEAD`. Membership is stricter than any name
 * pattern and cannot be talked around — a revision that does not exist here is
 * refused rather than handed to git's parser to interpret.
 *
 * @param value - the caller's filter.
 * @param refs - the refs this repository reported, or null when none were read.
 * @returns the accepted ref.
 * @throws when it names no ref of this repository.
 */
function acceptFilterRef(value, refs) {
  const text = requireString(value, 'ref')
  if (text === 'HEAD') return text
  if (refs !== null && refs.refs.some(ref => ref.name === text)) return text
  throw new Error(`dsh-git-graph: refusing ref ${text}`)
}

/**
 * Coerce a numeric field into a bounded integer.
 *
 * @param value - the caller's value.
 * @param fallback - the value to use when none was given.
 * @param min - the smallest accepted value.
 * @param max - the largest accepted value.
 * @returns the bounded integer.
 */
function clampInt(value, fallback, min, max) {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

/**
 * Require a non-empty string field.
 *
 * @param value - the caller's value.
 * @param label - the field name, for the error.
 * @returns the string.
 * @throws when it is absent or empty.
 */
function requireString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`dsh-git-graph: ${label} is required`)
  }
  return value
}

/**
 * Require a value shaped like a commit id.
 *
 * A revision is not a place for a caller's own syntax: `--help`, a ref range, or
 * a path could otherwise reach git's argument parser. Only hex ids and the few
 * symbolic names this plugin itself produces pass.
 *
 * @param value - the caller's value.
 * @returns the validated revision.
 * @throws when it is not one of the accepted shapes.
 */
function requireRev(value) {
  const text = requireString(value, 'revision')
  if (text === 'HEAD' || text === ':0' || text === ':1' || text === '4b825dc642cb6eb9a060e54bf8d69288fbee4904') {
    return text
  }
  if (/^[0-9a-f]{4,64}$/.test(text)) return text
  throw new Error(`dsh-git-graph: refusing revision ${text}`)
}

/**
 * Require a full commit id.
 *
 * @param value - the caller's value.
 * @returns the validated id.
 * @throws when it is not a full hex id.
 */
function requireHash(value) {
  const text = requireString(value, 'hash')
  if (!/^[0-9a-f]{40,64}$/.test(text)) {
    throw new Error(`dsh-git-graph: refusing commit ${text}`)
  }
  return text
}

/**
 * Serve one request, and report a failure as a message rather than a 500.
 *
 * A repository that is missing, unreadable, or not a repository is an ordinary
 * answer to this plugin — the tab says so. Only a malformed request is a client
 * error.
 *
 * @param ctx - the plugin's Cordis context.
 * @param request - the parsed request body.
 * @returns the HTTP status and the body to send.
 */
async function respond(ctx, request) {
  try {
    return { status: 200, body: { ok: true, result: await dispatch(ctx, request) } }
  } catch (error) {
    return {
      status: 200,
      body: { ok: false, error: String(error?.gitStderr ?? error?.message ?? error) },
    }
  }
}

/**
 * Read a JSON request body.
 *
 * @param req - the request.
 * @returns the parsed body.
 * @throws when it is absent or is not a JSON object.
 */
async function readBody(request) {
  // Connection's bridge authenticates before buffering. Keep this plugin's
  // smaller body limit too, since Git actions only need a few named values.
  const text = await request.text()
  if (Buffer.byteLength(text) > 64 * 1024) {
    throw new Error('dsh-git-graph: request body too large')
  }
  if (text.trim() === '') return {}
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new Error(`dsh-git-graph: malformed request body: ${String(error)}`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('dsh-git-graph: request body must be a JSON object')
  }
  return parsed
}

/**
 * Write one JSON answer.
 *
 * @param res - the response.
 * @param status - the HTTP status.
 * @param body - the JSON body.
 */
function sendJson(status, body) {
  return Response.json(body, {
    status,
    // Every answer is read on demand from the repository; a cached one would
    // describe a tree that has since changed.
    headers: { 'cache-control': 'no-store' },
  })
}

/**
 * Whether one path inside the Git directory is worth telling the browser about.
 *
 * A commit, a checkout, a stage and a branch switch all announce themselves as a
 * top-level file (`HEAD`, `index`, `packed-refs`, `ORIG_HEAD`, `MERGE_HEAD` …) or
 * as a ref under `refs/`. Everything else in there — `objects/`, `logs/`,
 * `hooks/` — is either huge or irrelevant to what the graph draws, so one commit
 * cannot turn into hundreds of reasons to reload.
 *
 * @param relativePath - the path `fs.watch` reported, relative to the Git directory.
 * @returns whether the graph could look different because of it.
 */
export function isRefChange(relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0) return false
  const path = relativePath.split('\\').join('/')
  return !path.includes('/') || path.startsWith('refs/')
}

/**
 * The directory Git keeps its own state in.
 *
 * `--absolute-git-dir` resolves a linked worktree's private HEAD/index metadata.
 * Shared refs live in its common directory, included separately by gitWatchDirs.
 *
 * @param root - the repository working tree.
 * @returns the absolute Git directory.
 */
async function gitDir(root) {
  return realpathSync((await git(root, ['rev-parse', '--absolute-git-dir'])).trim())
}

/** Watch private worktree state and shared refs, deduplicating ordinary repositories. */
async function gitWatchDirs(root) {
  const [privateDir, common] = await Promise.all([
    gitDir(root),
    git(root, ['rev-parse', '--git-common-dir']),
  ])
  const commonDir = realpathSync(resolve(root, common.trim()))
  return [...new Set([privateDir, commonDir])]
}

/** One watched Git directory: its watcher, the streams listening to it, and their timers. */
const watchGroups = new Map()

/** One burst across private state and common refs still produces one event per stream. */
const changeTimers = new Map()
function queueWatchChange(res) {
  clearTimeout(changeTimers.get(res))
  changeTimers.set(res, setTimeout(() => {
    changeTimers.delete(res)
    sendEvent(res, 'changed', { at: Date.now() })
  }, WATCH_DEBOUNCE_MS))
}

/**
 * Write one server-sent event, ignoring a stream that is already gone.
 *
 * @param res - the open stream.
 * @param event - the event name the browser listens for.
 * @param data - the JSON payload.
 */
function sendEvent(res, event, data) {
  if (res.writableEnded === true || res.destroyed === true) return
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  } catch {
    // The stream died between the check and the write; its close handler removes it.
  }
}

/**
 * Write a comment line, which keeps proxies and idle timeouts from closing a
 * stream that has nothing to report.
 *
 * @param res - the open stream.
 * @param text - the comment body.
 */
function sendComment(res, text) {
  if (res.writableEnded === true || res.destroyed === true) return
  try {
    res.write(`: ${text}\n\n`)
  } catch {
    // As above.
  }
}

/**
 * Stop watching one Git directory and forget its group.
 *
 * @param path - the Git directory.
 * @param group - its group record.
 */
function stopWatchGroup(path, group) {
  clearInterval(group.heartbeat)
  try {
    group.watcher?.close()
  } catch {
    // A watcher that already failed has nothing left to close.
  }
  watchGroups.delete(path)
}

/** Close every watcher. Called when the plugin unloads. */
function stopAllWatches() {
  for (const [path, group] of [...watchGroups]) stopWatchGroup(path, group)
  for (const timer of changeTimers.values()) clearTimeout(timer)
  changeTimers.clear()
}

/**
 * Tell the listeners they must fall back to their own triggers.
 *
 * A watcher can fail for reasons this plugin cannot fix — an inotify limit, a
 * filesystem without events. Saying so is better than a stream that silently
 * never fires again, because the browser can stop waiting on it.
 *
 * @param group - the group whose watcher failed.
 * @param error - what went wrong.
 */
function degradeWatchGroup(group, error) {
  const message = String(error?.message ?? error)
  group.degraded = message
  clearInterval(group.heartbeat)
  try {
    group.watcher?.close()
  } catch {
    // Already gone.
  }
  group.watcher = null
  for (const res of group.clients) {
    clearTimeout(changeTimers.get(res))
    changeTimers.delete(res)
    sendEvent(res, 'degraded', { message })
  }
}

/**
 * Start watching one Git directory.
 *
 * The watch is recursive and stays on the Git directory alone — not the working
 * tree. Measured on a mid-sized repository, watching `.git` costs a fraction of
 * the working tree (hundreds of directories against tens of thousands), and it
 * carries every signal the graph draws: commits, refs, staging, checkouts.
 *
 * @param path - the Git directory.
 * @returns the new group.
 */
function startWatchGroup(path) {
  const group = { clients: new Set(), heartbeat: null, watcher: null, degraded: null }
  watchGroups.set(path, group)
  try {
    group.watcher = watch(path, { recursive: true }, (event, file) => {
      if (group.degraded !== null || !isRefChange(file)) return
      for (const res of group.clients) queueWatchChange(res)
    })
    group.watcher.on('error', error => degradeWatchGroup(group, error))
  } catch (error) {
    degradeWatchGroup(group, error)
  }
  group.heartbeat = setInterval(() => {
    for (const res of group.clients) sendComment(res, 'keep-alive')
  }, WATCH_HEARTBEAT_MS)
  group.heartbeat.unref?.()
  return group
}

/**
 * Add one stream to a Git directory's watchers, starting them if needed.
 *
 * @param path - the Git directory.
 * @param res - the stream to keep informed.
 */
function addWatchClient(path, res) {
  const group = watchGroups.get(path) ?? startWatchGroup(path)
  group.clients.add(res)
  if (group.degraded !== null) sendEvent(res, 'degraded', { message: group.degraded })
}

/**
 * Remove one stream, stopping the watchers once nobody is listening.
 *
 * A hidden tab closes its stream, so an unwatched graph costs this plugin
 * nothing at all — the same trade VS Code Git Graph makes by stopping its file
 * watcher while its panel is hidden.
 *
 * @param res - the stream that closed.
 */
function removeWatchClient(res) {
  clearTimeout(changeTimers.get(res))
  changeTimers.delete(res)
  // A linked worktree stream belongs to both its private and common groups.
  for (const [path, group] of watchGroups) {
    if (!group.clients.delete(res)) continue
    if (group.clients.size === 0) stopWatchGroup(path, group)
  }
}

/**
 * Answer one stream request.
 *
 * @param ctx - the plugin's Cordis context.
 * @param request - the authenticated Fetch request, including its abort signal.
 * @returns a stream that stays open for the life of the tab.
 */
async function openEvents(ctx, request) {
  const url = new URL(request.url)
  const encodedTarget = url.searchParams.get('target')
  if (encodedTarget !== null && encodedTarget.length > 16 * 1024) throw new Error('dsh-git-graph: repository target too large')
  const selection = { sessionId: url.searchParams.get('sessionId') ?? '' }
  if (encodedTarget !== null) {
    try { selection.target = JSON.parse(encodedTarget) } catch {
      throw new Error('dsh-git-graph: malformed repository target')
    }
  }
  const paths = await gitWatchDirs(await repositoryAccess.resolveRoot(ctx, selection))
  const path = paths[0]
  if (request.signal.aborted) return new Response(null, { status: 204 })

  // Connection's Fetch bridge owns the HTTP response. The watcher writes into
  // a Web stream, whose cancel/abort removes the listener and its last watcher.
  let sink
  let cleanup
  const body = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      let closed = false
      sink = {
        get writableEnded() { return closed },
        write(text) { controller.enqueue(encoder.encode(text)) },
      }
      cleanup = () => {
        if (closed) return
        closed = true
        request.signal.removeEventListener('abort', cleanup)
        removeWatchClient(sink)
        try { controller.close() } catch { /* Already canceled by the transport. */ }
      }
      request.signal.addEventListener('abort', cleanup, { once: true })
      if (request.signal.aborted) cleanup()
    },
    cancel() { cleanup?.() },
  })
  if (!sink.writableEnded) {
    sendComment(sink, 'connected')
    sendEvent(sink, 'ready', { path })
    for (const metadataPath of paths) {
      if (sink.writableEnded) break
      addWatchClient(metadataPath, sink)
    }
  }
  return new Response(body, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      // A buffering proxy would hold every push until the stream ended.
      'x-accel-buffering': 'no',
    },
  })
}

/**
 * Register the plugin's routes.
 *
 * @param ctx - the plugin's Cordis context.
 */
export function registerRoutes(ctx) {
  const routes = []
  try {
    routes.push(ctx.connection.fetch.register({
      path: ROUTE_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async request => {
        const { status, body } = await readBody(request)
          .then(parsed => respond(ctx, parsed))
          .catch(error => ({ status: 400, body: { ok: false, error: String(error?.message ?? error) } }))
        return sendJson(status, body)
      },
    }))
    routes.push(ctx.connection.fetch.register({
      path: EVENTS_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: request => openEvents(ctx, request).catch(error =>
        sendJson(200, { ok: false, error: String(error?.gitStderr ?? error?.message ?? error) })),
    }))
  } catch (error) {
    // The second route can collide on its own. Do not leave a stale handler.
    for (const dispose of routes.reverse()) void dispose()
    throw error
  }
  return async () => { for (const dispose of routes.reverse()) await dispose() }
}

/**
 * Register the plugin's routes.
 *
 * The two routes belong to this row's lifetime, and `register` hands back the
 * disposer that ends it. Registering without keeping it is not a small leak:
 * a duplicate path throws, so a row that is applied a second time —
 * a reload, a disable and enable, a hot replacement — fails on the collision
 * *while the routes from the first apply keep answering*. The plugin then looks
 * broken and works, which is the worst of both: the failure is reported by the
 * row's phase, and the only symptom a reader sees is that their actions have no
 * effect because they are still being served by the previous generation.
 *
 * @param ctx - the plugin's Cordis context.
 */
export function apply(ctx) {
  ctx.effect(() => registerRoutes(ctx), 'git-graph: routes')
  ctx.effect(() => () => stopAllWatches(), 'git-graph: repository watch')
}

/**
 * The pure functions, exported for tests.
 *
 * Parsing Git's own output is where this plugin is most likely to be wrong and
 * least likely to be caught by reading it, so the parsers are reachable without
 * a live plugin context.
 */
export const internals = {
  createRepositoryAccess,
  scanRepositories,
  DISCOVERY_LIMITS,
  SESSION_GROUP_ID,
  isContained,
  sessionCwd,
  resolveRepositoryRoot: repositoryAccess.resolveRoot,
  listWorkspaces: repositoryAccess.workspaces,
  listRepositories: repositoryAccess.repositories,
  repositoryLevel: repositoryAccess.repositoryLevel,
  nulSplit,
  parseNameStatus,
  parseNumstat,
  mergeFileStats,
  parseStatusV2,
  clampInt,
  requireRev,
  requireHash,
  requireRefName,
  requireTarget,
  requirePath,
  requireRemote,
  requireChoice,
  requireStashIndex,
  acceptFilterRef,
  optionalMessage,
  listCommits,
  listRefs,
  listStashes,
  commitDetail,
  compareRevisions,
  fileDiff,
  workingTree,
  showBlob,
  repoRoot,
  gitDir,
  gitWatchDirs,
  isRefChange,
  diffRemoteRefs,
  fetchRemotes,
  headState,
  repositoryState,
  planAction,
  assertActionAllowed,
  warningsFor,
  runAction,
  queueWrite,
  writeQueues,
  gitWrite,
  addWatchClient,
  registerRoutes,
  removeWatchClient,
  openEvents,
  watchedDirectories: () => [...watchGroups.keys()],
  dispatch,
}
