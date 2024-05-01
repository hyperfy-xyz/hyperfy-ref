import { System } from './System'

export class Scripts extends System {
  constructor(space) {
    super(space)
    this.updateNodes = new Set()
    this.fixedUpdateNodes = new Set()
    this.lateUpdateNodes = new Set()
  }

  register(node) {
    if (node.script?.update) {
      this.updateNodes.add(node)
    }
    if (node.script?.fixedUpdate) {
      this.fixedUpdateNodes.add(node)
    }
    if (node.script?.lateUpdate) {
      this.lateUpdateNodes.add(node)
    }
  }

  unregister(node) {
    this.updateNodes.delete(node)
    this.fixedUpdateNodes.delete(node)
    this.lateUpdateNodes.delete(node)
  }

  update(delta) {
    for (const node of this.updateNodes) {
      try {
        node.script.update?.(delta)
      } catch (err) {
        console.error(err)
      }
    }
  }

  fixedUpdate(delta) {
    for (const node of this.fixedUpdateNodes) {
      try {
        node.script.fixedUpdate?.(delta)
      } catch (err) {
        console.error(err)
      }
    }
  }

  lateUpdate(delta) {
    for (const node of this.lateUpdateNodes) {
      try {
        node.script.lateUpdate?.(delta)
      } catch (err) {
        console.error(err)
      }
    }
  }

  log(...args) {
    console.log('[scripts]', ...args)
  }

  destroy() {
    this.updateNodes.clear()
    this.fixedUpdateNodes.clear()
    this.lateUpdateNodes.clear()
  }
}
