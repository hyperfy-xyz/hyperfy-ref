import * as THREE from 'three'

export class Avatar {
  constructor(space, data, local) {
    this.space = space
    this.id = data.id
    this.vrmUrl = data.vrmUrl
    this.position = new THREE.Vector3().fromArray(data.position)
    this.rotation = data.rotation
    this.change = null
    if (local) {
      this.track('create', data)
    }
  }

  update(delta) {
    // ...
    // example: if this was controled by me and  i move, update changes
    this.track('apply', {
      position: this.position.toArray(),
      rotation: this.rotation,
    })
  }

  track(type, data) {
    if (type === 'destroy') {
      this.space.network.changes[this.id] = { type: 'destroy' }
    } else if (type === 'create') {
      this.space.network.changes[this.id] = { type: 'create', data }
    } else if (type === 'apply') {
      let change = this.space.network.changes[this.id]
      if (!change) {
        change = { type: 'apply', data: {} }
        this.space.network.changes[this.id] = change
      }
      change.data = { ...change.data, ...data }
    }
  }

  apply(data) {
    if (data.vrmUrl) {
      this.vrmUrl = data.vrmUrl
    }
    if (data.position) {
      this.position.fromArray(data.position)
    }
    if (data.rotation) {
      this.rotation = data.rotation
    }
  }

  destroy(local) {
    this.space.entities.entities.delete(this.id)
    if (local) {
      this.track('destroy')
    }
  }
}
