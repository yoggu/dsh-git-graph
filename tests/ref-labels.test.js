import test from 'node:test'
import assert from 'node:assert/strict'
import { groupRefs, parseRef, RefBadges } from '../src/client/graph-ui.js'

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

test('a row without refs renders nothing', () => {
  assert.equal(RefBadges({ refs: [] }), null)
  assert.deepEqual(own(labels([])), [])
})
