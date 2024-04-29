import * as THREE from 'three'

import * as nodes from './nodes'
import { Node } from './nodes/Node'

export class Entity {
  constructor(space) {
    this.space = space
    this.id = null
    this.type = null
    this.authority = null
    this.position = new THREE.Vector3()
    this.quaternion = new THREE.Quaternion()
    this.state = {}
    this.nodes = []
  }

  deserialize(data) {
    this.id = data.id
    this.type = data.type
    this.authority = data.authority
    this.position.fromArray(data.position)
    this.quaternion.fromArray(data.quaternion)
    this.state = data.state
    this.nodes = new Node(this, null, { children: data.nodes })
    this.nodes.traverse(node => {
      node.start()
    })
    // this.nodes = data.nodes.map(data => {
    //   const Node = nodes[data.type]
    //   const node = new Node(this, null, data)
    //   return node
    // })

    // {
    //   // tmp
    //   const geometry = new THREE.BoxGeometry(1, 1, 1)
    //   const material = new THREE.MeshBasicMaterial({ color: 'red' })
    //   const mesh = new THREE.Mesh(geometry, material)
    //   mesh.position.copy(this.position)
    //   mesh.quaternion.copy(this.quaternion)
    //   this.space.graphics.scene.add(mesh)
    // }
    return this
  }

  update(delta) {
    //...
  }
}
