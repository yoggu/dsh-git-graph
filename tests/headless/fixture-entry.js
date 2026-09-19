import React from 'react'
import { createRoot } from 'react-dom/client'

// Only the Cordis mounting surface is substituted. The unmodified client.js
// factory, React components, CSS, browser events and fetch requests run for real.
const h = React.createElement
const seats = new Map()
const disposers = []
window.testState = { openTabs: 0, registrations: [], ready: false }
const lifetime = new AbortController()
const tabInfo = { tab: { signal: lifetime.signal, navigation: { params: {} }, actions: { openTab() { window.testState.openTabs++ } } } }
let renderRoot, fixtureSession = 'fixture', view = 'git-graph'
const props = () => ({ sessionId: fixtureSession, useTabInfo: () => tabInfo,
  useSessions: selector => selector({ byId: { [fixtureSession]: { cwd: '/test-repository' } } }) })
function mount() {
  const id = view === 'git-graph' ? 'dsh-git-graph' : 'dsh-git-graph/changes'
  const Body = seats.get(`sidebar.right.pane.tab:${id}`)
  const Title = seats.get(`sidebar.right.pane.tab.title:${id}`)
  renderRoot ||= createRoot(document.getElementById('root'))
  renderRoot.render(h('main', { className: 'fixture-shell' },
    h('header', { className: 'fixture-title', role: 'tablist' }, h('span', { role: 'tab' }, h(Title, props()))),
    h('div', { className: 'fixture-body' }, h(Body, { key: `${fixtureSession}:${view}`, ...props() }))))
  window.testState.ready = true
}
window.testHarness = {
  setSession(sessionId, kind = 'git-graph') { fixtureSession = sessionId; view = kind; mount() },
  theme(theme) { document.documentElement.dataset.theme = theme },
  dispose() { renderRoot?.unmount(); lifetime.abort(); disposers.reverse().forEach(dispose => dispose?.()) },
}
window.__ModuleLoader__ = {
  load(registration) {
    if (registration.id !== 'dsh-git-graph') throw new Error('Unexpected plugin')
    const plugin = registration.factory(name => { if (name === 'react') return React; throw new Error(`Unexpected module ${name}`) })
    const ctx = {
      effect(fn) { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose) },
      get(name) { return name === 'sidebarRight' ? { openTab() { window.testState.openTabs++ } } : undefined },
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
