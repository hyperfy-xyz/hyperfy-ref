import * as THREE from 'three'

import { System } from './System'
import { LooseOctree } from './extras/LooseOctree'

export class Spatial extends System {
  constructor(world) {
    super(world)
  }

  start() {
    this.octree = new LooseOctree({
      scene: this.world.graphics.scene,
      center: new THREE.Vector3(0, 0, 0),
      size: 10,
    })
    this.lastPrune = 0
  }

  update(delta) {
    if (this.world.input.pressed.KeyP) {
      this.octree.toggleHelper()
    }
  }
}
