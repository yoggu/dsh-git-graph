# dsh-git-graph

Git views in the right Sidebar of DSH Web: the commit history of this session's
workspace as a lane graph, one commit's details and files, the diff of any file
(historical or uncommitted), and the working tree an agent has left behind.

## Persistent split-view browser

Open **Git graph** from the right Sidebar's own tab menu. The plugin adds no
control of its own anywhere else in the interface.

- **History** keeps the graph visible while selection updates a commit inspector.
- **Changed files** remain visible while a single diff preview updates in place.
- **Changes** switches inside the same Git view to staged, unstaged and untracked
  groups. Refresh reads a new snapshot without changing the selected file if it remains.
- Drag either divider, use its arrow keys, or double-click to reset. Narrow views
  stack panes; expanded views arrange them side by side when enough width exists.
- Arrow keys/Home/End navigate commits and files; file filtering, previous/next
  buttons, unified old/new line numbers, wrapping, context selection and hunk
  navigation make review possible without opening more tabs.

The sidebar's fullscreen action expands the same workspace. History/Changes
switching keeps both views mounted. Legacy Commit and Diff tab links still work,
but ordinary commit/file clicks no longer open tabs. No arbitrary-commit comparison
UI is currently exposed.

Known limits: untracked files are listed but their content is not available from
the current host API; a clear message replaces the misleading empty diff. Code
preview is unified (not two-column); intraline change highlighting is not included.
Very short views allow scrolling rather than clipping file controls.

### Graph and diff colors

The Git tab carries a compact branch icon. Raw patch headers (`diff --git`,
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

To change grammars or tokenization: edit `scripts/syntax-entry.js`, then run
`npm ci && npm run build:syntax`. The build replaces only the marked generated
block in `client.js`, preserving its hand-edited plugin code. License notices are
in `THIRD_PARTY_NOTICES.md`.

UX research: independently implemented selection-driven patterns documented by
[Sublime Merge](https://www.sublimemerge.com/docs/getting_started#understanding_the_interface),
[GitKraken](https://help.gitkraken.com/gitkraken-desktop/interface/) and
[GitHub Desktop](https://docs.github.com/en/desktop/making-changes-in-a-branch/viewing-the-branch-history-in-github-desktop).

## What it never does

It never writes to a repository. There is no checkout, no commit, no fetch, no
reset, no merge. Every `git` call is a read, its argument list is built
host-side, and the browser chooses from named operations rather than sending
command text. The right-click menu copies hashes and subjects and opens views;
it deliberately offers no mutating Git action.

## How it is wired

- `lib/index.js` — the host half. It resolves the repository from the calling
  Session's own working directory (`git rev-parse --show-toplevel`, so a session
  opened in a subdirectory still finds its repository) and serves one exact
  route, `/api/dsh-git-graph`. A request that names no live session is refused
  rather than answered from another project.
- `client.js` — the browser half. It registers four tab types in the right
  Sidebar and renders the graph, the details, the patches and the working tree.
  It runs no git itself.

## Install

```sh
dsh plugin --profile web add link:/home/yoggu/Projects/dsh-plugins/dsh-git-graph
```

First install needs one restart of the web service. After that, **editing
`client.js` needs no restart**: `dsh-client-hmr` stat-polls every client bundle
every 500 ms and re-hashes the ones whose size or mtime changed, so a saved file
reaches the page on the next load. Editing `lib/index.js` — the host half — does
need a restart, because host rows are composed at startup.

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

25 checks run out of the box. Setting `GRAPH_TEST_REPO` to a repository with a
large branching history adds 8 more that exercise real lane routing, pagination
and merge details on that history, which is only ever read.

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
- **A stale bundle looks exactly like a broken fix.** After editing `client.js`,
  confirm the running page actually has the change before debugging further. The
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
