export class Entity {
  constructor(world, props) {
    this.world = world

    this.networkIds = 0
    this.networkProps = {}

    this.id = props.id
    this.type = props.type

    this.authority = this.createNetworkProp(data.authority)
  }

  createNetworkProp(value, onChange) {
    // todo: create special for vector3/quaternion?
    const self = this
    const prop = {
      id: this.networkIds++,
      value,
      box: {
        get value() {
          return prop.value
        },
        set value(newValue) {
          const oldValue = prop.value
          if (oldValue === newValue) return
          prop.value = newValue
          prop.box.onChange?.(newValue, oldValue)
          self.world.network.queueEntityProp(self, prop)
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
    this.networkProps[prop.id] = prop
    return prop.box
  }

  applyNetworkUpdate(update) {
    for (const id in update) {
      const prop = this.networkProps[id]
      if (!prop) continue
      const data = update[id]
      prop.deserialize(data)
    }
  }
}

export class Object extends Entity {
  constructor(world, props) {
    super(world, props)

    this.createNetworkProp(this, 'authority')
  }
}
