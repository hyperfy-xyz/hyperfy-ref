import * as THREE from 'three'

import { Events } from './extras/Events'

const v1 = new THREE.Vector3()
const q1 = new THREE.Quaternion()

export class Entity {
  constructor(world, data) {
    this.world = world
    this.type = 'unknown'
    this.isEntity = true

    this.id = data.id
    this.props = data.props || {}
    this._state = data.state || {}
    this._stateChanges = {}

    this.vars = data.vars || {}
    this.varBinds = {}

    this.destroyed = false

    this.state = new Proxy(this._state, {
      set: (target, key, value) => {
        if (target[key] === value) return true
        this._state[key] = value
        const data = this.getUpdate()
        if (!data.state) data.state = {}
        data.state[key] = value
        return true
      },
    })
  }

  update(delta) {
    // ...
  }

  fixedUpdate(delta) {
    // ...
  }

  lateUpdate(delta) {
    // ...
  }

  finalize() {
    this._stateChanges = {}
  }

  getUpdate() {
    if (this.nextMsg?.sent) {
      this.nextMsg = null
    }
    if (!this.nextMsg) {
      this.nextMsg = {
        event: Events.ENTITY_UPDATED,
        data: {
          id: this.id,
        },
      }
      this.world.network.sendLater(this.nextMsg)
    }
    return this.nextMsg.data
  }

  createVar(id, value, onChange) {
    value = this.vars[id] || value
    if (value.isVector3) {
      this.varBinds[id] = createVector3Var(this, id, value, onChange)
    } else if (value.isQuaternion) {
      this.varBinds[id] = createQuaternionVar(this, id, value, onChange)
    } else {
      this.varBinds[id] = createPrimitiveVar(this, id, value, onChange)
    }
    return this.varBinds[id].box
  }

  destroyVar(id) {
    this.varBinds[id]?.destroy()
    this.varBinds[id] = null
    delete this.vars[id]
  }

  applyNetworkVars(vars) {
    for (const key in vars) {
      const newValue = vars[key]
      this.varBinds[key]?.applyNetworkValue(newValue)
    }
  }

  applyLocalProps(props, sync) {
    // ...
  }

  applyNetworkProps(props) {
    // ...
  }

  // there is no `applyLocalState` just do entity.state.foo = bar

  applyNetworkState(state) {
    for (const key in state) {
      this._state[key] = state[key]
      this._stateChanges[key] = state[key]
    }
  }

  destroy() {
    // override must call super.destroy()
    this.destroyed = true
    this.world.input.onEntityDestroyed(this)
  }
}

const createPrimitiveVar = (entity, id, initialValue, onChange) => {
  let dead
  let value = initialValue
  const box = {
    onChange,
    get value() {
      return value
    },
    set value(newValue) {
      const changed = value !== newValue
      if (!changed) return
      const oldValue = value
      value = newValue
      box.onChange?.(oldValue, newValue)
      const update = entity.getUpdate()
      if (!update.vars) update.vars = {}
      update.vars[id] = newValue
    },
  }
  return {
    box,
    applyNetworkValue(newValue) {
      if (dead) return
      const oldValue = value
      value = newValue
      box.onChange?.(oldValue, value)
    },
    destroy() {
      dead = true
    },
  }
}

const createVector3Var = (entity, id, initialValue, onChange) => {
  let dead
  let value = initialValue
  const box = {
    onChange,
    get value() {
      return value
    },
    set value(newValue) {
      const changed = value !== newValue
      if (!changed) return
      const oldValue = v1.copy(value)
      value.copy(newValue)
      box.onChange?.(oldValue, newValue)
      const update = entity.getUpdate()
      if (!update.vars) update.vars = {}
      if (!update.vars[id]) update.vars[id] = []
      newValue.toArray(update.vars[id])
    },
  }
  return {
    box,
    applyNetworkValue(newValue) {
      if (dead) return
      const oldValue = v1.copy(value)
      value.fromArray(newValue)
      box.onChange?.(oldValue, value)
    },
    destroy() {
      dead = true
    },
  }
}

const createQuaternionVar = (entity, id, initialValue, onChange) => {
  let dead
  let value = initialValue
  const box = {
    onChange,
    get value() {
      return value
    },
    set value(newValue) {
      if (dead) return
      const changed = value !== newValue
      if (!changed) return
      const oldValue = q1.copy(value)
      value.copy(newValue)
      box.onChange?.(oldValue, newValue)
      const update = entity.getUpdate()
      if (!update.vars) update.vars = {}
      if (!update.vars[id]) update.vars[id] = []
      newValue.toArray(update.vars[id])
    },
  }
  return {
    box,
    applyNetworkValue(newValue) {
      if (dead) return
      const oldValue = q1.copy(value)
      value.fromArray(newValue)
      box.onChange?.(oldValue, value)
    },
    destroy() {
      dead = true
    },
  }
}
