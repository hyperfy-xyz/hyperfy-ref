import * as Nodes from '../nodes'
import { createVRMFactory } from './createVRMFactory'

export function vrmToNodes(glb, world) {
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
  const vrm = createNode({
    type: 'vrm',
    name: 'vrm',
    factory: createVRMFactory(glb, world),
  })
  root.add(vrm)
  return root
}
