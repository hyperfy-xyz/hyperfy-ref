import * as THREE from 'three'
import { isNumber, isBoolean } from 'lodash-es'

import { Node } from './Node'
import { num } from '@/utils/rand'
import { DEG2RAD } from '@/utils/3d'

// const _v1 = new THREE.Vector3()
// const _v2 = new THREE.Vector3()
// const _q1 = new THREE.Quaternion()

const defaults = {
  radius: 0.4,
  height: 1,
  visible: false,
}

export class Character extends Node {
  constructor(entity, data) {
    super(entity, data)
    this.radius = isNumber(data.radius) ? data.radius : defaults.radius
    this.height = isNumber(data.height) ? data.height : defaults.height
    this.visible = isBoolean(data.visible) ? data.visible : defaults.visible
  }

  mount() {
    if (this.visible) {
      const geometry = new THREE.CapsuleGeometry(this.radius, this.height, 2, 8)
      geometry.translate(0, this.height / 2 + this.radius, 0)
      const material = new THREE.MeshStandardMaterial({ color: 'green' })
      this.mesh = new THREE.Mesh(geometry, material)
      this.mesh.receiveShadow = true
      this.mesh.castShadow = true
      this.mesh.matrixAutoUpdate = false
      this.mesh.matrixWorldAutoUpdate = false
      this.mesh.matrix.copy(this.matrix)
      this.mesh.matrixWorld.copy(this.matrixWorld)
      this.space.graphics.scene.add(this.mesh)
    }
    const desc = new PHYSX.PxCapsuleControllerDesc()
    desc.height = this.height
    desc.radius = this.radius
    desc.climbingMode = PHYSX.PxCapsuleClimbingModeEnum.eCONSTRAINED
    desc.slopeLimit = Math.cos(60 * DEG2RAD) // 60 degrees
    desc.material = this.space.physics.physics.createMaterial(0.2, 0.2, 0.2)
    desc.contactOffset = 0.1 // PhysX default = 0.1
    desc.stepOffset = 0.5 // PhysX default = 0.5m
    this.controller = this.space.physics.controllerManager.createController(desc) // prettier-ignore
    const worldPosition = this.getWorldPosition()
    this.controller.setFootPosition(worldPosition.toPxExtVec3())
    PHYSX.destroy(desc.material)
    PHYSX.destroy(desc)
  }

  update() {
    // console.log('cha update pos', this.position.toArray())
    // console.log('cha update matrix', this.matrix.toArray())
    // console.log('cha update matrixWorld', this.matrixWorld.toArray())
    if (this.mesh) {
      this.mesh.matrix.copy(this.matrix)
      this.mesh.matrixWorld.copy(this.matrixWorld)
    }
    // this.controller.setFootPosition(this.position)
  }

  unmount() {
    if (this.mesh) {
      this.space.graphics.scene.remove(this.mesh)
    }
    this.controller.release()
  }

  move(vec3) {
    const moveFlags = this.controller.move(
      vec3.toPxVec3(),
      0,
      1 / 60,
      this.space.physics.controllerFilters
    )
    this.isGrounded = moveFlags.isSet(PHYSX.PxControllerCollisionFlagEnum.eCOLLISION_DOWN) // prettier-ignore
    const pos = this.controller.getFootPosition()
    this.position.copy(pos)
    // return this.isGrounded
  }

  getProxy() {
    if (!this.proxy) {
      const self = this
      const proxy = {
        ...super.getProxy(),
        move(vec3) {
          return self.move(vec3)
        },
        isGrounded() {
          return self.isGrounded
        },
      }
      this.proxy = proxy
    }
    return this.proxy
  }
}
