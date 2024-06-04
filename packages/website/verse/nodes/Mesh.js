import { Layers } from '../extras/Layers'

import { Node } from './Node'

export class Mesh extends Node {
  constructor(entity, data) {
    super(entity, data)
    this.isMesh = true
    this.mesh = data.mesh

    // this.mesh = data.mesh.clone()
    // this.mesh.node = this
  }

  mount() {
    this.instance = this.world.instances.add(this.mesh, this.matrixWorld)
    this.instance.setNode(this)
    if (this.layer) {
      this.instance.setLayer(this.layer)
    }

    // this.world.graphics.scene.add(this.mesh)
    // this.mesh.matrix.copy(this.matrix)
    // this.mesh.matrixWorld.copy(this.matrixWorld)
    // this.mesh.matrixAutoUpdate = false
    // this.mesh.matrixWorldAutoUpdate = false
  }

  update() {
    if (this.instance) {
      this.instance.move(this.matrixWorld)
    }
    // console.log(this.name)
    // if (this.name === 'HumanLow') {
    //   console.log('HumanLow.update', this.matrixWorld.toArray().join(','))
    // }

    // this.mesh.matrix.copy(this.matrixWorld)
  }

  unmount() {
    if (this.instance) {
      this.instance.remove()
      this.instance = null
    }

    // this.world.graphics.scene.remove(this.mesh)
  }

  setMode(mode) {
    if (mode === 'moving') {
      this.layer = Layers.MOVING
    } else {
      this.layer = Layers.DEFAULT
    }
    this.instance?.setLayer(this.layer)

    // this.mesh?.layers.set(this.layer)
  }

  getStats() {
    let triangles = 0
    if (this.mesh) {
      const geometry = this.mesh.geometry
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
