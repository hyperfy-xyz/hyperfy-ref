import * as Nodes from './nodes'

import { QuaternionLerp } from './extras/QuaternionLerp'
import { Vector3Lerp } from './extras/Vector3Lerp'

const MOVING_SEND_RATE = 1 / 5

export class Entity {
  constructor(world, data) {
    this.world = world
    this.id = data.id
    this.schema = this.world.entities.getSchema(data.schemaId)
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
          world.network.pushEntityUpdate(this.id, update => {
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
    // this.script = null
    this.events = {}
    this.positionLerp = new Vector3Lerp(this.root.position, MOVING_SEND_RATE)
    this.quaternionLerp = new QuaternionLerp(this.root.quaternion, MOVING_SEND_RATE) // prettier-ignore
    this.load()
  }

  async load() {
    this.model = await this.world.loader.load(
      this.schema.model,
      this.schema.modelType
    )
    this.checkMode()
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
    // script
    // this.script = null
    this.events = {}
    // build
    if (this.mode === 'dead') {
      const box = this.createNode({
        type: 'box',
        name: 'error',
        color: 'blue',
        position: [0, 0.5, 0],
      })
      this.root.add(box)
    }
    if (this.mode !== 'dead') {
      const convert = (object3d, parentNode) => {
        let node
        if (
          object3d.type === 'Scene' ||
          object3d.type === 'Group' ||
          object3d.type === 'Object3D'
        ) {
          node = this.createNode({
            type: 'group',
            name: object3d.name,
            position: object3d.position.toArray(),
            quaternion: object3d.quaternion.toArray(),
            scale: object3d.scale.toArray(),
          })
        }
        if (object3d.type === 'Mesh') {
          // console.log('rebuild mesh', object3d, this)
          node = this.createNode({
            type: 'mesh',
            name: object3d.name,
            mesh: object3d,
            position: object3d.position.toArray(),
            quaternion: object3d.quaternion.toArray(),
            scale: object3d.scale.toArray(),
          })
        }
        if (node) {
          parentNode.add(node)
        } else {
          console.log('unsupported', object3d)
        }
        for (const child of object3d.children) {
          convert(child, node)
        }
      }
      for (const object3d of this.model.scene.children) {
        convert(object3d, this.root)
      }
      // TEMP box
      // const box = this.createNode({
      //   type: 'box',
      //   name: 'error',
      //   color: 'blue',
      //   position: [0, 0.5, 0],
      // })
      // this.root.add(box)
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
      if (this.schema.script) {
        this.world.entities.decActive(this)
      }
    }
    if (prevMode === 'moving') {
      this.world.entities.decActive(this)
    }
    if (prevMode === 'editing') {
      this.world.entities.decActive(this)
    }
    // rebuild
    this.rebuild()
    this.positionLerp.snap()
    this.quaternionLerp.snap()
    this.root.dirty()
    this.nodes.forEach(node => {
      node.setMode(this.mode)
    })
    // console.log('entity', this)
    // console.log('stats', this.getStats())
    // configure new
    if (this.mode === 'active') {
      // instantiate script
      if (this.schema.script) {
        const script = this.world.scripts.resolve(this.schema.script)
        try {
          script(this.getProxy())
        } catch (err) {
          console.error('entity instantiate failed', this)
          console.error(err)
          this.kill()
        }
      }
      // emit script 'setup' event (pre-world-space)
      try {
        this.emit('setup')
      } catch (err) {
        console.error('entity setup failed', this)
        console.error(err)
        this.kill()
      }
      // emit script 'start' event (world-space)
      try {
        this.emit('start')
      } catch (err) {
        console.error('entity start failed', this)
        console.error(err)
        this.kill()
      }
      // register for script update/fixedUpdate etc
      if (this.schema.script) {
        this.world.entities.incActive(this)
      }
    }
    if (this.mode === 'moving') {
      if (modeClientId === this.world.network.client.id) {
        this.world.control.setMoving(this)
      }
      this.world.entities.incActive(this)
    }
    if (this.mode === 'editing') {
      if (modeClientId === this.world.network.client.id) {
        this.world.panels.edit(this)
      }
      this.world.entities.incActive(this)
    }
    if (this.mode === 'dead') {
      // move root children to world space
      // while (this.root.children.length) {
      //   this.root.detach(this.root.children[0])
      // }
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
      try {
        this.emit('update', delta)
      } catch (err) {
        // console.error('entity update failed', this)
        console.error(err)
        this.kill()
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
      try {
        this.emit('fixedUpdate', delta)
      } catch (err) {
        console.error('entity fixedUpdate failed', this)
        console.error(err)
        this.kill()
      }
    }
  }

  lateUpdate(delta) {
    if (this.mode === 'active') {
      try {
        this.emit('lateUpdate', delta)
      } catch (err) {
        console.error('entity lateUpdate failed', this)
        console.error(err)
        this.kill()
      }
    }
    this.stateChanges = null
  }

  on(name, callback) {
    if (!this.events[name]) {
      this.events[name] = new Set()
    }
    this.events[name].add(callback)
  }

  off(name, callback) {
    if (!this.events[name]) return
    this.events[name].delete(callback)
  }

  emit(name, a1, a2) {
    if (!this.events[name]) return
    for (const callback of this.events[name]) {
      callback(a1, a2)
    }
  }

  kill() {
    this.mode = 'dead'
    this.checkMode()
  }

  getProxy() {
    if (!this.proxy) {
      const entity = this
      const world = this.world
      const proxy = {
        on(name, callback) {
          entity.on(name, callback)
        },
        off(name, callback) {
          entity.off(name, callback)
        },
        get(name) {
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
          return entity.authority === world.network.client.id
        },
        requestControl() {
          world.control.request(entity)
        },
        getControl() {
          return world.control.get(entity)
        },
        releaseControl() {
          return world.control.release(entity)
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

  getStats() {
    let triangles = 0
    this.root.traverse(node => {
      const nStats = node.getStats()
      if (nStats) {
        triangles += nStats.triangles
      }
    })
    return {
      triangles,
    }
  }

  destroy() {
    this.world.entities.decActive(this, true)
    this.nodes.forEach(node => {
      if (node.mounted) {
        node.unmount()
      }
    })
    this.destroyed = true
  }
}
