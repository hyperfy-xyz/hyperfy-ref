import * as THREE from 'three'

import { Node } from './Node'
import { num } from '@/utils/rand'

export class Box extends Node {
  constructor(entity, data) {
    super(entity, data)
  }

  mount() {
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshBasicMaterial({ color: 'red' })
    this.mesh = new THREE.Mesh(geometry, material)
    this.space.graphics.scene.add(this.mesh)
    this.mesh.matrixAutoUpdate = false
    this.mesh.matrixWorldAutoUpdate = false
    this.mesh.matrix.copy(this.matrix)
    this.mesh.matrixWorld.copy(this.matrixWorld)
    // console.log('box mount pos', this.position.toArray())
    // console.log('box mount matrix', this.matrix.toArray())
    // console.log('box mount matrixWorld', this.matrixWorld.toArray())
  }

  update() {
    // console.log('box update pos', this.position.toArray())
    // console.log('box update matrix', this.matrix.toArray())
    // console.log('box update matrixWorld', this.matrixWorld.toArray())
    this.mesh.matrix.copy(this.matrix)
    this.mesh.matrixWorld.copy(this.matrixWorld)
  }

  unmount() {
    this.space.graphics.scene.remove(this.mesh)
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
