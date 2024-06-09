import { System } from './System'
import { Entity } from './Entity'

export class Entities extends System {
  constructor(world) {
    super(world)
    this.schemas = new Map()
    this.instances = new Map()
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
      this.instances.forEach(entity => {
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

  addInstance(data) {
    const entity = new Entity(this.world, data)
    this.instances.set(entity.id, entity)
    return entity
  }

  addInstanceLocal(data) {
    const entity = this.addInstance(data)
    this.world.network.pushEntityUpdate(data.id, update => {
      update.add = data
    })
    return entity
  }

  getInstance(id) {
    return this.instances.get(id)
  }

  removeInstance(id) {
    const entity = this.instances.get(id)
    this.world.panels.onEntityRemoved(entity)
    entity.destroy() // todo: cleanup
    this.instances.delete(id)
  }

  removeInstanceLocal(id) {
    this.removeInstance(id)
    this.world.network.pushEntityUpdate(id, update => {
      update.remove = true
    })
  }

  countInstancesBySchema(id) {
    let n = 0
    this.instances.forEach(entity => {
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
