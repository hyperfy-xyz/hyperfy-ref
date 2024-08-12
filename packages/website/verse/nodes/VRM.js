import { Node } from './Node'
import * as THREE from 'three'

export class VRM extends Node {
  constructor(data = {}) {
    super(data)
    this.type = 'vrm'
    this.isVRM = true
    this.factory = data.factory
    this.vrm = null
  }

  mount() {
    if (this.factory) {
      this.vrm = this.factory(this.matrixWorld, this)
    }
  }

  commit(didMove) {
    if (didMove) {
      this.vrm?.move(this.matrixWorld)
    }
  }

  unmount() {
    if (this.vrm) {
      this.vrm.destroy()
      this.vrm = null
    }
  }

  // setMode(mode) {
  //   // TODO: toggle physics off when moving
  //   //
  //   // if (mode === 'moving') {
  //   //   this.layer = Layers.MOVING
  //   // } else {
  //   //   this.layer = Layers.DEFAULT
  //   // }
  // }

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
      const self = this
      const proxy = {
        ...super.getProxy(),
        setEmote(id) {
          return self.vrm?.setEmote(id)
        },
      }
      this.proxy = proxy
    }
    return this.proxy
  }
}
