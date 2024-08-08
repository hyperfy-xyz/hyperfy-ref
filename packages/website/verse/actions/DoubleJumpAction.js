import * as THREE from 'three'

import { Action } from './Action'

export class DoubleJumpAction extends Action {
  constructor() {
    super()
    this.emote = 'avatar@flip.glb'
    this.speed = 1
    this.moveFreedom = 1
    this.lockOn = false
    this.duration = 0.4
    this.elapsed = 0
    this.consumed = false
    this.started = false
    this.complete = false
  }

  check(avatar) {
    if (avatar.isGrounded && this.consumed) {
      this.consumed = false
    }
    if (avatar.isJumping && avatar.controls.jump && !this.consumed) {
      this.elapsed = 0
      this.consumed = true
      this.started = false
      this.complete = false
      return true
    }
    return false
  }

  update(delta, avatar) {
    if (!this.started) {
      avatar.velocity.y = Math.sqrt(2 * avatar.gravity * avatar.jumpHeight)
      this.started = true
    }
    this.elapsed += delta
    if (this.elapsed > this.duration) {
      this.complete = true
    }
  }
}
