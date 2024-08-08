import * as THREE from 'three'

import { Action } from './Action'

export class BowAction extends Action {
  constructor() {
    super()
    this.emote = 'avatar@bow-aim.glb'
    this.speed = 0
    this.moveFreedom = 0.2
    this.lockOn = true
    this.duration = 0.2
    this.fired = false
    this.elapsed = 0
    this.complete = false
  }

  check(avatar) {
    // TODO: rename LMB -> MouseLeft/LeftMouse
    if (avatar.controls.use) {
      this.emote = 'avatar@bow-aim.glb'
      this.fired = false
      this.elapsed = 0
      this.complete = false
      return true
    }
    return false
  }

  update(delta, avatar) {
    if (!this.fired && !avatar.controls.use) {
      this.fired = true
    }
    if (this.fired) {
      this.emote = 'avatar@bow-fire.glb'
      this.elapsed += delta
      if (this.elapsed > this.duration) {
        this.complete = true
      }
    }
  }
}
