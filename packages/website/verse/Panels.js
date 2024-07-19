import { System } from './System'

export class Panels extends System {
  constructor(world) {
    super(world)
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
      const user = this.world.network.findUser(entity.creator)
      const me = this.world.network.client.user
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
        this.panel = null
        this.emit()
      },
    }
    this.emit()
  }

  onEntityRemoved(entity) {
    if (this.panel?.entity === entity) {
      console.log('panel', this.panel)
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
