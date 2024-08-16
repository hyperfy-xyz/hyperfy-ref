import * as THREE from 'three'
import { isBoolean } from 'lodash-es'

import { Layers } from './Layers'

export function createColliderFactory(world, mesh) {
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
  const pmesh = PHYSX.PxTopLevelFunctions.prototype.CreateTriangleMesh(cookingParams, desc)
  // console.log('pmesh', pmesh)

  const meshPos = new THREE.Vector3()
  const meshQuat = new THREE.Quaternion()
  const meshSca = new THREE.Vector3()
  mesh.matrixWorld.decompose(meshPos, meshQuat, meshSca)

  const scale = new PHYSX.PxMeshScale(new PHYSX.PxVec3(meshSca.x, meshSca.y, meshSca.z), new PHYSX.PxQuat(0, 0, 0, 1))
  const geometry = new PHYSX.PxTriangleMeshGeometry(pmesh, scale)

  const flags = new PHYSX.PxShapeFlags(
    PHYSX.PxShapeFlagEnum.eSCENE_QUERY_SHAPE | PHYSX.PxShapeFlagEnum.eSIMULATION_SHAPE
    // | PHYSX.PxShapeFlagEnum.eVISUALIZATION
  )
  const material = physics.createMaterial(0.5, 0.5, 0.5)

  const transform = new PHYSX.PxTransform(PHYSX.PxIDENTITYEnum.PxIdentity)

  PHYSX.destroy(scale)
  PHYSX.destroy(desc)
  PHYSX.destroy(points)
  PHYSX.destroy(triangles)

  return {
    create(node, matrix, collision, collisionLayer) {
      const shape = physics.createShape(geometry, material, true, flags)
      const filterData = new PHYSX.PxFilterData(collisionLayer.group, collisionLayer.mask, 0, 0)
      shape.setQueryFilterData(filterData)
      shape.setSimulationFilterData(filterData)

      // convert matrix to physx transform
      const pos = new THREE.Vector3()
      const qua = new THREE.Quaternion()
      const sca = new THREE.Vector3()
      matrix.decompose(pos, qua, sca)
      pos.toPxTransform(transform)
      qua.toPxTransform(transform)

      // create actor and add to scene
      let actor
      if (collision === 'dynamic') {
        actor = world.physics.physics.createRigidDynamic(transform)
        actor.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eKINEMATIC, false)
        actor.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eENABLE_CCD, true)
      } else if (collision === 'kinematic') {
        actor = world.physics.physics.createRigidDynamic(transform)
        actor.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eKINEMATIC, true)
        actor.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eENABLE_CCD, false)
      } else {
        actor = world.physics.physics.createRigidStatic(transform)
      }
      actor.attachShape(shape)
      world.physics.scene.addActor(actor)

      let untrack
      if (collision !== 'static') {
        untrack = world.physics.track(actor, node?.onPhysicsMovement)
      }

      let active = true

      return {
        setActive(value) {
          value = isBoolean(value) ? value : !!value
          if (active === value) return
          active = value
          if (active) {
            world.physics.scene.addActor(actor)
          } else {
            world.physics.scene.removeActor(actor)
          }
        },
        move(matrix) {
          // get physics to update as some of these are ignored
          world.physics.setGlobalPose(actor, matrix)
        },
        destroy() {
          if (active) {
            world.physics.scene.removeActor(actor)
          }
          shape.release()
          actor.release()
          untrack?.()
        },
      }
    },
    destroy() {
      pmesh.release()
      PHYSX.destroy(geometry)
      PHYSX.destroy(transform)
      material.release()
    },
  }
}
