# dsh-git-graph

Git in the right Sidebar of DSH Web: the commit history of this session's
workspace as a lane graph, one commit's details and files, the diff of any file
(historical or uncommitted), the working tree an agent has left behind, and the
writing actions a reader confirms — branches, tags, commits, stashes, the working
tree and the remote.

## Graph, accordion, and diff tabs

Open **Git graph** from the right Sidebar's tab menu. The plugin adds no control
outside that sidebar.

- History is a full-width graph table with **Description**, **Date**, **Author**,
  and short **Commit** columns.
- A branch that still agrees with its remote-tracking branch wears one badge
  naming both — `main` with an italic `origin` — so `origin/main` only gets its
  own full-name badge once it has drifted onto a commit of its own.
- When the worktree is dirty, a grey **Uncommitted changes (n)** row appears above
  the commits. A partially staged path counts once in `n`, while its staged and
  unstaged changes remain separate entries.
- Clicking a commit or the uncommitted row expands its details directly beneath
  that row; clicking it again collapses the accordion. The open row is remembered
  in memory per DSH session while you visit separate Diff tabs.
- The accordion places commit metadata and message on the left and a compact,
  hierarchical changed-file tree on the right. Files retain accessible status
  letters and colors, plus per-file added/deleted line counts when Git reports them.
- Clicking a changed file opens a separate **Diff** tab. Each file can have its
  own tab, so the graph and other open diffs remain available.
- The graph keeps itself current. The host watches the repository's Git
  directory and pushes one event per burst of changes over a server-sent event
  stream, so a commit made while you are looking at the tab appears on its own —
  no refresh, no tab switch.
- **Refresh** re-reads history and working tree by hand; a background refresh
  keeps your scroll position, your open accordion and the loaded depth, and only
  re-renders when something the rows draw actually changed.
- **Fetch** pulls every configured remote (`git fetch --all`, tags included). It
  is the one toolbar button that touches the network, it appears only when a
  remote exists, and it updates remote-tracking branches only — the working tree,
  the index, HEAD and your local branches are untouched. Push and pull live in a
  branch's own menu, where they are confirmed like every other writing action.

The diff tab defaults to **Auto** layout: it uses Combined view below 900px and
Split view at or above 900px. **Split** and **Combined** are explicit overrides.
Split mode pairs adjacent replacement blocks, pads one-sided rows, keeps context
aligned, and renders hunk/no-newline rows across both sides. Syntax highlighting is
tokenized independently for old and new cells. Intraline change highlighting is
not included. Very short views allow scrolling rather than clipping file controls.

### Graph and diff colors

The Git tab carries a compact branch icon, and the guide's **Git graph**
capsule carries the same mark. Raw patch headers (`diff --git`,
`index`, `---`, `+++`) live in the collapsed **Diff metadata** disclosure, not
between code lines. Hunk range headers remain in the preview for navigation.

The graph sits above hover/selection backgrounds and never intercepts pointer
input. Each live branch has a fixed colored rail; short rounded transitions show
its entry/exit. File status badges use amber **M**, green **A**, red **D** and blue
**R/C**, with letters and tooltips so status does not depend on color alone.

Diff syntax highlighting is bundled locally with highlight.js (no CDN). Supported:
JS/JSX, TS/TSX, Python, JSON, YAML, CSS, HTML/XML/SVG, Bash, SQL, Markdown, Go,
Rust, Java, Dockerfiles, INI/TOML and .env files. The language button toggles it.
Old/new hunk sides are tokenized separately; missing context at hunk boundaries
can limit multi-line classification. Unknown formats and patches above 200 KB or
5,000 rows stay plain for responsiveness. All code tokens are rendered as escaped
React text, never inserted as repository HTML.

To change grammars or tokenization, edit `src/client/syntax.js`, then run
`npm run build`. The tsdown build bundles all client modules and highlight.js into
`client.js`; React stays external because DSH supplies it. License notices are in
`THIRD_PARTY_NOTICES.md`.

UX research: independently implemented patterns informed by the public
[VS Code Git Graph documentation](https://github.com/mhutchie/vscode-git-graph/blob/develop/README.md),
plus [Sublime Merge](https://www.sublimemerge.com/docs/getting_started#understanding_the_interface),
[GitKraken](https://help.gitkraken.com/gitkraken-desktop/interface/), and
[GitHub Desktop](https://docs.github.com/en/desktop/making-changes-in-a-branch/viewing-the-branch-history-in-github-desktop).

## What it does to your repository

Reads change nothing. The writing actions are the ones a reader picks from a
menu and confirms in a dialog — never raw command text: the browser names an
action, the host validates every argument and builds the argument list, and the
dialog shows that list before anything runs.

Three rules keep an action from surprising the agent working in the same tree:

- Nothing runs while a Git operation is half-finished (`MERGE_HEAD`,
  `REBASE_HEAD`, `CHERRY_PICK_HEAD`, `REVERT_HEAD`, `BISECT_LOG`) or while
  `.git/index.lock` exists. The way *out* of the operation that is running is
  offered instead, as a banner above the graph.
- Writes are queued per repository, so two clicks cannot race each other for the
  index. Git's own locking still arbitrates with everyone else.
- A dirty working tree is a warning, not a refusal: git decides which changes a
  checkout may carry across, and the dialog says what the tree holds first.

`--force-with-lease` is used instead of `--force`, and no action ever passes a
name or a path that starts with `-` to git in an argument position.

- **Branches** — check out, create (at HEAD, a commit or a ref), rename, delete
  (`-D` only when asked), merge (`--no-ff` when asked), rebase, reset
  (soft/mixed/hard), pull, push, and fetching a remote-tracking branch into the
  local branch of the same name.
- **Tags** — create a lightweight or annotated tag on any commit, delete one,
  push one.
- **Commits** — check out (detached), cherry-pick, revert, reset the branch to
  it, and create a branch or a tag at it.
- **Working tree** — stash (with a message, untracked files, or keeping the
  index), discard one file's changes (from the index or from HEAD), reset
  everything (mixed or hard), remove untracked files.
- **Stashes** — apply, pop, drop, and start a branch from one.
- **Remote** — fetch, with `--prune` when asked.

## How it is wired

- `lib/index.js` — the host half. It resolves the repository from the calling
  Session's own working directory (`git rev-parse --show-toplevel`, so a session
  opened in a subdirectory still finds its repository) and serves two exact
  routes: `/api/dsh-git-graph` for requests, and `/api/dsh-git-graph/events`, a
  server-sent event stream of repository changes. A request that names no live
  session is refused rather than answered from another project. Reads are
  `commits`, `commit`, `diff`, `blob`, `working`, `workingDiff`, `workingFile`
  and `state`; the writing path is `plan` (what would run, and whether it may)
  and `action` (run it).
- The watch behind that stream follows the Git directory alone — not the working
  tree. Measured on a mid-sized repository that is hundreds of directories
  instead of tens of thousands, and it carries every signal the graph draws:
  commits, refs, staging and checkouts. It runs only while a tab is subscribed,
  so a graph nobody is looking at costs nothing, and it debounces a burst into
  one push. If the watch cannot start, the stream says so and the browser falls
  back to refreshing when the tab comes back into view.
- `src/client/` — the modular browser source. It registers three tab types in the
  right Sidebar and renders the graph, details and patches. Its imports follow an
  acyclic entry → registration → views → helpers direction, with `live.js`
  owning the push channel. `actions.js` holds the action vocabulary the menus are
  built from and `dialog.js` the confirmation dialog that plans an action before
  offering to run it.
- `client.js` — the generated, self-contained DSH browser wrapper. It keeps React
  external and runs no git itself.

## Install

```sh
dsh plugin --profile web add link:/home/yoggu/Projects/dsh-plugins/dsh-git-graph
```

First install needs one restart of the web service. After that, edit `src/client/`
and run `npm run build`, or keep `npm run watch` running while developing;
**updating generated `client.js` needs no restart**. `dsh-client-hmr` stat-polls
every client bundle every 500 ms and re-hashes the
ones whose size or mtime changed, so a built file reaches the page on the next
load. Editing `lib/index.js` — the host half — does need a restart, because host
rows are composed at startup.

Then, in the right Sidebar, open the guide and pick **Git graph**.

## Test

```sh
npm test
```

The suite builds real repositories in a temp directory and reads git's own
output, because the parsers are where this plugin is most likely to be wrong and
least likely to be caught by reading the code.

### Headless browser tests (no desktop or browser extension)

```sh
npm ci
npm run test:browser
# Optional: BROWSER_PATH=/path/to/chromium GRAPH_TEST_REPO=/path/to/repo npm run test:browser
```

`tests/headless/run.mjs` launches a disposable headless Chromium and loads the
actual `client.js` through its exported plugin factory. Only Cordis mounting and
theme tokens are substituted; React, CSS, DOM events and the existing host's Git
read operations are real. Network requests are intercepted inside the test: no
HTTP server, logged-in profile or DSH restart is needed. All scenarios run
against a temporary repository that the test creates and removes; nothing of
yours is read or written unless you ask for it.

47 checks run out of the box. Setting `GRAPH_TEST_REPO` to a repository with a
large branching history adds 3 more that exercise real lane routing and real
working-tree reads on that history, which is only ever read.

Together they cover dark/light and 400px/1440px layouts, computed status colors,
actual screenshot pixels for graph hover/selection, syntax toggling, escaped
source, metadata disclosure, keyboard and pointer resizing, selected-row
visibility after shrinking, inline navigation, selection preservation,
partially staged files, deleted/binary states, hunk navigation, wrap toggling
and browser exceptions. Screenshots and machine-readable results go to `test-artifacts/`
(ignored by Git). This complements, but does not verify, live DSH routing/HMR or
its exact theme/Slot implementation. All browser processes and temp repositories
are cleaned up at test completion.

## Development notes

Two traps worth knowing, both of which cost real time to find:

- **A component must be passed as a function.** `h('ContextMenu', {...})` passes
  the *string* `'ContextMenu'`; React then looks for an HTML element by that
  name, finds none, and renders nothing — silently, with no console error and no
  exception. Always `h(ContextMenu, {...})`.
- **A stale bundle looks exactly like a broken fix.** After editing `src/client/`,
  run `npm run build` (or `npm run check:build` to detect drift), then confirm the
  running page actually has the change before debugging further. The
  reliable check reads the loaded bundle:

  ```js
  // in the browser console
  const url = performance.getEntriesByType('resource')
    .map(r => r.name).find(n => n.includes('dsh-git-graph/client.js') && n.includes('plugins/??'))
  fetch(url).then(r => r.text()).then(t => t.includes('<a string from your change>'))
  ```

  A reload alone can serve a cached revision; a fresh page load after the HMR
  poll has re-hashed the file is what shows the current code.

## Layout notes

The lane layout is a pure function of the commit page.

### Comparison modes

History compares a commit to its first parent (the empty tree for a root).
Staged changes compare HEAD to index; unstaged changes compare index to working
copy. Historical renames pass both old and new paths to the host.
