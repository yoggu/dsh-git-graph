import * as React from 'react'
import { EVENTS_ROUTE } from './constants.js'

/**
 * Follow the repository while this tab is the one on screen.
 *
 * The host watches the Git directory and pushes one event per burst of changes,
 * so an open graph keeps up with a commit that happened while you were looking
 * at it — which is the case a refresh-on-focus trigger cannot catch, because
 * nothing ever changed focus.
 *
 * Three rules keep this cheap and honest:
 *
 *   - The stream exists only while the tab is visible. A hidden tab costs the
 *     host nothing, the same trade VS Code Git Graph makes by stopping its file
 *     watcher while its panel is hidden.
 *   - Every push leads to a *soft* refresh, which re-renders only if the data
 *     actually differs. A burst that says nothing therefore costs nothing.
 *   - When the host reports that its watcher failed, the stream is closed rather
 *     than left to look alive; the caller is told, and falls back to refreshing
 *     when the view returns to the foreground.
 *
 * @param props - the session to follow, whether the tab is on screen, and the callbacks.
 */
export function useRepositoryWatch({ sessionId, target, visible, onChanged, onDegraded }) {
  const targetJson = target === undefined ? '' : JSON.stringify(target)
  // The callbacks change whenever the view re-renders; the stream must not be
  // torn down and rebuilt because of that.
  const changed = React.useRef(onChanged)
  const degraded = React.useRef(onDegraded)
  changed.current = onChanged
  degraded.current = onDegraded
  React.useEffect(() => {
    if (!visible || typeof EventSource !== 'function') return undefined
    const address = `${EVENTS_ROUTE}?sessionId=${encodeURIComponent(sessionId)}${targetJson ? `&target=${encodeURIComponent(targetJson)}` : ''}`
    const source = new EventSource(address)
    let abandoned = false
    let opened = false
    let failures = 0
    source.addEventListener('ready', () => {
      opened = true
      failures = 0
      // A stream that just opened may have missed changes while it was down.
      changed.current?.('opened')
    })
    source.addEventListener('changed', () => changed.current?.('changed'))
    source.addEventListener('degraded', event => {
      abandoned = true
      source.close()
      let message = 'the repository watch is unavailable'
      try {
        message = JSON.parse(event.data)?.message ?? message
      } catch {
        // A malformed payload is still a degraded watch.
      }
      degraded.current?.(message)
    })
    source.onerror = () => {
      if (abandoned) return
      // A connection that once worked is the browser's to repair: it retries on
      // its own, and a restart of the host is exactly a case it recovers from.
      if (opened) return
      // One that never opened is not coming back on its own — a host without the
      // route, or a proxy that refuses to stream. Give up instead of retrying
      // forever, and say so; the view falls back to reading when it is looked at.
      failures += 1
      if (failures >= 3) {
        abandoned = true
        source.close()
        degraded.current?.('the live channel is not answering')
      }
    }
    return () => {
      abandoned = true
      source.close()
    }
  }, [sessionId, targetJson, visible])
  React.useEffect(() => {
    if (!visible) return undefined
    // Coming back to the foreground is cheap to check and catches the case the
    // stream cannot: a browser that suspended the connection while hidden.
    const wake = () => { if (document.visibilityState !== 'hidden') changed.current?.('foreground') }
    window.addEventListener('focus', wake)
    document.addEventListener('visibilitychange', wake)
    return () => {
      window.removeEventListener('focus', wake)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [visible])
}
