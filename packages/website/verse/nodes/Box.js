import * as THREE from 'three'
import { isBoolean } from 'lodash-es'

import { Layers } from '../extras/Layers'

import { Node } from './Node'

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _q1 = new THREE.Quaternion()

const defaults = {
  size: [1, 1, 1],
  color: 'blue',
  physics: null,
  visible: true,
}

// WIP batch mesh - has issues, eg no per-mesh layers and stuff
// const batchGroups = {} // [key] [...batches]
// const getBatch = (world, color) => {
//   const key = color
//   let group = batchGroups[key]
//   if (!group) {
//     group = []
//     batchGroups[key] = group
//   }
//   let batch = group.find(batch => batch._geometryCount < batch._maxGeometryCount)
//   if (!batch) {
//     const material = new THREE.MeshStandardMaterial({ color })
//     batch = new THREE.BatchedMesh(100, 8*100, undefined, material)
//     world.graphics.scene.add(batch)
//     group.push(batch)
//   }
//   return batch
// }

export class Box extends Node {
  constructor(data = {}) {
    super(data)
    this.type = 'box'
    this.isBox = true
    this.size = data.size || defaults.size.slice()
    this.color = data.color || defaults.color
    this.physics = data.physics || defaults.physics
    this.visible = isBoolean(data.visible) ? data.visible : defaults.visible
  }

  mount() {
    if (this.visible) {
      const geometry = new THREE.BoxGeometry(...this.size)
      geometry.computeBoundsTree()
      const material = new THREE.MeshStandardMaterial({
        color: this.color,
        roughness: 1,
        metalness: 0,
      })
      this.mesh = new THREE.Mesh(geometry, material)
      this.mesh.receiveShadow = true
      this.mesh.castShadow = true
      this.mesh.matrixAutoUpdate = false
      this.mesh.matrixWorldAutoUpdate = false
      this.mesh.matrix.copy(this.matrixWorld)
      this.mesh.matrixWorld.copy(this.matrixWorld)
      this.mesh.node = this
      // if (this.layer) this.mesh.layers.set(this.layer)
      this.ctx.world.graphics.scene.add(this.mesh)
      this.sItem = {
        matrix: this.matrixWorld,
        geometry: this.mesh.geometry,
        material: this.mesh.material,
        getEntity: () => {
          return this.ctx.entity
        },
      }
      this.ctx.world.spatial.octree.insert(this.sItem)

      this.mesh.matrix.decompose(
        this.mesh.position,
        this.mesh.quaternion,
        this.mesh.scale
      )
      // console.log('Box pos (mount)', this.mesh.position)
    }
    if (this.physics) {
      const geometry = new PHYSX.PxBoxGeometry(
        this.size[0] / 2,
        this.size[1] / 2,
        this.size[2] / 2
      )
      const material = this.ctx.world.physics.physics.createMaterial(
        0.5,
        0.5,
        0.5
      )
      const flags = new PHYSX.PxShapeFlags(
        PHYSX.PxShapeFlagEnum.eSCENE_QUERY_SHAPE |
          PHYSX.PxShapeFlagEnum.eSIMULATION_SHAPE
      )
      const filterData = this.ctx.world.physics.layers.object
      const shape = this.ctx.world.physics.physics.createShape(
        geometry,
        material,
        true,
        flags
      )
      shape.setSimulationFilterData(filterData)
      this.transform = new PHYSX.PxTransform()
      this.matrixWorld.decompose(_v1, _q1, _v2)
      _v1.toPxTransform(this.transform)
      _q1.toPxTransform(this.transform)
      if (this.physics === 'dynamic') {
        this.body = this.ctx.world.physics.physics.createRigidDynamic(this.transform) // prettier-ignore
        this.body.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eKINEMATIC, false)
        this.body.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eENABLE_CCD, true)
      } else if (this.physics === 'kinematic') {
        this.body = this.ctx.world.physics.physics.createRigidDynamic(this.transform) // prettier-ignore
        this.body.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eKINEMATIC, true)
        this.body.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eENABLE_CCD, false)
      } else {
        this.body = this.ctx.world.physics.physics.createRigidStatic(this.transform) // prettier-ignore
      }
      this.body.attachShape(shape)
      this.ctx.world.physics.scene.addActor(this.body)
      if (this.physics === 'dynamic') {
        this.unbind = this.ctx.world.physics.bind(this.body, this)
      }
    }
  }

  update() {
    if (this.mesh) {
      // this.matrixWorld.decompose(_v1, _q1, _v2)
      this.mesh.matrix.copy(this.matrixWorld)
      this.mesh.matrixWorld.copy(this.matrixWorld)
      this.mesh.matrix.decompose(
        this.mesh.position,
        this.mesh.quaternion,
        this.mesh.scale
      )
      this.ctx.world.spatial.octree.move(this.sItem)
      // console.log('Box pos (update)', this.mesh.position.toArray())

      // this.mesh.position.toPxTransform(this.transform)
      // this.mesh.quaternion.toPxTransform(this.transform)
      // this.body.setGlobalPose(this.transform)
    }
  }

  unmount() {
    if (this.mesh) {
      this.ctx.world.graphics.scene.remove(this.mesh)
      this.ctx.world.spatial.octree.remove(this.sItem)
    }
    if (this.body) {
      this.ctx.world.physics.scene.removeActor(this.body)
      this.unbind?.()
    }
  }

  addForce(force) {
    if (!this.body) return
    this.body.addForce(force.toPxVec3(), PHYSX.PxForceModeEnum.eFORCE, true)
  }

  addTorque(torque) {
    if (!this.body) return
    this.body.addTorque(torque.toPxVec3(), PHYSX.PxForceModeEnum.eFORCE, true)
  }

  getLinearVelocity() {
    if (!this.body) return
    return _v1.fromPxVec3(this.body.getLinearVelocity())
  }

  setLinearVelocity(vec3) {
    if (!this.body) return
    this.body.setLinearVelocity(vec3.toPxVec3())
  }

  getAngularVelocity() {
    if (!this.body) return
    return _v1.fromPxVec3(this.body.getAngularVelocity())
  }

  setAngularVelocity(vec3) {
    if (!this.body) return
    this.body.setAngularVelocity(vec3.toPxVec3())
  }

  setDynamic() {
    if (!this.body) return
    if (this.physics === 'dynamic') return
    this.physics = 'dynamic'
    this.body.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eKINEMATIC, false)
    this.body.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eENABLE_CCD, true)

    // for some reason we need to re-set the global pose
    // otherwise the physics system can report an older pose from when this was dynamic before
    this.matrixWorld.decompose(_v1, _q1, _v2)
    _v1.toPxTransform(this.transform)
    _q1.toPxTransform(this.transform)
    this.body.setGlobalPose(this.transform)

    this.unbind = this.ctx.world.physics.bind(this.body, this)
  }

  setKinematic() {
    if (!this.body) return
    if (this.physics === 'kinematic') return
    this.unbind?.()
    this.physics = 'kinematic'
    this.body.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eENABLE_CCD, false)
    this.body.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eKINEMATIC, true)
  }

  setMode(mode) {
    // if (mode === 'moving') {
    //   this.layer = Layers.MOVING
    // } else {
    //   this.layer = Layers.DEFAULT
    // }
    // this.mesh?.layers.set(this.layer)
  }

  copy(source, recursive) {
    super.copy(source, recursive)
    this.size = source.size.slice()
    this.color = source.color
    this.physics = source.physics
    this.visible = source.visible
    return this
  }

  getProxy() {
    const self = this
    if (!this.proxy) {
      const proxy = {
        addForce(force) {
          self.addForce(force)
        },
        addTorque(torque) {
          self.addTorque(torque)
        },
        getLinearVelocity() {
          return self.getLinearVelocity()
        },
        setLinearVelocity(vec3) {
          return self.setLinearVelocity(vec3)
        },
        getAngularVelocity() {
          return self.getAngularVelocity()
        },
        setAngularVelocity(vec3) {
          return self.setAngularVelocity(vec3)
        },
        setDynamic() {
          self.setDynamic()
        },
        setKinematic() {
          self.setKinematic()
        },
        ...super.getProxy(),
      }
      this.proxy = proxy
    }
    return this.proxy
  }
}
