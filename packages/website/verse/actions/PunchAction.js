import * as THREE from 'three'

import { Action } from './Action'

export class PunchAction extends Action {
  constructor() {
    super()
    this.emote = 'avatar@punch.glb'
    this.displacement.z = -0.5
    this.speed = 1
    this.moveFreedom = 0
    this.lockOn = false
    this.duration = 0.6
    this.elapsed = 0
    this.complete = false
  }

  check(avatar) {
    // TODO: rename LMB -> MouseLeft/LeftMouse
    if (avatar.input.use) {
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
