import { createNode } from './createNode'

export function vrmToNodes(factory) {
  const nodes = new Map()
  function registerNode(data) {
    const node = createNode(data)
    if (nodes.has(node.id)) {
      console.error('node with id already exists:', node.id)
      return
    }
    nodes.set(node.id, node)
    return node
  }
  const root = registerNode({
    id: '$root',
    type: 'group',
  })
  const vrm = registerNode({
    id: 'vrm',
    type: 'vrm',
    factory,
  })
  root.add(vrm)
  return root
}
