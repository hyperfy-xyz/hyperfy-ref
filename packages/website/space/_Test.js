import * as THREE from 'three'

import { System } from './System'

// Guide
// https://nvidia-omniverse.github.io/PhysX/physx/5.3.1/index.html

// API Reference
// https://nvidia-omniverse.github.io/PhysX/physx/5.3.1/_api_build/physx_api.html

// Ventea example of PxTriangleMesh cooking
// https://github.com/Aliremu/ventea/blob/311418c0f6b05884395195a58081d186c388d5fe/src/Physics/physx.worker.ts#L140

export class Test extends System {
  constructor(space) {
    super(space)
  }

  async start() {
    // cube (primitive)
    // {
    //   const geometry = new THREE.BoxGeometry(1, 1, 1)
    //   const material = new THREE.MeshBasicMaterial({ color: 'red' })
    //   this.mesh = new THREE.Mesh(geometry, material)
    //   this.space.graphics.scene.add(this.mesh)
    // }
    // {
    //   const physics = this.space.physics.physics
    //   const geometry = new PHYSX.PxBoxGeometry(0.5, 0.5, 0.5)
    //   const flags = new PHYSX.PxShapeFlags(
    //     PHYSX.PxShapeFlagEnum.eSCENE_QUERY_SHAPE |
    //       PHYSX.PxShapeFlagEnum.eSIMULATION_SHAPE |
    //       PHYSX.PxShapeFlagEnum.eVISUALIZATION
    //   )
    //   const tmpFilterData = new PHYSX.PxFilterData(1, 1, 0, 0)
    //   const material = physics.createMaterial(0.5, 0.5, 0.5)
    //   const shape = physics.createShape(geometry, material, true, flags)
    //   shape.setSimulationFilterData(tmpFilterData)
    //   const vec3 = new PHYSX.PxVec3(0, -9.81, 0)
    //   const transform = new PHYSX.PxTransform(PHYSX.PxIDENTITYEnum.PxIdentity)
    //   this.body = physics.createRigidDynamic(transform)
    //   this.body.attachShape(shape)
    //   this.space.physics.scene.addActor(this.body)
    // }
    // cube (triangle mesh)
    {
      const geometry = new THREE.DodecahedronGeometry(1)
      const material = new THREE.MeshBasicMaterial({ color: 'blue' })
      this.mesh = new THREE.Mesh(geometry, material)
      this.space.graphics.scene.add(this.mesh)
    }
    {
      // PxTriangleMeshDesc meshDesc;
      // meshDesc.points.count           = nbVerts;
      // meshDesc.points.stride          = sizeof(PxVec3);
      // meshDesc.points.data            = verts;

      // meshDesc.triangles.count        = triCount;
      // meshDesc.triangles.stride       = 3*sizeof(PxU32);
      // meshDesc.triangles.data         = indices32;

      // PxDefaultMemoryOutputStream writeBuffer;
      // PxTriangleMeshCookingResult::Enum result;
      // bool status = cooking.cookTriangleMesh(meshDesc, writeBuffer,result);
      // if(!status)
      //     return NULL;

      // PxDefaultMemoryInputData readBuffer(writeBuffer.getData(), writeBuffer.getSize());
      // return physics.createTriangleMesh(readBuffer);

      // Accessing vertices and indices from the geometry
      const positionAttribute = this.mesh.geometry.getAttribute('position')
      const indexAttribute = this.mesh.geometry.getIndex()

      const points = new PHYSX.Vector_PxVec3()
      const triangles = new PHYSX.Vector_PxU32()

      // Adding vertices to the PhysX points vector
      for (let i = 0; i < positionAttribute.count; i++) {
        const x = positionAttribute.getX(i)
        const y = positionAttribute.getY(i)
        const z = positionAttribute.getZ(i)
        const p = new PHYSX.PxVec3(x, y, z)
        points.push_back(p)
      }

      // Adding indices to the PhysX triangles vector, if available
      if (indexAttribute) {
        for (let i = 0; i < indexAttribute.count; i++) {
          triangles.push_back(indexAttribute.array[i])
        }
      } else {
        // If no indices are provided, assume non-indexed geometry
        for (let i = 0; i < positionAttribute.count; i++) {
          triangles.push_back(i)
        }
      }

      // Create the PhysX triangle mesh descriptor
      const desc = new PHYSX.PxTriangleMeshDesc()
      desc.points.count = points.size()
      desc.points.stride = 12 // size of PhysX.PxVec3 in bytes
      desc.points.data = points.data()
      desc.triangles.count = triangles.size() / 3
      desc.triangles.stride = 12 // size of uint32 in bytes, assuming indices are 32-bit
      desc.triangles.data = triangles.data()
      // console.log('val?', desc.isValid())

      const physics = this.space.physics.physics
      const cookingParams = physics.cookingParams
      const mesh = PHYSX.PxTopLevelFunctions.prototype.CreateTriangleMesh(
        cookingParams,
        desc
      )
      // console.log('mesh', mesh)

      const scale = new PHYSX.PxMeshScale(
        new PHYSX.PxVec3(1, 1, 1),
        new PHYSX.PxQuat(0, 0, 0, 1)
      )
      const geometry = new PHYSX.PxTriangleMeshGeometry(mesh, scale)

      const flags = new PHYSX.PxShapeFlags(
        PHYSX.PxShapeFlagEnum.eSCENE_QUERY_SHAPE |
          PHYSX.PxShapeFlagEnum.eSIMULATION_SHAPE |
          PHYSX.PxShapeFlagEnum.eVISUALIZATION
      )
      const tmpFilterData = new PHYSX.PxFilterData(1, 1, 0, 0)
      const material = physics.createMaterial(0.5, 0.5, 0.5)
      const shape = physics.createShape(geometry, material, true, flags)
      shape.setSimulationFilterData(tmpFilterData)
      // const vec3 = new PHYSX.PxVec3(0, -9.81, 0)
      const transform = new PHYSX.PxTransform(PHYSX.PxIDENTITYEnum.PxIdentity)
      this.body = physics.createRigidDynamic(transform)
      this.body.attachShape(shape)
      this.space.physics.scene.addActor(this.body)

      PHYSX.destroy(scale)
      PHYSX.destroy(desc)
      PHYSX.destroy(desc)
      PHYSX.destroy(points)
      PHYSX.destroy(triangles)
    }
  }

  fixedUpdate() {
    const transform = this.body.getGlobalPose()
    this.mesh.position.copy(transform.p)
    this.mesh.quaternion.copy(transform.q)
  }
}

// function putIntoPhysXHeap(heap, array) {
//   const ptr = PHYSX._malloc(4 * array.length)
//   let offset = 0

//   for (let i = 0; i < array.length; i++) {
//     heap[(ptr + offset) >> 2] = array[i]
//     offset += 4
//   }

//   return ptr
// }

// see: https://github.com/mrdoob/three.js/blob/master/examples/jsm/utils/BufferGeometryUtils.js
// function deinterleaveAttribute(attribute) {
//   const cons = attribute.data.array.constructor
//   const count = attribute.count
//   const itemSize = attribute.itemSize
//   const normalized = attribute.normalized

//   const array = new cons(count * itemSize)
//   let newAttribute
//   if (attribute.isInstancedInterleavedBufferAttribute) {
//     newAttribute = new THREE.InstancedBufferAttribute(
//       array,
//       itemSize,
//       normalized,
//       attribute.meshPerAttribute
//     )
//   } else {
//     newAttribute = new THREE.BufferAttribute(array, itemSize, normalized)
//   }
//   for (let i = 0; i < count; i++) {
//     newAttribute.setX(i, attribute.getX(i))
//     if (itemSize >= 2) {
//       newAttribute.setY(i, attribute.getY(i))
//     }
//     if (itemSize >= 3) {
//       newAttribute.setZ(i, attribute.getZ(i))
//     }
//     if (itemSize >= 4) {
//       newAttribute.setW(i, attribute.getW(i))
//     }
//   }
//   return newAttribute
// }
