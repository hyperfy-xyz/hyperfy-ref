import { SockServer } from './SockServer'
import { api } from './api'
import { avatarSchema } from './avatarSchema'

let ids = 0

export class World {
  constructor(id, onDestroy) {
    this.id = id
    this.onDestroy = onDestroy
    this.meta = null
    this.permissions = null
    this.schemas = new Map()
    this.schemas.set('$avatar', avatarSchema)
    this.instances = new Map()
    this.clients = new Map()
    this.checkInterval = setInterval(() => this.checkConnections(), 10000)
    this.ready = new Promise(async resolve => {
      await this.init()
      resolve()
    })
  }

  async init() {
    try {
      this.meta = await api.get(`/worlds/${this.id}`)
      this.permissions = await api.get(`/permissions/${this.id}`)

      // temp
      // this.permissions.prototypeMove = false
      // this.permissions.prototypeEdit = false
      // this.permissions.prototypeDestroy = false

      const entities = await api.get(`/entities?worldId=${this.id}`)
      for (const entity of entities) {
        this.instances.set(entity.id, entity)
      }
    } catch (err) {
      console.error(err)
      this.destroy()
    }
  }

  onConnect = async ws => {
    const client = new Client(this, ws)
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
    const schemas = Array.from(this.schemas.values())
    const instances = Array.from(this.instances.values())
    const init = {
      clientId: client.id,
      meta: this.meta,
      permissions: this.permissions,
      clients,
      schemas,
      instances,
    }
    client.sock.send('init', init)
    client.sock.on('update-client', this.onUpdateClient) // todo: move to 'update' event
    client.sock.on('packet', this.onPacket)
    client.sock.on('entity-mode-request', this.onEntityModeRequest)
    this.broadcast('add-client', client.serialize(), client)
    client.active = true
  }

  onUpdateClient = (sock, data) => {
    sock.client.deserialize(data)
  }

  onPacket = (sock, data) => {
    const client = sock.client
    for (const schemaId in data.schemas) {
      const schema = data.schemas[schemaId]
      this.schemas.set(schema.id, schema)
      this.broadcast('upsert-schema', schema, client)
      // TODO: remove schemas when not needed so they don't build up
      // initial state sent to new clients?
    }
    for (const entityId in data.entities) {
      const update = data.entities[entityId]
      if (update.remove) {
        this.instances.delete(entityId)
        this.broadcast('remove-entity', entityId, client)
        return
      }
      if (update.add) {
        this.instances.set(entityId, update.add)
        this.broadcast('add-entity', update.add, client)
      }
      if (update.state) {
        const entity = this.instances.get(entityId)
        if (!entity) return
        const state = update.state
        entity.state = {
          ...entity.state,
          ...state,
        }
        this.broadcast('update-entity', { id: entityId, state }, client)
      }
      if (update.props) {
        const entity = this.instances.get(entityId)
        if (!entity) return
        const props = update.props
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
    const entity = this.instances.get(entityId)
    if (entity.mode !== 'active') return
    if (mode === 'moving' && !sock.client.canMoveEntity(entity)) {
      return
    }
    if (mode === 'editing' && !sock.client.canEditEntity(entity)) {
      return
    }
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
    this.instances.forEach(entity => {
      const schema = this.schemas.get(entity.schemaId)
      if (schema.type === 'avatar' && entity.authority === client.id) {
        toRemove.push(entity)
      }
    })
    for (const entity of toRemove) {
      this.instances.delete(entity.id)
      this.broadcast('remove-entity', entity.id)
    }
    // if they were editing/moving an entity, reactivate it
    this.instances.forEach(entity => {
      if (entity.modeClientId === client.id) {
        entity.mode = 'active'
        entity.modeClientId = null
        this.broadcast('update-entity', {
          id: entity.id,
          props: {
            mode: entity.mode,
            modeClientId: entity.modeClientId,
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
  constructor(world, ws) {
    this.world = world
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
    this.user = data.user
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

  canMoveEntity(entity) {
    const userId = this.user.id
    const worldPerms = this.world.permissions
    const userPerms = this.permissions
    const schema = this.world.schemas.get(entity.schemaId)
    if (schema.type === 'prototype') {
      // if you created it you can move it if you still have the create permission
      if (entity.creator === userId) {
        return worldPerms.prototypeCreate || userPerms.prototypeCreate
      }
      // otherwise you can only move if you have move permission
      return worldPerms.prototypeMove || userPerms.prototypeMove
    }
    if (schema.type === 'item') {
      return worldPerms.itemMove || userPerms.itemMove
    }
    return false
  }

  canEditEntity(entity) {
    const userId = this.user.id
    const worldPerms = this.world.permissions
    const userPerms = this.permissions
    const schema = this.world.schemas.get(entity.schemaId)
    if (schema.type === 'prototype') {
      // if you created it you can edit it if you still have the create permission
      if (entity.creator === userId) {
        return worldPerms.prototypeCreate || userPerms.prototypeCreate
      }
      // otherwise you can only edit if you have edit permission
      return worldPerms.prototypeEdit || userPerms.prototypeEdit
    }
    return false
  }

  canDestroyEntity(entity) {
    const userId = this.user.id
    const worldPerms = this.world.permissions
    const userPerms = this.permissions
    const schema = this.world.schemas.get(entity.schemaId)
    if (schema.type === 'prototype') {
      // if you created it you can destroy it if you still have the create permission
      if (entity.creator === userId) {
        return worldPerms.prototypeCreate || userPerms.prototypeCreate
      }
      // otherwise you can only destroy if you have destroy permission
      return worldPerms.prototypeDestroy || userPerms.prototypeDestroy
    }
    return false
  }
}