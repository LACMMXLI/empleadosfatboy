const net = require("node:net")

const databaseUrl = process.env.DATABASE_URL
const timeoutMs = Number(process.env.COOLIFY_DB_WAIT_TIMEOUT ?? 60000)
const intervalMs = 1500

if (!databaseUrl) {
  console.error("DATABASE_URL is required")
  process.exit(1)
}

let url
try {
  url = new URL(databaseUrl)
} catch {
  console.error("DATABASE_URL is not a valid URL")
  process.exit(1)
}

const host = url.hostname
const port = Number(url.port || 5432)
const startedAt = Date.now()

function tryConnect() {
  const socket = net.createConnection({ host, port })

  socket.once("connect", () => {
    socket.end()
    console.log(`Database is reachable at ${host}:${port}`)
  })

  socket.once("error", () => {
    socket.destroy()
    if (Date.now() - startedAt >= timeoutMs) {
      console.error(`Timed out waiting for database at ${host}:${port}`)
      process.exit(1)
    }
    setTimeout(tryConnect, intervalMs)
  })
}

tryConnect()
