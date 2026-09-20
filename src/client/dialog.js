import * as React from 'react'
import { initialValues, missingFields, paramsFor } from './actions.js'
import { call } from './api.js'
import { CompactDropdown } from './ui.js'

const h = React.createElement

/** How each half-finished operation is named to a reader. */
const OPERATION_LABELS = {
  merge: 'merge',
  cherryPick: 'cherry-pick',
  revert: 'revert',
  rebase: 'rebase',
  bisect: 'bisect',
}

/**
 * How a half-finished operation is named to a reader.
 *
 * @param operation - the host's marker name, e.g. `cherryPick`.
 * @returns the spelling a reader would use, e.g. `cherry-pick`.
 */
export function operationLabel(operation) {
  return OPERATION_LABELS[operation] ?? operation
}

/**
 * One line describing where the repository stands right now.
 *
 * It is shown inside the confirmation dialog, next to the command, because that
 * is where the fact that the tree is dirty or that HEAD is detached changes the
 * decision the reader is about to make.
 *
 * @param state - the host's answer about the repository.
 * @returns the summary, or `null` before any answer arrived.
 */
export function describeState(state) {
  if (state === null || state === undefined) return null
  const parts = [state.branch === null ? 'detached HEAD' : `on ${state.branch}`]
  parts.push(state.dirty
    ? `${state.changedCount} uncommitted change${state.changedCount === 1 ? '' : 's'}`
    : 'clean working tree')
  if (state.operation !== null && state.operation !== undefined) {
    parts.push(`${operationLabel(state.operation)} in progress`)
  }
  if (state.conflicts?.length > 0) {
    parts.push(`${state.conflicts.length} conflicted file${state.conflicts.length === 1 ? '' : 's'}`)
  }
  return parts.join(' · ')
}

/**
 * The confirmation dialog for one writing action.
 *
 * What the reader approves is the argument list the *host* would run, not a
 * sentence composed in the browser: the dialog asks for a plan and shows it.
 * That is also why a refusal — a merge already in progress, an index another
 * process is writing — appears here as the reason the confirm button is
 * unavailable, rather than as an error after the fact.
 *
 * @param props - the action request, the session, and what to do on success.
 * @returns the dialog element.
 */
export function ActionDialog({ request, sessionId, signal, onClose, onDone }) {
  const [values, setValues] = React.useState(() => initialValues(request))
  const [plan, setPlan] = React.useState(null)
  const [planError, setPlanError] = React.useState(null)
  const [runError, setRunError] = React.useState(null)
  const [running, setRunning] = React.useState(false)
  const firstField = React.useRef(null)

  const missing = missingFields(request, values)
  const params = paramsFor(request, values)
  // The plan is re-read whenever the parameters change, so the command shown is
  // always the command that would run — never the one from a previous keystroke.
  const paramsKey = JSON.stringify(params)

  React.useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  React.useEffect(() => { firstField.current?.focus() }, [])

  React.useEffect(() => {
    if (missing.length > 0) {
      setPlan(null)
      setPlanError(null)
      return undefined
    }
    let active = true
    call({ op: 'plan', sessionId, action: request.action, params }, signal)
      .then(result => { if (active) { setPlan(result); setPlanError(null) } })
      .catch(error => {
        if (active && error.name !== 'AbortError') {
          setPlan(null)
          setPlanError(String(error.message ?? error))
        }
      })
    return () => { active = false }
    // `missing.length` and `paramsKey` are the whole of what this depends on.
  }, [paramsKey, missing.length, request.action, sessionId, signal])

  const blocked = plan?.blocked ?? null
  const canRun = plan !== null && blocked === null && missing.length === 0 && !running

  const run = () => {
    if (!canRun) return
    setRunning(true)
    setRunError(null)
    call({ op: 'action', sessionId, action: request.action, params }, signal)
      .then(result => { setRunning(false); onDone(result) })
      .catch(error => {
        setRunning(false)
        // A failed action keeps the dialog open: git's message is the useful
        // part, and the reader may want to change a field and try again.
        if (error.name !== 'AbortError') setRunError(String(error.message ?? error))
      })
  }

  const fields = (request.fields ?? []).map((field, index) => {
    const value = values[field.name]
    const set = next => setValues(current => ({ ...current, [field.name]: next }))
    if (field.type === 'checkbox') {
      return h('label', { key: field.name, className: 'gg-field gg-field-check' },
        h('input', { type: 'checkbox', checked: value === true, onChange: event => set(event.target.checked) }),
        h('span', null, field.label),
        field.help === undefined ? null : h('span', { className: 'gg-field-help' }, field.help))
    }
    if (field.type === 'select') {
      return h('div', { key: field.name, className: 'gg-field' },
        h('span', { className: 'gg-field-label' }, field.label),
        h(CompactDropdown, {
          value,
          options: field.options ?? [],
          onChange: set,
          label: field.label,
          className: 'gg-field-select',
        }))
    }
    return h('label', { key: field.name, className: 'gg-field' },
      h('span', { className: 'gg-field-label' }, field.label),
      h('input', {
        ref: index === 0 ? firstField : undefined,
        type: 'text',
        value: typeof value === 'string' ? value : '',
        placeholder: field.placeholder,
        onChange: event => set(event.target.value),
      }),
      field.help === undefined ? null : h('span', { className: 'gg-field-help' }, field.help))
  })

  /**
   * The review block: the command, and whatever the reader must know first.
   */
  const review = missing.length > 0
    ? h('p', { className: 'gg-field-help' }, `Needs ${missing.join(' and ')}.`)
    : planError !== null
      ? h('p', { className: 'gg-error', role: 'alert' }, planError)
      : plan === null
        ? h('p', { className: 'gg-field-help' }, 'Checking…')
        : h('div', null,
          h('code', { className: 'gg-argv' }, plan.plan.summary),
          plan.warnings.length > 0
            ? h('ul', { className: 'gg-dialog-warnings' }, plan.warnings.map((line, i) => h('li', { key: i }, line)))
            : null)

  return h('div', {
    className: 'gg-modal',
    onMouseDown: event => { if (event.target === event.currentTarget) onClose() },
  }, h('form', {
    className: `gg-dialog${request.danger === true ? ' is-danger' : ''}`,
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': request.title,
    onSubmit: event => { event.preventDefault(); run() },
  },
  h('h2', { className: 'gg-dialog-title' }, request.title),
  request.note === undefined ? null : h('p', { className: 'gg-dialog-note' }, request.note),
  plan === null || plan.state === undefined ? null : h('p', { className: 'gg-dialog-state' }, describeState(plan.state)),
  fields,
  h('div', { className: 'gg-dialog-review' }, review),
  blocked === null ? null : h('p', { className: 'gg-blocked', role: 'alert' }, blocked),
  runError === null ? null : h('p', { className: 'gg-error', role: 'alert' }, runError),
  h('div', { className: 'gg-dialog-actions' },
    h('button', { type: 'button', className: 'gg-btn', onClick: onClose, disabled: running }, 'Cancel'),
    h('button', {
      type: 'submit',
      className: `gg-btn is-primary${request.danger === true ? ' is-danger' : ''}`,
      disabled: !canRun,
    }, running ? 'Running…' : 'Run'))))
}
