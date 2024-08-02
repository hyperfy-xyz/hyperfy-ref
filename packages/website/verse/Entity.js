import * as THREE from 'three'

import { Events } from './extras/Events'
import { Vector3Enhanced } from './extras/Vector3Enhanced'

const v1 = new THREE.Vector3()
const q1 = new THREE.Quaternion()

export class Entity {
  constructor(world, props) {
    this.world = world

    this.networkProps = {}
    this.dirtyProps = new Set()

    this.id = props.id
    this.type = props.type

    // if set, server destroys when owner leaves
    this.ownerId = props.ownerId

    this.destroyed = false
  }

  createNetworkProp(key, value, onChange) {
    let prop
    if (value?.isVector3Enhanced) {
      prop = createVector3NetworkProp(this, key, value, onChange)
    } else if (value?.isVector3) {
      prop = createVector3NetworkProp(this, key, new Vector3Enhanced().copy(value), onChange) // prettier-ignore
    } else if (value?.isQuaternion) {
      prop = createQuaternionNetworkProp(this, key, value, onChange)
    } else {
      prop = createPrimitiveNetworkProp(this, key, value, onChange)
    }
    this.networkProps[key] = prop
    return prop.box
  }

  sendNetworkUpdate() {
    const data = {
      id: this.id,
    }
    for (const prop of this.dirtyProps) {
      data[prop.key] = prop.serialize()
    }
    this.dirtyProps.clear()
    this.world.network.send(Events.ENTITY_UPDATED, data)
  }

  receiveNetworkUpdate(data) {
    for (const key in data) {
      if (key === 'id') continue
      const prop = this.networkProps[key]
      if (!prop) continue
      prop.deserialize(data[key])
    }
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

  getActions(add) {
    // ...
  }

  destroy() {
    // overrides MUST call super.destroy()
    this.world.input.onEntityDestroyed(this)
    this.destroyed = true
  }
}

function createPrimitiveNetworkProp(entity, key, value, onChange) {
  let oldValue = value
  const prop = {
    key,
    value,
    box: {
      get value() {
        return prop.value
      },
      set value(newValue) {
        if (oldValue === newValue) return
        prop.value = newValue
        prop.box.onChange?.(newValue, oldValue)
        oldValue = newValue
        entity.dirtyProps.add(prop)
        entity.world.network.queueEntity(entity)
      },
      onChange,
    },
    serialize() {
      return prop.value
    },
    deserialize(data) {
      const oldValue = prop.value
      const newValue = data
      prop.value = newValue
      prop.box.onChange?.(newValue, oldValue)
    },
  }
  return prop
}

function createVector3NetworkProp(entity, key, value, onChange) {
  let deserializing
  const oldValue = value.clone()
  const prop = {
    key,
    value,
    box: {
      get value() {
        return prop.value
      },
      set value(newValue) {
        if (oldValue.equals(newValue)) return
        prop.value.copy(newValue)
        prop.box.onChange?.(prop.value, oldValue)
        oldValue.copy(newValue)
        entity.dirtyProps.add(prop)
        entity.world.network.queueEntity(entity)
      },
      onChange,
    },
    serialize() {
      return prop.value.toArray()
    },
    deserialize(data) {
      deserializing = true
      oldValue.copy(prop.value)
      const newValue = prop.value.fromArray(data)
      prop.box.onChange?.(newValue, oldValue)
      deserializing = false
    },
  }
  prop.value._onChange(() => {
    if (deserializing) return
    if (oldValue.equals(value)) return
    prop.box.onChange?.(prop.value, oldValue)
    oldValue.copy(prop.value)
    entity.dirtyProps.add(prop)
    entity.world.network.queueEntity(entity)
  })
  return prop
}

function createQuaternionNetworkProp(entity, key, value, onChange) {
  let deserializing
  const oldValue = value.clone()
  const prop = {
    key,
    value,
    box: {
      get value() {
        return prop.value
      },
      set value(newValue) {
        if (oldValue.equals(newValue)) return
        prop.value.copy(newValue)
        prop.box.onChange?.(prop.value, oldValue)
        oldValue.copy(newValue)
        entity.dirtyProps.add(prop)
        entity.world.network.queueEntity(entity)
      },
      onChange,
    },
    serialize() {
      return prop.value.toArray()
    },
    deserialize(data) {
      deserializing = true
      oldValue.copy(prop.value)
      const newValue = prop.value.fromArray(data)
      prop.box.onChange?.(newValue, oldValue)
      deserializing = false
    },
  }
  prop.value._onChange(() => {
    if (deserializing) return
    if (oldValue.equals(value)) return
    prop.box.onChange?.(prop.value, oldValue)
    oldValue.copy(prop.value)
    entity.dirtyProps.add(prop)
    entity.world.network.queueEntity(entity)
  })
  return prop
}
