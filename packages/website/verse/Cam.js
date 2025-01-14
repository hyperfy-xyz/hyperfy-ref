import * as THREE from 'three'

import { System } from './System'

import { bindRotations } from './extras/bindRotations'
import { Layers } from './extras/Layers'

const CAM_MAX_DISTANCE = 1 // max distance between camera and target
const CAM_MIN_FACTOR = 5 // min lerp factor (slowest speed)
const CAM_MAX_FACTOR = 16 // max lerp factor (fastest speed) note: it gets jittery for some reason when higher

const BACKWARD = new THREE.Vector3(0, 0, 1)

const v1 = new THREE.Vector3()

export class Cam extends System {
  constructor(world) {
    super(world)
    this.target = {
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      rotation: new THREE.Euler(0, 0, 0, 'YXZ'),
      zoom: 4,
    }
    bindRotations(this.target.quaternion, this.target.rotation)
    this.sweepGeometry = null
  }

  start() {
    this.sweepGeometry = new PHYSX.PxSphereGeometry(0.2)
  }

  finalize(delta) {
    const cameraRig = this.world.graphics.cameraRig
    const camera = this.world.graphics.camera

    // interpolate camera rig to target transform with a slight lag
    const distanceToTarget = cameraRig.position.distanceTo(this.target.position) // prettier-ignore
    const t = Math.min(distanceToTarget / CAM_MAX_DISTANCE, 1)
    const lerpFactor = CAM_MAX_FACTOR - (CAM_MAX_FACTOR - CAM_MIN_FACTOR) * (1 - Math.pow(t, 2)) // prettier-ignore
    cameraRig.position.lerp(this.target.position, lerpFactor * delta)
    cameraRig.quaternion.slerp(this.target.quaternion, 16 * delta)

    // raycast backward to check for zoom collision
    const origin = cameraRig.position
    const direction = v1.copy(BACKWARD).applyQuaternion(cameraRig.quaternion)
    const layerMask = Layers.camera.mask // hit everything the camera should hit
    const hit = this.world.physics.sweep(this.sweepGeometry, origin, direction, 200, layerMask)

    // lerp to target zoom distance
    let distance = this.target.zoom
    // but if we hit something snap it in so we don't end up in the wall
    if (hit && hit.distance < distance) {
      camera.position.z = hit.distance
    } else {
      camera.position.lerp(v1.set(0, 0, distance), 6 * delta)
    }

    // console.log('Cam target', cameraRig.position.toArray())
    // force snap
    // cameraRig.position.copy(this.target.position)
    // cameraRig.quaternion.copy(this.target.quaternion)
    // camera.position.z = distance
    // console.log('Cam snap to target', cameraRig.position.toArray())
  }
}
