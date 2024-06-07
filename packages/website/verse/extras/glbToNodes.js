import * as Nodes from '../nodes'

const LOD_REGEX = /_lod(\d+)/ // eg mesh_lod0 & mesh_lod100

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
        if (LOD_REGEX.test(object3d.name)) {
          let [name, maxDistance] = object3d.name.split(LOD_REGEX)
          maxDistance = parseInt(maxDistance)
          if (!lodsByName[name]) {
            lodsByName[name] = []
          }
          lodsByName[name].push({ mesh: object3d, maxDistance })
        } else {
          lodsByName[object3d.name] = [
            { mesh: object3d, maxDistance: Infinity },
          ]
        }
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
        src,
        position: lod0.mesh.position.toArray(),
        quaternion: lod0.mesh.quaternion.toArray(),
        scale: lod0.mesh.scale.toArray(),
      })
      parentNode.add(node)
      // note: lods are combined, children are ignored
    }
  }
  parse(glb.scene.children, root)
  return root
}
