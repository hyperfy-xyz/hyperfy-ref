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
  function parseName(name) {
    const parts = name.split('_')
    let baseName = parts[0]
    let isHidden = false
    let isCollider = false
    let isLod = false
    let maxDistance = null
    for (const part of parts) {
      if (part.startsWith('lod')) {
        isLod = true
        maxDistance = parseInt(part.substring(3), 10)
      } else if (part === 'collider') {
        isCollider = true
      } else if (part === 'hidden') {
        isHidden = true
      }
    }
    return [baseName, isHidden, isCollider, isLod, maxDistance]
  }
  function parse(object3ds, parentNode) {
    const lods = {} // name -> [...{ node, maxDistance }]
    for (const object3d of object3ds) {
      // Object3D, Group, Scene
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
      // Mesh
      if (object3d.type === 'Mesh') {
        const [baseName, isHidden, isCollider, isLod, maxDistance] = parseName(object3d.name) // prettier-ignore
        const node = createNode({
          type: 'mesh',
          name: object3d.name,
          model: world.models.register(object3d),
          visible: !isHidden,
          collision: isCollider,
          active: isLod ? false : true,
          position: object3d.position.toArray(),
          quaternion: object3d.quaternion.toArray(),
          scale: object3d.scale.toArray(),
        })
        if (isLod) {
          let lod = lods[baseName]
          if (!lod) {
            lod = createNode({
              type: 'lod',
              name: baseName,
              position: [0, 0, 0], // object3d.position.toArray(),
              quaternion: [0, 0, 0, 1], // object3d.quaternion.toArray(),
              scale: [1, 1, 1], // object3d.scale.toArray(),
            })
            lods[baseName] = lod
            parentNode.add(lod)
          }
          lod.insert(node, maxDistance)
        } else {
          parentNode.add(node)
        }
        parse(object3d.children, node)
      }
      if (object3d.type === 'SkinnedMesh') {
        // TODO
      }
    }
  }
  parse(glb.scene.children, root)
  return root
}
