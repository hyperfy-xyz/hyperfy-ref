import * as Nodes from '../nodes'

const groupTypes = ['Scene', 'Group', 'Object3D']

export function voxToNodes(vox, world) {
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
    name: '$root',
  })
  function parse(object3ds, parentNode) {
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
        const node = createNode({
          type: 'mesh',
          name: object3d.name,
          model: world.models.register(object3d),
          visible: true,
          collision: false,
          position: object3d.position.toArray(),
          quaternion: object3d.quaternion.toArray(),
          scale: object3d.scale.toArray(),
        })
        parentNode.add(node)
        parse(object3d.children, node)
      }
    }
  }
  parse(vox.scene.children, root)
  return root
}
