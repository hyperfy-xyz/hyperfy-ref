import * as THREE from 'three'
import * as Nodes from './nodes'

export class Entity {
  constructor(space, data) {
    this.space = space
    this.id = data.id
    this.type = data.type
    this.authority = data.authority
    this.active = data.active
    this.nodes = new Map()
    this.root = this.createNode({
      type: 'group',
      name: 'root',
      position: data.position,
      quaternion: data.quaternion,
      scale: data.scale,
    })
    this.root.mounted = true
    this.root.project()
    this.buildNodes(this.root, data.nodes)
    // this.state = {}
    // this.nodes = []
    this.scripts = []
    this.root.traverse(node => {
      if (node.type === 'script') {
        this.scripts.push(node)
      }
    })
    if (this.active) {
      // initialise scripts
      for (const node of this.scripts) {
        node.init()
      }
      // move root children to world space
      while (this.root.children.length) {
        this.root.detach(this.root.children[0])
      }
      // start scripts
      for (const node of this.scripts) {
        node.start()
      }
      // register for update/fixedUpdate
      for (const node of this.scripts) {
        this.space.scripts.register(node)
      }
    }
  }

  buildNodes(parent, nodes) {
    for (const data of nodes) {
      const node = this.createNode(data)
      parent.add(node)
      this.buildNodes(node, data.children)
    }
  }

  createNode(data) {
    if (this.nodes.has(data.name)) {
      console.error('node name already exists:', data.name)
      return
    }
    const Node = Nodes[data.type]
    const node = new Node(this, data)
    this.nodes.set(node.name, node)
    return node
  }

  getProxy() {
    if (!this.proxy) {
      const entity = this
      const proxy = {
        find(name) {
          const node = entity.nodes.get(name)
          if (!node) return null
          return node.getProxy()
        },
        create(data) {
          const node = entity.createNode(data)
          return node.getProxy()
        },
        add(pNode) {
          const node = entity.nodes.get(pNode.name)
          entity.root.add(node)
          return proxy
        },
        remove(pNode) {
          const node = entity.nodes.get(pNode.name)
          entity.root.remove(node)
          return proxy
        },
      }
      this.proxy = proxy
    }
    return this.proxy
  }

  destroy() {
    for (const node of this.scripts) {
      this.space.scripts.unregister(node)
    }
    this.nodes.forEach(node => {
      if (node.mounted) {
        node.unmount()
      }
    })
  }

  // deserialize(data) {
  //   this.id = data.id
  //   this.type = data.type
  //   this.authority = data.authority
  //   this.position.fromArray(data.position)
  //   this.quaternion.fromArray(data.quaternion)
  //   this.state = data.state
  //   this.nodes = new Node(this, null, { children: data.nodes })
  //   this.nodes.traverse(node => {
  //     node.start()
  //   })
  //   // this.nodes = data.nodes.map(data => {
  //   //   const Node = nodes[data.type]
  //   //   const node = new Node(this, null, data)
  //   //   return node
  //   // })

  //   // {
  //   //   // tmp
  //   //   const geometry = new THREE.BoxGeometry(1, 1, 1)
  //   //   const material = new THREE.MeshBasicMaterial({ color: 'red' })
  //   //   const mesh = new THREE.Mesh(geometry, material)
  //   //   mesh.position.copy(this.position)
  //   //   mesh.quaternion.copy(this.quaternion)
  //   //   this.space.graphics.scene.add(mesh)
  //   // }
  //   return this
  // }
}
