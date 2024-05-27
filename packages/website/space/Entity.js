import * as Nodes from './nodes'

import { Vector3Lerp } from '@/utils/Vector3Lerp'
import { QuaternionLerp } from '@/utils/QuaternionLerp'

const MOVING_SEND_RATE = 1 / 5

export class Entity {
  constructor(space, data) {
    this.space = space
    this.id = data.id
    this.schema = this.space.entities.getSchema(data.schemaId)
    this.creator = data.creator
    this.authority = data.authority
    this.mode = data.mode
    this.modeClientId = data.modeClientId // when mode=moving|editing
    this.nodes = new Map()
    this.root = this.createNode({
      type: 'group',
      name: 'root',
      position: data.position,
      quaternion: data.quaternion,
    })
    this.root.mounted = true
    this.root.project()
    this.state = data.state
    this.stateProxy = new Proxy(this.state, {
      set: (target, key, value) => {
        if (target[key] !== value) {
          target[key] = value
          space.network.pushEntityUpdate(this.id, update => {
            if (!update.state) {
              update.state = {}
            }
            update.state = {
              ...update.state,
              [key]: value,
            }
          })
        }
        return true
      },
    })
    this.stateChanges = null
    this.scripts = []
    this.positionLerp = new Vector3Lerp(this.root.position, MOVING_SEND_RATE)
    this.quaternionLerp = new QuaternionLerp(this.root.quaternion, MOVING_SEND_RATE) // prettier-ignore
    this.checkMode()
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
    this.scripts = []
    // build
    if (this.mode === 'dead') {
      this.buildNodes(this.root, [
        {
          type: 'box',
          name: 'error',
          color: 'blue',
          position: [0, 0.5, 0],
        },
      ])
    } else {
      this.buildNodes(this.root, this.schema.nodes)
    }
  }

  checkMode(forceRespawn) {
    const prevMode = this.prevMode
    const prevModeClientId = this.prevModeClientId
    const mode = this.mode
    const modeClientId = this.modeClientId
    if (prevMode === mode && !forceRespawn) return
    // cleanup previous
    if (prevMode === 'active') {
      if (this.scripts.length) {
        this.space.entities.decActive(this)
      }
    }
    if (prevMode === 'moving') {
      this.space.entities.decActive(this)
    }
    if (prevMode === 'editing') {
      this.space.entities.decActive(this)
    }
    // rebuild
    this.rebuild()
    this.positionLerp.snap()
    this.quaternionLerp.snap()
    this.root.dirty()
    this.nodes.forEach(node => {
      node.setMode(this.mode)
    })
    // configure new
    if (this.mode === 'active') {
      this.root.traverse(node => {
        if (node.type === 'script') {
          this.scripts.push(node)
        }
      })
      // initialise scripts
      for (const node of this.scripts) {
        try {
          node.init()
        } catch (err) {
          console.error('entity init failed', this)
          console.error(err)
          this.kill()
        }
      }
      // move root children to world space
      while (this.root.children.length) {
        this.root.detach(this.root.children[0])
      }
      // start scripts
      for (const node of this.scripts) {
        try {
          node.start()
        } catch (err) {
          console.error('entity start failed', this)
          console.error(err)
          this.kill()
        }
      }
      // register for script update/fixedUpdate etc
      if (this.scripts.length) {
        this.space.entities.incActive(this)
      }
    }
    if (this.mode === 'moving') {
      if (modeClientId === this.space.network.client.id) {
        this.space.control.setMoving(this)
      }
      this.space.entities.incActive(this)
    }
    if (this.mode === 'editing') {
      if (modeClientId === this.space.network.client.id) {
        this.space.panels.edit(this)
      }
      this.space.entities.incActive(this)
    }
    this.prevMode = this.mode
    this.prevModeClientId = this.modeClientId
  }

  update(delta) {
    // only called when
    // - it has scripts
    // - its being moved
    // also applies to fixed/late update
    if (this.mode === 'active') {
      for (const node of this.scripts) {
        try {
          node.script.update?.(delta)
        } catch (err) {
          console.error('entiy update failed', this)
          console.error(err)
          this.kill()
        }
      }
    }
    if (this.mode === 'moving') {
      this.positionLerp.update(delta)
      this.quaternionLerp.update(delta)
      this.root.dirty()
    }
    if (this.mode === 'editing') {
      this.positionLerp.update(delta)
      this.quaternionLerp.update(delta)
      this.root.dirty()
    }
  }

  fixedUpdate(delta) {
    if (this.mode === 'active') {
      for (const node of this.scripts) {
        try {
          node.script.fixedUpdate?.(delta)
        } catch (err) {
          console.error('entiy fixedUpdate failed', this)
          console.error(err)
          this.kill()
        }
      }
    }
  }

  lateUpdate(delta) {
    if (this.mode === 'active') {
      for (const node of this.scripts) {
        try {
          node.script.lateUpdate?.(delta)
        } catch (err) {
          console.error('entiy lateUpdate failed', this)
          console.error(err)
          this.kill()
        }
      }
    }
    this.stateChanges = null
  }

  kill() {
    this.mode = 'dead'
    this.checkMode()
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
    if (data.position) {
      this.positionLerp.push(data.position)
    }
    if (data.quaternion) {
      this.quaternionLerp.push(data.quaternion)
    }
    if (data.mode) {
      this.mode = data.mode
      this.modeClientId = data.modeClientId
      this.checkMode()
    }
  }

  destroy() {
    this.space.entities.decActive(this, true)
    this.nodes.forEach(node => {
      if (node.mounted) {
        node.unmount()
      }
    })
    this.destroyed = true
  }
}
