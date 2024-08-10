import * as THREE from 'three'

import { Action } from './Action'

export class DodgeAction extends Action {
  constructor() {
    super()
    this.duration = null
  }

  check(avatar) {
    if (avatar.input.dodge) {
      this.emote = avatar.isMoving ? 'avatar@roll.glb' : 'avatar@backstep.glb'
      this.displacement.z = avatar.isMoving ? -1 : 1
      this.speed = avatar.isMoving ? 15 : 10
      this.moveFreedom = avatar.isMoving ? 0 : 0
      this.lockOn = false
      this.duration = avatar.isMoving ? 0.7 : 0.5
      this.elapsed = 0
      this.complete = false
      return true
    }
    return false
  }

  update(delta, avatar) {
    this.elapsed += delta
    if (this.elapsed > this.duration) {
      this.complete = true
    }
  }
}
