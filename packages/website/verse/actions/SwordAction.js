import * as THREE from 'three'

import { Action } from './Action'

export class SwordAction extends Action {
  constructor() {
    super()
    this.emote = 'avatar@melee-strike.glb'
    this.displacement.z = -0.5
    this.speed = 1
    this.moveFreedom = 0
    this.lockOn = true
    this.duration = 0.6
    this.elapsed = 0
    this.complete = false
  }

  check(input, avatar) {
    // TODO: rename LMB -> MouseLeft/LeftMouse
    if (input.pressed.LMB) {
      this.elapsed = 0
      this.complete = false
      return true
    }
    return false
  }

  update(delta, input, avatar) {
    this.elapsed += delta
    if (this.elapsed > this.duration) {
      this.complete = true
    }
  }
}
