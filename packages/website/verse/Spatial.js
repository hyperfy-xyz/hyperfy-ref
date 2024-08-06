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

    // TEMP: testing spherecast
    {
      this.points = []
      this.points.push(new THREE.Vector3(0, 0, 0))
      this.points.push(new THREE.Vector3(0, 0, -1))
      const geometry = new THREE.BufferGeometry().setFromPoints(this.points)
      const material = new THREE.LineBasicMaterial({ color: 'red' })
      this.line = new THREE.Line(geometry, material)
      this.line.position.y = 0.5
      this.world.graphics.scene.add(this.line)
    }
  }

  update(delta) {
    if (this.world.input.pressed.KeyP) {
      this.octree.toggleHelper()
    }

    // TEMP: testing spherecast
    if (!this.direction) this.direction = new THREE.Vector3(0, 0, -1)
    const hits = this.octree.spherecast(this.line.position, this.direction, 0.5, Infinity) // prettier-ignore
    const distance = hits[0]?.distance || 1000
    // console.log(distance, hits)
    this.points[1].z = -distance
    this.line.geometry.setFromPoints(this.points)
    this.line.geometry.attributes.position.needsUpdate = true
  }
}
