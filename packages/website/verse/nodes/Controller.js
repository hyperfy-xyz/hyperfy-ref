import * as THREE from 'three'
import { isNumber, isBoolean } from 'lodash-es'

import { DEG2RAD } from '../extras/general'

import { Node } from './Node'

const defaults = {
  radius: 0.4,
  height: 1,
  visible: false,
}

export class Controller extends Node {
  constructor(data = {}) {
    super(data)
    this.type = 'controller'
    this.isController = true
    this.radius = isNumber(data.radius) ? data.radius : defaults.radius
    this.height = isNumber(data.height) ? data.height : defaults.height
    this.visible = isBoolean(data.visible) ? data.visible : defaults.visible
  }

  mount() {
    if (this.visible) {
      const geometry = new THREE.CapsuleGeometry(this.radius, this.height, 2, 8)
      geometry.translate(0, this.height / 2 + this.radius, 0)
      geometry.computeBoundsTree()
      const material = new THREE.MeshStandardMaterial({ color: 'green' })
      this.mesh = new THREE.Mesh(geometry, material)
      this.mesh.receiveShadow = true
      this.mesh.castShadow = true
      this.mesh.matrixAutoUpdate = false
      this.mesh.matrixWorldAutoUpdate = false
      this.mesh.matrix.copy(this.matrix)
      this.mesh.matrixWorld.copy(this.matrixWorld)
      this.mesh.node = this
      this.ctx.world.graphics.scene.add(this.mesh)
    }
    const desc = new PHYSX.PxCapsuleControllerDesc()
    desc.height = this.height
    desc.radius = this.radius
    desc.climbingMode = PHYSX.PxCapsuleClimbingModeEnum.eCONSTRAINED
    desc.slopeLimit = Math.cos(60 * DEG2RAD) // 60 degrees
    desc.material = this.ctx.world.physics.defaultMaterial
    desc.contactOffset = 0.1 // PhysX default = 0.1
    desc.stepOffset = 0.5 // PhysX default = 0.5m
    this.controller = this.ctx.world.physics.controllerManager.createController(desc) // prettier-ignore
    PHYSX.destroy(desc)
    const worldPosition = this.getWorldPosition()
    this.controller.setFootPosition(worldPosition.toPxExtVec3())
  }

  update() {
    if (this.mesh) {
      this.mesh.matrix.copy(this.matrix)
      this.mesh.matrixWorld.copy(this.matrixWorld)
    }
    // if (this.didMove) {
    //   console.log('character position change without move() ????')
    //   const worldPosition = this.getWorldPosition()
    //   this.controller.setFootPosition(worldPosition.toPxExtVec3())
    //   this.didMove = false
    // }
  }

  unmount() {
    if (this.mesh) {
      this.ctx.world.graphics.scene.remove(this.mesh)
    }
    if (this.controller) {
      this.controller.release()
      this.controller = null
    }
  }

  move(vec3) {
    this.moveFlags = this.controller.move(
      vec3.toPxVec3(),
      0,
      1 / 60,
      this.ctx.world.physics.controllerFilters
    )
    // this.isGrounded = moveFlags.isSet(PHYSX.PxControllerCollisionFlagEnum.eCOLLISION_DOWN) // prettier-ignore
    const pos = this.controller.getFootPosition()
    this.position.copy(pos)
    this.didMove = true
  }

  teleport(vec3) {
    this.position.copy(vec3)
    this.controller.setFootPosition(vec3.toPxExtVec3())
  }

  copy(source, recursive) {
    super.copy(source, recursive)
    this.radius = source.radius
    this.height = source.height
    this.visible = source.visible
    return this
  }

  getProxy() {
    if (!this.proxy) {
      const self = this
      const proxy = {
        ...super.getProxy(),
        teleport(vec3) {
          return self.teleport(vec3)
        },
        move(vec3) {
          return self.move(vec3)
        },
        isGrounded() {
          return self.moveFlags.isSet(
            PHYSX.PxControllerCollisionFlagEnum.eCOLLISION_DOWN
          )
        },
        isCeiling() {
          return self.moveFlags.isSet(
            PHYSX.PxControllerCollisionFlagEnum.eCOLLISION_UP
          )
        },
      }
      this.proxy = proxy
    }
    return this.proxy
  }
}
