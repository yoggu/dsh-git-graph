/**
 * The vocabulary of writing actions, as menus.
 *
 * Every entry here names an action the host already knows and collects the few
 * values it takes. Nothing in this file decides what a command will be: the
 * confirmation dialog asks the host to plan the action and shows the resulting
 * argument list, so an entry that drifted from the host's own table would show
 * the difference before anything ran rather than quietly doing something else.
 *
 * @module dsh-git-graph/actions
 */

/**
 * @typedef {object} Field
 * @property {string} name - the parameter the value is sent under.
 * @property {string} label - what the reader sees.
 * @property {'text'|'select'|'checkbox'} [type] - defaults to a text input.
 * @property {boolean} [required] - whether an empty value blocks the action.
 * @property {string|boolean} [initial] - the value the dialog starts with.
 * @property {string} [placeholder] - an example, for a text field.
 * @property {string} [help] - a sentence under the field.
 * @property {{value: string, label: string}[]} [options] - for a select.
 */

/**
 * @typedef {object} ActionRequest
 * @property {string} action - the action id.
 * @property {string} label - the menu entry.
 * @property {string} title - the dialog heading.
 * @property {string} [note] - a sentence under the heading.
 * @property {boolean} [danger] - whether the entry is marked as destructive.
 * @property {object} [params] - the parameters that need no input.
 * @property {Field[]} [fields] - the inputs the dialog collects first.
 */

/** How git's three reset modes read to someone deciding which one to pick. */
export const RESET_OPTIONS = [
  { value: 'soft', label: 'soft — move the branch, keep the index and working tree' },
  { value: 'mixed', label: 'mixed — move the branch and reset the index, keep the working tree' },
  { value: 'hard', label: 'hard — discard the index and every uncommitted change' },
]

/** A commit id, short enough for a heading. */
const short = hash => String(hash ?? '').slice(0, 8)

/** A remote chooser, or nothing when there is no remote to choose. */
const remoteField = remotes => ({
  name: 'remote',
  label: 'Remote',
  type: 'select',
  required: true,
  initial: remotes[0],
  options: remotes.map(name => ({ value: name, label: name })),
})

/**
 * Turn a graph badge into the ref an action menu can name.
 *
 * A badge carries only what the row's decoration said: a short name, a kind,
 * and for a remote-tracking branch the remote it belongs to. The full ref name
 * — what a command would take — and the commit it points at come from the refs
 * list the same request returned. A stash is resolved against the stash list
 * instead, because its identity is the position it holds, not a ref name.
 *
 * @param badge - the grouped badge from the row.
 * @param refs - the host's full ref entries.
 * @param stashes - the host's stash entries.
 * @returns the ref descriptor, or `null` for a badge that names no ref.
 */
export function describeBadge(badge, refs = [], stashes = []) {
  if (badge === null || badge === undefined) return null
  if (badge.kind === 'detached') return null
  if (badge.kind === 'stash') {
    const found = stashes.find(entry => `stash@{${entry.index}}` === badge.label)
    return {
      kind: 'stash',
      label: badge.label,
      remote: null,
      full: badge.label,
      path: found?.selector ?? badge.label,
      target: found?.hash ?? null,
      index: found?.index ?? null,
      subject: found?.subject ?? null,
    }
  }
  const wanted = badge.kind === 'remote'
    ? `refs/remotes/${badge.remote}/${badge.label}`
    : badge.kind === 'tag' ? `refs/tags/${badge.label}` : `refs/heads/${badge.label}`
  const found = refs.find(entry => entry.name === wanted)
  return {
    kind: badge.kind,
    label: badge.label,
    remote: badge.kind === 'remote' ? badge.remote : null,
    full: badge.kind === 'remote' ? `${badge.remote}/${badge.label}` : badge.label,
    path: found?.name ?? wanted,
    target: found?.target ?? null,
  }
}

/**
 * The actions a commit row offers.
 *
 * @param commit - the row's commit.
 * @param ctx - the current branch and the configured remotes.
 * @returns the menu entries.
 */
export function commitActions(commit, ctx) {
  const branch = ctx.branch ?? 'the current branch'
  return [
    {
      action: 'commit.createBranch',
      label: 'Create branch here…',
      title: `Create a branch at ${short(commit.hash)}`,
      params: { hash: commit.hash },
      fields: [
        { name: 'name', label: 'Branch name', required: true, placeholder: 'feature/x' },
        { name: 'checkout', label: 'Check out the new branch', type: 'checkbox', initial: true },
      ],
    },
    {
      action: 'tag.add',
      label: 'Tag this commit…',
      title: `Tag ${short(commit.hash)}`,
      params: { hash: commit.hash },
      fields: [
        { name: 'name', label: 'Tag name', required: true, placeholder: 'v1.2.0' },
        { name: 'message', label: 'Message', placeholder: 'Release 1.2.0', help: 'A message makes it an annotated tag.' },
      ],
    },
    {
      action: 'commit.cherryPick',
      label: 'Cherry-pick onto this branch',
      title: `Cherry-pick ${short(commit.hash)} onto ${branch}`,
      params: { hash: commit.hash },
      fields: [{ name: 'noCommit', label: 'Stage the changes without committing', type: 'checkbox' }],
    },
    {
      action: 'commit.revert',
      label: 'Revert this commit',
      title: `Revert ${short(commit.hash)}`,
      note: 'Adds a commit that undoes this one.',
      params: { hash: commit.hash },
    },
    {
      action: 'commit.reset',
      label: `Reset ${branch} to here…`,
      title: `Reset ${branch} to ${short(commit.hash)}`,
      danger: true,
      params: { hash: commit.hash },
      fields: [{ name: 'mode', label: 'Mode', type: 'select', initial: 'mixed', options: RESET_OPTIONS }],
    },
    {
      action: 'commit.checkout',
      label: 'Check out this commit…',
      title: `Detach HEAD at ${short(commit.hash)}`,
      note: 'Leaves no branch checked out; commits made here belong to no branch until you create one.',
      danger: true,
      params: { hash: commit.hash },
    },
  ]
}

/**
 * The actions a branch, remote-tracking branch or tag badge offers.
 *
 * @param ref - the badge's ref: its kind, its label, and for a remote-tracking
 *   branch the remote it belongs to.
 * @param ctx - the current branch and the configured remotes.
 * @returns the menu entries.
 */
export function refActions(ref, ctx) {
  const remotes = ctx.remotes ?? []
  const branch = ctx.branch ?? 'the current branch'
  const full = ref.full ?? (ref.remote === undefined ? ref.label : `${ref.remote}/${ref.label}`)
  const entries = []
  const isCurrent = ref.kind === 'head' || (ref.kind === 'branch' && ref.label === ctx.branch)

  if (ref.kind === 'branch' || ref.kind === 'head') {
    if (!isCurrent) {
      entries.push({
        action: 'branch.checkout',
        label: `Check out ${ref.label}`,
        title: `Check out ${ref.label}`,
        params: { name: ref.label },
      })
      entries.push({
        action: 'branch.merge',
        label: `Merge ${ref.label} into ${branch}`,
        title: `Merge ${ref.label} into ${branch}`,
        params: { name: ref.label },
        fields: [{ name: 'noFastForward', label: 'Always make a merge commit (--no-ff)', type: 'checkbox' }],
      })
      entries.push({
        action: 'branch.rebase',
        label: `Rebase ${branch} onto ${ref.label}`,
        title: `Rebase ${branch} onto ${ref.label}`,
        note: 'Replays this branch’s commits on top of the other. Commits already pushed are rewritten.',
        danger: true,
        params: { onto: ref.label },
      })
      entries.push({
        action: 'branch.reset',
        label: `Reset ${branch} to ${ref.label}…`,
        title: `Reset ${branch} to ${ref.label}`,
        note: 'Moves this branch onto the other, whatever it does to the commits in between.',
        danger: true,
        params: { to: ref.label },
        fields: [{ name: 'mode', label: 'Mode', type: 'select', initial: 'mixed', options: RESET_OPTIONS }],
      })
      entries.push({
        action: 'branch.rename',
        label: 'Rename…',
        title: `Rename ${ref.label}`,
        params: { name: ref.label },
        fields: [{ name: 'to', label: 'New name', required: true, initial: ref.label }],
      })
      entries.push({
        action: 'branch.delete',
        label: `Delete ${ref.label}`,
        title: `Delete ${ref.label}`,
        danger: true,
        params: { name: ref.label },
        fields: [{
          name: 'force',
          label: 'Delete even if it is not merged',
          type: 'checkbox',
          help: 'Without this git refuses to delete a branch whose commits exist nowhere else.',
        }],
      })
    } else if (remotes.length > 0) {
      entries.push({
        action: 'branch.push',
        label: 'Push…',
        title: `Push ${ref.label}`,
        params: { branch: ref.label },
        fields: [
          remoteField(remotes),
          { name: 'setUpstream', label: 'Set the remote as upstream (-u)', type: 'checkbox' },
          { name: 'force', label: 'Force, if the remote has moved (--force-with-lease)', type: 'checkbox' },
        ],
      })
      entries.push({
        action: 'branch.pull',
        label: 'Pull…',
        title: `Pull into ${ref.label}`,
        params: { branch: ref.label },
        fields: [
          remoteField(remotes),
          { name: 'ffOnly', label: 'Fast-forward only', type: 'checkbox' },
        ],
      })
    }
  }

  if (ref.kind === 'remote') {
    entries.push({
      action: 'branch.create',
      label: `Check out ${full} as a new branch…`,
      title: `Check out ${full}`,
      params: { startPoint: full, checkout: true },
      fields: [{ name: 'name', label: 'Local branch name', required: true, initial: ref.label }],
    })
    entries.push({
      action: 'branch.merge',
      label: `Merge ${full} into ${branch}`,
      title: `Merge ${full} into ${branch}`,
      params: { name: full },
      fields: [{ name: 'noFastForward', label: 'Always make a merge commit (--no-ff)', type: 'checkbox' }],
    })
    entries.push({
      action: 'branch.reset',
      label: `Reset ${branch} to ${full}…`,
      title: `Reset ${branch} to ${full}`,
      note: 'Moves this branch onto the remote-tracking commit, whatever it does to the commits in between.',
      danger: true,
      params: { to: full },
      fields: [{ name: 'mode', label: 'Mode', type: 'select', initial: 'mixed', options: RESET_OPTIONS }],
    })
    entries.push({
      action: 'branch.fetchIntoLocal',
      label: `Update local ${ref.label} from ${ref.remote}`,
      title: `Fetch ${full} into local ${ref.label}`,
      note: 'Moves the local branch to whatever this remote-tracking branch points at.',
      danger: true,
      params: { remote: ref.remote, branch: ref.label },
      fields: [{ name: 'force', label: 'Allow a non-fast-forward update', type: 'checkbox', initial: true }],
    })
  }

  if (ref.kind === 'tag') {
    if (remotes.length > 0) {
      entries.push({
        action: 'tag.push',
        label: `Push tag ${ref.label}…`,
        title: `Push tag ${ref.label}`,
        params: { name: ref.label },
        fields: [remoteField(remotes)],
      })
    }
    entries.push({
      action: 'tag.delete',
      label: `Delete tag ${ref.label}`,
      title: `Delete tag ${ref.label}`,
      danger: true,
      params: { name: ref.label },
    })
  }

  return entries
}

/**
 * The actions one stash offers.
 *
 * A stash is the one subject whose actions are all about its position: applying
 * the wrong entry is the mistake this menu exists to prevent, so every label
 * carries the selector the action will use.
 *
 * @param stash - the stash descriptor, whose index is its position.
 * @returns the menu entries, or none when the position is unknown.
 */
export function stashActions(stash) {
  if (stash === null || stash === undefined || !Number.isInteger(stash.index)) return []
  const at = stash.label ?? `stash@{${stash.index}}`
  return [
    {
      action: 'stash.apply',
      label: `Apply ${at}`,
      title: `Apply ${at}`,
      note: 'Leaves the stash in the list.',
      params: { index: stash.index },
      fields: [{ name: 'reinstateIndex', label: 'Restore what was staged (--index)', type: 'checkbox' }],
    },
    {
      action: 'stash.pop',
      label: `Pop ${at}`,
      title: `Pop ${at}`,
      note: 'Applies it and removes it from the list.',
      params: { index: stash.index },
    },
    {
      action: 'stash.branch',
      label: `Start a branch from ${at}…`,
      title: `Start a branch from ${at}`,
      note: 'Checks out a new branch at the commit the stash was made on, then applies it.',
      params: { index: stash.index },
      fields: [{ name: 'name', label: 'Branch name', required: true, placeholder: 'recover/x' }],
    },
    {
      action: 'stash.drop',
      label: `Drop ${at}`,
      title: `Drop ${at}`,
      danger: true,
      params: { index: stash.index },
    },
  ]
}

/**
 * The actions the uncommitted-changes row offers.
 *
 * @returns the menu entries.
 */
export function workingActions() {
  return [
    {
      action: 'working.stash',
      label: 'Stash all changes…',
      title: 'Stash uncommitted changes',
      params: {},
      fields: [
        { name: 'message', label: 'Message', placeholder: 'work in progress' },
        { name: 'includeUntracked', label: 'Include untracked files', type: 'checkbox' },
        { name: 'keepIndex', label: 'Keep what is staged in the index', type: 'checkbox' },
      ],
    },
    {
      action: 'working.reset',
      label: 'Discard all uncommitted changes…',
      title: 'Discard every uncommitted change',
      note: 'Affects tracked files. Untracked files are left alone; use the clean action for those.',
      danger: true,
      params: {},
      fields: [{
        name: 'mode',
        label: 'Mode',
        type: 'select',
        initial: 'mixed',
        options: [
          { value: 'mixed', label: 'mixed — unstage everything, keep the working tree' },
          { value: 'hard', label: 'hard — throw the working tree away as well' },
        ],
      }],
    },
    {
      action: 'working.clean',
      label: 'Remove untracked files…',
      title: 'Remove untracked files',
      danger: true,
      params: {},
      fields: [
        { name: 'directories', label: 'Include untracked directories (-d)', type: 'checkbox' },
        { name: 'ignored', label: 'Include ignored files (-x)', type: 'checkbox', help: 'This deletes build output and local configuration.' },
      ],
    },
  ]
}

/**
 * The action one changed file offers.
 *
 * Which action that is depends on where the file stands, and getting it wrong
 * is not cosmetic: `git checkout --` refuses a file git does not track at all,
 * and refuses a file that was added to the index but never committed, because
 * neither has an earlier version to restore from. Those two are therefore
 * removed rather than restored, and each dialog says so.
 *
 * @param file - the file entry: its path, its status and the group it came from.
 * @returns the menu entries.
 */
export function fileActions(file) {
  const staged = file.group === 'staged' || file.staged === true
  const untracked = file.group === 'untracked' || file.status === '?'
  const renamed = typeof file.oldPath === 'string' && file.oldPath !== '' && file.oldPath !== file.path
  if (renamed) {
    // Neither path on its own can be restored: the new one is in no earlier
    // tree, and putting the old one back would leave the new one behind. The
    // host runs the three commands that undo a rename between them.
    return [{
      action: 'working.undorename',
      label: `Undo the rename ${file.oldPath} → ${file.path}…`,
      title: `Undo the rename of ${file.oldPath}`,
      note: 'No single git command undoes a rename, so this restores the index for both paths, brings the old file back, and removes the new one.',
      danger: true,
      params: { oldPath: file.oldPath, path: file.path },
    }]
  }
  if (untracked) {
    return [{
      action: 'working.clean',
      label: `Delete ${file.path}…`,
      title: `Delete ${file.path}`,
      note: 'Git does not track this file, so there is no earlier version to restore it from.',
      danger: true,
      params: { paths: [file.path] },
    }]
  }
  if (staged && file.status === 'A') {
    return [{
      action: 'working.remove',
      label: `Unstage and delete ${file.path}…`,
      title: `Unstage and delete ${file.path}`,
      note: 'The file was added but never committed, so there is no earlier version to restore it from.',
      danger: true,
      params: { paths: [file.path] },
    }]
  }
  return [
    {
      action: 'working.discard',
      label: `Discard changes in ${file.path}…`,
      title: `Discard changes in ${file.path}`,
      danger: true,
      params: { paths: [file.path] },
      fields: [{
        name: 'source',
        label: 'Restore from',
        type: 'select',
        initial: staged ? 'head' : 'index',
        options: [
          { value: 'index', label: 'the index — discard unstaged edits' },
          { value: 'head', label: 'HEAD — discard staged and unstaged edits' },
        ],
      }],
    },
  ]
}

/**
 * The actions that resolve a half-finished operation.
 *
 * These replace the ordinary menu while the repository is mid-merge or
 * mid-rebase: the host refuses everything else until this is finished, so
 * offering the way out is the only useful thing a menu can do.
 *
 * @param state - the host's answer about the repository.
 * @returns the menu entries.
 */
export function operationActions(state) {
  const operation = state?.operation
  if (operation === 'merge') {
    return [{ action: 'merge.abort', label: 'Abort the merge', title: 'Abort the merge', danger: true, params: {} }]
  }
  if (operation === 'rebase') {
    return [
      { action: 'rebase.continue', label: 'Continue the rebase', title: 'Continue the rebase', params: {} },
      { action: 'rebase.skip', label: 'Skip this commit', title: 'Skip the current commit', danger: true, params: {} },
      { action: 'rebase.abort', label: 'Abort the rebase', title: 'Abort the rebase', danger: true, params: {} },
    ]
  }
  if (operation === 'cherryPick') {
    return [
      { action: 'cherryPick.continue', label: 'Continue the cherry-pick', title: 'Continue the cherry-pick', params: {} },
      { action: 'cherryPick.abort', label: 'Abort the cherry-pick', title: 'Abort the cherry-pick', danger: true, params: {} },
    ]
  }
  if (operation === 'am') {
    return [
      { action: 'am.continue', label: 'Continue applying patches', title: 'Continue the patch application', params: {} },
      { action: 'am.skip', label: 'Skip this patch', title: 'Skip the current patch', danger: true, params: {} },
      { action: 'am.abort', label: 'Abort the patch application', title: 'Abort the patch application', danger: true, params: {} },
    ]
  }
  if (operation === 'bisect') {
    return [{ action: 'bisect.reset', label: 'End the bisect', title: 'End the bisect', params: {} }]
  }
  if (operation === 'revert') {
    return [
      { action: 'revert.continue', label: 'Continue the revert', title: 'Continue the revert', params: {} },
      { action: 'revert.abort', label: 'Abort the revert', title: 'Abort the revert', danger: true, params: {} },
    ]
  }
  return []
}

/**
 * The values a dialog starts with.
 *
 * @param request - the action request.
 * @returns one value per field, keyed by parameter name.
 */
export function initialValues(request) {
  const values = {}
  for (const field of request.fields ?? []) {
    if (field.type === 'checkbox') values[field.name] = field.initial === true
    else values[field.name] = typeof field.initial === 'string' ? field.initial : ''
  }
  return values
}

/**
 * The parameters an action will be planned and run with.
 *
 * @param request - the action request.
 * @param values - what the dialog collected.
 * @returns the fixed parameters, with the collected values on top.
 */
export function paramsFor(request, values = {}) {
  const params = { ...(request.params ?? {}) }
  for (const field of request.fields ?? []) {
    const value = values[field.name]
    if (field.type === 'checkbox') {
      params[field.name] = value === true
      continue
    }
    if (typeof value === 'string' && value !== '') params[field.name] = value
  }
  return params
}

/**
 * Which required fields are still empty.
 *
 * A dialog that asked the host to plan an action with a missing name would get
 * a refusal about a branch called `undefined`; naming the field instead is what
 * makes the form usable.
 *
 * @param request - the action request.
 * @param values - what the dialog collected.
 * @returns the labels of the fields that still need a value.
 */
export function missingFields(request, values = {}) {
  return (request.fields ?? [])
    .filter(field => field.required === true && field.type !== 'checkbox')
    .filter(field => {
      const value = values[field.name]
      return typeof value !== 'string' || value.trim() === ''
    })
    .map(field => field.label)
}
