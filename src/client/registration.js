import { COMMIT_ID, COMPARE_ID, DIFF_ID, ID } from './constants.js'
import { CSS } from './styles.js'
import { CommitBody, CommitTitle, CompareBody, CompareTitle, definitions, DiffBody, DiffTitle, GraphBody, GraphTitle } from './tabs.js'

/**
 * Register the tab types, their bodies and titles, and the styles.
 *
 * Every registration is an `ctx.effect`, so unloading this plugin removes
 * the tab types, every slot, and the stylesheet together.
 *
 * @param ctx - the client plugin context.
 */
export function apply(ctx) {
  const bodies = [
    [ID, GraphBody, GraphTitle],
    [COMMIT_ID, CommitBody, CommitTitle],
    [DIFF_ID, DiffBody, DiffTitle],
    [COMPARE_ID, CompareBody, CompareTitle],
  ]
  for (const definition of definitions) {
    ctx.effect(() => ctx.sidebarRightTabs.register(definition), `git-graph: ${definition.kind} type`)
  }
  for (const [key, Body, Title] of bodies) {
    ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
      name: 'sidebar.right.pane.tab',
      key,
    }, Body)), `git-graph: ${key} body`)
    ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
      name: 'sidebar.right.pane.tab.title',
      key,
    }, Title)), `git-graph: ${key} title`)
  }
  ctx.effect(() => {
    const style = document.createElement('style')
    style.setAttribute('data-dsh-git-graph', '')
    style.textContent = CSS
    document.head.appendChild(style)
    return () => { style.remove() }
  }, 'git-graph: styles')
}


export const inject = ['slots', 'sidebarRightTabs']
