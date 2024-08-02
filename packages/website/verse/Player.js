import * as THREE from 'three'
import { Vector3, Quaternion } from 'three'

import { Entity } from './Entity'
import { DEG2RAD } from './extras/general'
import { clamp } from './extras/utils'

import { DodgeAction } from './actions/DodgeAction'
import { SwordAction } from './actions/SwordAction'
import { HammerAction } from './actions/HammerAction'
import { BowAction } from './actions/BowAction'
import { DoubleJumpAction } from './actions/DoubleJumpAction'
import { PunchAction } from './actions/PunchAction'
import { smoothDamp } from './extras/smoothDamp'
import { Vector3Enhanced } from './extras/Vector3Enhanced'
import { NetworkedVector3 } from './extras/NetworkedVector3'
import { NetworkedQuaternion } from './extras/NetworkedQuaternion'

const UP = new THREE.Vector3(0, 1, 0)
const FORWARD = new THREE.Vector3(0, 0, -1)

const CAPSULE_RADIUS = 0.3

const FIXED_TIMESTEP = 1 / 60

const ZOOM_SPEED = 2
const LOOK_SPEED = 0.1
const MOVE_SPEED = 8
// const MOVE_SPEED = 50
// const MOVE_SPEED = 300 // debug
const MIN_ZOOM = 4
const MAX_ZOOM = 100 // 16

// const MOVING_SEND_RATE = 1 / 5

const v1 = new THREE.Vector3()
const e1 = new THREE.Euler(0, 0, 0, 'YXZ')
const q1 = new THREE.Quaternion()

const emotes = {
  idle: 'avatar@idle.glb',
  run: 'avatar@run.glb',
  walk: 'avatar@walk.glb',
  float: 'avatar@float.glb',
}

const defaults = {
  position: [0, 0, 0],
  vrmUrl: `${process.env.PUBLIC_ASSETS_URL}/wizard_255.vrm`,
  teleportN: 0,
}

export class Player extends Entity {
  constructor(world, props) {
    super(world, props)

    this.position = this.createNetworkProp(
      'position',
      new Vector3Enhanced().fromArray(props.position || defaults.position)
    )
    this.quaternion = this.createNetworkProp(
      'quaternion',
      new THREE.Quaternion().fromArray(props.quaternion || defaults.quaternion)
    )
    this.emote = this.createNetworkProp('emote', emotes.idle) // prettier-ignore
    this.itemIdx = this.createNetworkProp('itemIdx', null) // prettier-ignore
    this.itemIdx.onChange = idx => this.setItem(idx)
    this.vrmUrl = this.createNetworkProp('vrmUrl', props.vrmUrl || defaults.vrmUrl) // prettier-ignore
    this.vrmUrl.onChange = () => this.loadVRM(this)
    this.teleportN = this.createNetworkProp('teleportN', props.teleportN || defaults.teleportN) // prettier-ignore

    // ghost is just a container that controllers/vrms follow
    this.ghost = new THREE.Object3D()
    this.ghost.position.copy(this.position.value)
    this.ghost.quaternion.copy(this.quaternion.value)

    this.gravity = 20 // 9.81
    this.jumpHeight = 1.5

    this.displacement = new THREE.Vector3()
    this.velocity = new THREE.Vector3()

    this.zoom = 6

    this.targetEuler = new THREE.Euler(0, 0, 0, 'YXZ')
    this.targetQuaternion = new THREE.Quaternion()

    this.lookStart = new THREE.Vector2()
    this.lookDelta = new THREE.Vector2()
    this.looking = false

    this.networkPosition = new NetworkedVector3(
      this.ghost.position,
      this.world.network.sendRate
    )
    this.networkQuaternion = new NetworkedQuaternion(
      this.ghost.quaternion,
      this.world.network.sendRate
    )

    this.actions = [new DodgeAction(), new DoubleJumpAction()]

    this.items = [
      {
        modelUrl: null,
        boneName: null,
        action: new PunchAction(),
      },
      {
        modelUrl: `${process.env.PUBLIC_ASSETS_URL}/weapon-sword.glb`,
        boneName: 'rightHand',
        action: new SwordAction(),
      },
      {
        modelUrl: `${process.env.PUBLIC_ASSETS_URL}/weapon-hammer.glb`,
        boneName: 'rightHand',
        action: new HammerAction(),
      },
      {
        modelUrl: `${process.env.PUBLIC_ASSETS_URL}/weapon-bow.glb`,
        boneName: 'leftHand',
        action: new BowAction(),
      },
    ]

    this.vrmN = 0

    this.init()
  }

  async init() {
    // controller
    const desc = new PHYSX.PxCapsuleControllerDesc()
    desc.height = 1
    desc.radius = CAPSULE_RADIUS
    desc.climbingMode = PHYSX.PxCapsuleClimbingModeEnum.eCONSTRAINED
    desc.slopeLimit = Math.cos(60 * DEG2RAD) // 60 degrees
    desc.material = this.world.physics.defaultMaterial
    desc.contactOffset = 0.1 // PhysX default = 0.1
    desc.stepOffset = 0.5 // PhysX default = 0.5m
    this.controller = this.world.physics.controllerManager.createController(desc) // prettier-ignore
    console.log('ctr', this.controller)
    PHYSX.destroy(desc)
    this.controller.setFootPosition(this.ghost.position.toPxExtVec3())

    // vrm
    await this.loadVRM()

    // camera
    this.world.graphics.cameraRig.position.y = this.vrm.height
    this.world.graphics.cameraRig.rotation.x = -25 * DEG2RAD
    this.world.graphics.camera.position.z = 6

    // start
    // this.world.graphics.scene.add(this.vrm)
    this.world.entities.incActive(this)

    if (this.isOwner()) {
      this.world.network.onCameraReady?.()
    }
  }

  async loadVRM() {
    const n = ++this.vrmN
    const vrm = await this.world.loader.loadVRM(this.vrmUrl.value) // prettier-ignore
    if (this.vrmN !== n) return // stop if vrm url changed again while this one was loading
    if (this.destroyed) return // stop if the player has been destroyed
    if (this.vrm) this.vrm.destroy()
    this.vrm = vrm.factory(this.ghost.matrix, null)
    this.controller.resize(this.vrm.height - CAPSULE_RADIUS * 2)

    // debug capsule
    // {
    //   const radius = CAPSULE_RADIUS
    //   const height = this.vrm.height - radius * 2
    //   const fullHeight = radius + height + radius
    //   const geometry = new THREE.CapsuleGeometry(radius, height)
    //   geometry.translate(0, fullHeight / 2, 0)
    //   if (this.foo) {
    //     this.world.graphics.scene.remove(this.foo)
    //   }
    //   this.foo = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial())
    //   this.world.graphics.scene.add(this.foo)
    // }
  }

  isOwner() {
    return this.ownerId === this.world.network.client.id
  }

  update(delta) {
    if (this.isOwner()) {
      this.updateLocal(delta)
    } else {
      this.updateRemote(delta)
    }
  }

  updateLocal(delta) {
    const input = this.world.input
    const rig = this.world.graphics.cameraRig
    const camera = this.world.graphics.camera
    const ghost = this.ghost

    // rotate camera if dragging
    if (input.down.RMB) {
      if (!this.looking) {
        this.lookStart.copy(input.pan)
        this.looking = true
      }
      this.lookDelta.copy(input.pan).sub(this.lookStart).multiplyScalar(LOOK_SPEED * delta) // prettier-ignore
      this.lookStart.copy(input.pan)
      rig.rotation.y += -this.lookDelta.x
      rig.rotation.x += -this.lookDelta.y
    } else {
      this.looking = false
    }

    // zoom camera if scrolling wheel (and not moving an object)
    if (input.wheel && !input.moving) {
      this.zoom -= input.wheel * ZOOM_SPEED * delta
      this.zoom = clamp(this.zoom, MIN_ZOOM, MAX_ZOOM)
    }
    v1.set(0, 0, this.zoom)
    camera.position.lerp(v1, 6 * delta)

    // switch items (if not performing an action)
    if (!this.action) {
      if (input.pressed.Digit1) {
        this.itemIdx.value = 0
      } else if (input.pressed.Digit2) {
        this.itemIdx.value = 1
      } else if (input.pressed.Digit3) {
        this.itemIdx.value = 2
      } else if (input.pressed.Digit4) {
        this.itemIdx.value = 3
      }
    }

    // if not performing an action, check if we should start one
    if (!this.action) {
      if (this.item?.action?.check(input, this)) {
        this.action = this.item.action
      } else {
        for (const action of this.actions) {
          if (action.check(input, this)) {
            this.action = action
            break
          }
        }
      }
    }

    // initialize displacement
    this.displacement.set(0, 0, 0)

    // if we're not performing an action, use directional input displacement
    if (!this.action || this.action.moveFreedom) {
      if (input.down.ArrowLeft || input.down.KeyA) this.displacement.x -= 1 // prettier-ignore
      if (input.down.ArrowRight || input.down.KeyD) this.displacement.x += 1 // prettier-ignore
      if (input.down.ArrowUp || input.down.KeyW) this.displacement.z -= 1 // prettier-ignore
      if (input.down.ArrowDown || input.down.KeyS) this.displacement.z += 1 // prettier-ignore

      // we're moving if any keys are down
      this.isMoving = this.displacement.length() > 0

      // normalize displacement for non-joystick (disables surfing)
      this.displacement.normalize()

      // rotate displacement by camera Y-rotation
      const yRigQuaternion = q1.setFromAxisAngle(UP, rig.rotation.y)
      this.displacement.applyQuaternion(yRigQuaternion)

      // get a quaternion that faces the direction we are moving
      if (this.isMoving) {
        this.targetQuaternion.setFromUnitVectors(FORWARD, this.displacement)
        // console.log('foo2')
      }

      // multiply our displacement direction by our movement speed
      this.displacement.multiplyScalar(MOVE_SPEED * delta)

      if (this.action) {
        this.displacement.multiplyScalar(this.action.moveFreedom)
      }
    }

    // progress our action if any
    if (this.action) {
      this.action.update(delta, input, this)

      v1.copy(this.action.displacement)

      // rotate displacement by player Y-rotation
      v1.applyQuaternion(this.targetQuaternion)

      // multiply our displacement direction by our movement speed
      v1.multiplyScalar(this.action.speed * delta)

      this.displacement.add(v1)

      this.isMoving = false

      // lock on (face camera)
      if (this.action.lockOn) {
        this.targetEuler.set(0, rig.rotation.y, 0)
        this.targetQuaternion.setFromEuler(this.targetEuler)
      }
    }

    // if we're grounded, dig into the ground (for when going down slopes)
    // if we're not grounded, continually apply gravity
    if (this.isGrounded) {
      this.velocity.y = -20
    } else {
      this.velocity.y -= this.gravity * delta
    }

    // if we're grounded and we want to jump, apply jump velocity
    if (this.isGrounded && input.down.Space && !this.action) {
      this.velocity.y = Math.sqrt(2 * this.gravity * this.jumpHeight)
      this.isJumping = true
    }

    // HACK: temp flying
    // if (input.down.Space) {
    //   this.velocity.y += 1
    // }

    // apply emote
    if (this.action) {
      this.vrm.setEmote(this.action.emote)
      this.emote.value = this.action.emote
    } else if (!this.isGrounded) {
      this.vrm.setEmote(emotes.float)
      this.emote.value = emotes.float
    } else if (this.isMoving) {
      this.vrm.setEmote(emotes.run)
      this.emote.value = emotes.run
    } else {
      this.vrm.setEmote(emotes.idle)
      this.emote.value = emotes.idle
    }

    // apply the velocity (for this frame) to our displacement
    const velocity = v1.copy(this.velocity).multiplyScalar(delta)
    this.displacement.add(velocity)

    // finally apply displacement to our controller
    this.moveFlags = this.controller.move(
      this.displacement.toPxVec3(),
      0,
      FIXED_TIMESTEP,
      this.world.physics.controllerFilters
    )

    // check if we're grounded
    this.isGrounded = this.moveFlags.isSet(
      PHYSX.PxControllerCollisionFlagEnum.eCOLLISION_DOWN
    )

    // check if we hit our head on something
    this.isCeiling = this.moveFlags.isSet(
      PHYSX.PxControllerCollisionFlagEnum.eCOLLISION_UP
    )

    // if we were jumping and now we're grounded, update our variable
    if (this.isJumping && this.isGrounded) {
      this.isJumping = false
    }

    // if we did hit our head, cancel any jump velocity
    if (this.isCeiling && this.velocity.y > 0) {
      this.velocity.y = -this.gravity * delta
    }

    // read back controller position and apply to ghost & vrm
    const pos = this.controller.getFootPosition()
    ghost.position.copy(pos)
    ghost.updateMatrix()
    this.vrm.move(ghost.matrix)

    // make camera follow our final position horizontally
    // and vertically at our vrm model height
    rig.position.set(
      ghost.position.x,
      ghost.position.y + this.vrm.height,
      ghost.position.z
    )

    // if we're moving continually rotate ourselves toward the direction we are moving
    if (this.isMoving || this.action) {
      const alpha = 1 - Math.pow(0.00000001, delta)
      ghost.quaternion.slerp(this.targetQuaternion, alpha)
    }

    // clear the action when its complete
    if (this.action?.complete) {
      this.action = null
    }

    // attach any item to bone
    if (this.item?.model) {
      this.vrm.applyBoneMatrixWorld(this.item.boneName, this.item.model.matrix)
      this.item.model.matrixWorld.copy(this.item.model.matrix)
    }

    // network
    this.position.value.copy(ghost.position)
    this.quaternion.value.copy(ghost.quaternion)
  }

  updateRemote(delta) {
    // move
    this.networkPosition.update(
      this.position.value,
      this.teleportN.value,
      delta
    )
    this.networkQuaternion.update(
      this.quaternion.value,
      this.teleportN.value,
      delta
    )
    this.ghost.updateMatrix()
    this.vrm.move(this.ghost.matrix)
    this.controller.setFootPosition(this.ghost.position.toPxExtVec3())
    // emote
    this.vrm.setEmote(this.emote.value)
    // item attachment
    if (this.item?.model) {
      this.vrm.applyBoneMatrixWorld(this.item.boneName, this.item.model.matrix)
      this.item.model.matrixWorld.copy(this.item.model.matrix)
    }
  }

  teleport(x, y, z) {
    this.ghost.position.set(x, y, z)
    this.ghost.updateMatrix()
    this.vrm.move(this.ghost.matrix)
    this.controller.setFootPosition(this.ghost.position.toPxExtVec3())
    this.teleportN.value++
  }

  async setItem(idx) {
    // clear any current item
    if (this.item) {
      if (this.item.model) {
        this.world.graphics.scene.remove(this.item.model)
      }
    }
    this.item = this.items[idx]
    const item = this.item
    if (item.modelUrl) {
      // load it if we haven't yet
      if (!item.model) {
        const glb = await this.world.loader.loadGLB(item.modelUrl)
        item.model = glb.raw.scene.clone()
        item.model.matrixAutoUpdate = false
        item.model.matrixWorldAutoUpdate = false
      }
      // if we're still holding this item
      if (this.item === item) {
        // add it to the scene
        this.world.graphics.scene.add(item.model)
      }
    }
  }

  fixedUpdate(delta) {
    // ...
  }

  lateUpdate(delta) {
    // ...
  }

  // getStats() {
  //   let triangles = 0
  //   this.root.traverse(node => {
  //     const nStats = node.getStats()
  //     if (nStats) {
  //       triangles += nStats.triangles
  //     }
  //   })
  //   return {
  //     triangles,
  //   }
  // }

  destroy() {
    super.destroy()
    this.world.entities.decActive(this, true)
    this.vrm?.destroy()
    this.controller.release()
    this.controller = null
    if (this.item?.model) {
      this.world.graphics.scene.remove(this.item.model)
    }
  }
}
