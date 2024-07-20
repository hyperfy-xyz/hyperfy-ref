import { Events } from './extras/Events'

export class Entity {
  constructor(world, data) {
    this.world = world

    this.type = 'unknown'
    this.isEntity = true

    this.id = data.id
    this.props = data.props || {}
    this._state = data.state || {}
    this._stateChanges = {}

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
