import * as THREE from 'three'

import { System } from './System'
import { LooseOctree } from './extras/LooseOctree'

const PRUNE_RATE = 5

export class Spatial extends System {
  constructor(world) {
    super(world)
  }

  start() {
    this.octree = new LooseOctree({
      scene: this.world.graphics.scene,
      debug: true,
      center: new THREE.Vector3(0, 0, 0),
      size: 2000,
    })
    this.lastPrune = 0
  }

  update(delta) {
    // this.lastPrune += delta
    // if (this.lastPrune > PRUNE_RATE) {
    //   this.lastPrune = 0
    //   this.octree.prune()
    // }
  }
}
