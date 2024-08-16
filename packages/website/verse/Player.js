/**
 * Notes:
 *
 * Daves first person physics controller
 * https://www.youtube.com/watch?v=f473C43s8nE
 *
 * Potato codes rigidbody controller
 * https://www.youtube.com/watch?v=eNaTMUkNlwE
 *
 */

import * as THREE from 'three'
import { Vector3, Quaternion } from 'three'

import { Entity } from './Entity'
import { DEG2RAD, RAD2DEG } from './extras/general'
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
import { bindRotations } from './extras/bindRotations'
import { Layers } from './extras/Layers'

const UP = new THREE.Vector3(0, 1, 0)
const DOWN = new THREE.Vector3(0, -1, 0)
const FORWARD = new THREE.Vector3(0, 0, -1)

const CAPSULE_RADIUS = 0.3

const FIXED_TIMESTEP = 1 / 60

const ZOOM_SPEED = 2
const LOOK_SPEED = 0.1
const MOVE_SPEED = 8
// const MOVE_SPEED = 50
// const MOVE_SPEED = 300 // debug
const MIN_ZOOM = 2
const MAX_ZOOM = 100 // 16
const MAX_SLOPE = 60 // degrees

// const MOVING_SEND_RATE = 1 / 5

const v1 = new THREE.Vector3()
const v2 = new THREE.Vector3()
const v3 = new THREE.Vector3()
const v4 = new THREE.Vector3()
const v5 = new THREE.Vector3()
const v6 = new THREE.Vector3()
const v7 = new THREE.Vector3()
const v8 = new THREE.Vector3()
const e1 = new THREE.Euler(0, 0, 0, 'YXZ')
const q1 = new THREE.Quaternion()
const _v1 = new THREE.Vector3()
const _q1 = new THREE.Quaternion()
const _e1 = new THREE.Euler(0, 0, 0, 'YXZ')

const emotes = {
  idle: 'avatar@idle.glb',
  run: 'avatar@run.glb',
  walk: 'avatar@walk.glb',
  jump: 'avatar@jump.glb',
  float: 'avatar@float.glb',
  sit: 'avatar@sit.glb', // temp: used by fighter-pete
}

const defaults = {
  position: [0, 0, 0],
  vrmUrl: `${process.env.PUBLIC_ASSETS_URL}/wizard_255.vrm`,
  teleportN: 0,
  anchor: null,
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
    this.vrmUrl = this.createNetworkProp('vrmUrl', props.vrmUrl || defaults.vrmUrl)
    this.vrmUrl.onChange = () => this.loadVRM(this)
    this.teleportN = this.createNetworkProp('teleportN', props.teleportN || defaults.teleportN)
    this.anchor = this.createNetworkProp('anchor', props.anchor || defaults.anchor)

    // ghost is just a container that controllers/vrms follow
    this.ghost = new THREE.Object3D()
    this.ghost.position.copy(this.position.value)
    this.ghost.quaternion.copy(this.quaternion.value)

    this.gravity = 9.81
    this.jumpHeight = 1.5

    this.displacement = new THREE.Vector3()
    this.velocity = new THREE.Vector3()

    this.moving = false
    this.moveDir = new THREE.Vector3()

    this.grounded = false
    this.slipping = false
    this.jumping = false
    this.falling = false
    this.airtime = 0

    this.groundAngle = 0
    this.groundNormal = new THREE.Vector3().copy(UP)
    this.groundSweepRadius = CAPSULE_RADIUS - 0.01 // slighty smaller than player
    this.groundSweepGeometry = new PHYSX.PxSphereGeometry(this.groundSweepRadius)
    // this.groundCheckGeometry = new PHYSX.PxSphereGeometry(CAPSULE_RADIUS)

    this.zoom = 6

    this.targetEuler = new THREE.Euler(0, 0, 0, 'YXZ')
    this.targetQuaternion = new THREE.Quaternion()

    this.networkPosition = new NetworkedVector3(this.ghost.position, this.world.network.sendRate)
    this.networkQuaternion = new NetworkedQuaternion(this.ghost.quaternion, this.world.network.sendRate)

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
    // vrm
    await this.loadVRM()

    // capsule
    const radius = CAPSULE_RADIUS
    const halfHeight = (this.vrm.height - radius - radius) / 2
    // console.log(this.vrm.height)
    // console.log({ radius, halfHeight })
    const geometry = new PHYSX.PxCapsuleGeometry(radius, halfHeight)
    // frictionless material (the combine mode ensures we always use out min=0 instead of avging)
    const material = this.world.physics.physics.createMaterial(0, 0, 0)
    material.setFrictionCombineMode(PHYSX.PxCombineModeEnum.eMIN)
    material.setRestitutionCombineMode(PHYSX.PxCombineModeEnum.eMIN)
    const flags = new PHYSX.PxShapeFlags(PHYSX.PxShapeFlagEnum.eSCENE_QUERY_SHAPE | PHYSX.PxShapeFlagEnum.eSIMULATION_SHAPE) // prettier-ignore
    const shape = this.world.physics.physics.createShape(geometry, material, true, flags)
    const localPose = new PHYSX.PxTransform()
    // rotate to stand up
    _q1.set(0, 0, 0).setFromAxisAngle(v1.set(0, 0, 1), Math.PI / 2)
    _q1.toPxTransform(localPose)
    // move capsule up so its base is at 0,0,0
    _v1.set(0, halfHeight + radius, 0)
    _v1.toPxTransform(localPose)
    shape.setLocalPose(localPose)
    const filterData = new PHYSX.PxFilterData(Layers.player.group, Layers.player.mask, 0, 0)
    shape.setQueryFilterData(filterData)
    shape.setSimulationFilterData(filterData)
    const transform = new PHYSX.PxTransform()
    _v1.copy(this.ghost.position)
    _v1.toPxTransform(transform)
    _q1.set(0, 0, 0, 1).toPxTransform(transform)
    this.actor = this.world.physics.physics.createRigidDynamic(transform)
    // this.actor.setMass(0.1)
    this.actor.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eKINEMATIC, false)
    this.actor.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eENABLE_CCD, true)
    this.actor.setRigidDynamicLockFlag(PHYSX.PxRigidDynamicLockFlagEnum.eLOCK_ANGULAR_X, true)
    this.actor.setRigidDynamicLockFlag(PHYSX.PxRigidDynamicLockFlagEnum.eLOCK_ANGULAR_Y, true)
    this.actor.setRigidDynamicLockFlag(PHYSX.PxRigidDynamicLockFlagEnum.eLOCK_ANGULAR_Z, true)
    this.actor.attachShape(shape)
    this.world.physics.scene.addActor(this.actor)
    this.untrack = this.world.physics.track(this.actor, this.onPhysicsMovement)

    // start
    this.world.entities.setHot(this, true)

    if (this.isOwner()) {
      this.bindControls()
      this.world.network.onCameraReady?.()
    }
  }

  onPhysicsMovement = position => {
    // read back controller position and apply to ghost & vrm
    // const radius = CAPSULE_RADIUS
    // const halfHeight = (this.vrm.height - radius - radius) / 2
    // console.log('Player.onPhysicsMovement', position.y, this.vrm.height, radius, halfHeight)
    this.ghost.position.copy(position)
    // this.ghost.position.y -= radius
    this.ghost.updateMatrix()
    this.vrm?.move(this.ghost.matrix)
  }

  bindControls() {
    const world = this.world
    const input = {
      lookActive: false,
      lookDelta: new THREE.Vector3(),
      zoomDelta: 0,
      nextItem: null,
      moveForward: false,
      moveBack: false,
      moveLeft: false,
      moveRight: false,
      jump: false,
      jumpDown: false,
      use: false,
      dodge: false,
    }
    const clearDownKeys = () => {
      // clear down keys so they don't get stuck
      input.use = false
      input.lookActive = false
      input.lookDelta.set(0, 0, 0)
      input.zoomDelta = 0
      input.moveForward = false
      input.moveBack = false
      input.moveLeft = false
      input.moveRight = false
      input.jump = false
      input.jumpDown = false
      input.dodge = false
    }
    this.input = input
    this.control = world.input.bind({
      priority: 0,
      btnDown: code => {
        // console.log('btnDown', code)
        switch (code) {
          case 'MouseLeft':
            input.use = true
            break
          case 'MouseRight':
            this.control.lockPointer()
            input.lookActive = true
            break
          case 'Digit1':
            input.nextItem = 0
            break
          case 'Digit2':
            input.nextItem = 1
            break
          case 'Digit3':
            input.nextItem = 2
            break
          case 'Digit4':
            input.nextItem = 3
            break
          case 'ArrowLeft':
          case 'KeyA':
            input.moveLeft = true
            break
          case 'ArrowRight':
          case 'KeyD':
            input.moveRight = true
            break
          case 'ArrowUp':
          case 'KeyW':
            input.moveForward = true
            break
          case 'ArrowDown':
          case 'KeyS':
            input.moveBack = true
            break
          case 'Space':
            input.jump = true
            input.jumpDown = true
            break
          case 'ShiftLeft':
            input.dodge = true
            break
        }
      },
      btnUp: code => {
        // console.log('btnUp', code)
        switch (code) {
          case 'MouseLeft':
            input.use = false
            break
          case 'MouseRight':
            this.control.unlockPointer()
            input.lookActive = false
            break
          case 'ArrowLeft':
          case 'KeyA':
            input.moveLeft = false
            break
          case 'ArrowRight':
          case 'KeyD':
            input.moveRight = false
            break
          case 'ArrowUp':
          case 'KeyW':
            input.moveForward = false
            break
          case 'ArrowDown':
          case 'KeyS':
            input.moveBack = false
            break
          case 'Space':
            input.jump = false
            input.jumpDown = false
            break
          case 'ShiftLeft':
            input.dodge = false
            break
        }
      },
      move: axis => {
        // wasd/arrows/d-pad/joystick [-1,-1] to [1,1]
        console.log('move', axis)
      },
      pointer: info => {
        // coords of the mouse [0,0] to [1,1]
        // position of the mouse [0,0] to [viewportWidth,viewportHeight]
        // delta of the mouse in pixels
        // console.log('pointer', coords, position, locked)
        if (input.lookActive) {
          input.lookDelta.add(info.delta)
        }
      },
      zoom: delta => {
        input.zoomDelta += delta
      },
      blur: () => {
        clearDownKeys()
      },
      change() {
        clearDownKeys()
      },
    })
    this.control.camera.active = true
  }

  async loadVRM() {
    const n = ++this.vrmN
    const vrm = await this.world.loader.loadVRM(this.vrmUrl.value) // prettier-ignore
    if (this.vrmN !== n) return // stop if vrm url changed again while this one was loading
    if (this.destroyed) return // stop if the player has been destroyed
    if (this.vrm) this.vrm.destroy()
    this.vrm = vrm.factory(this.ghost.matrix, null)
    // console.warn('TODO: controller.resize replacement')
    // this.controller.resize(this.vrm.height - CAPSULE_RADIUS * 2)

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

  fixedUpdate(delta) {
    const isOwner = this.isOwner()
    if (isOwner) {
      // sweep down to see if we hit ground
      let sweepHit
      {
        const geometry = this.groundSweepGeometry
        const origin = v1.copy(this.ghost.position)
        origin.y += this.groundSweepRadius + 0.02 // move up inside player + a bit
        const direction = DOWN
        const maxDistance = 0.02 + 0.1 // outside player + a bit more
        const hitMask = Layers.environment.group | Layers.prop.group | Layers.tool.group
        sweepHit = this.world.physics.sweep(geometry, origin, direction, maxDistance, hitMask)
      }

      // update grounded info
      if (sweepHit) {
        this.justLeftGround = false
        this.grounded = true
        this.groundNormal.copy(sweepHit.normal)
        this.groundAngle = UP.angleTo(this.groundNormal) * RAD2DEG
      } else {
        this.justLeftGround = !!this.grounded
        this.grounded = false
        this.groundNormal.copy(UP)
        this.groundAngle = 0
      }

      // if we jumped and have now left the ground, progress to jumping
      if (this.jumped && !this.grounded) {
        this.jumped = false
        this.jumping = true
      }

      // if jumping and we're now on the ground, clear
      if (this.jumping && this.grounded) {
        this.jumping = false
      }

      // if grounded and not jumping, disable gravity so we don't slide down slopes
      if (this.grounded && !this.jumping) {
        this.actor.setActorFlag(PHYSX.PxActorFlagEnum.eDISABLE_GRAVITY, true)
      } else {
        this.actor.setActorFlag(PHYSX.PxActorFlagEnum.eDISABLE_GRAVITY, false)
      }

      // if on a steep slope, unground and track slipping
      if (this.grounded && this.groundAngle > 60) {
        this.justLeftGround = false
        this.grounded = false
        this.groundNormal.copy(UP)
        this.groundAngle = 0
        this.slipping = true
      } else {
        this.slipping = false
      }

      // apply drag
      const velocity = v1.copy(this.actor.getLinearVelocity())
      const dragCoeff = 12
      // prevent slip and slide
      velocity.x *= 1 - dragCoeff * delta
      velocity.z *= 1 - dragCoeff * delta
      // prevent force from yeeting us upward when going up slopes
      if (this.grounded && !this.jumped) {
        velocity.y *= 1 - dragCoeff * delta
      }
      // when walking of an edge or over the top of a ramp, attempt to snap down to a surface
      if (this.justLeftGround && !this.jumping) {
        velocity.y = -5
      }
      // if slipping ensure we have a constant slip velocity
      if (this.slipping) {
        // force minimum slip velocity + increase if not trying to climb back up
        if (velocity.y > -3.5) velocity.y = -3.5
        velocity.y -= 0.5
      }
      this.actor.setLinearVelocity(velocity.toPxVec3())

      // apply move force, projected onto ground normal
      let moveSpeed = 10 // run
      const slopeRotation = q1.setFromUnitVectors(UP, this.groundNormal)
      const moveForce = v1.copy(this.moveDir).multiplyScalar(moveSpeed * 10).applyQuaternion(slopeRotation) // prettier-ignore
      this.actor.addForce(moveForce.toPxVec3(), PHYSX.PxForceModeEnum.eFORCE, true)

      // apply jump
      if (this.grounded && !this.jumping && this.input.jump) {
        // calc velocity needed to reach jump height
        const jumpVelocity = Math.sqrt(2 * this.gravity * this.jumpHeight)
        // update velocity
        const velocity = this.actor.getLinearVelocity()
        velocity.y = jumpVelocity
        this.actor.setLinearVelocity(velocity)
        // set jumped (we haven't left the ground yet)
        this.jumped = true
      }
    }
  }

  // fixedUpdate(delta) {
  //   const isOwner = this.isOwner()
  //   if (isOwner) {
  //     // perform a sweep to find ground underneath us
  //     let sweepHit
  //     {
  //       const geometry = this.groundSweepGeometry
  //       const origin = v1.copy(this.ghost.position)
  //       origin.y += CAPSULE_RADIUS + 0.02
  //       const direction = DOWN
  //       const maxDistance = 0.1
  //       const hitMask = Layers.environment.group | Layers.prop.group | Layers.tool.group
  //       sweepHit = this.world.physics.sweep(geometry, origin, direction, maxDistance, hitMask)
  //     }
  //     // console.log(!!sweepHit)
  //     // console.log(sweepHit?.distance, sweepHit?.normal.toArray())

  //     // raycast check for ground
  //     // const inset = 0.1
  //     // const origin = v1.copy(this.ghost.position)
  //     // v1.y += inset // move up a bit
  //     // const maxDistance = 0.4
  //     // const hitMask = Layers.environment.group | Layers.prop.group | Layers.tool.group
  //     // const hit = this.world.physics.raycast(origin, DOWN, maxDistance, hitMask)

  //     // overlap test for ground
  //     // const origin = v1.copy(this.ghost.position)
  //     // v1.y -= CAPSULE_RADIUS
  //     // v1.y += 0.1
  //     // const hitMask = Layers.environment.group | Layers.prop.group | Layers.tool.group
  //     // const hit = this.world.physics.overlap(this.groundCheckGeometry, origin, hitMask)

  //     // update grounded info
  //     if (sweepHit) {
  //       this.grounded = true
  //       this.groundNormal.copy(sweepHit.normal)
  //       this.groundAngle = UP.angleTo(this.groundNormal) * RAD2DEG
  //     } else {
  //       this.grounded = false
  //       this.groundAngle = 0
  //       this.groundNormal.copy(UP)
  //     }

  //     let moveSpeed = 10 // run

  //     // if we're on a steep slope, we're slipping
  //     const maxSlope = 60 // deg
  //     if (this.groundAngle > maxSlope) {
  //       this.grounded = false
  //       this.slipping = true
  //       // can't move while slipping
  //       moveSpeed = 0
  //     } else {
  //       this.slipping = false
  //     }

  //     // get velocity
  //     const velocity = v1.copy(this.actor.getLinearVelocity())

  //     // calc slope factor
  //     // const slopeFactor = Math.max(this.groundNormal.dot(UP), 0) // 1=flat 0=vertical

  //     // if we jumped and now we've left the ground, progress to jumping
  //     if (this.jumped && !this.grounded) {
  //       this.jumped = false
  //       this.jumping = true
  //     }

  //     // if jumping and we land on a platform without falling first, cancel jumping
  //     if (this.jumping && this.grounded) {
  //       this.jumping = false
  //     }

  //     // if we're jumping and we start descending, progress to falling
  //     if (this.jumping && velocity.y <= 0) {
  //       this.jumping = false
  //       this.airtime = 0.15 // force into falling time
  //     }

  //     // // if we're not grounded and we're descending, progress to falling
  //     // console.log(velocity.y)
  //     // if (!this.grounded && velocity.y <= 0) {
  //     //   this.jumping = false // ensure no longer jumping
  //     //   this.falling = true
  //     // }

  //     // // if were' falling and we hit ground, cancel falling
  //     // if (this.falling && this.grounded) {
  //     //   this.falling = false
  //     // }

  //     // track airtime
  //     if (this.grounded) {
  //       this.airtime = 0
  //     } else {
  //       this.airtime += delta
  //     }

  //     // we're falling if we've been in the air more than 0.15s
  //     this.falling = this.airtime > 0.15

  //     // if we're grounded on a slope and not jumping, disable gravity so we don't slide down the slope
  //     if (this.grounded && this.groundAngle && !this.jumping) {
  //       this.actor.setActorFlag(PHYSX.PxActorFlagEnum.eDISABLE_GRAVITY, true)
  //     } else {
  //       this.actor.setActorFlag(PHYSX.PxActorFlagEnum.eDISABLE_GRAVITY, false)
  //     }

  //     // if we're not slipping apply drag
  //     if (!this.slipping) {
  //       const dragCoeff = 12
  //       // apply horizontal drag
  //       velocity.x *= 1 - dragCoeff * delta
  //       velocity.z *= 1 - dragCoeff * delta
  //       // apply vertical drag
  //       // note: we only do this to prevent being yeeted upward when moving up slopes
  //       // console.log(this.grounded, this.groundAngle > 0, !this.jumping, velocity.y > 0)
  //       if (this.grounded && this.groundAngle /*&& !this.jumping*/ && velocity.y > 0) {
  //         velocity.y *= 1 - dragCoeff * delta
  //       }
  //     }

  //     // update velocity
  //     this.actor.setLinearVelocity(velocity.toPxVec3())

  //     // this.actor.addForce(moveForce.toPxVec3(), PHYSX.PxForceModeEnum.eFORCE, true)

  //     // const adjustedMoveSpeed = moveSpeed * slopeFactor

  //     // apply move force
  //     const slopeRotation = q1.setFromUnitVectors(UP, this.groundNormal)
  //     const moveForce = v1.copy(this.moveDir).multiplyScalar(moveSpeed * 10).applyQuaternion(slopeRotation) // prettier-ignore
  //     this.actor.addForce(moveForce.toPxVec3(), PHYSX.PxForceModeEnum.eFORCE, true)

  //     // apply move force (alternative)
  //     // const slopeMoveDir = v1.copy(this.moveDir).projectOnPlane(this.groundNormal).normalize()
  //     // const moveForce = v2.copy(slopeMoveDir).multiplyScalar(moveSpeed * 10)
  //     // this.actor.addForce(moveForce.toPxVec3(), PHYSX.PxForceModeEnum.eFORCE, true)

  //     // handle jump key
  //     if (this.grounded && !this.jumping && this.input.jump) {
  //       // calc initial velocity needed to reach our jump height
  //       const initialVelocity = Math.sqrt(2 * this.gravity * this.jumpHeight)
  //       // update velocity
  //       const velocity = this.actor.getLinearVelocity()
  //       velocity.y = initialVelocity
  //       this.actor.setLinearVelocity(velocity)
  //       // set jumped (we haven't left the ground yet)
  //       this.jumped = true
  //     }
  //   }
  // }

  update(delta) {
    // rotate camera when looking (holding right mouse + dragging)
    this.control.camera.rotation.y += -this.input.lookDelta.x * LOOK_SPEED * delta
    this.control.camera.rotation.x += -this.input.lookDelta.y * LOOK_SPEED * delta
    // ensure we can't look too far up/down
    this.control.camera.rotation.x = clamp(this.control.camera.rotation.x, -90 * DEG2RAD, 90 * DEG2RAD)
    // consume lookDelta
    this.input.lookDelta.set(0, 0, 0)

    // zoom camera if scrolling wheel (and not moving an object)
    this.zoom += -this.input.zoomDelta * ZOOM_SPEED * delta
    this.zoom = clamp(this.zoom, MIN_ZOOM, MAX_ZOOM)
    this.control.camera.zoom = this.zoom
    // consume zoomDelta
    this.input.zoomDelta = 0

    // get our movement direction
    this.moveDir.set(0, 0, 0)
    if (this.input.moveForward) this.moveDir.z -= 1
    if (this.input.moveBack) this.moveDir.z += 1
    if (this.input.moveLeft) this.moveDir.x -= 1
    if (this.input.moveRight) this.moveDir.x += 1

    // we're moving if any keys are down
    this.moving = this.moveDir.length() > 0

    // normalize direction for non-joystick (prevents surfing)
    this.moveDir.normalize()

    // rotate direction to face camera Y direction
    const yQuaternion = q1.setFromAxisAngle(UP, this.control.camera.rotation.y)
    this.moveDir.applyQuaternion(yQuaternion)

    // if we're moving continually rotate ourselves toward the direction we are moving
    if (this.moving) {
      const alpha = 1 - Math.pow(0.00000001, delta)
      q1.setFromUnitVectors(FORWARD, this.moveDir)
      this.ghost.quaternion.slerp(q1, alpha)
    }

    // make camera follow our position horizontally
    // and vertically at our vrm model height
    this.control.camera.position.set(
      this.ghost.position.x,
      this.ghost.position.y + this.vrm.height,
      this.ghost.position.z
    )

    // emote
    if (this.jumping) {
      this.vrm.setEmote(emotes.float) // todo: better jump anim
    } else if (this.falling) {
      this.vrm.setEmote(emotes.float)
    } else if (this.moving) {
      this.vrm.setEmote(emotes.run)
    } else {
      this.vrm.setEmote(emotes.idle)
    }
  }

  _update(delta) {
    const isOwner = this.isOwner()

    //
    // Owner
    //

    if (isOwner) {
      const input = this.input
      const camera = this.control.camera
      const ghost = this.ghost

      // rotate camera when looking (holding right mouse + dragging)
      camera.rotation.y += -input.lookDelta.x * LOOK_SPEED * delta
      camera.rotation.x += -input.lookDelta.y * LOOK_SPEED * delta
      input.lookDelta.set(0, 0, 0)

      // zoom camera if scrolling wheel (and not moving an object)
      this.zoom += -input.zoomDelta * ZOOM_SPEED * delta
      this.zoom = clamp(this.zoom, MIN_ZOOM, MAX_ZOOM)
      camera.zoom = this.zoom
      input.zoomDelta = 0

      // switch items (if not performing an action)
      if (!this.action && input.nextItem !== null) {
        this.itemIdx.value = input.nextItem
        input.nextItem = null
      }

      // if not performing an action, check if we should start one
      if (!this.action) {
        if (this.item?.action?.check(this)) {
          this.action = this.item.action
        } else {
          for (const action of this.actions) {
            if (action.check(this)) {
              this.action = action
              break
            }
          }
        }
      }
    }

    // Not Owner

    if (!isOwner) {
      // ...
    }
  }

  _fixedUpdate(delta) {
    const isOwner = this.isOwner()

    //
    // Owner
    //

    if (isOwner) {
      const input = this.input
      const camera = this.control.camera
      const ghost = this.ghost

      // anchor node
      let anchorNode
      let anchorEmote
      if (this.anchor.value) {
        const entity = this.world.entities.getEntity(this.anchor.value.objectId)
        if (!entity) return
        anchorNode = entity.nodes.get(this.anchor.value.node)
        if (anchorNode) anchorEmote = emotes[this.anchor.value.emote]
      }

      // initialize moveDir
      this.moveDir.set(0, 0, 0)

      // if we're not performing an action, use directional input displacement
      if (!this.action || this.action.moveFreedom) {
        // copy input axis
        if (input.moveForward) this.moveDir.z -= 1
        if (input.moveBack) this.moveDir.z += 1
        if (input.moveLeft) this.moveDir.x -= 1
        if (input.moveRight) this.moveDir.x += 1

        // we're moving if any keys are down
        this.isMoving = this.moveDir.length() > 0

        // normalize direction for non-joystick (disables surfing)
        this.moveDir.normalize()

        // rotate direction to face camera Y direction
        const yRigQuaternion = q1.setFromAxisAngle(UP, camera.rotation.y)
        this.moveDir.applyQuaternion(yRigQuaternion)

        // get a quaternion that faces the direction we are moving
        if (this.isMoving) {
          this.targetQuaternion.setFromUnitVectors(FORWARD, this.moveDir)
          // console.log('foo2')
        }

        // apply damping manually (can't use actor.setLinearDamping(10) as it also applies to Y)
        const lvel = this.actor.getLinearVelocity()
        const dampingCoefficient = 12
        lvel.x *= 1 - dampingCoefficient * delta
        lvel.z *= 1 - dampingCoefficient * delta
        this.actor.setLinearVelocity(lvel)

        if (this.action) {
          this.moveDir.multiplyScalar(this.action.moveFreedom)
        }

        const moveForce = 80
        const force = v3.copy(this.moveDir).multiplyScalar(moveForce)

        // apply move force
        this.actor.addForce(force.toPxVec3(), PHYSX.PxForceModeEnum.eIMPULSE * delta, true)
      }

      // progress our action if any
      if (this.action) {
        this.action.update(delta, this)

        v1.copy(this.action.displacement)

        // rotate displacement by player Y-rotation
        v1.applyQuaternion(this.targetQuaternion)

        // multiply our displacement direction by our movement speed
        v1.multiplyScalar(this.action.speed * delta)

        this.displacement.add(v1)

        this.isMoving = false

        // lock on (face camera)
        if (this.action.lockOn) {
          this.targetEuler.set(0, camera.rotation.y, 0)
          this.targetQuaternion.setFromEuler(this.targetEuler)
        }
      }

      // // apply a natural gravity
      // // don't accrue it while anchored
      // if (!this.isGrounded && !anchorNode) {
      //   this.velocity.y -= this.gravity * delta
      // }

      // determine if we're airborn
      // this is used to negate walking down slopes where you come off the ground
      if (this.isGrounded) {
        this.airtime = 0
      } else {
        this.airtime += delta
      }
      this.isAirborn = this.airtime > 0.3

      // if we're grounded and we want to jump, apply jump velocity
      if (this.isGrounded && input.jump && !this.action) {
        // this.velocity.y = Math.sqrt(2 * this.gravity * this.jumpHeight)
        v4.set(0, Math.sqrt(2 * this.gravity * this.jumpHeight), 0).multiplyScalar(50) // WHY 50!?!?!?
        this.actor.addForce(v4.toPxVec3(), PHYSX.PxForceModeEnum.eFORCE, true)
        this.isJumping = true
        input.jump = false // consume
      }
      // // HACK: temp flying
      // if (input.jumpDown) {
      //   this.velocity.y += 1
      // }

      // apply emote
      let emote
      if (anchorEmote) {
        emote = anchorEmote
      } else if (this.action) {
        emote = this.action.emote
      } else if (this.isAirborn || this.isJumping) {
        emote = emotes.float
      } else if (this.isMoving) {
        emote = emotes.run
      } else {
        emote = emotes.idle
      }
      this.vrm.setEmote(emote)
      this.emote.value = emote

      // // apply the velocity (for this frame) to our displacement
      // const velocity = v1.copy(this.velocity).multiplyScalar(delta)
      // this.displacement.add(velocity)

      // ===

      // ===
      // ===
      // ===
      // ===
      // ===
      // ===
      // ===

      v1.copy(this.ghost.position)
      v1.y += 0.1
      const hit = this.world.physics.raycast(
        v1,
        DOWN,
        0.3,
        Layers.environment.group | Layers.prop.group | Layers.tool.group
      )
      this.isGrounded = !!hit

      this.isCeiling = false // TODO: can we remove?

      // const moveDir = v1.set(0, 0, 0)
      // if (input.moveForward) moveDir.z -= 1
      // if (input.moveBack) moveDir.z += 1
      // if (input.moveLeft) moveDir.x -= 1
      // if (input.moveRight) moveDir.x += 1
      // moveDir.normalize()
      // const yRigQuaternion = q1.setFromAxisAngle(UP, camera.rotation.y)
      // moveDir.applyQuaternion(yRigQuaternion)

      // const moveForce = 80
      // const force = v3.copy(this.moveDir).multiplyScalar(moveForce)

      // // apply damping manually (can't use actor.setLinearDamping(10) as it also applies to Y)
      // const lvel = this.actor.getLinearVelocity()
      // const dampingCoefficient = 12
      // lvel.x *= 1 - dampingCoefficient * delta
      // lvel.z *= 1 - dampingCoefficient * delta
      // this.actor.setLinearVelocity(lvel)

      // // // if we're grounded and we want to jump, apply jump velocity
      // // if (input.jump && !this.action) {
      // //   v4.set(0, Math.sqrt(2 * this.gravity * this.jumpHeight), 0).multiplyScalar(50)
      // //   this.actor.addForce(v4.toPxVec3(), PHYSX.PxForceModeEnum.eFORCE, true)
      // //   this.isJumping = true
      // //   input.jump = false // consume
      // // }

      // // apply our force
      // this.actor.addForce(force.toPxVec3(), PHYSX.PxForceModeEnum.eIMPULSE * delta, true) // PHYSX.PxForceModeEnum.eIMPULSE

      // ===

      // // finally apply displacement to our controller
      // this.moveFlags = this.controller.move(
      //   this.displacement.toPxVec3(),
      //   0,
      //   FIXED_TIMESTEP,
      //   this.world.physics.controllerFilters
      // )

      // // check if we're grounded
      // this.isGrounded = this.moveFlags.isSet(PHYSX.PxControllerCollisionFlagEnum.eCOLLISION_DOWN)

      // // check if we hit our head on something
      // this.isCeiling = this.moveFlags.isSet(PHYSX.PxControllerCollisionFlagEnum.eCOLLISION_UP)

      // if we were jumping and now we're grounded, update our variable
      if (this.isJumping && this.isGrounded) {
        this.isJumping = false
      }

      // // if we did hit our head, cancel any jump velocity
      // if (this.isCeiling && this.velocity.y > 0) {
      //   this.velocity.y = -this.gravity * delta
      // }

      // // read back controller position and apply to ghost & vrm
      // const pos = this.controller.getFootPosition()
      // ghost.position.copy(pos)
      // ghost.updateMatrix()
      // this.vrm.move(ghost.matrix)

      // make camera follow our final position horizontally
      // and vertically at our vrm model height
      camera.position.set(ghost.position.x, ghost.position.y + this.vrm.height, ghost.position.z)

      // if we're moving continually rotate ourselves toward the direction we are moving
      if (this.isMoving || this.action) {
        const alpha = 1 - Math.pow(0.00000001, delta)
        ghost.quaternion.slerp(this.targetQuaternion, alpha)
      }

      // clear the action when its complete
      if (this.action?.complete) {
        this.action = null
      }

      // if we're anchored most of above doesn't matter because we're forcing our position
      if (anchorNode) {
        anchorNode.matrixWorld.decompose(this.ghost.position, this.ghost.quaternion, v1)
        this.ghost.updateMatrix()
        this.controller.setFootPosition(this.ghost.position.toPxExtVec3())
        this.vrm.move(this.ghost.matrix)
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

    //
    // Not Owner
    //

    if (!isOwner) {
      // anchor
      let anchorNode
      let anchorEmote
      if (this.anchor.value) {
        const entity = this.world.entities.getEntity(this.anchor.value.objectId)
        if (!entity) return
        anchorNode = entity.nodes.get(this.anchor.value.node)
        if (anchorNode) {
          anchorNode.matrixWorld.decompose(this.ghost.position, this.ghost.quaternion, v1)
          // this.ghost.position.copy(anchorNode.position)
          // this.ghost.quaternion.copy(anchorNode.quaternion)
          anchorEmote = emotes[this.anchor.value.emote]
        }
      }
      // move
      if (!anchorNode) {
        this.networkPosition.update(this.position.value, this.teleportN.value, delta)
        this.networkQuaternion.update(this.quaternion.value, this.teleportN.value, delta)
      }
      this.ghost.updateMatrix()
      this.vrm.move(this.ghost.matrix)
      this.controller.setFootPosition(this.ghost.position.toPxExtVec3())
      // emote
      this.vrm.setEmote(anchorEmote || this.emote.value)
      // item attachment
      if (this.item?.model) {
        this.vrm.applyBoneMatrixWorld(this.item.boneName, this.item.model.matrix)
        this.item.model.matrixWorld.copy(this.item.model.matrix)
      }
    }
  }

  teleport(x, y, z) {
    this.ghost.position.set(x, y, z)
    this.ghost.updateMatrix()
    this.vrm.move(this.ghost.matrix)
    this.controller.setFootPosition(this.ghost.position.toPxExtVec3())
    this.teleportN.value++
  }

  setAnchor(objectId, node, emote) {
    if (objectId && node) {
      this.anchor.value = { objectId, node, emote }
    } else {
      this.anchor.value = null
      this.teleportN.value++
    }
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

  // fixedUpdate(delta) {
  //   // ...
  // }

  // lateUpdate(delta) {
  //   // ...
  // }

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
    this.world.entities.setHot(this, false)
    this.vrm?.destroy()
    this.controller.release()
    this.controller = null
    if (this.item?.model) {
      this.world.graphics.scene.remove(this.item.model)
    }
    this.control?.release()
    this.control = null
  }
}
