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
      debug: true,
      center: new THREE.Vector3(0, 0, 0),
      size: 2000,
    })
  }

  update(delta) {
    // ...
  }
}
