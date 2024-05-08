import { System } from './System'
import { Entity } from './Entity'

export class Entities extends System {
  constructor(space) {
    super(space)
    this.entities = new Map()
    this.dirtyNodes = []
    this.activeEntities = new Set()
  }

  add(data) {
    const entity = new Entity(this.space, data)
    this.entities.set(entity.id, entity)
    return entity
  }

  addLocal(data) {
    const entity = this.add(data)
    const delta = this.space.network.delta
    delta[data.id] = {
      add: data,
    }
    return entity
  }

  get(id) {
    return this.entities.get(id)
  }

  remove(id) {
    const entity = this.entities.get(id)
    entity.destroy() // todo: cleanup
    this.entities.delete(id)
  }

  removeLocal(id) {
    this.remove(id)
    const delta = this.space.network.delta
    if (!delta[id]) {
      delta[id] = {}
    }
    delta[id].remove = true
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
