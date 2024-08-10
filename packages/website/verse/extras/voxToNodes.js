import * as Nodes from '../nodes'

const groupTypes = ['Scene', 'Group', 'Object3D']

export function voxToNodes(vox, world) {
  const nodes = new Map()
  function createNode(data) {
    const Node = Nodes[data.type]
    const node = new Node(data)
    if (nodes.has(node.id)) {
      console.error('node with id already exists:', node.id)
      return
    }
    nodes.set(node.id, node)
    return node
  }
  const root = createNode({
    id: '$root',
    type: 'group',
  })
  function parse(object3ds, parentNode) {
    for (const object3d of object3ds) {
      if (groupTypes.includes(object3d.type)) {
        const node = createNode({
          id: object3d.name,
          type: 'group',
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
          id: object3d.name,
          type: 'mesh',
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
