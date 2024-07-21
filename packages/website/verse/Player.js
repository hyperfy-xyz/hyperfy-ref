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

const UP = new THREE.Vector3(0, 1, 0)
const FORWARD = new THREE.Vector3(0, 0, -1)

const FIXED_TIMESTEP = 1 / 60

const ZOOM_SPEED = 2
const LOOK_SPEED = 0.1
const MOVE_SPEED = 8

const v1 = new THREE.Vector3()
const e1 = new THREE.Euler(0, 0, 0, 'YXZ')
const q1 = new THREE.Quaternion()

const emotes = {
  idle: 'avatar@idle.glb',
  run: 'avatar@run.glb',
  walk: 'avatar@walk.glb',
  float: 'avatar@float.glb',
}

export class Player extends Entity {
  constructor(world, data) {
    super(world, data)
    this.type === 'player'
    this.isPlayer = true

    this.blah = this.createVar(0, 'blah')
    this.blah.onChange = (oldValue, newValue) => {
      console.log('blah', oldValue, newValue)
    }

    // const onTestChange = (oldValue, newValue) => {
    //   console.log('onTestChange', oldValue, newValue)
    // }
    // this.addFoob(String, 'test',  'TEST-1', onTestChange, true) // prettier-ignore
    // this.addFoob(
    //   Vector3,
    //   'vec3',
    //   [0, 0, 0],
    //   (oldValue, newValue) => {
    //     console.log('vec3', oldValue, newValue)
    //   },
    //   true
    // )

    this.clientId = data.clientId

    this.root = new THREE.Object3D()
    this.root.position.fromArray(data.position)
    this.root.quaternion.fromArray(data.quaternion)

    this.networkPosition = new THREE.Vector3().copy(this.root.position)
    this.networkQuaternion = new THREE.Quaternion().copy(this.root.quaternion)

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

    this.actions = [new DodgeAction(), new DoubleJumpAction()]

    this.items = [
      {
        modelUrl: null,
        boneName: null,
        action: new PunchAction(),
      },
      {
        modelUrl: `${process.env.PUBLIC_ASSETS_URL}/weapon-sword.glb`,
        boneName: 'Right_Hand',
        action: new SwordAction(),
      },
      {
        modelUrl: `${process.env.PUBLIC_ASSETS_URL}/weapon-hammer.glb`,
        boneName: 'Right_Hand',
        action: new HammerAction(),
      },
      {
        modelUrl: `${process.env.PUBLIC_ASSETS_URL}/weapon-bow.glb`,
        boneName: 'Left_Hand',
        action: new BowAction(),
      },
    ]
    this.item = null

    this.init()
  }

  async init() {
    const height = 1
    const radius = 0.4

    // vrm
    const vrmNode = await this.world.loader.load(`${process.env.PUBLIC_ASSETS_URL}/wizard_255.vrm`, 'vrm') // prettier-ignore
    this.vrm = vrmNode.children[0].factory({ entity: this }, this.root.matrix)

    // todo: check player wasn't destroyed or another vrm loaded

    // controller
    const desc = new PHYSX.PxCapsuleControllerDesc()
    desc.height = height
    desc.radius = radius
    desc.climbingMode = PHYSX.PxCapsuleClimbingModeEnum.eCONSTRAINED
    desc.slopeLimit = Math.cos(60 * DEG2RAD) // 60 degrees
    desc.material = this.world.physics.defaultMaterial
    desc.contactOffset = 0.1 // PhysX default = 0.1
    desc.stepOffset = 0.5 // PhysX default = 0.5m
    this.controller = this.world.physics.controllerManager.createController(desc) // prettier-ignore
    PHYSX.destroy(desc)
    this.controller.setFootPosition(this.root.position.toPxExtVec3())

    // camera
    this.world.graphics.cameraRig.position.y = this.vrm.height
    this.world.graphics.cameraRig.rotation.x = -25 * DEG2RAD
    this.world.graphics.camera.position.z = 6

    // start
    // this.world.graphics.scene.add(this.vrm)
    this.world.entities.incActive(this)
    this.world.network.onCameraReady?.()
  }

  isOwner() {
    return this.clientId === this.world.network.client.id
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
      this.zoom = clamp(this.zoom, 4, 16)
    }
    v1.set(0, 0, this.zoom)
    camera.position.lerp(v1, 0.1)

    // switch items (if not performing an action)
    if (!this.action) {
      if (input.pressed.Digit1) {
        this.setItem(this.items[0])
      } else if (input.pressed.Digit2) {
        this.setItem(this.items[1])
      } else if (input.pressed.Digit3) {
        this.setItem(this.items[2])
      } else if (input.pressed.Digit4) {
        this.setItem(this.items[3])
      }
    }

    // if not performing an action, check if we should start one
    if (!this.action) {
      if (this.item?.action?.check(input, this.isMoving, this)) {
        this.action = this.item.action
      } else {
        for (const action of this.actions) {
          if (action.check(input, this.isMoving, this)) {
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

    // if we're grounded, set fixed gravity
    // if we're not grounded, continally apply gravity
    if (this.isGrounded) {
      this.velocity.y = -this.gravity * delta
    } else {
      this.velocity.y -= this.gravity * delta
    }

    // if we're grounded and we want to jump, apply jump velocity
    if (this.isGrounded && input.down.Space && !this.action) {
      this.velocity.y = Math.sqrt(2 * this.gravity * this.jumpHeight)
      this.isJumping = true
    }

    // apply emote
    if (this.action) {
      this.vrm.setEmote(this.action.emote)
    } else if (!this.isGrounded) {
      this.vrm.setEmote(emotes.float)
    } else if (this.isMoving) {
      this.vrm.setEmote(emotes.run)
    } else {
      this.vrm.setEmote(emotes.idle)
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

    // read back controller position and apply to root & vrm
    const pos = this.controller.getFootPosition()
    this.root.position.copy(pos)
    this.root.updateMatrix()
    this.vrm.move(this.root.matrix)

    // make camera follow our final position horizontally
    // and vertically at our vrm model height
    rig.position.set(
      this.root.position.x,
      this.root.position.y + this.vrm.height,
      this.root.position.z
    )

    // if we're moving continually rotate ourselves toward the direction we are moving
    if (this.isMoving || this.action) {
      const alpha = 1 - Math.pow(0.00000001, delta)
      this.root.quaternion.slerp(this.targetQuaternion, alpha)
    }

    // clear the action when its complete
    if (this.action?.complete) {
      this.action = null
    }

    if (this.item?.model) {
      this.vrm.applyBoneMatrixWorld(this.item.boneName, this.item.model.matrix)
      this.item.model.matrixWorld.copy(this.item.model.matrix)
    }
  }

  updateRemote(delta) {
    // ...
  }

  async setItem(item) {
    // clear any current item
    if (this.item) {
      if (this.item.model) {
        this.world.graphics.scene.remove(this.item.model)
      }
    }
    this.item = item
    if (item.modelUrl) {
      // load it if we haven't yet
      if (!item.model) {
        const glb = await this.world.loader.loadGLBRaw(item.modelUrl)
        item.model = glb.scene
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

  // applyLocalChanges({ sync, state, props }) {
  //   if (state) {
  //     const changed = {}
  //     for (const key in state) {
  //       const value = state[key]
  //       if (this.state[key] !== value) {
  //         this.state[key] = value
  //         changed[key] = value
  //       }
  //     }
  //     if (sync && !isEmpty(changed)) {
  //       const data = this.getUpdate()
  //       data.state = {
  //         ...data.state,
  //         ...changed,
  //       }
  //     }
  //   }
  //   if (props) {
  //     let moved
  //     let moded
  //     const changed = {}
  //     if (props.position) {
  //       this.root.position.copy(props.position)
  //       changed.position = this.root.position.toArray()
  //       moved = true
  //     }
  //     if (props.quaternion) {
  //       this.root.quaternion.copy(props.quaternion)
  //       changed.quaternion = this.root.quaternion.toArray()
  //       moved = true
  //     }
  //     if (props.hasOwnProperty('mode')) {
  //       if (this.mode !== props.mode) {
  //         this.mode = props.mode
  //         changed.mode = props.mode
  //         moded = true
  //       }
  //     }
  //     if (props.hasOwnProperty('modeClientId')) {
  //       if (this.modeClientId !== props.modeClientId) {
  //         this.modeClientId = props.modeClientId
  //         changed.modeClientId = props.modeClientId
  //         moded = true
  //       }
  //     }
  //     if (props.hasOwnProperty('uploading')) {
  //       if (this.uploading !== props.uploading) {
  //         this.uploading = props.uploading
  //         changed.uploading = props.uploading
  //       }
  //     }
  //     if (moved) {
  //       this.root.dirty()
  //     }
  //     if (moded) {
  //       this.checkMode()
  //     }
  //     if (sync && !isEmpty(changed)) {
  //       const data = this.getUpdate()
  //       data.props = {
  //         ...data.props,
  //         ...changed,
  //       }
  //     }
  //   }
  // }

  // applyNetworkChanges({ state, props }) {
  //   if (state) {
  //     for (const key in state) {
  //       this.state[key] = state[key]
  //       this.stateChanges[key] = state[key]
  //     }
  //   }
  //   if (props) {
  //     if (props.position) {
  //       this.networkPosition.fromArray(props.position)
  //     }
  //     if (props.quaternion) {
  //       this.networkQuaternion.fromArray(props.quaternion)
  //     }
  //     if (props.mode) {
  //       this.mode = props.mode
  //       this.modeClientId = props.modeClientId
  //       this.checkMode()
  //     }
  //     if (props.hasOwnProperty('uploading')) {
  //       if (props.uploading !== null) {
  //         console.error('uploading should only ever be nulled')
  //       }
  //       if (this.uploading !== props.uploading) {
  //         this.uploading = props.uploading
  //         this.load()
  //       }
  //     }
  //   }
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
    this.world.entities.decActive(this, true)
    this.world.graphics.scene.remove(this.vrm)
    this.controller.release()
    this.controller = null
    this.destroyed = true
  }
}

// class RollAction {
//   constructor() {
//     this.emote = emotes.roll
//     this.displacement = new THREE.Vector3(0, 0, -1)
//     this.speed = 20
//     this.time = 0
//     this.complete = false
//     this.targetCamera = false
//   }
//   update(delta) {
//     this.time += delta
//     if (this.time > 0.5) {
//       this.complete = true
//     }
//   }
//   reset() {
//     this.time = 0
//     this.complete = false
//   }
// }

// class BackstepAction {
//   constructor() {
//     this.emote = emotes.backstep
//     this.displacement = new THREE.Vector3(0, 0, 1)
//     this.speed = 10
//     this.time = 0
//     this.complete = false
//     this.targetCamera = false
//   }
//   update(delta) {
//     this.time += delta
//     if (this.time > 0.4) {
//       this.complete = true
//     }
//   }
//   reset() {
//     this.time = 0
//     this.complete = false
//   }
// }

// class MeleeStrikeAction {
//   constructor() {
//     this.emote = emotes.meleeStrike
//     this.displacement = new THREE.Vector3(0, 0, -0.5)
//     this.speed = 1
//     this.time = 0
//     this.complete = false
//     this.targetCamera = true
//   }
//   update(delta) {
//     this.time += delta
//     if (this.time > 0.5) {
//       this.complete = true
//     }
//   }
//   reset() {
//     this.time = 0
//     this.complete = false
//   }
// }

// class MeleePummelAction {
//   constructor() {
//     this.emote = emotes.meleePummel
//     this.displacement = new THREE.Vector3(0, 0, -0.1)
//     this.speed = 1
//     this.time = 0
//     this.complete = false
//     this.targetCamera = true
//   }
//   update(delta) {
//     this.time += delta
//     if (this.time > 1.23) {
//       this.complete = true
//     }
//   }
//   reset() {
//     this.time = 0
//     this.complete = false
//   }
// }
