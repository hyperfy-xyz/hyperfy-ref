import * as THREE from 'three'

import { System } from './System'

export class Models extends System {
  constructor(world) {
    super(world)
    this.models = new Map() // id -> Model
  }

  register(mesh) {
    const id = mesh.geometry.uuid + '/' + mesh.material.uuid
    if (this.models.has(id)) {
      return this.models.get(id)
    }
    const model = new Model(this.world, mesh)
    this.models.set(id, model)
    return model
  }

  update(delta) {
    // model clean if dirty
    this.models.forEach(model => model.clean())
  }
}

class Model {
  constructor(world, mesh) {
    this.world = world
    this.mesh = mesh.clone()
    this.mesh.geometry.computeBoundsTree() // three-mesh-bvh
    this.mesh.material.shadowSide = THREE.BackSide // fix csm shadow banding
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    this.mesh.matrixAutoUpdate = false
    this.mesh.matrixWorldAutoUpdate = false
    this.iMesh = new THREE.InstancedMesh(mesh.geometry, mesh.material, 10)
    this.iMesh.name = this.mesh.name
    this.iMesh.castShadow = true
    this.iMesh.receiveShadow = true
    this.iMesh.matrixAutoUpdate = false
    this.iMesh.matrixWorldAutoUpdate = false
    this.iMesh.getEntity = this.getEntity.bind(this)
    this.items = [] // { node, matrix }
    this.dirty = true
  }

  createMesh(node, matrix) {
    const item = {
      idx: this.items.length,
      node,
      matrix,
    }
    this.items.push(item)
    this.iMesh.setMatrixAt(item.idx, item.matrix) // silently fails if too small, gets increased in clean()
    this.dirty = true
    return {
      move: matrix => {
        this.move(item, matrix)
      },
      destroy: () => {
        this.destroy(item)
      },
    }
  }

  move(item, matrix) {
    item.matrix.copy(matrix)
    this.iMesh.setMatrixAt(item.idx, matrix)
    this.dirty = true
  }

  destroy(item) {
    const last = this.items[this.items.length - 1]
    const isOnly = this.items.length === 1
    const isLast = item === last
    if (isOnly) {
      this.items = []
      this.dirty = true
    } else if (isLast) {
      // this is the last instance in the buffer, pop it off the end
      this.items.pop()
      this.dirty = true
    } else {
      // there are other instances after this one in the buffer, swap it with the last one and pop it off the end
      this.iMesh.setMatrixAt(item.idx, last.matrix)
      last.idx = item.idx
      this.items[item.idx] = last
      this.items.pop()
      this.dirty = true
    }
  }

  clean() {
    if (!this.dirty) return
    const size = this.iMesh.instanceMatrix.array.length / 16
    const count = this.items.length
    if (size < this.items.length) {
      const newSize = count + 100
      // console.log('increase', this.mesh.name, 'from', size, 'to', newSize)
      this.iMesh.resize(newSize)
      for (let i = size; i < count; i++) {
        this.iMesh.setMatrixAt(i, this.items[i].matrix)
      }
    }
    this.iMesh.count = count
    if (this.iMesh.parent && !count) {
      this.world.graphics.scene.remove(this.iMesh)
      this.dirty = false
      return
    }
    if (!this.iMesh.parent && count) {
      this.world.graphics.scene.add(this.iMesh)
    }
    this.iMesh.instanceMatrix.needsUpdate = true
    this.iMesh.computeBoundingSphere()
    this.dirty = false
  }

  getEntity(instanceId) {
    return this.items[instanceId]?.node.entity
  }

  createCollider(node, matrix) {
    if (!this.colliders) {
      this.colliders = makeColliderFactory(this.world, this.mesh)
    }
    return this.colliders.create(node, matrix)
  }

  getTriangles() {
    const geometry = this.mesh.geometry
    if (geometry.index !== null) {
      return geometry.index.count / 3
    } else {
      return geometry.attributes.position.count / 3
    }
  }
}

function makeColliderFactory(world, mesh) {
  const positionAttribute = mesh.geometry.getAttribute('position')
  const indexAttribute = mesh.geometry.getIndex()
  const points = new PHYSX.Vector_PxVec3()
  const triangles = new PHYSX.Vector_PxU32()

  // add vertices to the points vector
  for (let i = 0; i < positionAttribute.count; i++) {
    const x = positionAttribute.getX(i)
    const y = positionAttribute.getY(i)
    const z = positionAttribute.getZ(i)
    const p = new PHYSX.PxVec3(x, y, z)
    points.push_back(p)
  }

  // add indices to the triangles vector, if available
  if (indexAttribute) {
    for (let i = 0; i < indexAttribute.count; i++) {
      triangles.push_back(indexAttribute.array[i])
    }
  } else {
    // if no indices are provided, assume non-indexed geometry
    for (let i = 0; i < positionAttribute.count; i++) {
      triangles.push_back(i)
    }
  }

  // create triangle mesh descriptor
  const desc = new PHYSX.PxTriangleMeshDesc()
  desc.points.count = points.size()
  desc.points.stride = 12 // size of PhysX.PxVec3 in bytes
  desc.points.data = points.data()
  desc.triangles.count = triangles.size() / 3
  desc.triangles.stride = 12 // size of uint32 in bytes, assuming indices are 32-bit
  desc.triangles.data = triangles.data()
  // console.log('val?', desc.isValid())

  const physics = world.physics.physics
  const cookingParams = physics.cookingParams
  const pmesh = PHYSX.PxTopLevelFunctions.prototype.CreateTriangleMesh(
    cookingParams,
    desc
  )
  // console.log('pmesh', pmesh)

  const meshPos = new THREE.Vector3()
  const meshQuat = new THREE.Quaternion()
  const meshSca = new THREE.Vector3()
  mesh.matrixWorld.decompose(meshPos, meshQuat, meshSca)

  const scale = new PHYSX.PxMeshScale(
    new PHYSX.PxVec3(meshSca.x, meshSca.y, meshSca.z),
    new PHYSX.PxQuat(0, 0, 0, 1)
  )
  const geometry = new PHYSX.PxTriangleMeshGeometry(pmesh, scale)

  const flags = new PHYSX.PxShapeFlags(
    PHYSX.PxShapeFlagEnum.eSCENE_QUERY_SHAPE |
      PHYSX.PxShapeFlagEnum.eSIMULATION_SHAPE |
      PHYSX.PxShapeFlagEnum.eVISUALIZATION
  )
  const material = physics.createMaterial(0.5, 0.5, 0.5)

  const tmpFilterData = new PHYSX.PxFilterData(1, 1, 0, 0)

  PHYSX.destroy(scale)
  PHYSX.destroy(desc)
  PHYSX.destroy(points)
  PHYSX.destroy(triangles)

  return {
    create(node, matrix) {
      const shape = physics.createShape(geometry, material, true, flags)
      shape.setSimulationFilterData(tmpFilterData)

      // convert matrix to physx transform
      const pos = new THREE.Vector3()
      const qua = new THREE.Quaternion()
      const sca = new THREE.Vector3()
      matrix.decompose(pos, qua, sca)
      const transform = new PHYSX.PxTransform(PHYSX.PxIDENTITYEnum.PxIdentity)
      pos.toPxTransform(transform)
      qua.toPxTransform(transform)

      // create actor and add to scene
      const actor = physics.createRigidDynamic(transform)
      actor.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eKINEMATIC, true)
      actor.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eENABLE_CCD, false)
      actor.attachShape(shape)
      world.physics.scene.addActor(actor)

      let active = true

      return {
        setActive(value) {
          if (active === value) return
          active = value
          if (active) {
            world.physics.scene.addActor(actor)
          } else {
            world.physics.scene.removeActor(actor)
          }
        },
        move(matrix) {
          matrix.toPxTransform(transform)
          actor.setGlobalPose(transform)
        },
        destroy() {
          world.physics.scene.removeActor(actor)
          shape.release()
          actor.release()
        },
      }
    },
  }
}
