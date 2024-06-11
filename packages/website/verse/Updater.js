import { System } from './System'

export class Updater extends System {
  constructor(world) {
    super(world)
    this.updaters = new Set()
  }

  add(fn) {
    this.updaters.add(fn)
  }

  remove(fn) {
    this.updaters.delete(fn)
  }

  update(delta) {
    for (const updater of this.updaters) {
      updater(delta)
    }
  }
}
