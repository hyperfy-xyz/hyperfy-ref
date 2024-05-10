import './sourceMapSupport'
import 'dotenv-flow/config'
import http from 'http'
import express from 'express'
import { WebSocketServer } from 'ws'
import { Space } from './Space'

const prod = process.env.NODE_ENV === 'production'

const port = process.env.PORT
if (!port) throw new Error('port not set')

const app = express()
const server = http.createServer(app)
const wss = new WebSocketServer({ noServer: true })

const spaces = new Map()

server.on('upgrade', (req, sock, head) => {
  wss.handleUpgrade(req, sock, head, ws => {
    const url = new URL(req.url, 'http://supaverse')
    const pathname = url.pathname
    const match = /^\/space\/([^\/]+)\/?$/.exec(pathname)
    let id = match?.[1] || null
    if (!id) return ws.close()
    id = id.toLowerCase()
    let space = spaces.get(id)
    if (!space) {
      space = new Space(id, () => {
        spaces.delete(id)
      })
      spaces.set(id, space)
    }
    space.onConnect(ws)
  })
})

server.listen(port, () => {
  console.log(`listening on port ${port}`)
})
