import { SockServer } from './SockServer'
import { api } from './api'

let ids = 0

export class Space {
  constructor(id, onDestroy) {
    this.id = id
    this.onDestroy = onDestroy
    this.meta = null
    this.permissions = null
    this.entities = new Map()
    this.clients = new Map()
    this.checkInterval = setInterval(() => this.checkConnections(), 10000)
    this.ready = new Promise(async resolve => {
      await this.init()
      resolve()
    })
  }

  async init() {
    try {
      this.meta = await api.get(`/spaces/${this.id}`)
      this.permissions = await api.get(`/permissions/${this.id}`)
      const entities = await api.get(`/entities?spaceId=${this.id}`)
      for (const entity of entities) {
        this.entities.set(entity.id, entity)
      }
    } catch (err) {
      console.error(err)
      this.destroy()
    }
  }

  onConnect = async ws => {
    const client = new Client(ws)
    this.clients.set(client.id, client)
    client.sock.client = client
    client.sock.on('auth', this.onAuth)
    client.sock.on('disconnect', this.onDisconnect)
  }

  onAuth = async (sock, token) => {
    await this.ready
    const client = sock.client
    const user = await api.get(`/user-by-token?token=${token}`)
    const permissions = await api.get(`/permissions/${user.id}@${this.id}`)
    client.user = user
    client.permissions = permissions
    this.clients.set(client.id, client)
    const clients = []
    this.clients.forEach(client => {
      clients.push(client.serialize())
    })
    const entities = Array.from(this.entities.values())
    const init = {
      clientId: client.id,
      meta: this.meta,
      permissions: this.permissions,
      clients,
      entities,
    }
    client.sock.send('init', init)
    client.sock.on('update-client', this.onUpdateClient)
    client.sock.on('update-entities', this.onUpdateEntities)
    client.sock.on('entity-mode-request', this.onEntityModeRequest)
    this.broadcast('add-client', client.serialize(), client)
    client.active = true
  }

  onUpdateClient = (sock, data) => {
    sock.client.deserialize(data)
  }

  onUpdateEntities = (sock, delta) => {
    const client = sock.client
    for (const entityId in delta) {
      const entry = delta[entityId]
      if (entry.remove) {
        this.entities.delete(entityId)
        this.broadcast('remove-entity', entityId, client)
        return
      }
      if (entry.add) {
        this.entities.set(entityId, entry.add)
        this.broadcast('add-entity', entry.add, client)
      }
      if (entry.state) {
        const entity = this.entities.get(entityId)
        const state = entry.state
        entity.state = {
          ...entity.state,
          ...state,
        }
        this.broadcast('update-entity', { id: entityId, state }, client)
      }
      if (entry.props) {
        const entity = this.entities.get(entityId)
        const props = entry.props
        if (props.mode) {
          entity.mode = props.mode
        }
        if (props.modeClientId) {
          entity.modeClientId = props.modeClientId
        }
        if (props.position) {
          entity.position = props.position
        }
        if (props.quaternion) {
          entity.quaternion = props.quaternion
        }
        this.broadcast('update-entity', { id: entityId, props }, client)
      }
    }
  }

  onEntityModeRequest = async (sock, { entityId, mode }) => {
    const entity = this.entities.get(entityId)
    if (entity.mode !== 'active') return
    entity.mode = mode
    entity.modeClientId = sock.client.id
    this.broadcast('update-entity', {
      id: entityId,
      props: {
        mode: entity.mode,
        modeClientId: entity.modeClientId,
      },
    })
  }

  onDisconnect = sock => {
    const client = sock.client
    if (!this.clients.has(client.id)) {
      return // they never authed
    }
    this.clients.delete(client.id)
    // remove clients avatar
    const toRemove = []
    this.entities.forEach(entity => {
      if (entity.type === 'avatar' && entity.authority === client.id) {
        toRemove.push(entity)
      }
    })
    for (const entity of toRemove) {
      this.entities.delete(entity.id)
      this.broadcast('remove-entity', entity.id)
    }
    // if they were editing/moving an entity, reactivate it
    this.entities.forEach(entity => {
      if (entity.modeClientId === client.id) {
        entity.mode = 'active'
        entity.modeClientId = null
        this.broadcast('update-entity', {
          id: entity.id,
          props: {
            mode: 'active',
            modeClientId: null,
          },
        })
      }
    })
    this.broadcast('remove-client', client.id)
  }

  broadcast(event, data, skipClient) {
    this.clients.forEach(client => {
      if (!client.active) return
      if (client === skipClient) return
      client.sock.send(event, data)
    })
  }

  checkConnections() {
    // see: https://www.npmjs.com/package/ws#how-to-detect-and-close-broken-connections
    const dead = []
    this.clients.forEach(client => {
      if (!client.sock.alive) {
        dead.push(client)
      } else {
        client.sock.alive = false
        client.sock.ws.ping()
      }
    })
    dead.forEach(client => client.sock.disconnect())
  }

  destroy() {
    clearInterval(this.checkInterval)
    this.clients.forEach(client => {
      client.sock.disconnect()
    })
    this.onDestroy()
  }
}

class Client {
  constructor(ws) {
    this.sock = new SockServer(ws)
    this.id = ++ids
    this.user = null
    this.permissions = null
    this.active = false
  }

  deserialize(data) {
    if (this.id !== data.id) {
      throw new Error('client changed id')
    }
    this.id = data.id
    this.user = data.users
    this.permissions = data.permissions
    return this
  }

  serialize() {
    return {
      id: this.id,
      user: this.user,
      permissions: this.permissions,
    }
  }
}
