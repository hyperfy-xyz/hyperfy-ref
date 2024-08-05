import { System } from './System'

const items = new Array(4 * 6).fill(null)

export class Backpack extends System {
  constructor(world) {
    super(world)
    this.items = items
    // this.items = new Array(4 * 6).fill(null)
    this.listeners = []
  }

  take(entity) {
    const idx = this.items.findIndex(item => !item)
    this.items[idx] = entity.serialize()
    this.world.entities.removeEntityLocal(entity.id)
    this.notify()
  }

  use(item) {
    if (!item) return
    const idx = this.items.indexOf(item)
    this.items[idx] = null
    this.world.entities.addEntityLocal({
      ...item,
      id: this.world.network.makeId(),
      mode: 'moving',
      modeClientId: this.world.network.client.id,
      position: [0, -1000, 0],
    })
    this.notify()
  }

  watch(callback) {
    this.listeners.push(callback)
    return () => {
      const idx = this.listeners.indexOf(callback)
      this.listeners.splice(idx, 1)
    }
  }

  notify() {
    for (const callback of this.listeners) {
      callback()
    }
  }
}
