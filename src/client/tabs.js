import * as React from 'react'
import { COMMIT_ID, COMMIT_KIND, DIFF_ID, DIFF_KIND, ID, KIND } from './constants.js'
import { GraphView } from './graph-view.js'
import { CommitView, DiffView } from './views.js'
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
  return h('div', { className: 'gg-host' }, h(GraphView, { key: `${sessionId}:${cwd}`, tabInfo, sessionId }))
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
      description: () => 'Commit history and uncommitted changes of this session’s workspace',
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
]

