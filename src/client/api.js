import { ROUTE } from './constants.js'

/** Ask the host half one question. */
export async function call(request, signal) {
  const response = await fetch(ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  })
  const payload = await response.json().catch(() => null)
  if (payload === null) throw new Error('git-graph: the host sent no answer')
  if (payload.ok !== true) throw new Error(payload.error ?? 'git-graph: the request failed')
  return payload.result
}
