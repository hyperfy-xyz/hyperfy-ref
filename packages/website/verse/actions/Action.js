import * as THREE from 'three'

export class Action {
  constructor() {
    this.emote = null
    this.displacement = new THREE.Vector3()
    this.speed = 0
    this.moveFreedom = 0
    this.lockOn = false
    this.elapsed = 0
    this.complete = false
  }

  check(input) {
    return false
  }

  start() {
    // ...
  }

  update(delta) {
    // ...
  }
}
