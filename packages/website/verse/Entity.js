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
    this.uploading = data.uploading
    this.mode = data.mode
    this.modeClientId = data.modeClientId // when mode=moving|editing
    this.nodes = new Map()
    this.root = new Nodes.group({
      name: 'root',
      position: data.position,
      quaternion: data.quaternion,
    })
    this.positionLerp = new Vector3Lerp(this.root.position, MOVING_SEND_RATE)
    this.quaternionLerp = new QuaternionLerp(this.root.quaternion, MOVING_SEND_RATE) // prettier-ignore
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
    this.events = {}
    this.loadNum = 0
    this.load()
  }

  isUploading() {
    if (!this.uploading) return false
    if (this.world.loader.has(this.schema.model)) {
      this.uploading = null // we already have this lets go!
      return false
    }
    return this.uploading !== this.world.network.client.id
  }

  async load() {
    if (!this.isUploading()) {
      try {
        this.blueprint = null
        const num = ++this.loadNum
        const blueprint = await this.world.loader.load(
          this.schema.model,
          this.schema.modelType
        )
        if (this.loadNum !== num) return // reloaded
        this.blueprint = blueprint
      } catch (err) {
        console.error('Could not load model:', err)
        return this.kill()
      }
    }
    this.checkMode(true)
  }

  createNode(data) {
    if (this.nodes.has(data.name)) {
      console.error('node name already exists: ', data.name)
      return
    }
    const Node = Nodes[data.type]
    const node = new Node(data)
    this.nodes.set(node.name, node)
    return node
  }

  rebuild() {
    // destroy current root
    this.root.unbind()
    // clear script events
    this.events = {}
    // reconstruct
    if (this.isUploading()) {
      // show loading
      this.root = new Nodes.group({
        name: 'root',
      })
      const box = new Nodes.box({
        name: 'loading',
        color: 'blue',
        position: [0, 0.5, 0],
      })
      this.root.add(box)
    } else if (!this.blueprint) {
      // not uploading but no blueprint? must be dead!
      this.root = new Nodes.group({
        name: 'root',
      })
      const box = new Nodes.box({
        name: 'error',
        color: 'red',
        position: [0, 0.5, 0],
      })
      this.root.add(box)
    } else {
      // construct from blueprint
      this.root = this.blueprint.clone(true)
    }
    // re-point the lerpers
    this.root.position.copy(this.positionLerp.value)
    this.positionLerp.value = this.root.position
    this.root.quaternion.copy(this.quaternionLerp.value)
    this.quaternionLerp.value = this.root.quaternion
    this.positionLerp.snap()
    this.quaternionLerp.snap()
    // re-collect nodes by name
    this.nodes.clear()
    this.root.traverse(node => {
      if (this.nodes.has(node.name)) {
        console.warn('dupe node name', node.name)
      }
      this.nodes.set(node.name, node)
    })
    // bind (and mount)
    this.root.bind(this)
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
    this.blueprint = null
    this.checkMode(true)
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
    if (data.hasOwnProperty('uploading')) {
      if (data.uploading !== null) {
        console.error('uploading should only ever be nulled')
      }
      if (this.uploading !== data.uploading) {
        this.uploading = data.uploading
        this.load()
      }
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
