import React from 'react'
import { createRoot } from 'react-dom/client'

// Only the Cordis mounting surface is substituted. The unmodified client.js
// factory, React components, CSS, browser events and fetch requests run for real.
const h = React.createElement
const seats = new Map()
const disposers = []
window.testState = { openTabs: 0, opened: [], registrations: [], ready: false }
const lifetime = new AbortController()
let renderRoot, fixtureSession = 'fixture', view = 'git-graph', navigationParams = {}, tabVisible = true
const openTab = (kind, options = {}) => {
  window.testState.openTabs++
  window.testState.opened.push({ kind, params: options.params ?? {} })
  view = kind
  navigationParams = options.params ?? {}
  mount()
}
const tabInfo = () => ({ tab: { signal: lifetime.signal, visible: tabVisible, navigation: { params: navigationParams }, actions: { openTab } }, sidebar: { expanded: true, fullscreen: false } })
const props = () => ({ sessionId: fixtureSession, useTabInfo: tabInfo,
  useSessions: selector => selector({ byId: { [fixtureSession]: { cwd: '/test-repository' } } }) })
function mount() {
  // Every registered tab type is looked up by the id the plugin registered it
  // under; a kind the harness does not know would render the wrong body and
  // look like a plugin failure.
  const id = view === 'git-graph' ? 'dsh-git-graph'
    : view === 'git-diff' ? 'dsh-git-graph/diff'
      : view === 'git-compare' ? 'dsh-git-graph/compare'
        : 'dsh-git-graph/commit'
  const Body = seats.get(`sidebar.right.pane.tab:${id}`)
  const Title = seats.get(`sidebar.right.pane.tab.title:${id}`)
  renderRoot ||= createRoot(document.getElementById('root'))
  renderRoot.render(h('main', { className: 'fixture-shell' },
    h('header', { className: 'fixture-title', role: 'tablist' }, h('span', { role: 'tab' }, h(Title, props()))),
    h('div', { className: 'fixture-body' }, h(Body, { key: `${fixtureSession}:${view}`, ...props() }))))
  window.testState.ready = true
}
window.testHarness = {
  setSession(sessionId, kind = 'git-graph', params = {}) { fixtureSession = sessionId; view = kind; navigationParams = params; mount() },
  theme(theme) { document.documentElement.dataset.theme = theme },
  setVisible(visible) { tabVisible = visible; mount() },
  dispose() { renderRoot?.unmount(); lifetime.abort(); disposers.reverse().forEach(dispose => dispose?.()) },
}
window.__ModuleLoader__ = {
  load(registration) {
    if (registration.id !== 'dsh-git-graph') throw new Error('Unexpected plugin')
    const plugin = registration.factory(name => { if (name === 'react') return React; throw new Error(`Unexpected module ${name}`) })
    const ctx = {
      effect(fn) { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose) },
      get(name) { return name === 'sidebarRight' ? { openTab } : undefined },
      sidebarRightTabs: { register(def) { window.testState.registrations.push(def.kind); return () => {} } },
      slots: {
        inject(name, register) { return register() },
        register(spec, component) { const key = `${spec.name}:${spec.key ?? spec.id}`; seats.set(key, component); return () => seats.delete(key) },
      },
    }
    plugin.apply(ctx)
    mount()
  },
}
