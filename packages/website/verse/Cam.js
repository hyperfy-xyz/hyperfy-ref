import * as THREE from 'three'

import { System } from './System'

import { bindRotations } from './extras/bindRotations'

const CAM_MAX_DISTANCE = 2 // max distance between camera and target
const CAM_MIN_FACTOR = 5 // min lerp factor (slowest speed)
const CAM_MAX_FACTOR = 50 // max lerp factor (fastest speed)

const BACKWARD = new THREE.Vector3(0, 0, 1)

const v1 = new THREE.Vector3()

export class Cam extends System {
  constructor(world) {
    super(world)
    this.position = new THREE.Vector3()
    this.quaternion = new THREE.Quaternion()
    this.rotation = new THREE.Euler(0, 0, 0, 'YXZ')
    this.zoom = 4
    this.zoomIgnoreGroups = null
    this.sweepGeometry = null
    bindRotations(this.quaternion, this.rotation)
  }

  start() {
    const groups = this.world.physics.groups
    this.zoomIgnoreGroups = groups.player | groups.object
    this.sweepGeometry = new PHYSX.PxSphereGeometry(0.2)
  }

  update(delta) {
    const cameraRig = this.world.graphics.cameraRig
    const camera = this.world.graphics.camera

    // interpolate camera rig to target transform with a slight lag
    const distanceToTarget = cameraRig.position.distanceTo(this.position) // prettier-ignore
    const t = Math.min(distanceToTarget / CAM_MAX_DISTANCE, 1)
    const lerpFactor = CAM_MAX_FACTOR - (CAM_MAX_FACTOR - CAM_MIN_FACTOR) * (1 - Math.pow(t, 2)) // prettier-ignore
    cameraRig.position.lerp(this.position, lerpFactor * delta)
    cameraRig.quaternion.slerp(this.quaternion, 16 * delta)

    // raycast backward to check for zoom collision
    const origin = cameraRig.position
    const direction = v1.copy(BACKWARD).applyQuaternion(cameraRig.quaternion)
    const hit = this.world.physics.sweep(
      this.sweepGeometry,
      origin,
      direction,
      200,
      this.zoomIgnoreGroups
    )

    // lerp to target zoom distance
    let distance = this.zoom
    // but if we hit something snap it in so we don't end up in the wall
    if (hit && hit.distance < distance) {
      camera.position.z = hit.distance
    } else {
      camera.position.lerp(v1.set(0, 0, distance), 6 * delta)
    }
  }
}
