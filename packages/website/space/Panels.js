import { System } from './System'

export class Panels extends System {
  constructor(space) {
    super(space)
    this.panel = null
    this.listeners = new Set()
  }

  inspect(entity) {
    if (entity.type === 'prototype') {
      this.panel = {
        type: 'inspect-prototype',
        entity,
        close: () => {
          this.panel = null
          this.emit()
        },
      }
    }
    if (entity.type === 'avatar') {
      const user = this.space.network.findUser(entity.creator)
      const me = this.space.network.client.user
      if (user.id === me.id) {
        this.panel = {
          type: 'inspect-self',
          entity,
          close: () => {
            this.panel = null
            this.emit()
          },
        }
      } else {
        this.panel = {
          type: 'inspect-avatar',
          entity,
          close: () => {
            this.panel = null
            this.emit()
          },
        }
      }
    }
    this.emit()
  }

  edit(entity) {
    this.panel = {
      type: 'edit',
      entity,
      close: () => {
        entity.mode = 'active'
        entity.modeClientId = null
        entity.checkMode()
        const delta = this.space.network.getEntityDelta(entity.id)
        if (!delta.props) delta.props = {}
        delta.props.mode = 'active'
        delta.props.modeClientId = null
        this.panel = null
        this.emit()
      },
    }
    this.emit()
  }

  onEntityRemoved(entity) {
    if (this.panel?.entity === entity) {
      this.panel.close()
    }
  }

  emit() {
    for (const listener of this.listeners) {
      listener()
    }
  }

  subscribe(listener) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}
