export function geometryToPxMesh(world, geometry, convex) {
  const positionAttribute = geometry.getAttribute('position')
  const indexAttribute = geometry.getIndex()
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

  const physics = world.physics.physics
  const cookingParams = physics.cookingParams

  let desc
  let pmesh

  if (convex) {
    desc = new PHYSX.PxConvexMeshDesc()
    desc.points.count = points.size()
    desc.points.stride = 12 // size of PhysX.PxVec3 in bytes
    desc.points.data = points.data()
    desc.flags.raise(PHYSX.PxConvexFlagEnum.eCOMPUTE_CONVEX)
    // console.log('isValid', desc.isValid())
    pmesh = PHYSX.CreateConvexMesh(cookingParams, desc)
  } else {
    desc = new PHYSX.PxTriangleMeshDesc()
    desc.points.count = points.size()
    desc.points.stride = 12 // size of PhysX.PxVec3 in bytes
    desc.points.data = points.data()
    desc.triangles.count = triangles.size() / 3
    desc.triangles.stride = 12 // size of uint32 in bytes, assuming indices are 32-bit
    desc.triangles.data = triangles.data()
    // console.log('isValid', desc.isValid())
    pmesh = PHYSX.CreateTriangleMesh(cookingParams, desc)
  }

  PHYSX.destroy(desc)
  PHYSX.destroy(points)
  PHYSX.destroy(triangles)

  return pmesh

  // const meshPos = new THREE.Vector3()
  // const meshQuat = new THREE.Quaternion()
  // const meshSca = new THREE.Vector3()
  // mesh.matrixWorld.decompose(meshPos, meshQuat, meshSca)

  // console.error(
  //   'TODO: the scale and final geometry should probs be made in the Collider now as each node might have diff scale but same geometry.'
  // )

  // const scale = new PHYSX.PxMeshScale(new PHYSX.PxVec3(meshSca.x, meshSca.y, meshSca.z), new PHYSX.PxQuat(0, 0, 0, 1))

  // let geometry
  // if (convex) {
  //   geometry = new PHYSX.PxConvexMeshGeometry(pmesh, scale)
  // } else {
  //   geometry = new PHYSX.PxTriangleMeshGeometry(pmesh, scale)
  // }

  // // const flags = new PHYSX.PxShapeFlags(
  // //   PHYSX.PxShapeFlagEnum.eSCENE_QUERY_SHAPE | PHYSX.PxShapeFlagEnum.eSIMULATION_SHAPE
  // //   // | PHYSX.PxShapeFlagEnum.eVISUALIZATION
  // // )
  // // const material = physics.createMaterial(0.5, 0.5, 0.5)
  // // const transform = new PHYSX.PxTransform(PHYSX.PxIDENTITYEnum.PxIdentity)

  // PHYSX.destroy(scale)
  // PHYSX.destroy(desc)
  // PHYSX.destroy(points)
  // PHYSX.destroy(triangles)

  // return geometry
}
