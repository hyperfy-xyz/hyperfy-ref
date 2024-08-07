import * as Nodes from '../nodes'

export function createNode(data) {
  const Node = Nodes[data.type]
  if (!Node) console.error('unknown node:', data.type)
  const node = new Node(data)
  return node
}
