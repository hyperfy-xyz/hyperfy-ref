import * as THREE from 'three'

const DEFAULT_SPEED = 1 / 5

export class QuaternionLerp {
  constructor(value, speed) {
    this.value = value || new THREE.Quaternion()
    this.speed = speed || DEFAULT_SPEED // receive rate, eg 1/5 is 5 times per second
    this.previous = new THREE.Quaternion().copy(this.value)
    this.current = new THREE.Quaternion().copy(this.value)
    this.time = 0
  }

  push(value, snap) {
    if (Array.isArray(value)) {
      if (snap) {
        this.previous.fromArray(value)
        this.current.fromArray(value)
        this.value.fromArray(value)
      } else {
        this.previous.copy(this.current)
        this.current.fromArray(value)
      }
    } else {
      if (snap) {
        this.previous.copy(value)
        this.current.copy(value)
        this.value.copy(value)
      } else {
        this.previous.copy(this.current)
        this.current.copy(value)
      }
    }
    this.time = 0
    return this
  }

  snap() {
    this.previous.copy(this.current)
    this.value.copy(this.current)
  }

  clear() {
    this.previous.copy(this.value)
    this.current.copy(this.value)
  }

  update(delta) {
    this.time += delta
    const alpha = this.time / this.speed
    if (alpha > 1) return
    this.value.slerpQuaternions(this.previous, this.current, alpha)
    return this
  }
}
