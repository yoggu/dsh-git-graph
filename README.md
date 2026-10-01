# dsh-git-graph

A Git graph in the right sidebar of DSH Web. Browse commits, branches, tags and stashes, inspect staged/unstaged changes and diffs, compare revisions, and perform selected Git actions through confirmation dialogs. Changes to the Git directory update the view automatically while it is open.

## Install

Install the tagged GitHub release into your DSH Web profile:

```sh
dsh plugin --profile web add 'https://github.com/yoggu/dsh-git-graph.git#v0.1.3'
```

Or download the source and link the local checkout. The browser bundle (`client.js`) is already included; no build is needed to install it:

```sh
git clone --branch v0.1.3 --depth 1 https://github.com/yoggu/dsh-git-graph.git
cd dsh-git-graph
npm install --omit=dev --ignore-scripts
dsh plugin --profile web add "link:$(pwd)"
```

Keep a linked checkout in place while the plugin is installed. Use the profile you actually run if it is not `web`.

Restart DSH Web if necessary, reload the page, then select **Git graph** from the right sidebar's tab menu. No API key is required. The installed package includes the built browser bundle (`client.js`).

To uninstall: `dsh plugin --profile web remove dsh-git-graph`.

## Selecting a repository

The Git panel initially lists only registered DSH workspace folders, with the current workspace first. Select a workspace's Git repository directly, or use the arrow beside a folder to load its immediate subfolders. Expand further folders one level at a time to reach nested repositories, worktrees or initialized submodules. There is no recursive background scan. You can inspect another workspace without creating a session there; search filters folders already loaded rather than starting a deeper scan.

Selection changes only the Git panel: Files, terminal, the active DSH workspace and the session directory stay unchanged. Diff and comparison tabs retain the repository they were opened from. The active repository is named above the graph and in action confirmations. Selection is remembered per session in plugin memory, not across a browser reload.

Folder browsing skips dependency directories and child symlinks. Child folders are read only when you expand their parent, and loaded levels are reused when you collapse and reopen them. Use the refresh button to reload workspace roots and open branches. The picker has no partial-scan notices; actual folder errors have an inline retry. Separate worktrees remain selectable. Bare repositories are not supported.

## Git actions and security

The plugin reads the explicitly selected repository, defaulting to the repository containing the current DSH session when available. Writing actions (for example commit, checkout, reset, stash, push and pull) are initiated by a user and presented for confirmation; **Fetch** reads from configured remotes without a confirmation. Destructive actions can discard work. Push uses `--force-with-lease` when force is requested.

Git reads repository-local configuration even for ordinary status calls; settings such as `core.fsmonitor`, hooks or filters may execute programs. Fetch, push and pull also use configured transports and can contact external hosts. Do not open or operate the graph on repositories with untrusted Git configuration. Access to this plugin's authenticated API effectively grants Git control over repositories in all registered DSH workspaces, the session directory and its children, and the repository containing that session. Explicit targets are validated against these roots; deleting a workspace registration invalidates its targets rather than falling back to another repository. Diff contents are rendered as escaped text; syntax highlighting is bundled locally, not loaded from a CDN. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for included licenses.

## Development and tests

```sh
npm ci
npm run build       # regenerate client.js after changing src/client/
npm test
npm run test:browser # optional: requires Chromium
```

The normal tests create temporary Git repositories; the browser suite uses a disposable headless browser. `npm run check:build` checks whether the tracked browser bundle matches its source.

## License

MIT; see [LICENSE](LICENSE).
