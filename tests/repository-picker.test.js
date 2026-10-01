import test from 'node:test'
import assert from 'node:assert/strict'
import { initialRepository, targetKey, repositoryDisplay } from '../src/client/repositories.js'

const a = { root: '/project/a', target: { workspaceId: 'project', path: 'a' } }
const b = { root: '/project/b', target: { workspaceId: 'project', path: 'b' } }
test('picker defaults only to containing repo, never a sole unscanned child', () => {
  assert.equal(initialRepository([a, b], null), null)
  assert.equal(initialRepository([a], null), null)
  assert.equal(initialRepository([], null), null)
  assert.equal(initialRepository([a, b], b), b)
  assert.equal(initialRepository([], a), a)
})
test('remembered selection is restored by canonical root and never silently retargeted', () => {
  assert.equal(initialRepository([a, b], a, { ...b }), b)
  assert.equal(initialRepository([a], a, b), null)
  assert.equal(initialRepository([], a, { ...a }), a, 'fresh containing repo remains restorable even when bounded scan omits it')
  assert.notEqual(targetKey(a.target), targetKey(b.target))
})

test('repository rows separate the leaf name from its disambiguating parent path', () => {
  const entry = { relativePath: 'packages/tools/renderer', label: 'packages/tools/renderer', root: '/work/packages/tools/renderer' }
  assert.deepEqual(repositoryDisplay(entry), { name: 'renderer', parent: 'packages/tools', root: false })
  assert.equal(entry.label, 'packages/tools/renderer', 'presentation does not alter target identity or accessible label')
})

test('root and containing repositories have readable names instead of dot paths', () => {
  assert.deepEqual(repositoryDisplay({ relativePath: '.', root: '/work/project', workspaceTitle: 'Project' }), { name: 'Project', parent: '', root: true })
  assert.deepEqual(repositoryDisplay({ relativePath: '..', root: '/work/project', target: { session: true, containing: true } }), { name: 'project', parent: 'Containing repository', root: false })
  assert.deepEqual(repositoryDisplay({ relativePath: '.', root: 'C:\\work\\project' }), { name: 'project', parent: '', root: true })
})
