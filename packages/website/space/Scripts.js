import { System } from './System'

export class Scripts extends System {
  constructor(space) {
    super(space)
    this.entities = new Set()
  }

  register(entity) {
    this.entities.add(entity)
  }

  unregister(entity) {
    this.entities.delete(entity)
  }

  update(delta) {
    for (const entity of this.entities) {
      for (const node of entity.scripts) {
        try {
          node.script.update?.(delta)
        } catch (err) {
          console.error(err)
        }
      }
    }
  }

  fixedUpdate(delta) {
    for (const entity of this.entities) {
      for (const node of entity.scripts) {
        try {
          node.script.fixedUpdate?.(delta)
        } catch (err) {
          console.error(err)
        }
      }
    }
  }

  lateUpdate(delta) {
    for (const entity of this.entities) {
      for (const node of entity.scripts) {
        try {
          node.script.lateUpdate?.(delta)
        } catch (err) {
          console.error(err)
        }
      }
      entity.stateChanges = null
    }
  }

  log(...args) {
    console.log('[scripts]', ...args)
  }

  destroy() {
    this.entities.clear()
  }
}
