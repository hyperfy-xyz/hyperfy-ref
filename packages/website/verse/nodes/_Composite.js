import { Layers } from '../extras/Layers'

import { Node } from './Node'

export class Composite extends Node {
  constructor(data = {}) {
    super(data)
    this.name = 'composite'
    this.isComposite = true
    this.src = data.src
    this.instance = null
  }

  mount() {
    if (this.src) {
      this.instance = this.src.add(this, this.matrixWorld)
    }
  }

  update() {
    if (this.instance) {
      this.src.move(this.instance, this.matrixWorld)
    }
  }

  unmount() {
    if (this.instance) {
      this.src.remove(this.instance)
      this.instance = null
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
    if (this.src) {
      const geometry = this.src.lods[0].mesh.geometry
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

  copy(source, recursive) {
    super.copy(source, recursive)
    this.src = source.src
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
