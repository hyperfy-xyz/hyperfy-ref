import { System } from './System'

export class Panels extends System {
  constructor(space) {
    super(space)
    this.panel = null
    this.listeners = new Set()
  }

  inspect(entity) {
    if (entity.schema.type === 'prototype') {
      this.panel = {
        type: 'inspect-prototype',
        entity,
        close: () => {
          this.panel = null
          this.emit()
        },
      }
    }
    if (entity.schema.type === 'avatar') {
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
        if (!entity.destroyed) {
          entity.mode = 'active'
          entity.modeClientId = null
          this.space.network.pushEntityUpdate(entity.id, update => {
            if (!update.props) update.props = {}
            update.props.mode = 'active'
            update.props.modeClientId = null
          })
          this.space.entities.upsertSchemaLocal(entity.schema) // this causes a respawn for all instances
        }
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
