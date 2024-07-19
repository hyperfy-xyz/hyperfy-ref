import * as THREE from 'three'

import { Action } from './Action'

export class DodgeAction extends Action {
  constructor() {
    super()
    this.duration = null
  }

  check(input, isMoving) {
    if (input.pressed.ShiftLeft) {
      this.emote = isMoving ? 'avatar@roll.glb' : 'avatar@backstep.glb'
      this.displacement.z = isMoving ? -1 : 1
      this.speed = isMoving ? 15 : 10
      this.moveFreedom = isMoving ? 0 : 0
      this.lockOn = false
      this.duration = isMoving ? 0.7 : 0.5
      this.elapsed = 0
      this.complete = false
      return true
    }
    return false
  }

  update(delta) {
    this.elapsed += delta
    if (this.elapsed > this.duration) {
      this.complete = true
    }
  }
}
