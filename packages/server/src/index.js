import './sourceMapSupport'
import 'dotenv-flow/config'
import http from 'http'
import express from 'express'
import cors from 'cors'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import { WebSocketServer } from 'ws'
import { World } from './World'
import { api } from './api'

const prod = process.env.NODE_ENV === 'production'

const port = process.env.PORT
if (!port) throw new Error('port not set')

const app = express()
const server = http.createServer(app)
const wss = new WebSocketServer({ noServer: true })

app.use(cors())
app.use(compression())
app.use(cookieParser())
app.use(express.json())

app.use('/assets', express.static('assets'))

app.use('/api', api)

const worlds = new Map()
server.on('upgrade', (req, sock, head) => {
  const url = new URL(req.url, 'http://supaverse')
  const pathname = url.pathname
  const match = /^\/worlds\/([^\/]+)\/?$/.exec(pathname)
  let id = match?.[1] || null
  if (!id) return sock.destroy()
  id = id.toLowerCase()
  wss.handleUpgrade(req, sock, head, ws => {
    let world = worlds.get(id)
    if (!world) {
      world = new World({
        id,
        onDestroy: () => {
          worlds.delete(id)
        },
      })
      worlds.set(id, world)
    }
    world.onConnect(ws)
  })
})

server.listen(port, () => {
  console.log(`listening on port ${port}`)
})
