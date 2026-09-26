# dsh-git-graph

A Git graph in the right sidebar of DSH Web. Browse commits, branches, tags and stashes, inspect staged/unstaged changes and diffs, compare revisions, and perform selected Git actions through confirmation dialogs. Changes to the Git directory update the view automatically while it is open.

## Install

Install the tagged GitHub release into your DSH Web profile:

```sh
dsh plugin --profile web add 'https://github.com/yoggu/dsh-git-graph.git#v0.1.1'
```

Or download the source and link the local checkout. The browser bundle (`client.js`) is already included; no build is needed to install it:

```sh
git clone --branch v0.1.1 --depth 1 https://github.com/yoggu/dsh-git-graph.git
cd dsh-git-graph
npm install --omit=dev --ignore-scripts
dsh plugin --profile web add "link:$(pwd)"
```

Keep a linked checkout in place while the plugin is installed. Use the profile you actually run if it is not `web`.

Restart DSH Web if necessary, reload the page, then select **Git graph** from the right sidebar's tab menu. No API key is required. The installed package includes the built browser bundle (`client.js`).

To uninstall: `dsh plugin --profile web remove dsh-git-graph`.

## Git actions and security

The plugin reads the repository of the current DSH session. Writing actions (for example commit, checkout, reset, stash, push and pull) are initiated by a user and presented for confirmation; **Fetch** reads from configured remotes without a confirmation. Destructive actions can discard work. Push uses `--force-with-lease` when force is requested.

Git reads repository-local configuration even for ordinary status calls; settings such as `core.fsmonitor`, hooks or filters may execute programs. Fetch, push and pull also use configured transports and can contact external hosts. Do not open or operate the graph on repositories with untrusted Git configuration. Access to this plugin's authenticated API effectively grants Git control over the session workspace. Diff contents are rendered as escaped text; syntax highlighting is bundled locally, not loaded from a CDN. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for included licenses.

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
