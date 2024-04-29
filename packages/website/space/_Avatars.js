import { System } from './System'

import { uuid } from '@/utils/uuid'

export class Avatars extends System {
  constructor(space) {
    super(space)
    this.avatars = new Map()
    this.self = null
  }

  update(delta) {
    // ...
  }

  spawn(place) {
    const avatar = new Avatar(this.space)
    if (place) {
      const position = place.getWorldPosition()
      const rotationY = place.getWorldRotation().y
      avatar.teleport(position, rotationY)
    } else {
      const position = new THREE.Vector3()
      const rotationY = 0
      avatar.teleport(position, rotationY)
    }
    this.avatars.set(avatar.id, avatar)
    this.self = avatar
  }

  log(...args) {
    console.log('[items]', ...args)
  }
}

class Avatar {
  constructor(space) {
    this.space = space
    this.id = null
    this.name = null
  }

  deserialize(data) {
    this.id = data.id || uuid()
    this.name = data.name
  }

  serialize() {
    return {
      id: this.id,
      name: this.name,
    }
  }
}
