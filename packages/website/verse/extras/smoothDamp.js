import * as THREE from 'three'

const defaultDeltaTime = 1 / 60

const change = new THREE.Vector3()
const originalTo = new THREE.Vector3()
const temp = new THREE.Vector3()
const temp2 = new THREE.Vector3()

/**
 * Claude cleaned up my code to be even more efficient than the
 * original and simplified versions below.
 */

export function smoothDamp(
  current,
  target,
  smoothTime,
  deltaTime = defaultDeltaTime,
  maxSpeed = Infinity
) {
  if (!current._velocity) {
    current._velocity = new THREE.Vector3(0, 0, 0)
  }
  const velocity = current._velocity

  smoothTime = Math.max(0.0001, smoothTime)
  const omega = 2 / smoothTime

  const x = omega * deltaTime
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)

  change.subVectors(current, target)
  originalTo.copy(target)

  const maxChange = maxSpeed * smoothTime
  change.clampLength(0, maxChange)

  temp.copy(target)
  target.copy(current).sub(change)

  temp2.subVectors(velocity, change).multiplyScalar(deltaTime * omega)
  velocity.sub(temp2)

  temp2.copy(change).multiplyScalar(exp)
  current.addVectors(target, temp2)

  temp2.subVectors(originalTo, current)
  if (temp2.dot(temp.subVectors(current, originalTo)) > 0) {
    current.copy(originalTo)
    velocity.set(0, 0, 0)
  }
}

/**
 * Simplified and cleaned up to be more performant (eg not instantiating vec3s)
 */

// import * as THREE from 'three'

// const defaultDeltaTime = 1 / 60

// const v1 = new THREE.Vector3()
// const v2 = new THREE.Vector3()
// const v3 = new THREE.Vector3()
// const v4 = new THREE.Vector3()
// const v5 = new THREE.Vector3()
// const v6 = new THREE.Vector3()

// export function smoothDamp(
//   current,
//   target,
//   smoothTime,
//   deltaTime = defaultDeltaTime,
//   maxSpeed = Infinity
// ) {
//   if (!current._velocity) {
//     current._velocity = new THREE.Vector3(0, 0, 0)
//   }
//   const velocity = current._velocity

//   smoothTime = Math.max(0.0001, smoothTime)
//   const omega = 2 / smoothTime

//   const x = omega * deltaTime
//   const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)

//   const change = v1.subVectors(current, target)
//   change.subVectors(current, target)
//   const originalTo = v2.copy(target)

//   const maxChange = maxSpeed * smoothTime
//   change.clampLength(0, maxChange)
//   target.copy(current).sub(change)

//   const temp = v3.subVectors(velocity, change).multiplyScalar(deltaTime)
//   velocity.subVectors(velocity, temp.multiplyScalar(omega))

//   let output = v4.addVectors(target, change.multiplyScalar(exp))

//   if (
//     v5.subVectors(originalTo, current).dot(v6.subVectors(output, originalTo)) >
//     0
//   ) {
//     output.copy(originalTo)
//     velocity.set(0, 0, 0)
//   }

//   current.copy(output)
// }

/**
 * Original
 * Based off https://gist.github.com/stakira/1ac34b257e219c1f5c36376b9d7fba5a
 * Which was inspired by Unity's Vector3.SmoothDamp
 * Converted to JS+THREE by Claude AI
 */

// function smoothDamp(
//   current,
//   target,
//   currentVelocity,
//   smoothTime,
//   maxSpeed = Infinity,
//   deltaTime
// ) {
//   const EPSILON = 0.0001
//   smoothTime = Math.max(0.0001, smoothTime)
//   const omega = 2 / smoothTime

//   const x = omega * deltaTime
//   const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)

//   const change = new THREE.Vector3().subVectors(current, target)
//   const originalTo = target.clone()

//   const maxChange = maxSpeed * smoothTime
//   change.clampLength(0, maxChange)
//   target.copy(current).sub(change)

//   const temp = new THREE.Vector3()
//     .subVectors(currentVelocity, change)
//     .multiplyScalar(deltaTime)
//   currentVelocity.subVectors(currentVelocity, temp.multiplyScalar(omega))

//   let output = new THREE.Vector3().addVectors(
//     target,
//     change.multiplyScalar(exp)
//   )

//   if (
//     new THREE.Vector3()
//       .subVectors(originalTo, current)
//       .dot(new THREE.Vector3().subVectors(output, originalTo)) > 0
//   ) {
//     output.copy(originalTo)
//     currentVelocity.set(0, 0, 0)
//   }

//   return output
// }
