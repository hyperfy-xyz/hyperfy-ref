import * as THREE from 'three'

import { Node } from './Node'
import { isNumber } from 'lodash-es'

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _q1 = new THREE.Quaternion()

const types = ['static', 'kinematic', 'dynamic']

const defaults = {
  type: 'static',
  mass: 1,
}

export class RigidBody extends Node {
  constructor(data = {}) {
    super(data)
    this.name = 'rigidbody'

    this.shapes = new Set()

    this.type = data.type || defaults.type
    this.mass = isNumber(data.mass) ? data.mass : defaults.mass

    this._tm = new PHYSX.PxTransform(PHYSX.PxIDENTITYEnum.PxIdentity)
  }

  mount() {
    if (!this.ctx.active) return // ignore if just placing/moving
    this.matrixWorld.decompose(_v1, _q1, _v2)
    this.transform = new PHYSX.PxTransform(PHYSX.PxIDENTITYEnum.PxIdentity)
    _v1.toPxTransform(this.transform)
    _q1.toPxTransform(this.transform)
    if (this.type === 'static') {
      this.actor = this.ctx.world.physics.physics.createRigidStatic(this.transform)
    } else if (this.type === 'kinematic') {
      this.actor = this.ctx.world.physics.physics.createRigidDynamic(this.transform)
      this.actor.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eKINEMATIC, true)
      // this.actor.setMass(this.mass)
      PHYSX.PxRigidBodyExt.prototype.setMassAndUpdateInertia(this.actor, this.mass)
      this.untrack = this.ctx.world.physics.track(this.actor, this.onPhysicsMovement)
    } else if (this.type === 'dynamic') {
      this.actor = this.ctx.world.physics.physics.createRigidDynamic(this.transform)
      // this.actor.setMass(this.mass)
      PHYSX.PxRigidBodyExt.prototype.setMassAndUpdateInertia(this.actor, this.mass)
      this.untrack = this.ctx.world.physics.track(this.actor, this.onPhysicsMovement)
    }
    for (const shape of this.shapes) {
      this.actor.attachShape(shape)
    }
    this.ctx.world.physics.scene.addActor(this.actor)
    this.needsRebuild = false
  }

  commit(didMove) {
    if (this.needsRebuild) {
      this.unmount()
      this.mount()
      return
    }
    if (didMove) {
      if (this.actor) {
        // handled via physics system as sometimes these are ignored
        this.ctx.world.physics.setGlobalPose(this.actor, this.matrixWorld)
      }
    }
  }

  unmount() {
    if (this.actor) {
      this.untrack?.()
      this.untrack = null
      this.ctx.world.physics.scene.removeActor(this.actor)
      this.actor.release()
      this.actor = null
    }
  }

  addShape(shape) {
    this.shapes.add(shape)
    if (this.actor) {
      this.actor.attachShape(shape)
    }
  }

  removeShape(shape) {
    this.shapes.delete(shape)
    if (this.actor) {
      this.actor.detachShape(shape)
    }
  }

  copy(source, recursive) {
    super.copy(source, recursive)
    this.type = source.type
    this.mass = source.mass
    return this
  }

  getProxy() {
    if (!this.proxy) {
      const self = this
      let proxy = {
        get type() {
          return self.type
        },
        set type(value) {
          if (self.type === value) return
          if (!types.includes(value)) throw new Error(`[rigidbody] invalid type: ${value}`)
          const prev = self.type
          self.type = value
          if ((prev === 'kinematic' || prev === 'dynamic') && (value === 'kinematic' || value === 'dynamic')) {
            // kinematic <-> dynamic is just a flag change
            self.actor.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eKINEMATIC, value === 'kinematic')
          } else {
            self.needsRebuild = true
            self.setDirty()
          }
        },
        get mass() {
          return self.mass
        },
        set mass(value) {
          if (!isNumber(value) || value < 0) throw new Error('[rigidbody] mass must be >= 0')
          self.mass = value
          // self.actor?.setMass?.(value)
          if (self.actor) {
            PHYSX.PxRigidBodyExt.prototype.setMassAndUpdateInertia(self.actor, self.mass)
          }
        },
        addForce(force, mode) {
          // TODO: modes + enums injected into script
          self.actor?.addForce(force.toPxVec3(), PHYSX.PxForceModeEnum.eFORCE, true)
        },
        addTorque(torque, mode) {
          // TODO: modes + enums injected into script
          self.actor?.addTorque(torque.toPxVec3(), PHYSX.PxForceModeEnum.eFORCE, true)
        },
        getLinearVelocity(vec3 = _v1) {
          if (!self.actor) return vec3.set(0, 0, 0)
          return vec3.fromPxVec3(self.actor.getLinearVelocity())
        },
        setLinearVelocity(vec3) {
          self.actor?.setLinearVelocity(vec3.toPxVec3())
        },
        getAngularVelocity(vec3 = _v1) {
          if (!self.actor) return vec3.set(0, 0, 0)
          return vec3.fromPxVec3(self.actor.getAngularVelocity())
        },
        setAngularVelocity(vec3) {
          self.actor?.setAngularVelocity(vec3.toPxVec3())
        },
        setKinematicTarget(position, quaternion) {
          if (self.type !== 'kinematic') {
            throw new Error('[rigidbody] setKinematicTarget failed (not kinematic)')
          }
          position.toPxTransform(self._tm)
          quaternion.toPxTransform(self._tm)
          self.actor?.setKinematicTarget(self._tm)
        },
      }
      proxy = Object.defineProperties(proxy, Object.getOwnPropertyDescriptors(super.getProxy())) // inherit Node properties
      this.proxy = proxy
    }
    return this.proxy
  }
}
