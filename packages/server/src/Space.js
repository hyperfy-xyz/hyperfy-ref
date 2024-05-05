import { SockServer } from './SockServer'

let ids = 0

export class Space {
  constructor(id) {
    this.id = id
    this.clients = new Map()
    this.entities = new Map()
    this.ready = new Promise(async resolve => {
      await this.init()
      resolve()
    })
  }

  async init() {
    // todo: fetch items etc
    //
    // todo: on error disconnect all clients
    // for (const client of this.clients) {
    //   client.disconnect()
    // }
    this.checkInterval = setInterval(() => this.checkConnections(), 10000)
  }

  onConnect = async ws => {
    const client = new Client(ws)
    client.sock.client = client
    client.sock.on('update-client', this.onUpdateClient)
    client.sock.on('update-entities', this.onUpdateEntities)
    client.sock.on('disconnect', this.onDisconnect)
    // client.sock.bind('auth', this.onAuth)
    this.clients.set(client.id, client)
    await this.ready
    const clientId = client.id
    const clients = []
    this.clients.forEach(client => {
      clients.push(client.serialize())
    })
    const entities = Array.from(this.entities.values())
    const init = {
      clientId,
      clients,
      entities,
    }
    client.sock.send('init', init)
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
        entity.state = {
          ...entity.state,
          ...entry.state,
        }
        this.broadcast(
          'update-entity',
          { id: entityId, state: entry.state },
          client
        )
      }
    }
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
    this.name = null
    this.address = null
  }

  deserialize(data) {
    if (this.id !== data.id) {
      throw new Error('client changed id')
    }
    this.id = data.id
    this.name = data.name
    this.address = data.address
    return this
  }

  serialize() {
    return {
      id: this.id,
      name: this.name,
      address: this.address,
    }
  }
}
