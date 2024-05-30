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
    const script = this.space.evaluate(this.code)
    this.script = script(this.entity.getProxy())
  }

  // init() {
  //   // TODO: we only need to evaluate code once because they return a factory function
  //   // so we should use the code as a key and only evaluate the first one
  //   const fn = this.space.compartment.evaluate(this.code)
  //   const Instance = fn(this.entity.getProxy())
  //   this.script = new Instance()
  //   this.script.init?.()
  // }

  // start() {
  //   this.script?.start?.()
  // }

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
