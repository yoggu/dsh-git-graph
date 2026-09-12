# dsh-git-graph

A Git tab in the right Sidebar of DSH Web: the commit history of this session's
workspace as a lane graph, each commit's details and files, and the diff of what
an agent has changed and not yet committed.

## What it shows

- **History** — commits in topological order with branch, remote and tag badges;
  a commit's message, parents and dates; its changed files; and a per-file patch
  against the first parent (renames shown as renames, not as added files).
  Ctrl-click a second commit to compare two arbitrary commits.
- **Changes** — the working tree read fresh on demand, grouped into staged,
  unstaged and untracked, with each file's patch. This is the view for watching
  an agent work: the state is the one at the instant the tab asked, so refresh
  to see the current one.

## What it never does

It never writes to a repository. There is no checkout, no commit, no fetch, no
reset. Every `git` call is a read, its argument list is built host-side, and the
browser chooses from named operations rather than sending command text.

## How it is wired

- `lib/index.js` — the host half. It resolves the repository from the calling
  Session's own working directory (`git rev-parse --show-toplevel`, so a session
  opened in a subdirectory still finds its repository) and serves one exact
  route, `/api/dsh-git-graph`. A request that names no live session is refused
  rather than answered from another project.
- `client.js` — the browser half. It registers the `git-graph` tab type in the
  right Sidebar and renders the graph, the details, the patches and the working
  tree. It runs no git itself.

## Install

```sh
dsh plugin --profile web add link:/home/yoggu/Projects/dsh-plugins/dsh-git-graph
```

Then restart the web service and refresh the page. In the right Sidebar, open the
guide and pick **Git graph**.
