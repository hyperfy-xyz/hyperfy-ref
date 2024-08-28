import { Node } from './Node'

export class Group extends Node {
  constructor(entity, data) {
    super(entity, data)
    this.name = 'group'
    this.isGroup = true
  }

  copy(source, recursive) {
    super.copy(source, recursive)
    return this
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
