import * as Nodes from '../nodes'

const LOD_REGEX = /_lod(\d+)/ // eg mesh_lod0 & mesh_lod100
const COLLIDER_REGEX = /_collider/ // eg mesh_collider

const groupTypes = ['Scene', 'Group', 'Object3D']

export function glbToNodes(glb, world) {
  const nodes = new Map()
  function createNode(data) {
    if (nodes.has(data.name)) {
      console.error('node name already exists:', data.name)
      return
    }
    const Node = Nodes[data.type]
    const node = new Node(data)
    nodes.set(node.name, node)
    return node
  }
  const root = createNode({
    type: 'group',
    name: 'root',
  })
  function parse(object3ds, parentNode) {
    const lodsByName = {}
    for (const object3d of object3ds) {
      if (groupTypes.includes(object3d.type)) {
        const node = createNode({
          type: 'group',
          name: object3d.name,
          position: object3d.position.toArray(),
          quaternion: object3d.quaternion.toArray(),
          scale: object3d.scale.toArray(),
        })
        parentNode.add(node)
        parse(object3d.children, node)
      }
      if (object3d.type === 'Mesh') {
        object3d.geometry.computeBoundsTree() // three-mesh-bvh
        if (COLLIDER_REGEX.test(object3d.name)) {
          // either a collider
          const node = createNode({
            type: 'collider',
            name: object3d.name,
            position: object3d.position.toArray(),
            quaternion: object3d.quaternion.toArray(),
            scale: object3d.scale.toArray(),
            factory: buildActorFactory(object3d, world),
          })
          parentNode.add(node)
          parse(object3d.children, node)
        } else if (LOD_REGEX.test(object3d.name)) {
          // a composite with lods
          let [name, maxDistance] = object3d.name.split(LOD_REGEX)
          maxDistance = parseInt(maxDistance)
          if (!lodsByName[name]) {
            lodsByName[name] = []
          }
          lodsByName[name].push({ mesh: object3d, maxDistance })
        } else {
          // or a regular composite
          lodsByName[object3d.name] = [
            { mesh: object3d, maxDistance: Infinity },
          ]
        }
      }
      if (object3d.type === 'SkinnedMesh') {
        // TODO
        // world.graphics.scene.add(object3d)
      }
    }
    for (const name in lodsByName) {
      const lods = lodsByName[name]
      lods.sort((a, b) => a.maxDistance - b.maxDistance) // ascending
      const lod0 = lods[0]
      lods[lods.length - 1].maxDistance = Infinity // for now there is no dropoff
      const src = world.models.create(lods) // TODO: rename world.models to world.composites
      const node = createNode({
        type: 'composite',
        name,
        position: lod0.mesh.position.toArray(),
        quaternion: lod0.mesh.quaternion.toArray(),
        scale: lod0.mesh.scale.toArray(),
        src,
      })
      parentNode.add(node)
      // note: lods are combined, children are ignored
    }
  }
  parse(glb.scene.children, root)
  return root
}

function buildActorFactory(mesh, world) {
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

  return matrix => {
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

    let enabled = true

    return {
      move(matrix) {
        matrix.toPxTransform(transform)
        actor.setGlobalPose(transform)
      },
      setEnabled(value) {
        if (enabled === value) return
        enabled = value
        if (enabled) {
          world.physics.scene.addActor(actor)
        } else {
          world.physics.scene.removeActor(actor)
        }
      },
      destroy() {
        world.physics.scene.removeActor(actor)
        shape.release()
        actor.release()
      },
    }
  }
}
