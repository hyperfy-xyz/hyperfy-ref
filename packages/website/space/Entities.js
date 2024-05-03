import { System } from './System'
import { Entity } from './Entity'

export class Entities extends System {
  constructor(space) {
    super(space)
    this.entities = new Map()
    this.dirtyNodes = []
  }

  update(delta) {
    while (this.dirtyNodes.length) {
      this.dirtyNodes.pop().apply()
    }
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

  log(...args) {
    console.log('[items]', ...args)
  }
}
