import React, { useEffect, useState } from 'react'

export function readRoute() {
  const raw = location.hash.slice(1) || '/home'
  const [path, query = ''] = raw.split('?')
  return {
    path: '/' + path.replace(/^\//, ''),
    params: new URLSearchParams(query),
    hash: location.hash,
  }
}

const notify = () => window.dispatchEvent(new Event('prism-route'))

export function useRoute() {
  const [route, setRoute] = useState(readRoute)
  useEffect(() => {
    const changed = () => setRoute(readRoute())
    window.addEventListener('prism-route', changed)
    window.addEventListener('popstate', changed)
    window.addEventListener('hashchange', changed)
    const click = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest('a')
      const href = anchor?.getAttribute('href')
      if (
        !href?.startsWith('#') ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return
      event.preventDefault()
      history.replaceState({ ...history.state, scrollY: window.scrollY }, '', location.href)
      history.pushState({ scrollY: 0, from: location.hash }, '', href)
      notify()
    }
    document.addEventListener('click', click)
    return () => {
      window.removeEventListener('prism-route', changed)
      window.removeEventListener('popstate', changed)
      window.removeEventListener('hashchange', changed)
      document.removeEventListener('click', click)
    }
  }, [])
  useEffect(() => {
    const title = route.path.startsWith('/fund/')
      ? 'ETF detail'
      : route.path.startsWith('/security/')
        ? 'Security detail'
        : route.path === '/home'
          ? 'Portfolio'
          : route.path === '/data'
            ? 'Data & connections'
            : route.path.slice(1).replace(/^./, (letter) => letter.toUpperCase())
    document.title = `${title} · Portfolio Prism`
    const desired = history.state?.scrollY ?? 0
    const heading = document.querySelector<HTMLElement>('h1')
    heading?.focus({ preventScroll: true })
    window.scrollTo(0, desired)
    // Async data can make the previous scroll position available after the route mounts.
    const observer = new ResizeObserver(() => window.scrollTo(0, desired))
    if (desired > 0) observer.observe(document.body)
    const stop = () => observer.disconnect()
    window.addEventListener('wheel', stop, { once: true })
    window.addEventListener('pointerdown', stop, { once: true })
    const timeout = setTimeout(stop, 3000)
    return () => {
      observer.disconnect()
      clearTimeout(timeout)
      window.removeEventListener('wheel', stop)
      window.removeEventListener('pointerdown', stop)
    }
    // Re-selecting the current destination must also move focus out of a closed menu.
  }, [route])
  return route
}

export function useRouteValue(key: string, fallback: string) {
  const [value, setValue] = useState(() => readRoute().params.get(key) ?? fallback)
  useEffect(() => {
    const changed = () => setValue(readRoute().params.get(key) ?? fallback)
    window.addEventListener('popstate', changed)
    return () => window.removeEventListener('popstate', changed)
  }, [key, fallback])
  return [
    value,
    (next: string) => {
      const route = readRoute()
      if (next === fallback) route.params.delete(key)
      else route.params.set(key, next)
      history.replaceState(
        { ...history.state, scrollY: window.scrollY },
        '',
        `#${route.path}${route.params.size ? '?' + route.params : ''}`
      )
      setValue(next)
    },
  ] as const
}

export function entityHref(path: string) {
  const separator = path.includes('?') ? '&' : '?'
  return `#${path}${separator}from=${encodeURIComponent(location.hash || '#/home')}`
}

export function ReturnLink() {
  const from = readRoute().params.get('from')
  const safe =
    from?.startsWith('#/') || from?.match(/^#(portfolio|development|breakdown|data|explore)(\?|$)/)
  return (
    <a
      className="return-link"
      href={safe ? from! : '#/home'}
      onClick={(event) => {
        if (history.state?.from) {
          event.preventDefault()
          history.back()
        }
      }}
    >
      ← Back to investigation
    </a>
  )
}
