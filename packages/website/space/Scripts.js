import { System } from './System'

export class Scripts extends System {
  constructor(space) {
    super(space)
    this.updateNodes = new Set()
  }

  register(node) {
    if (!node.script) return
    if (node.script.init) {
      node.script.init()
    }
    if (node.script.update) {
      this.updateNodes.add(node)
    }
    return () => {
      if (node.script.update) {
        this.updatesNodes.delete(node)
      }
    }
  }

  update(delta) {
    for (const node of this.updateNodes) {
      node.script.update?.(delta)
    }
  }

  log(...args) {
    console.log('[loader]', ...args)
  }

  destroy() {
    this.updateNodes.clear()
  }
}
