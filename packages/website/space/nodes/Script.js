import { Node } from './Node'

export class Script extends Node {
  constructor(entity, data) {
    super(entity, data)
    this.code = data.code
    this.script = null
  }

  init() {
    const fn = this.space.compartment.evaluate(this.code)
    const Instance = fn(this.entity.getProxy())
    this.script = new Instance()
    this.script.init?.()
  }

  start() {
    this.script?.start?.()
  }

  onState(newState) {
    this.script?.onState?.(newState)
  }

  getProxy() {
    if (!this.proxy) {
      const proxy = {
        ...super.getProxy(),
      }
      this.proxy = proxy
    }
    return this.proxy
  }

  destroy() {
    this.script = null
  }
}
