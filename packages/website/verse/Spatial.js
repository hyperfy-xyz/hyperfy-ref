import * as THREE from 'three'

import { System } from './System'
import { Octree } from './extras/Octree'

export class Spatial extends System {
  constructor(world) {
    super(world)
  }

  start() {
    const box = new THREE.Box3(
      new THREE.Vector3(-2000, -2000, -2000),
      new THREE.Vector3(2000, 2000, 2000)
    )
    this.octree = new Octree({
      scene: this.world.graphics.scene,
      debug: true,
      box,
      maxItems: 100,
    })
  }

  update(delta) {
    // ...
  }
}
