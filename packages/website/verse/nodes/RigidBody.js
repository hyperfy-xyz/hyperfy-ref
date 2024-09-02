import * as THREE from 'three'

import { Node } from './Node'
import { isNumber } from 'lodash-es'

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _q1 = new THREE.Quaternion()
const _m1 = new THREE.Matrix4()
const _m2 = new THREE.Matrix4()
const _m3 = new THREE.Matrix4()
const _defaultScale = new THREE.Vector3(1, 1, 1)

const types = ['static', 'kinematic', 'dynamic']
const reservedTags = ['player']

const defaults = {
  type: 'static',
  mass: 1,
  tag: null,
  onContactStart: null,
  onContactEnd: null,
  onTriggerEnter: null,
  onTriggerLeave: null,
}

export class RigidBody extends Node {
  constructor(data = {}) {
    super(data)
    this.name = 'rigidbody'

    this.shapes = new Set()

    this.type = data.type || defaults.type
    this.mass = isNumber(data.mass) ? data.mass : defaults.mass
    this.tag = data.tag || defaults.tag
    this.onContactStart = data.onContactStart
    this.onContactEnd = data.onContactEnd
    this.onTriggerEnter = data.onTriggerEnter
    this.onTriggerLeave = data.onTriggerLeave

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
      // this.untrack = this.ctx.world.physics.track(this.actor, this.onPhysicsMovement)
    } else if (this.type === 'dynamic') {
      this.actor = this.ctx.world.physics.physics.createRigidDynamic(this.transform)
      // this.actor.setMass(this.mass)
      PHYSX.PxRigidBodyExt.prototype.setMassAndUpdateInertia(this.actor, this.mass)
      // this.untrack = this.ctx.world.physics.track(this.actor, this.onPhysicsMovement)
    }
    for (const shape of this.shapes) {
      this.actor.attachShape(shape)
    }
    const self = this
    this.removeActor = this.ctx.world.physics.addActor(this.actor, {
      onInterpolate: this.type === 'kinematic' || this.type === 'dynamic' ? this.onInterpolate : null,
      get tag() {
        return self.tag
      },
      get onContactStart() {
        return self.onContactStart
      },
      get onContactEnd() {
        return self.onContactEnd
      },
      get onTriggerEnter() {
        return self.onTriggerEnter
      },
      get onTriggerLeave() {
        return self.onTriggerLeave
      },
    })
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

  onInterpolate = (position, quaternion) => {
    if (this.parent) {
      _m1.compose(position, quaternion, _defaultScale)
      _m2.copy(this.parent.matrixWorld).invert()
      _m3.multiplyMatrices(_m2, _m1)
      _m3.decompose(this.position, this.quaternion, _v1)
      // this.matrix.copy(_m3)
      // this.matrixWorld.copy(_m1)
    } else {
      this.position.copy(position)
      this.quaternion.copy(quaternion)
      // this.matrix.compose(this.position, this.quaternion, this.scale)
      // this.matrixWorld.copy(this.matrix)
    }
  }

  unmount() {
    if (this.actor) {
      // this.untrack?.()
      // this.untrack = null
      this.removeActor?.()
      this.removeActor = null
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
    this.tag = source.tag
    this.onContactStart = source.onContactStart
    this.onContactEnd = source.onContactEnd
    this.onTriggerEnter = source.onTriggerEnter
    this.onTriggerLeave = source.onTriggerLeave
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
        get tag() {
          return self.tag
        },
        set tag(value) {
          if (reservedTags.includes(value)) throw new Error('[rigidbody] cannot use reserved tag:', value)
          self.tag = value
        },
        get onContactStart() {
          return self.onContactStart
        },
        set onContactStart(value) {
          self.onContactStart = value
        },
        get onContactEnd() {
          return self.onContactEnd
        },
        set onContactEnd(value) {
          self.onContactEnd = value
        },
        get onTriggerEnter() {
          return self.onTriggerEnter
        },
        set onTriggerEnter(value) {
          self.onTriggerEnter = value
        },
        get onTriggerLeave() {
          return self.onTriggerLeave
        },
        set onTriggerLeave(value) {
          self.onTriggerLeave = value
        },
        addForce(force, mode) {
          // TODO: modes + enums injected into script
          self.actor?.addForce(force.toPxVec3(), PHYSX.PxForceModeEnum.eFORCE, true)
        },
        addTorque(torque, mode) {
          // TODO: modes + enums injected into script
          self.actor?.addTorque(torque.toPxVec3(), PHYSX.PxForceModeEnum.eFORCE, true)
        },
        getPosition(vec3 = _v1) {
          if (!self.actor) return vec3.set(0, 0, 0)
          const pose = self.actor.getGlobalPose()
          vec3.copy(pose.p)
          return vec3
        },
        setPosition(vec3) {
          if (!self.actor) return
          const pose = self.actor.getGlobalPose()
          vec3.toPxTransform(pose)
          self.actor.setGlobalPose(pose)
        },
        getQuaternion(quat = _q1) {
          if (!self.actor) return quat.set(0, 0, 0)
          const pose = self.actor.getGlobalPose()
          quat.copy(pose.q)
          return quat
        },
        setQuaternion(quat) {
          if (!self.actor) return
          const pose = self.actor.getGlobalPose()
          quat.toPxTransform(pose)
          self.actor.setGlobalPose(pose)
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
