import * as THREE from 'three'

import { Node } from './Node'

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _q1 = new THREE.Quaternion()

const DEFAULT_PHYSICS_ANGULAR_LOCK = [false, false, false]

export class Capsule extends Node {
  constructor(entity, data) {
    super(entity, data)
    this.radius = data.radius || 0.25
    this.height = data.height || 1
    this.physics = data.physics || null
    this.physicsAngularLock = data.physicsAngularLock || DEFAULT_PHYSICS_ANGULAR_LOCK // prettier-ignore
    this.visible = !!data.visible
  }

  mount() {
    if (this.visible) {
      const geometry = new THREE.CapsuleGeometry(this.radius, this.height, 2, 8)
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
    if (this.physics) {
      const geometry = new PHYSX.PxCapsuleGeometry(this.radius, this.height / 2)
      const material = this.space.physics.physics.createMaterial(0.5, 0.5, 0.5)
      const flags = new PHYSX.PxShapeFlags(
        PHYSX.PxShapeFlagEnum.eSCENE_QUERY_SHAPE |
          PHYSX.PxShapeFlagEnum.eSIMULATION_SHAPE
      )
      const tmpFilterData = new PHYSX.PxFilterData(1, 1, 0, 0)
      const shape = this.space.physics.physics.createShape(
        geometry,
        material,
        true,
        flags
      )
      shape.setSimulationFilterData(tmpFilterData)
      fixCapsule(shape)
      this.mesh.matrixWorld.decompose(_v1, _q1, _v2)
      const transform = new PHYSX.PxTransform()
      transform.p.x = _v1.x
      transform.p.y = _v1.y
      transform.p.z = _v1.z
      transform.q.x = _q1.x
      transform.q.y = _q1.y
      transform.q.z = _q1.z
      transform.q.w = _q1.w
      if (this.physics === 'dynamic') {
        this.body = this.space.physics.physics.createRigidDynamic(transform)
        this.body.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eKINEMATIC, false)
        this.body.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eENABLE_CCD, true)
        if (this.physicsAngularLock[0]) {
          this.body.setRigidDynamicLockFlag(
            PHYSX.PxRigidDynamicLockFlagEnum.eLOCK_ANGULAR_X,
            true
          )
        }
        if (this.physicsAngularLock[1]) {
          this.body.setRigidDynamicLockFlag(
            PHYSX.PxRigidDynamicLockFlagEnum.eLOCK_ANGULAR_Y,
            true
          )
        }
        if (this.physicsAngularLock[2]) {
          this.body.setRigidDynamicLockFlag(
            PHYSX.PxRigidDynamicLockFlagEnum.eLOCK_ANGULAR_Z,
            true
          )
        }
        // this.body.setMass(50) // todo: data.mass
      } else if (this.physics === 'kinematic') {
        this.body = this.space.physics.physics.createRigidStatic(transform)
        this.body.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eKINEMATIC, true)
        this.body.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eENABLE_CCD, false)
      } else {
        this.body = this.space.physics.physics.createRigidStatic(transform)
      }
      this.body.attachShape(shape)
      this.space.physics.scene.addActor(this.body)
      if (this.physics === 'dynamic') {
        this.unbind = this.space.physics.bind(this.body, this)
      }
    }
  }

  addForce(force, impulse) {
    if (!this.body) return
    const pForce = toPxVec3(force)
    if (impulse) {
      this.body.addForce(pForce, PHYSX.PxForceModeEnum.eIMPULSE)
    } else {
      this.body.addForce(pForce, PHYSX.PxForceModeEnum.eFORCE)
    }
  }

  update() {
    // console.log('box update pos', this.position.toArray())
    // console.log('box update matrix', this.matrix.toArray())
    // console.log('box update matrixWorld', this.matrixWorld.toArray())
    if (this.mesh) {
      this.mesh.matrix.copy(this.matrix)
      this.mesh.matrixWorld.copy(this.matrixWorld)
    }
  }

  unmount() {
    if (this.mesh) {
      this.space.graphics.scene.remove(this.mesh)
    }
    if (this.body) {
      this.unbind()
    }
  }

  getProxy() {
    if (!this.proxy) {
      const self = this
      const proxy = {
        ...super.getProxy(),
        addForce(force, mode) {
          self.addForce(force, mode)
        },
      }
      this.proxy = proxy
    }
    return this.proxy
  }
}

let offset
const fixCapsule = shape => {
  // capsules are X axis in physx, rotate up
  // see: https://gameworksdocs.nvidia.com/PhysX/4.1/documentation/physxguide/Manual/Geometry.html?highlight=capsule
  if (!offset) {
    const rotation = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      Math.PI / 2
    )
    offset = new PHYSX.PxTransform(PHYSX.PxIDENTITYEnum.PxIdentity)
    offset.q.x = rotation.x
    offset.q.y = rotation.y
    offset.q.z = rotation.z
    offset.q.w = rotation.w
  }
  shape.setLocalPose(offset)
}

let _vec3
const toPxVec3 = vec3 => {
  if (!_vec3) _vec3 = new PHYSX.PxVec3(0, 0, 0)
  _vec3.x = vec3.x
  _vec3.y = vec3.y
  _vec3.z = vec3.z
  return _vec3
}
