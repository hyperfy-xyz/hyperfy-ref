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
    this.state = data.state
    this.stateProxy = new Proxy(this.state, {
      set: (target, key, value) => {
        if (target[key] !== value) {
          target[key] = value
          const delta = space.network.delta
          if (!delta[this.id]) {
            delta[this.id] = {}
          }
          if (!delta[this.id].state) {
            delta[this.id].state = {}
          }
          delta[this.id].state = {
            ...delta[this.id].state,
            [key]: value,
          }
        }
        return true
      },
    })
    this.stateChanges = null
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
      // register for script update/fixedUpdate etc
      this.space.scripts.register(this)
    }
  }

  buildNodes(parent, nodes) {
    for (const data of nodes) {
      const node = this.createNode(data)
      parent.add(node)
      if (data.children) {
        this.buildNodes(node, data.children)
      }
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
      const space = this.space
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
        isAuthority() {
          return entity.authority === space.network.client.id
        },
        requestControl() {
          space.control.request(entity)
        },
        getControl() {
          return space.control.get(entity)
        },
        releaseControl() {
          return space.control.release(entity)
        },
        getState() {
          return entity.stateProxy
        },
        getStateChanges() {
          return entity.stateChanges
        },
      }
      this.proxy = proxy
    }
    return this.proxy
  }

  onRemoteStateChanges(changes) {
    this.state = {
      ...this.state,
      ...changes,
    }
    this.stateChanges = {
      ...this.stateChanges,
      ...changes,
    }
  }

  destroy() {
    this.space.scripts.unregister(this)
    this.nodes.forEach(node => {
      if (node.mounted) {
        node.unmount()
      }
    })
  }
}
