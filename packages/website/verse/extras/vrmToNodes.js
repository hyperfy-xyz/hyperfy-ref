import { createNode } from './createNode'

export function vrmToNodes(factory) {
  const nodes = new Map()
  function registerNode(data) {
    if (nodes.has(data.name)) {
      console.error('node name already exists:', data.name)
      return
    }
    const node = createNode(data)
    nodes.set(node.name, node)
    return node
  }
  const root = registerNode({
    type: 'group',
    name: '$root',
  })
  const vrm = registerNode({
    type: 'vrm',
    name: 'vrm',
    factory,
  })
  root.add(vrm)
  return root
}
