import './sourceMapSupport'
import 'dotenv-flow/config'
import http from 'http'
import express from 'express'
import httpProxy from 'http-proxy'

const prod = process.env.NODE_ENV === 'production'

const port = process.env.PORT
if (!port) throw new Error('port not set')

const app = express()
const server = http.createServer(app)
const proxy = httpProxy.createProxyServer({})

server.on('upgrade', (req, sock, head) => {
  const url = new URL(req.url, 'http://supaverse')
  const pathname = url.pathname
  const match = /^\/space\/([^\/]+)\/?$/.exec(pathname)
  let id = match?.[1] || null
  if (!id) return error(sock, 'id_required')
  id = id.toLowerCase()
  const valid = /^[a-z0-9-]+$/.test(id)
  if (!valid) return error(sock, 'id_invalid')
  const params = Object.fromEntries([...url.searchParams])
  if (prod) {
    // TODO: fly-replay
  } else {
    // dev proxies to server
    proxy.ws(req, sock, head, {
      target: process.env.DEV_SERVER,
    })
  }
})

server.listen(port, () => {
  console.log(`listening on port ${port}`)
})

const error = (sock, code) => {
  sock.write(
    'HTTP/1.1 400 Bad Request\r\n' +
      'Content-Type: text/plain\r\n' +
      'Content-Length: ' +
      Buffer.byteLength(code) +
      '\r\n' +
      'Connection: close\r\n\r\n' +
      code
  )
  sock.destroy()
  console.log(`websocket rejected: ${code}`)
}
