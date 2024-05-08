import * as THREE from 'three'

const DEFAULT_SPEED = 1 / 5

export class Vector3Lerp {
  constructor(value, speed) {
    this.value = value || new THREE.Vector3()
    this.speed = speed || DEFAULT_SPEED // receive rate, eg 1/5 is 5 times per second
    this.previous = new THREE.Vector3().copy(this.value)
    this.current = new THREE.Vector3().copy(this.value)
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
    this.value.lerpVectors(this.previous, this.current, alpha)
    return this
  }
}

// export class Vector3Lerp {
//   constructor(value, speed) {
//     this.value = value || new THREE.Vector3()
//     this.target = this.value.clone()
//     this.speed = speed || DEFAULT_SPEED // receive rate, eg 1/5 is 5 times per second
//   }

//   push(value, snap) {
//     if (Array.isArray(value)) {
//       if (snap) {
//         this.value.fromArray(value)
//         this.target.fromArray(value)
//       } else {
//         this.target.fromArray(value)
//       }
//     } else {
//       if (snap) {
//         this.value.copy(value)
//         this.target.copy(value)
//       } else {
//         this.target.copy(value)
//       }
//     }
//     return this
//   }

//   update(delta) {
//     this.value.lerp(this.target, this.speed * delta)
//     return this
//   }
// }

// export class Vector3Lerp {
//   constructor(value, speed, damping = 0.3) {
//     this.value = value || new THREE.Vector3()
//     this.target = this.value.clone()
//     this.speed = speed || DEFAULT_SPEED // Transition speed
//     this.damping = damping // Damping factor
//     this.velocity = new THREE.Vector3() // Velocity vector for damping calculation
//   }

//   push(value, snap) {
//     if (Array.isArray(value)) {
//       if (snap) {
//         this.value.fromArray(value)
//         this.target.fromArray(value)
//         this.velocity.set(0, 0, 0) // Reset velocity on snap
//       } else {
//         this.target.fromArray(value)
//       }
//     } else {
//       if (snap) {
//         this.value.copy(value)
//         this.target.copy(value)
//         this.velocity.set(0, 0, 0) // Reset velocity on snap
//       } else {
//         this.target.copy(value)
//       }
//     }
//     return this
//   }

//   update(delta) {
//     // Damping effect similar to SmoothDamp
//     let distance = new THREE.Vector3().subVectors(this.target, this.value)
//     let attraction = distance.multiplyScalar(this.speed)
//     this.velocity.add(attraction).multiplyScalar(this.damping)
//     this.value.add(this.velocity.clone().multiplyScalar(delta))
//     return this
//   }
// }
