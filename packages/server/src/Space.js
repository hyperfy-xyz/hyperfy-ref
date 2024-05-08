import { SockServer } from './SockServer'
import { api } from './api'

let ids = 0

export class Space {
  constructor(id) {
    this.id = id
    this.meta = null
    this.permissions = null
    this.entities = new Map()
    this.clients = new Map()
    this.ready = new Promise(async resolve => {
      await this.init()
      resolve()
    })
  }

  async init() {
    this.meta = await api.get(`/spaces/${this.id}`)
    this.permissions = await api.get(`/permissions/${this.id}`)
    const entities = await api.get(`/entities?spaceId=${this.id}`)
    for (const entity of entities) {
      this.entities.set(entity.id, entity)
    }
    // todo: on error disconnect all clients
    // for (const client of this.clients) {
    //   client.disconnect()
    // }
    this.checkInterval = setInterval(() => this.checkConnections(), 10000)
  }

  onConnect = async ws => {
    const client = new Client(ws)
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
    client.sock.on('entity-move-request', this.onEntityMoveRequest)
    this.broadcast('add-client', client.serialize(), client)
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
        if (props.active === true || props.active === false) {
          entity.active = props.active
        }
        if (props.moving === true || props.moving === false) {
          entity.moving = props.moving
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

  onEntityMoveRequest = async (sock, entityId) => {
    const entity = this.entities.get(entityId)
    if (entity.mover) return
    entity.mover = sock.client.id
    this.broadcast('update-entity', {
      id: entityId,
      props: { mover: entity.mover },
    })
  }

  // onAuth = async (client, token) => {
  //   const { userId } = await readToken(token)
  //   const user = await db('users').where('id', userId)
  //   const permissions = this.space.permissions[user.id] || 0
  //   client.user = {
  //     id: user.id,
  //     name: user.name,
  //     address: user.address,
  //     permissions,
  //   }
  //   this.broadcast('auth-change', {
  //     id: client.id,
  //     user,
  //   })
  //   return client.user
  // }

  // onSomeMethod = (client, arg1) => {
  //   // ...
  // }

  onDisconnect = sock => {
    const client = sock.client
    if (!this.clients.has(client.id)) {
      return // they never authed
    }
    this.clients.delete(client.id)
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
    this.broadcast('remove-client', client.id)
  }

  broadcast(event, data, skipClient) {
    this.clients.forEach(client => {
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
  }
}

class Client {
  constructor(ws) {
    this.sock = new SockServer(ws)
    this.id = ++ids
    this.user = null
    this.permissions = null
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
