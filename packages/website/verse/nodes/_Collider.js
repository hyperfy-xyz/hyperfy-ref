import { Layers } from '../extras/Layers'

import { Node } from './Node'

export class Collider extends Node {
  constructor(data = {}) {
    super(data)
    this.name = 'collider'
    this.isCollider = true
    this.factory = data.factory
  }

  mount() {
    if (this.factory) {
      this.actor = this.factory(this.matrixWorld)
    }
  }

  update() {
    if (this.actor) {
      // note that scale is ignored.
      // only initial scale is applied and then locked.
      this.actor.move(this.matrixWorld)
    }
  }

  unmount() {
    if (this.actor) {
      this.actor.destroy()
      this.actor = null
    }
  }

  setMode(mode) {
    if (this.actor) {
      if (mode === 'moving') {
        this.actor.setEnabled(false)
      } else {
        this.actor.setEnabled(true)
      }
    }
  }

  // getStats() {
  //   let triangles = 0
  //   if (this.src) {
  //     const geometry = this.src.lods[0].mesh.geometry
  //     if (geometry.index !== null) {
  //       triangles += geometry.index.count / 3
  //     } else {
  //       triangles += geometry.attributes.position.count / 3
  //     }
  //   }
  //   return {
  //     triangles,
  //   }
  // }

  copy(source, recursive) {
    super.copy(source, recursive)
    this.factory = source.factory
    return this
  }

  getProxy() {
    if (!this.proxy) {
      const proxy = {
        ...super.getProxy(),
      }
      this.proxy = proxy
    }
    return this.proxy
  }
}
