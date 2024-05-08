import * as THREE from 'three'
import * as Nodes from './nodes'
import { cloneDeep } from 'lodash-es'
import { Vector3Lerp } from '@/utils/Vector3Lerp'
import { QuaternionLerp } from '@/utils/QuaternionLerp'

const MOVING_SEND_RATE = 1 / 5

export class Entity {
  constructor(space, data) {
    this.space = space
    this.id = data.id
    this.type = data.type
    this.authority = data.authority
    this.active = null // set below
    this.moving = false
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
    this.state = data.state
    this.stateProxy = new Proxy(this.state, {
      set: (target, key, value) => {
        if (target[key] !== value) {
          target[key] = value
          const delta = space.network.getEntityDelta(this.id)
          if (!delta.state) {
            delta.state = {}
          }
          delta.state = {
            ...delta.state,
            [key]: value,
          }
        }
        return true
      },
    })
    this.stateChanges = null
    this.scripts = []
    this.initialNodes = data.nodes
    this.positionLerp = new Vector3Lerp(this.root.position, MOVING_SEND_RATE)
    this.quaternionLerp = new QuaternionLerp(this.root.quaternion, MOVING_SEND_RATE) // prettier-ignore
    this.setActive(data.active)
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

  rebuild() {
    // destroy
    while (this.root.children.length) {
      this.root.detach(this.root.children[0])
    }
    this.nodes.forEach(node => {
      node.unmount() // todo: destroy nodes?
    })
    this.nodes.clear()
    if (this.scripts.length) {
      this.space.entities.decActive(this)
    }
    this.scripts = []
    // build
    this.buildNodes(this.root, this.initialNodes)
  }

  setActive(active) {
    if (this.active === active) return
    this.active = active
    this.rebuild()
    if (this.active) {
      this.setMoving(false)
      this.root.traverse(node => {
        if (node.type === 'script') {
          this.scripts.push(node)
        }
      })
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
      if (this.scripts.length) {
        this.space.entities.incActive(this)
      }
    } else {
      // ...
    }
    const delta = this.space.network.getEntityDelta(this.id)
    if (!delta.props) delta.props = {}
    delta.props.active = this.active
  }

  setMoving(moving) {
    if (this.moving === moving) return
    this.moving = moving
    this.positionLerp.reset()
    this.quaternionLerp.reset()
    this.root.dirty()
    if (this.moving) {
      this.setActive(false)
      this.nodes.forEach(node => {
        node.setMoving(true)
      })
      this.space.entities.incActive(this)
    } else {
      this.nodes.forEach(node => {
        node.setMoving(false)
      })
      this.setActive(true)
      this.space.entities.decActive(this)
    }
    const delta = this.space.network.getEntityDelta(this.id)
    if (!delta.props) delta.props = {}
    delta.props.moving = this.moving
  }

  update(delta) {
    // only called when
    // - it has scripts
    // - its being moved
    // also applies to fixed/late update
    if (this.active) {
      for (const node of this.scripts) {
        try {
          node.script.update?.(delta)
        } catch (err) {
          console.error(err)
        }
      }
    }
    if (this.moving) {
      this.positionLerp.update(delta)
      this.quaternionLerp.update(delta)
      this.root.dirty()
    }
  }

  fixedUpdate(delta) {
    if (this.active) {
      for (const node of this.scripts) {
        try {
          node.script.fixedUpdate?.(delta)
        } catch (err) {
          console.error(err)
        }
      }
    }
  }

  lateUpdate(delta) {
    if (this.active) {
      for (const node of this.scripts) {
        try {
          node.script.lateUpdate?.(delta)
        } catch (err) {
          console.error(err)
        }
      }
    }
    this.stateChanges = null
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

  onRemotePropChanges(data) {
    if (data.active === true || data.active === false) {
      this.setActive(data.active)
    }
    if (data.moving === true || data.moving === false) {
      this.setMoving(data.moving)
    }
    if (data.position) {
      this.positionLerp.push(data.position)
    }
    if (data.quaternion) {
      this.quaternionLerp.push(data.quaternion)
    }
  }

  destroy() {
    this.space.entities.decActive(this, true)
    this.nodes.forEach(node => {
      if (node.mounted) {
        node.unmount()
      }
    })
  }
}
