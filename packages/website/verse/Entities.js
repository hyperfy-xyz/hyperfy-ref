import { System } from './System'
import { Entity } from './Entity'

import { Events } from './extras/Events'
import { Player } from './Player'
import { Object } from './Object'

const Types = {
  player: Player,
  object: Object,
}

export class Entities extends System {
  constructor(world) {
    super(world)
    this.schemas = new Map()
    this.entities = new Map()
    this.dirtyNodes = new Set()
    this.hot = new Set()
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
        if (entity.schema?.id === schema.id) {
          entity.reload()
        }
      })
    }
    return schema
  }

  upsertSchemaLocal(schema) {
    this.upsertSchema(schema)
    this.world.network.send(Events.SCHEMA_UPSERTED, schema)
    return schema
  }

  getSchema(id) {
    return this.schemas.get(id)
  }

  addEntity(data) {
    const Entity = Types[data.type]
    const entity = new Entity(this.world, data)
    this.entities.set(entity.id, entity)
    return entity
  }

  addEntityLocal(data) {
    const entity = this.addEntity(data)
    this.world.network.send(Events.ENTITY_ADDED, data)
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
    this.world.network.send(Events.ENTITY_REMOVED, id)
  }

  countEntitysBySchema(id) {
    let n = 0
    this.entities.forEach(entity => {
      if (entity.schema?.id === id) n++
    })
    return n
  }

  setHot(entity, isHot) {
    if (isHot) {
      this.hot.add(entity)
    } else {
      this.hot.delete(entity)
    }
  }

  project() {
    for (const node of this.dirtyNodes) {
      node.apply()
    }
    this.dirtyNodes.clear()
  }

  fixedUpdate(delta) {
    for (const entity of this.hot) {
      entity.fixedUpdate(delta)
    }
  }

  update(delta) {
    // this.project()
    for (const entity of this.hot) {
      entity.update(delta)
    }
  }

  lateUpdate(delta) {
    this.project()
    for (const entity of this.hot) {
      entity.lateUpdate(delta)
    }
    this.project()
  }

  log(...args) {
    console.log('[items]', ...args)
  }
}
