import { serveExample } from './host'
const demo = await serveExample()
console.log(`Synthetic contributor example: ${demo.url}
Temporary SQLite only; no credentials or remote requests. Ctrl+C removes this run's data.`)
let closing = false
const close = async () => { if (closing) return; closing = true; await demo.close(); process.exit(0) }
process.on('SIGINT', () => { void close() }); process.on('SIGTERM', () => { void close() })
