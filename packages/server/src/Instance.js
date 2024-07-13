import { Sock } from './Sock'
import { Events } from './Events'
import {
  getEntitiesByWorld,
  getOrCreatePermissions,
  getOrCreateWorld,
  getUserByToken,
} from './actions'

export class Instance {
  constructor({ id, onDestroy }) {
    this.id = id
    this.meta = null
    this.permissions = null
    this.schemas = new Map()
    this.entities = new Map()
    this.clients = new Map()
    this.onDestroy = onDestroy
    this.checkInterval = setInterval(() => this.checkConnections(), 10000)
    this.init()
  }

  async init() {
    let resolve
    this.ready = new Promise(r => (resolve = r))
    try {
      this.meta = await getOrCreateWorld(this.id)
      this.permissions = await getOrCreatePermissions(this.id)
      const entities = await getEntitiesByWorld(this.id)
      for (const entity of entities) {
        this.entities.set(entity.id, entity)
      }
    } catch (err) {
      console.error(err)
      this.destroy()
      return
    }
    resolve()
  }

  onConnect = async ws => {
    const client = new Client(this, ws)
    this.clients.set(client.id, client)
    client.sock.client = client
    client.sock.on(Events.AUTH, this.onAuth)
    client.sock.on('disconnect', this.onDisconnect)
  }

  onAuth = async (sock, token) => {
    await this.ready
    const client = sock.client
    const user = await getUserByToken(token)
    const permissions = await getOrCreatePermissions(`${user.id}@${this.id}`)
    client.user = user
    client.permissions = permissions
    this.clients.set(client.id, client)
    const clients = []
    this.clients.forEach(client => {
      clients.push(client.serialize())
    })
    const schemas = Array.from(this.schemas.values())
    const entities = Array.from(this.entities.values())
    const snapshot = {
      clientId: client.id,
      meta: this.meta,
      permissions: this.permissions,
      clients,
      schemas,
      entities,
    }
    client.sock.send(Events.SNAPSHOT, snapshot)
    client.sock.on(Events.CLIENT_UPDATED, this.onClientUpdated)
    client.sock.on(Events.SCHEMA_UPSERTED, this.onSchemaUpserted)
    client.sock.on(Events.ENTITY_ADDED, this.onEntityAdded)
    client.sock.on(Events.ENTITY_UPDATED, this.onEntityUpdated)
    client.sock.on(Events.ENTITY_REMOVED, this.onEntityRemoved)
    client.active = true
    this.broadcast(Events.CLIENT_ADDED, client.serialize(), client)
  }

  onClientUpdated = (sock, data) => {
    sock.client.deserialize(data)
    this.broadcast(Events.CLIENT_UPDATED, sock.client.serialize(), sock.client)
  }

  onSchemaUpserted = (sock, schema) => {
    this.schemas.set(schema.id, schema)
    this.broadcast(Events.SCHEMA_UPSERTED, schema, sock.client)
    // TODO: remove schemas when not needed so they don't build up
    // the initial state sent to new clients?
  }

  onEntityAdded = (sock, data) => {
    this.entities.set(data.id, data)
    this.broadcast(Events.ENTITY_ADDED, data, sock.client)
  }

  onEntityUpdated = (sock, data) => {
    const { id, state, props } = data
    const entity = this.entities.get(id)
    if (!entity) return
    if (state) {
      entity.state = {
        ...entity.state,
        ...state,
      }
    }
    if (props) {
      if (props.hasOwnProperty('mode')) {
        entity.mode = props.mode
      }
      if (props.hasOwnProperty('modeClientId')) {
        entity.modeClientId = props.modeClientId
      }
      if (props.hasOwnProperty('uploading')) {
        entity.uploading = props.uploading
      }
      if (props.position) {
        entity.position = props.position
      }
      if (props.quaternion) {
        entity.quaternion = props.quaternion
      }
    }
    this.broadcast(Events.ENTITY_UPDATED, data, sock.client)
  }

  onEntityRemoved = (sock, id) => {
    this.entities.delete(id)
    this.broadcast(Events.ENTITY_REMOVED, id, sock.client)
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
      const schema = this.schemas.get(entity.schemaId)
      if (schema.type === 'avatar' && entity.authority === client.id) {
        toRemove.push(entity)
      }
    })
    for (const entity of toRemove) {
      this.entities.delete(entity.id)
      this.broadcast(Events.ENTITY_REMOVED, entity.id)
    }
    // if they were editing/moving an entity, reactivate it
    this.entities.forEach(entity => {
      if (entity.modeClientId === client.id) {
        entity.mode = 'active'
        entity.modeClientId = null
        this.broadcast(Events.ENTITY_UPDATED, {
          id: entity.id,
          props: {
            mode: entity.mode,
            modeClientId: entity.modeClientId,
          },
        })
      }
    })
    this.broadcast(Events.CLIENT_REMOVED, client.id)
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

let ids = 0

class Client {
  constructor(instance, ws) {
    this.id = ++ids
    this.sock = new Sock(ws)
    this.instance = instance
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
    const worldPerms = this.instance.permissions
    const userPerms = this.permissions
    const schema = this.instance.schemas.get(entity.schemaId)
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
    const worldPerms = this.instance.permissions
    const userPerms = this.permissions
    const schema = this.instance.schemas.get(entity.schemaId)
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
    const worldPerms = this.instance.permissions
    const userPerms = this.permissions
    const schema = this.instance.schemas.get(entity.schemaId)
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
