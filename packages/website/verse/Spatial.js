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
    this.control = this.world.input.bind({
      priority: 100,
      btnDown: code => {
        if (code === 'KeyP') {
          this.octree.toggleHelper()
          return true
        }
      },
    })
  }

  destroy() {
    this.control?.release()
    this.control = null
  }
}
