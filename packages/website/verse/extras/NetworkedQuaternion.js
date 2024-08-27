import * as THREE from 'three'

export class NetworkedQuaternion {
  constructor(value, rate) {
    this.value = value
    this.rate = rate // receive rate eg 1/5 for 5hz
    this.previous = new THREE.Quaternion().copy(this.value)
    this.current = new THREE.Quaternion().copy(this.value)
    this.time = 0
    this.snapToken = 0
  }

  update(value, snapToken, delta) {
    if (!this.current.equals(value)) {
      if (this.snapToken !== snapToken) {
        this.snapToken = snapToken
        this.previous.copy(value)
        this.current.copy(value)
        this.value.copy(value)
      } else {
        this.previous.copy(this.current)
        this.current.copy(value)
      }
      this.time = 0
    }
    this.time += delta
    let alpha = this.time / this.rate
    if (alpha > 1) alpha = 1
    this.value.slerpQuaternions(this.previous, this.current, alpha)
    return this
  }
}
