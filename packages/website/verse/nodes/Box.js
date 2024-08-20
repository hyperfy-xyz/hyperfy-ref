import * as THREE from 'three'
import { isBoolean, isNumber } from 'lodash-es'

import { Node } from './Node'
import { Layers } from '../extras/Layers'

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

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _q1 = new THREE.Quaternion()

const defaults = {
  width: 1,
  height: 1,
  depth: 1,
  color: 'white',
  roughness: 1,
  metalness: 0,
  castShadow: true,
  receiveShadow: true,
  visible: true,
  collision: null,
  collisionLayer: 'environment',
  staticFriction: 0.6,
  dynamicFriction: 0.6,
  restitution: 0.1,
}

export class Box extends Node {
  constructor(data = {}) {
    super(data)
    this.type = 'box'
    this.isBox = true

    this.width = isNumber(data.width) ? data.width : defaults.width
    this.height = isNumber(data.height) ? data.height : defaults.height
    this.depth = isNumber(data.depth) ? data.depth : defaults.depth
    this.color = data.color || defaults.color
    this.roughness = isNumber(data.roughness) ? data.roughness : defaults.roughness
    this.metalness = isNumber(data.metalness) ? data.metalness : defaults.metalness
    this.castShadow = isBoolean(data.castShadow) ? data.castShadow : defaults.castShadow
    this.receiveShadow = isBoolean(data.receiveShadow) ? data.receiveShadow : defaults.receiveShadow
    this.visible = isBoolean(data.visible) ? data.visible : defaults.visible

    this.collision = data.collision || defaults.collision
    this.collisionLayer = data.collisionLayer || defaults.collisionLayer
    this.staticFriction = isNumber(data.staticFriction) ? data.staticFriction : defaults.staticFriction
    this.dynamicFriction = isNumber(data.dynamicFriction) ? data.dynamicFriction : defaults.dynamicFriction
    this.restitution = isNumber(data.restitution) ? data.restitution : defaults.restitution

    this.needsRebuild = false

    this._tm = new PHYSX.PxTransform(PHYSX.PxIDENTITYEnum.PxIdentity)
  }

  mount() {
    if (this.visible) {
      const geometry = new THREE.BoxGeometry(this.width, this.height, this.depth)
      geometry.computeBoundsTree()
      const material = new THREE.MeshStandardMaterial({
        color: this.color,
        roughness: this.roughness,
        metalness: this.metalness,
      })
      this.mesh = new THREE.Mesh(geometry, material)
      this.mesh.castShadow = this.castShadow
      this.mesh.receiveShadow = this.receiveShadow
      this.mesh.matrixAutoUpdate = false
      this.mesh.matrixWorldAutoUpdate = false
      // this.mesh.matrix.copy(this.matrixWorld)
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
      // this.mesh.matrix.decompose(
      //   this.mesh.position,
      //   this.mesh.quaternion,
      //   this.mesh.scale
      // )
    }
    if (this.collision) {
      const geometry = new PHYSX.PxBoxGeometry(this.width / 2, this.height / 2, this.depth / 2)
      const material = this.ctx.world.physics.physics.createMaterial(
        this.staticFriction,
        this.dynamicFriction,
        this.restitution
      )
      const flags = new PHYSX.PxShapeFlags(PHYSX.PxShapeFlagEnum.eSCENE_QUERY_SHAPE | PHYSX.PxShapeFlagEnum.eSIMULATION_SHAPE) // prettier-ignore
      // const filterData = this.ctx.world.physics.layers.object
      const layer = Layers[this.collisionLayer]
      const filterData = new PHYSX.PxFilterData(layer.group, layer.mask, 0, 0)
      const shape = this.ctx.world.physics.physics.createShape(geometry, material, true, flags)
      shape.setQueryFilterData(filterData)
      shape.setSimulationFilterData(filterData)
      this.transform = new PHYSX.PxTransform(PHYSX.PxIDENTITYEnum.PxIdentity)
      this.matrixWorld.decompose(_v1, _q1, _v2)
      _v1.toPxTransform(this.transform)
      _q1.toPxTransform(this.transform)
      if (this.collision === 'dynamic') {
        this.actor = this.ctx.world.physics.physics.createRigidDynamic(this.transform)
        // this.actor.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eKINEMATIC, false)
        // this.actor.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eENABLE_CCD, true)
      } else if (this.collision === 'kinematic') {
        this.actor = this.ctx.world.physics.physics.createRigidDynamic(this.transform)
        this.actor.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eKINEMATIC, true)
        // this.actor.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eENABLE_CCD, false)
      } else if (this.collision === 'static') {
        this.actor = this.ctx.world.physics.physics.createRigidStatic(this.transform)
      }
      // this.actor.setMass(1)
      this.actor.attachShape(shape)
      this.ctx.world.physics.scene.addActor(this.actor)
      if (this.collision === 'kinematic' || this.collision === 'dynamic') {
        this.untrack = this.ctx.world.physics.track(this.actor, this.onPhysicsMovement)
      }
    }
  }

  commit(didTransform) {
    if (this.needsRebuild) {
      this.unmount()
      this.mount()
      this.needsRebuild = false
      return
    }
    if (didTransform) {
      if (this.mesh) {
        // this.mesh.matrix.copy(this.matrixWorld)
        this.mesh.matrixWorld.copy(this.matrixWorld)
        // this.mesh.matrix.decompose(
        //   this.mesh.position,
        //   this.mesh.quaternion,
        //   this.mesh.scale
        // )
        this.ctx.world.spatial.octree.move(this.sItem)
      }
      if (this.actor) {
        // set via physics system as sometimes these are ignored
        this.ctx.world.physics.setGlobalPose(this.actor, this.matrixWorld)
      }
    }
  }

  unmount() {
    if (this.mesh) {
      this.ctx.world.graphics.scene.remove(this.mesh)
      this.mesh.geometry.dispose()
      this.mesh.material.dispose()
      this.mesh = null
      this.ctx.world.spatial.octree.remove(this.sItem)
      this.sItem = null
    }
    if (this.actor) {
      this.untrack?.()
      this.ctx.world.physics.scene.removeActor(this.actor)
      // TODO: destroy physics things
    }
  }

  copy(source, recursive) {
    super.copy(source, recursive)
    this.width = source.width
    this.height = source.height
    this.depth = source.depth
    this.color = source.color
    this.roughness = source.roughness
    this.metalness = source.metalness
    this.castShadow = source.castShadow
    this.receiveShadow = source.receiveShadow
    this.visible = source.visible
    this.collision = source.collision
    this.collisionLayer = source.collisionLayer
    this.staticFriction = source.staticFriction
    this.dynamicFriction = source.dynamicFriction
    this.restitution = source.restitution
    return this
  }

  getProxy() {
    const self = this
    if (!this.proxy) {
      const proxy = {
        get width() {
          return self.width
        },
        set width(value) {
          self.width = value
          if (self.mesh) {
            self.needsRebuild = true
            self.setDirty()
          }
        },
        get height() {
          return self.height
        },
        set height(value) {
          self.height = value
          if (self.mesh) {
            self.needsRebuild = true
            self.setDirty()
          }
        },
        get depth() {
          return self.depth
        },
        set depth(value) {
          self.depth = value
          if (self.mesh) {
            self.needsRebuild = true
            self.setDirty()
          }
        },
        setSize(width, height, depth) {
          self.width = width
          self.height = height
          self.depth = depth
          if (self.mesh) {
            self.needsRebuild = true
            self.setDirty()
          }
        },
        get color() {
          return self.color
        },
        set color(value) {
          self.color = value
          if (self.mesh) {
            self.needsRebuild = true
            self.setDirty()
          }
        },
        get roughness() {
          return self.roughness
        },
        set roughness(value) {
          self.roughness = value
          if (self.mesh) {
            self.needsRebuild = true
            self.setDirty()
          }
        },
        get metalness() {
          return self.metalness
        },
        set metalness(value) {
          self.metalness = value
          if (self.mesh) {
            self.needsRebuild = true
            self.setDirty()
          }
        },
        get castShadow() {
          return self.castShadow
        },
        set castShadow(value) {
          self.castShadow = value
          if (self.mesh) {
            self.mesh.castShadow = value
          }
        },
        get receiveShadow() {
          return self.receiveShadow
        },
        set receiveShadow(value) {
          self.receiveShadow = value
          if (self.mesh) {
            self.mesh.receiveShadow = value
          }
        },
        get visible() {
          return self.visible
        },
        set visible(value) {
          if (self.visible === value) return
          self.visible = value
          self.needsRebuild = true
          self.setDirty()
        },
        get collision() {
          return self.collision
        },
        set collision(value) {
          if (self.collision === value) return
          const prev = self.collision
          self.collision = value
          if (self.actor) {
            if (value === 'dynamic') {
              self.actor.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eKINEMATIC, false)
              // self.actor.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eENABLE_CCD, true)

              // for some reason we need to re-set the global pose
              // otherwise the physics system can report an older pose from when this was dynamic before
              self.matrixWorld.decompose(_v1, _q1, _v2)
              _v1.toPxTransform(self.transform)
              _q1.toPxTransform(self.transform)
              self.actor.setGlobalPose(self.transform)

              self.untrack = self.ctx.world.physics.track(self.actor, self.onPhysicsMovement)
            }
            if (value === 'kinematic') {
              self.untrack?.()
              self.untrack = null
              // self.actor.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eENABLE_CCD, false)
              self.actor.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eKINEMATIC, true)
            }
          } else {
            self.needsRebuild = true
            self.setDirty()
          }
        },
        get collisionLayer() {
          return self.collisionLayer
        },
        set collisionLayer(value) {
          self.collisionLayer = value
          if (self.actor) {
            // todo: we could just update the PxFilterData tbh
            self.needsRebuild = true
            self.setDirty()
          }
        },
        get staticFriction() {
          return self.staticFriction
        },
        set staticFriction(value) {
          self.staticFriction = value
          if (self.actor) {
            // todo: we could probably just update the PxMaterial tbh
            self.needsRebuild = true
            self.setDirty()
          }
        },
        get dynamicFriction() {
          return self.dynamicFriction
        },
        set dynamicFriction(value) {
          self.dynamicFriction = value
          if (self.actor) {
            // todo: we could probably just update the PxMaterial tbh
            self.needsRebuild = true
            self.setDirty()
          }
        },
        get restitution() {
          return self.restitution
        },
        set restitution(value) {
          self.restitution = value
          if (self.actor) {
            // todo: we could probably just update the PxMaterial tbh
            self.needsRebuild = true
            self.setDirty()
          }
        },
        setMaterial(staticFriction, dynamicFriction, restitution) {
          self.staticFriction = staticFriction
          self.dynamicFriction = dynamicFriction
          self.restitution = restitution
          if (self.actor) {
            // todo: we could probably just update the PxMaterial tbh
            self.needsRebuild = true
            self.setDirty()
          }
        },
        addForce(force) {
          self.actor?.addForce(force.toPxVec3(), PHYSX.PxForceModeEnum.eFORCE, true)
        },
        addTorque(torque) {
          self.actor.addTorque(torque.toPxVec3(), PHYSX.PxForceModeEnum.eFORCE, true)
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
          if (self.collision !== 'kinematic') {
            throw new Error('setKinematicTarget failed (box is not kinematic)')
          }
          position.toPxTransform(self._tm)
          quaternion.toPxTransform(self._tm)
          self.actor?.setKinematicTarget(self._tm)
        },
        ...super.getProxy(),
      }
      this.proxy = proxy
    }
    return this.proxy
  }
}
