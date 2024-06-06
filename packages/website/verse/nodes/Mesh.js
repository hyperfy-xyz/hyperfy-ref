import { Layers } from '../extras/Layers'

import { Node } from './Node'

export class Mesh extends Node {
  constructor(entity, data) {
    super(entity, data)
    this.isMesh = true
    this.model = data.model
  }

  mount() {
    this.item = this.model.add(this, this.matrixWorld)
  }

  update() {
    if (this.item) {
      this.model.move(this.item, this.matrixWorld)
    }
  }

  unmount() {
    if (this.item) {
      this.model.remove(this.item)
      this.item = null
    }
  }

  setMode(mode) {
    // TODO: toggle physics off when moving
    //
    // if (mode === 'moving') {
    //   this.layer = Layers.MOVING
    // } else {
    //   this.layer = Layers.DEFAULT
    // }
  }

  getStats() {
    let triangles = 0
    if (this.model) {
      const geometry = this.model.lods[0].mesh.geometry
      if (geometry.index !== null) {
        triangles += geometry.index.count / 3
      } else {
        triangles += geometry.attributes.position.count / 3
      }
    }
    return {
      triangles,
    }
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
