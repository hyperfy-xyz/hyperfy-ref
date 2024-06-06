import { Layers } from '../extras/Layers'

import { Node } from './Node'

export class Mesh extends Node {
  constructor(entity, data) {
    super(entity, data)
    this.isMesh = true
    // this.mesh = data.mesh
    this.model = data.model
  }

  mount() {
    // this.instance = this.world.instances.add(this.mesh, this.matrixWorld)
    // this.instance.setNode(this)
    // if (this.layer) {
    //   this.instance.setLayer(this.layer)
    // }
    this.item = this.model.add(this, this.matrixWorld)
  }

  update() {
    // if (this.instance) {
    //   this.instance.move(this.matrixWorld)
    // }
    if (this.item) {
      this.model.move(this.item, this.matrixWorld)
    }
  }

  unmount() {
    // if (this.instance) {
    //   this.instance.remove()
    //   this.instance = null
    // }
    if (this.item) {
      this.model.remove(this.item)
      this.item = null
    }
  }

  setMode(mode) {
    if (mode === 'moving') {
      this.layer = Layers.MOVING
    } else {
      this.layer = Layers.DEFAULT
    }
    // this.instance?.setLayer(this.layer)
  }

  getStats() {
    let triangles = 0
    // if (this.mesh) {
    //   const geometry = this.mesh.geometry
    //   if (geometry.index !== null) {
    //     triangles += geometry.index.count / 3
    //   } else {
    //     triangles += geometry.attributes.position.count / 3
    //   }
    // }
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
