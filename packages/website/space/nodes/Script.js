import { Node } from './Node'

export class Script extends Node {
  constructor(entity, parent, data) {
    super(entity, parent, data)
    try {
      const Class = this.space.compartment.evaluate(data.code)
      this.script = new Class()
    } catch (err) {
      console.error(err)
    }
  }

  start() {
    if (!this.script) return
    this.unregister = this.space.scripts.register(this)
  }

  stop() {
    this.unregister?.()
  }
}
