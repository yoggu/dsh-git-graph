import * as React from 'react'
import { COMMIT_ID, COMMIT_KIND, COMPARE_ID, COMPARE_KIND, DIFF_ID, DIFF_KIND, ID, KIND } from './constants.js'
import { RepositoryGraph } from './repositories.js'
import { CommitView, CompareView, DiffView } from './views.js'
import { GitIcon, GuideGlyph } from './ui.js'

const h = React.createElement

/**
 * Resolve the session a tab belongs to, and refuse to render without one.
 *
 * @param props - the slot's framework-injected props.
 * @returns the view.
 */
export function sessionOf(props) {
  const { sessionId, useSessions } = props
  const cwd = useSessions(sessions => sessions.byId[sessionId]?.cwd)
  return { sessionId: String(sessionId), cwd }
}

/**
 * The Graph tab's body.
 *
 * @param props - the slot's framework-injected props.
 * @returns the view.
 */
export function GraphBody(props) {
  const tabInfo = props.useTabInfo()
  const { sessionId, cwd } = sessionOf(props)
  if (cwd === undefined || cwd === null) {
    return h('div', { className: 'gg-empty' }, 'This session has no workspace directory yet.')
  }
  return h('div', { className: 'gg-host' }, h(RepositoryGraph, { key: `${sessionId}:${cwd}`, tabInfo, sessionId }))
}

/**
 * The Commit tab's body.
 *
 * @param props - the slot's framework-injected props.
 * @returns the view.
 */
export function CommitBody(props) {
  const tabInfo = props.useTabInfo()
  const { sessionId, cwd } = sessionOf(props)
  if (cwd === undefined || cwd === null) {
    return h('div', { className: 'gg-empty' }, 'This session has no workspace directory yet.')
  }
  return h('div', { className: 'gg-host' }, h(CommitView, { key: `${sessionId}:${cwd}`, tabInfo, sessionId }))
}

/**
 * The Diff tab's body.
 *
 * @param props - the slot's framework-injected props.
 * @returns the view.
 */
export function DiffBody(props) {
  const tabInfo = props.useTabInfo()
  const { sessionId, cwd } = sessionOf(props)
  if (cwd === undefined || cwd === null) {
    return h('div', { className: 'gg-empty' }, 'This session has no workspace directory yet.')
  }
  return h('div', { className: 'gg-host' }, h(DiffView, { key: `${sessionId}:${cwd}`, tabInfo, sessionId }))
}

/**
 * The Compare tab's body.
 *
 * @param props - the slot's framework-injected props.
 * @returns the view.
 */
export function CompareBody(props) {
  const tabInfo = props.useTabInfo()
  const { sessionId, cwd } = sessionOf(props)
  if (cwd === undefined || cwd === null) {
    return h('div', { className: 'gg-empty' }, 'This session has no workspace directory yet.')
  }
  return h('div', { className: 'gg-host' }, h(CompareView, { key: `${sessionId}:${cwd}`, tabInfo, sessionId }))
}

/** The graph tab's chip title. */
export function GraphTitle() {
  return h('span', { className: 'gg-tab-title' }, h('span', { className: 'gg-tab-icon' }, h(GitIcon, { name: 'branch' })), 'Git')
}

/**
 * The commit tab's chip title: the short hash, so two of them are told apart.
 *
 * @param props - the tab's live information.
 * @returns the title.
 */
export function CommitTitle({ useTabInfo }) {
  const { tab } = useTabInfo()
  const hash = tab.navigation?.params?.hash
  return typeof hash === 'string' ? hash.slice(0, 7) : 'Commit'
}

/**
 * The diff tab's chip title: the file's own name.
 *
 * @param props - the tab's live information.
 * @returns the title.
 */
export function DiffTitle({ useTabInfo }) {
  const { tab } = useTabInfo()
  const params = tab.navigation?.params ?? {}
  const path = typeof params.path === 'string' ? params.path : 'Diff'
  const parts = path.split('/')
  return parts[parts.length - 1] || 'Diff'
}

/**
 * The compare tab's chip title: the two short revisions, so several
 * comparisons open at once are told apart.
 *
 * @param props - the tab's live information.
 * @returns the title.
 */
export function CompareTitle({ useTabInfo }) {
  const { tab } = useTabInfo()
  const params = tab.navigation?.params ?? {}
  const base = String(params.base ?? '').slice(0, 7)
  const head = String(params.head ?? '')
  return `${base}..${head === '' ? 'worktree' : head.slice(0, 7)}`
}

/** The tab types this package registers. */
export const definitions = [
  {
    id: ID,
    kind: KIND,
    priority: 'extension',
    title: () => 'Git',
    guide: [{
      order: 20,
      title: () => 'Git graph',
      description: () => 'Browse Git repositories across your DSH workspaces',
      icon: GuideGlyph,
    }],
  },
  {
    id: COMMIT_ID,
    kind: COMMIT_KIND,
    priority: 'extension',
    title: () => 'Commit',
  },
  {
    id: DIFF_ID,
    kind: DIFF_KIND,
    priority: 'extension',
    multiple: true,
     title: () => 'Diff',
  },
  {
    id: COMPARE_ID,
    kind: COMPARE_KIND,
    priority: 'extension',
    multiple: true,
    title: () => 'Compare',
  },
]

