import './sourceMapSupport'
import 'dotenv-flow/config'
import http from 'http'
import express from 'express'
import { WebSocketServer } from 'ws'
import { World } from './World'

const prod = process.env.NODE_ENV === 'production'

const port = process.env.PORT
if (!port) throw new Error('port not set')

const app = express()
const server = http.createServer(app)
const wss = new WebSocketServer({ noServer: true })

const worlds = new Map()

server.on('upgrade', (req, sock, head) => {
  wss.handleUpgrade(req, sock, head, ws => {
    const url = new URL(req.url, 'http://supaverse')
    const pathname = url.pathname
    const match = /^\/world\/([^\/]+)\/?$/.exec(pathname)
    let id = match?.[1] || null
    if (!id) return ws.close()
    id = id.toLowerCase()
    let world = worlds.get(id)
    if (!world) {
      world = new World(id, () => {
        worlds.delete(id)
      })
      worlds.set(id, world)
    }
    world.onConnect(ws)
  })
})

server.listen(port, () => {
  console.log(`listening on port ${port}`)
})
