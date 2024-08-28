import * as Nodes from '../nodes'

export function createNode(data) {
  const Node = Nodes[data.name]
  if (!Node) console.error('unknown node:', data.name)
  const node = new Node(data)
  return node
}
