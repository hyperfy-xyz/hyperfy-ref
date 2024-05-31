import { Node } from './Node'

export class Script extends Node {
  constructor(entity, data) {
    super(entity, data)
    this.raw = data.raw
    this.code = data.code
    this.script = null
  }

  instantiate() {
    // evaluate uses code as a key so it only evaluates it once
    const script = this.space.scripts.resolve(this.code)
    this.script = script(this.entity.getProxy())
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
