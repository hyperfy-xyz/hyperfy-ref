import { Node } from './Node'

export class Group extends Node {
  constructor(entity, data) {
    super(entity, data)
    this.isGroup = true
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
}
