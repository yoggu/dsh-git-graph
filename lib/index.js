/**
 * Host half of `dsh-git-graph`: answer Git questions about the repository that
 * belongs to the calling Session's workspace, read-only.
 *
 * Two different questions arrive here, and they have different answers:
 *
 *   - **History.** Which commits exist, what a commit contains, and how one
 *     commit differs from its parent. Every input is an immutable commit id, so
 *     an answer stays true forever and may be cached.
 *   - **The working tree.** What is different *right now* from HEAD — what a
 *     running agent has already changed and not yet committed. This answer is
 *     true only at the instant it is produced, so it is never cached.
 *
 * A Session's working directory is the only root this plugin will read. The id
 * arrives on the request and is resolved against the live Session store; a
 * request that names no Session, or one that has since gone away, is refused
 * rather than served from some other project.
 *
 * Nothing in this file writes to a repository. Every `git` invocation is a
 * read, and the argument lists are fixed here — the browser chooses from named
 * options, never from raw command text.
 *
 * @module dsh-git-graph
 */

import { execFile } from 'node:child_process'
import { realpathSync, watch } from 'node:fs'

/** Cordis plugin name. */
export const name = 'dsh-git-graph'

/**
 * The services this plugin needs before it can answer anything.
 *
 * `sessions` is deliberately absent. It is read through `ctx.get` per request
 * instead, because a hard dependency would keep this row from activating at all
 * in a composition that serves the browser without a session store — and a Git
 * tab that never mounts is worse than one that reports why it cannot read.
 */
export const inject = ['webServer']

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
  GIT_CONFIG_NOSYSTEM: '1',
  LC_ALL: 'C',
  LANG: 'C',
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
  const { maxBuffer = MAX_BUFFER, encoding = 'utf8' } = opts
  return new Promise((resolve, reject) => {
    execFile('git', ['--no-pager', '-C', cwd, ...args], {
      cwd,
      env: GIT_ENV,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer,
      encoding,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error === null || error === undefined) {
        resolve(stdout)
        return
      }
      // A non-zero exit is git's own verdict — "not a repository", "unknown
      // revision", "no such path". It is reported as such, with git's message.
      const message = String(stderr ?? '').trim() || String(error.message ?? error)
      const failure = new Error(message)
      failure.gitStderr = message
      reject(failure)
    })
  })
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
async function repoRoot(cwd) {
  const out = await git(cwd, ['rev-parse', '--show-toplevel'])
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
 * @param root - the repository root.
 * @param opts - how many commits to read and from where to start.
 * @returns the commit records, already trimmed to the requested window.
 */
async function listCommits(root, opts) {
  const { limit, skip, ref } = opts
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
  const remotes = (await git(root, ['remote']))
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
  return { refs, head: head === 'HEAD' ? null : head, remotes }
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
    'status', '--porcelain=v2', '-z', '--untracked-files=all', '--renames',
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
async function dispatch(ctx, request) {
  const { op, sessionId } = request
  const cwd = sessionCwd(ctx, sessionId)
  if (cwd === undefined) {
    throw new Error('dsh-git-graph: unknown or expired Session; no workspace to read')
  }
  const root = await repoRoot(cwd)

  switch (op) {
    case 'commits': {
      const limit = clampInt(request.limit, DEFAULT_PAGE, 1, MAX_PAGE)
      const skip = clampInt(request.skip, 0, 0, 1_000_000)
      const ref = typeof request.ref === 'string' && request.ref.length > 0 ? request.ref : undefined
      const [commits, refs] = await Promise.all([
        listCommits(root, { limit, skip, ref }),
        skip === 0 ? listRefs(root) : Promise.resolve(null),
      ])
      return { root, commits, refs, nextSkip: skip + commits.length, exhausted: commits.length < limit }
    }
    case 'commit':
      return { root, detail: await commitDetail(root, requireHash(request.hash)) }
    case 'diff':
      return {
        root,
        ...(await fileDiff(root, {
          from: requireRev(request.from),
          to: requireRev(request.to),
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
    default:
      throw new Error(`dsh-git-graph: unknown operation ${String(op)}`)
  }
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
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      // A read-only Git query has no business carrying a large body; refusing
      // early is cheaper than buffering whatever arrives.
      if (size > 64 * 1024) {
        reject(new Error('dsh-git-graph: request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('error', reject)
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (text.trim() === '') {
        resolve({})
        return
      }
      try {
        const parsed = JSON.parse(text)
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(new Error('dsh-git-graph: request body must be a JSON object'))
          return
        }
        resolve(parsed)
      } catch (error) {
        reject(new Error(`dsh-git-graph: malformed request body: ${String(error)}`))
      }
    })
  })
}

/**
 * Write one JSON answer.
 *
 * @param res - the response.
 * @param status - the HTTP status.
 * @param body - the JSON body.
 */
function sendJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    // Every answer is read on demand from the repository; a cached one would
    // describe a tree that has since changed.
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
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
 * `--absolute-git-dir` is what makes a linked worktree watchable: there `.git` is
 * a file pointing elsewhere, and the refs that move on a commit live in the
 * directory this resolves to.
 *
 * @param root - the repository working tree.
 * @returns the absolute Git directory.
 */
async function gitDir(root) {
  return realpathSync((await git(root, ['rev-parse', '--absolute-git-dir'])).trim())
}

/** One watched Git directory: its watcher, the streams listening to it, and their timers. */
const watchGroups = new Map()

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
  clearTimeout(group.timer)
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
  clearTimeout(group.timer)
  clearInterval(group.heartbeat)
  try {
    group.watcher?.close()
  } catch {
    // Already gone.
  }
  group.watcher = null
  for (const res of group.clients) sendEvent(res, 'degraded', { message })
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
  const group = { clients: new Set(), timer: null, heartbeat: null, watcher: null, degraded: null }
  watchGroups.set(path, group)
  try {
    group.watcher = watch(path, { recursive: true }, (event, file) => {
      if (group.degraded !== null || !isRefChange(file)) return
      clearTimeout(group.timer)
      group.timer = setTimeout(() => {
        for (const res of group.clients) sendEvent(res, 'changed', { at: Date.now() })
      }, WATCH_DEBOUNCE_MS)
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
  for (const [path, group] of watchGroups) {
    if (!group.clients.delete(res)) continue
    if (group.clients.size === 0) stopWatchGroup(path, group)
    return
  }
}

/**
 * Answer one stream request.
 *
 * @param ctx - the plugin's Cordis context.
 * @param req - the request.
 * @param res - the response, held open for the life of the tab.
 */
async function openEvents(ctx, req, res) {
  const url = new URL(req.url ?? EVENTS_PATH, 'http://localhost')
  const cwd = sessionCwd(ctx, url.searchParams.get('sessionId') ?? '')
  if (cwd === undefined) {
    sendJson(res, 200, { ok: false, error: 'dsh-git-graph: unknown or expired Session; no workspace to watch' })
    return
  }
  const path = await gitDir(await repoRoot(cwd))
  if (res.writableEnded === true || res.destroyed === true) return
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    // A buffering proxy would hold every push until the stream ended.
    'x-accel-buffering': 'no',
  })
  sendComment(res, 'connected')
  sendEvent(res, 'ready', { path })
  addWatchClient(path, res)
  req.on('close', () => removeWatchClient(res))
}

/**
 * Register the plugin's routes.
 *
 * @param ctx - the plugin's Cordis context.
 */
export function apply(ctx) {
  ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_PATH,
    handler: (req, res) => {
      readBody(req)
        .then(body => respond(ctx, body))
        .catch(error => ({ status: 400, body: { ok: false, error: String(error?.message ?? error) } }))
        .then(({ status, body }) => sendJson(res, status, body))
    },
  })
  ctx.webServer.register({
    kind: 'exact',
    path: EVENTS_PATH,
    handler: (req, res) => {
      openEvents(ctx, req, res).catch(error => {
        const message = String(error?.gitStderr ?? error?.message ?? error)
        if (res.headersSent === true) {
          sendEvent(res, 'degraded', { message })
          res.end()
          return
        }
        sendJson(res, 200, { ok: false, error: message })
      })
    },
  })
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
  nulSplit,
  parseNameStatus,
  parseNumstat,
  mergeFileStats,
  parseStatusV2,
  clampInt,
  requireRev,
  requireHash,
  listCommits,
  listRefs,
  commitDetail,
  fileDiff,
  workingTree,
  showBlob,
  repoRoot,
  gitDir,
  isRefChange,
  addWatchClient,
  removeWatchClient,
  openEvents,
  watchedDirectories: () => [...watchGroups.keys()],
  dispatch,
}
