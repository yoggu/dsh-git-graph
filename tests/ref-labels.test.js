import test from 'node:test'
import assert from 'node:assert/strict'
import { groupRefs, parseRef, RefBadges, refGlyph } from '../src/client/graph-ui.js'
import { GitIcon } from '../src/client/ui.js'

const REMOTES = ['origin', 'upstream']
const own = value => JSON.parse(JSON.stringify(value))
const labels = refs => groupRefs(refs, REMOTES)

test('a remote-tracking branch on its local branch commit folds into that badge', () => {
  assert.deepEqual(own(labels(['HEAD -> main', 'origin/main'])), [{
    key: 'head:main',
    kind: 'head',
    text: 'main',
    // The short name and the remote travel with the badge so a right-click can
    // name the ref it stands for — `refs/heads/main`, `origin/main` — rather
    // than re-parsing the label.
    label: 'main',
    remote: null,
    title: 'HEAD is at main',
    remotes: [{ name: 'origin', full: 'origin/main' }],
  }])
})

test('several remotes in sync collapse into the same branch badge', () => {
  const [badge] = labels(['main', 'origin/main', 'upstream/main'])
  assert.equal(badge.kind, 'branch')
  assert.deepEqual(own(badge.remotes), [
    { name: 'origin', full: 'origin/main' },
    { name: 'upstream', full: 'upstream/main' },
  ])
})

test('a diverged remote keeps its own full-name badge', () => {
  // The local branch is not on this row: the two have drifted apart, so the
  // remote-tracking name is the only thing that names this commit.
  assert.deepEqual(own(labels(['origin/main'])), [{
    key: 'remote:origin/main',
    kind: 'remote',
    text: 'origin/main',
    label: 'main',
    remote: 'origin',
    title: 'origin/main',
    remotes: [],
  }])
})

test('a remote-tracking branch whose branch name has no local twin stays standalone', () => {
  const badges = labels(['main', 'origin/release-2.0'])
  assert.deepEqual(own(badges.map(badge => [badge.kind, badge.text])), [['branch', 'main'], ['remote', 'origin/release-2.0']])
  assert.deepEqual(own(badges[0].remotes), [])
})

test('remote HEAD and short remote names never fold by accident', () => {
  // `origin/HEAD` is the remote's own symbolic ref, not a branch named HEAD; a
  // branch may legitimately be called `HEAD`-adjacent, so only real branches fold.
  const badges = labels(['HEAD', 'origin/HEAD', 'origin/main'])
  assert.deepEqual(own(badges.map(badge => [badge.kind, badge.text])), [
    ['remote', 'origin/HEAD'],
    ['remote', 'origin/main'],
    ['detached', 'HEAD'],
  ])
})

test('tags stay tagged and badges keep head, branch, remote, tag order', () => {
  const badges = labels(['tag: v1.0.0', 'origin/release-2.0', 'feature/x', 'HEAD -> main'])
  assert.deepEqual(own(badges.map(badge => [badge.kind, badge.text])), [
    ['head', 'main'],
    ['branch', 'feature/x'],
    ['remote', 'origin/release-2.0'],
    ['tag', 'v1.0.0'],
  ])
  assert.equal(badges[3].title, 'tag v1.0.0')
  // Neither `origin/release-2.0` nor `feature/x` has a twin on this row.
  assert.deepEqual(own(badges.map(badge => badge.remotes)), [[], [], [], []])
})

test('an in-sync remote folds even when it is listed before its local branch', () => {
  const badges = labels(['origin/main', 'HEAD -> main'])
  assert.deepEqual(own(badges.map(badge => [badge.kind, badge.text])), [['head', 'main']])
  assert.deepEqual(own(badges[0].remotes), [{ name: 'origin', full: 'origin/main' }])
})

test('parseRef splits a remote name against the known remotes, longest first', () => {
  assert.deepEqual(own(parseRef('origin/feature/x', REMOTES)), { label: 'feature/x', kind: 'remote', prefix: null, remote: 'origin' })
  assert.deepEqual(own(parseRef('upstream/main', REMOTES)), { label: 'main', kind: 'remote', prefix: null, remote: 'upstream' })
  // An unknown prefix is a local branch that merely looks remote-ish.
  assert.deepEqual(own(parseRef('fork/main', REMOTES)), { label: 'fork/main', kind: 'branch', prefix: null, remote: null })
})

test('the badge renders the remote as an italic segment beside the branch name', () => {
  const tree = RefBadges({ refs: labels(['HEAD -> main', 'origin/main']) })
  assert.equal(tree.props.className, 'gg-refs')
  const [badge] = tree.props.children
  assert.equal(badge.props.className, 'gg-ref gg-ref-head')
  assert.equal(badge.props.title, 'HEAD is at main')
  const [icon, name, remote] = badge.props.children
  assert.equal(icon.props.className, 'gg-ref-icon')
  assert.equal(name.props.className, 'gg-ref-name')
  assert.equal(name.props.children, 'main')
  assert.equal(remote.props.className, 'gg-ref-remote-name')
  assert.equal(remote.props.children, 'origin')
  assert.equal(remote.props.title, 'origin/main')
})

test('the in-sync segment never shares a class with a standalone remote badge', () => {
  const [standalone] = RefBadges({ refs: labels(['origin/release-2.0']) }).props.children
  assert.equal(standalone.props.className, 'gg-ref gg-ref-remote')
  const [synced] = RefBadges({ refs: labels(['main', 'origin/main']) }).props.children
  assert.equal(synced.props.children.at(-1).props.className, 'gg-ref-remote-name')
})

test('a tag badge wears the tag glyph, every branch-like badge the branch mark', () => {
  // The badge told a tag and a branch apart by name only, so a tagged commit
  // was decorated with the branch mark — the one shape that says "this is a
  // branch". The glyph now follows the kind.
  const glyphOf = ref => RefBadges({ refs: [ref] }).props.children[0].props.children[0].props.children.props.name
  const [tag] = labels(['tag: v1.0.0'])
  assert.equal(glyphOf(tag), 'tag')
  for (const ref of labels(['HEAD -> main', 'feature/x', 'origin/release-2.0', 'HEAD'])) {
    assert.equal(glyphOf(ref), 'branch', `${ref.kind} keeps the branch mark`)
  }
  assert.equal(refGlyph('tag'), 'tag')
  assert.equal(refGlyph('stash'), 'branch')
  // Naming a glyph is not drawing it: an unknown name yields an empty svg, so
  // the table is checked for the paths themselves.
  assert.ok(GitIcon({ name: 'tag' }).props.children.length > 0, 'the tag glyph is drawn')
})

test('a row without refs renders nothing', () => {
  assert.equal(RefBadges({ refs: [] }), null)
  assert.deepEqual(own(labels([])), [])
})

test('a stash is named by its position, not by the one ref every stash shares', () => {
  const stashes = [
    { index: 0, hash: 'a'.repeat(40), selector: 'stash@{0}', subject: 'WIP on main: base' },
    { index: 1, hash: 'b'.repeat(40), selector: 'stash@{1}', subject: 'On main: erste' },
  ]
  const [{ kind, text, title }] = groupRefs(['refs/stash'], REMOTES, { hash: 'a'.repeat(40), stashes })
  assert.equal(kind, 'stash')
  assert.equal(text, 'stash@{0}')
  assert.equal(title, 'WIP on main: base')

  // The other stash sits on another commit, so the same decoration yields its
  // own position rather than repeating the first.
  const [second] = groupRefs(['refs/stash'], REMOTES, { hash: 'b'.repeat(40), stashes })
  assert.equal(second.text, 'stash@{1}')

  // A commit the stash list does not know keeps a neutral label instead of
  // claiming a position it may not hold.
  const [unknown] = groupRefs(['refs/stash'], REMOTES, { hash: 'c'.repeat(40), stashes })
  assert.equal(unknown.text, 'stash')

  // `refs/stash` is a full ref path, and must not be read as a branch of that
  // name — which is what happened before the stash was a kind of its own.
  assert.equal(parseRef('refs/stash', REMOTES).kind, 'stash')
  assert.equal(parseRef('refs/stash', REMOTES).label, 'stash')
})
