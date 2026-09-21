/** One host lifecycle entrypoint; offline previews never start scheduled work. */
export function startAutomaticRefresh(service: {
  connections?: { refreshOtherConnections(): void }
  restore(): unknown
  sync(): unknown
  issuerRefresh: { refresh(automatic: boolean): unknown }
}, enabled: boolean): () => void {
  if (!enabled) return () => {}
  service.restore()
  service.connections?.refreshOtherConnections()
  service.issuerRefresh.refresh(true)
  const timer = setInterval(() => {
    service.sync()
    service.connections?.refreshOtherConnections()
    service.issuerRefresh.refresh(true)
  }, 15 * 60 * 1000)
  return () => clearInterval(timer)
}
