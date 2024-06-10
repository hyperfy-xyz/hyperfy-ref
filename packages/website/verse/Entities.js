import { System } from './System'
import { Entity } from './Entity'

export class Entities extends System {
  constructor(world) {
    super(world)
    this.schemas = new Map()
    this.entities = new Map()
    this.dirtyNodes = []
    this.activeEntities = new Set()
  }

  upsertSchema(schema) {
    let existing = this.schemas.get(schema.id)
    if (existing) {
      for (const key in schema) {
        existing[key] = schema[key]
      }
    } else {
      this.schemas.set(schema.id, schema)
    }
    if (existing) {
      this.entities.forEach(entity => {
        if (entity.schema.id === schema.id) {
          entity.reload()
        }
      })
    }
    return schema
  }

  upsertSchemaLocal(schema) {
    this.upsertSchema(schema)
    this.world.network.pushSchema(schema)
    return schema
  }

  getSchema(id) {
    return this.schemas.get(id)
  }

  addEntity(data) {
    const entity = new Entity(this.world, data)
    this.entities.set(entity.id, entity)
    return entity
  }

  addEntityLocal(data) {
    const entity = this.addEntity(data)
    const packet = this.world.network.packet
    if (!packet.entities) packet.entities = {}
    if (!packet.entities[entity.id]) packet.entities[entity.id] = {}
    packet.entities[entity.id].add = data
    return entity
  }

  getEntity(id) {
    return this.entities.get(id)
  }

  removeEntity(id) {
    const entity = this.entities.get(id)
    this.world.panels.onEntityRemoved(entity)
    entity.destroy() // todo: cleanup
    this.entities.delete(id)
  }

  removeEntityLocal(id) {
    this.removeEntity(id)
    const packet = this.world.network.packet
    if (!packet.entities) packet.entities = {}
    if (!packet.entities[id]) packet.entities[id] = {}
    packet.entities[id].remove = true
  }

  countEntitysBySchema(id) {
    let n = 0
    this.entities.forEach(entity => {
      if (entity.schema.id === id) n++
    })
    return n
  }

  incActive(entity) {
    if (!entity._activeCount) {
      entity._activeCount = 0
    }
    entity._activeCount++
    this.activeEntities.add(entity)
  }

  decActive(entity, force) {
    entity._activeCount--
    if (force) entity._activeCount = 0
    if (entity._activeCount <= 0) {
      this.activeEntities.delete(entity)
    }
  }

  update(delta) {
    while (this.dirtyNodes.length) {
      this.dirtyNodes.pop().apply()
    }
    for (const entity of this.activeEntities) {
      entity.update(delta)
    }
  }

  fixedUpdate(delta) {
    for (const entity of this.activeEntities) {
      entity.fixedUpdate(delta)
    }
  }

  lateUpdate(delta) {
    for (const entity of this.activeEntities) {
      entity.lateUpdate(delta)
    }
  }

  log(...args) {
    console.log('[items]', ...args)
  }
}
