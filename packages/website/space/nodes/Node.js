import * as nodes from './'

export class Node {
  constructor(entity, parent, data) {
    this.space = entity.space
    this.entity = entity
    this.parent = parent
    this.children = data.children.map(data => {
      const Node = nodes[data.type]
      return new Node(entity, this, data)
    })
  }

  start() {
    // ...
  }

  traverse(callback) {
    callback(this)
    this.children.forEach(node => {
      node.traverse(callback)
    })
  }
}
