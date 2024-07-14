import * as THREE from 'three'

import { isEmpty } from 'lodash-es'

import * as Nodes from './nodes'

import { QuaternionLerp } from './extras/QuaternionLerp'
import { Vector3Lerp } from './extras/Vector3Lerp'
import { Events } from './extras/Events'
import { smoothDamp } from './extras/smoothDamp'

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
      name: '$root',
      position: data.position,
      quaternion: data.quaternion,
    })
    this.networkPosition = new THREE.Vector3().copy(this.root.position)
    this.networkQuaternion = new THREE.Quaternion().copy(this.root.quaternion)
    this.state = data.state || {}
    this.stateProxy = new Proxy(this.state, {
      set: (target, key, value) => {
        if (target[key] === value) return true
        this.applyLocalChanges({
          sync: true,
          state: {
            [key]: value,
          },
        })
        return true
      },
    })
    this.stateChanges = {}
    this.events = {}
    this.blueprint = null
    this.script = null
    this.loadNum = 0
    this.load()
  }

  isUploading() {
    if (!this.uploading) return false
    if (this.world.loader.has(this.schema.model)) {
      return false // we already have this locally lets go!
    }
    return this.uploading !== this.world.network.client.id
  }

  async load() {
    if (!this.isUploading()) {
      try {
        this.blueprint = null
        this.script = null
        const promises = []
        {
          promises.push(
            this.world.loader.load(this.schema.model, this.schema.modelType)
          )
        }
        if (this.schema.script) {
          const url = `${process.env.PUBLIC_API_URL}/scripts/${this.schema.script}`
          promises.push(this.world.loader.load(url, 'js'))
        }
        const num = ++this.loadNum
        const [blueprint, script] = await Promise.all(promises)
        if (this.loadNum !== num) return // reloaded
        this.blueprint = blueprint
        this.script = script
      } catch (err) {
        console.error('Could not load model/script:', err)
        return this.kill()
      }
    }
    this.checkMode(true)
  }

  reload() {
    this.blueprint = null
    this.script = null
    this.load()
  }

  createNode(data) {
    if (this.nodes.has(data.name)) {
      console.error('node name already exists: ', data.name)
      return
    }
    const Node = Nodes[data.type]
    const node = new Node(data)
    node.bind(this)
    this.nodes.set(node.name, node)
    return node
  }

  rebuild() {
    // unmount nodes (including detached)
    const prevRoot = this.root
    this.root.deactivate()
    this.nodes.forEach(node => {
      node.deactivate()
    })
    this.nodes.clear()
    // clear script events
    this.events = {}
    // reconstruct
    if (this.isUploading()) {
      // show loading
      this.root = this.createNode({
        type: 'group',
        name: '$root',
      })
      const box = this.createNode({
        type: 'box',
        name: 'loading',
        color: 'blue',
        position: [0, 0.5, 0],
      })
      this.root.add(box)
    } else if (!this.blueprint) {
      // not uploading but no blueprint? must be dead!
      this.root = this.createNode({
        type: 'group',
        name: '$root',
      })
      const box = this.createNode({
        type: 'box',
        name: 'error',
        color: 'red',
        position: [0, 0.5, 0],
      })
      this.root.add(box)
    } else {
      // construct from blueprint
      this.root = this.blueprint.clone(true)
      this.root.bind(this)
    }
    // copy over transforms
    this.root.position.copy(prevRoot.position)
    this.root.quaternion.copy(prevRoot.quaternion)
    // re-collect nodes by name
    this.root.traverse(node => {
      if (this.nodes.has(node.name)) {
        console.warn('dupe node name', node.name)
      }
      this.nodes.set(node.name, node)
    })
    // bind all nodes to this entity
    // this.root.bind(this)
  }

  checkMode(forceRespawn) {
    const prevMode = this.prevMode
    const prevModeClientId = this.prevModeClientId
    const mode = this.mode
    const modeClientId = this.modeClientId
    if (prevMode === mode && !forceRespawn) return
    // cleanup previous
    if (prevMode === 'active') {
      if (this.script) {
        this.world.entities.decActive(this)
      }
    }
    if (prevMode === 'moving') {
      this.world.entities.decActive(this)
      const isMover = prevModeClientId !== this.world.network.client.id
      if (!isMover) {
        // before rebuilding, snap to final network transforms for accuracy
        this.root.position.copy(this.networkPosition)
        this.root.quaternion.copy(this.networkQuaternion)
      }
    }
    // rebuild
    this.rebuild()
    // console.log('entity', this)
    // console.log('stats', this.getStats())
    // configure new
    if (this.mode === 'active') {
      // instantiate script
      if (this.script) {
        try {
          this.script(this.getProxy())
        } catch (err) {
          console.error('entity instantiate failed', this)
          console.error(err)
          this.kill()
        }
      }
      // emit script 'setup' event (pre-mount)
      try {
        this.emit('setup')
      } catch (err) {
        console.error('entity setup failed', this)
        console.error(err)
        this.kill()
      }
      // activate (mount) nodes
      this.root.activate()
      // emit script 'start' event (post-mount)
      try {
        this.emit('start')
      } catch (err) {
        console.error('entity start failed', this)
        console.error(err)
        this.kill()
      }
      // register for script update/fixedUpdate etc
      if (this.script) {
        this.world.entities.incActive(this)
      }
    }
    if (this.mode === 'moving') {
      if (modeClientId === this.world.network.client.id) {
        this.world.control.setMoving(this)
      }
      this.world.entities.incActive(this)
      // activate (mount) nodes
      this.root.activate()
    }
    this.nodes.forEach(node => node.setMode(this.mode))
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
      const isMover = this.modeClientId === this.world.network.client.id
      if (!isMover) {
        const smoothTime = MOVING_SEND_RATE * 2.5
        smoothDamp(this.root.position, this.networkPosition, smoothTime, delta)
        this.root.quaternion.slerp(this.networkQuaternion, 8 * delta)
        this.root.dirty()
      }
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
    this.stateChanges = {}
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
    this.script = null
    this.checkMode(true)
  }

  getProxy() {
    const entity = this
    const world = this.world
    return {
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
      ...this.root.getProxy(),
    }
  }

  getUpdate = () => {
    if (this.nextMsg?.sent) {
      this.nextMsg = null
    }
    if (!this.nextMsg) {
      this.nextMsg = {
        event: Events.ENTITY_UPDATED,
        data: {
          id: this.id,
        },
      }
      this.world.network.sendLater(this.nextMsg)
    }
    return this.nextMsg.data
  }

  applyLocalChanges({ sync, state, props }) {
    if (state) {
      const changed = {}
      for (const key in state) {
        const value = state[key]
        if (this.state[key] !== value) {
          this.state[key] = value
          changed[key] = value
        }
      }
      if (sync && !isEmpty(changed)) {
        const data = this.getUpdate()
        data.state = {
          ...data.state,
          ...changed,
        }
      }
    }
    if (props) {
      let moved
      let moded
      const changed = {}
      if (props.position) {
        this.root.position.copy(props.position)
        changed.position = this.root.position.toArray()
        moved = true
      }
      if (props.quaternion) {
        this.root.quaternion.copy(props.quaternion)
        changed.quaternion = this.root.quaternion.toArray()
        moved = true
      }
      if (props.hasOwnProperty('mode')) {
        if (this.mode !== props.mode) {
          this.mode = props.mode
          changed.mode = props.mode
          moded = true
        }
      }
      if (props.hasOwnProperty('modeClientId')) {
        if (this.modeClientId !== props.modeClientId) {
          this.modeClientId = props.modeClientId
          changed.modeClientId = props.modeClientId
          moded = true
        }
      }
      if (props.hasOwnProperty('uploading')) {
        if (this.uploading !== props.uploading) {
          this.uploading = props.uploading
          changed.uploading = props.uploading
        }
      }
      if (moved) {
        this.root.dirty()
      }
      if (moded) {
        this.checkMode()
      }
      if (sync && !isEmpty(changed)) {
        const data = this.getUpdate()
        data.props = {
          ...data.props,
          ...changed,
        }
      }
    }
  }

  applyNetworkChanges({ state, props }) {
    if (state) {
      for (const key in state) {
        this.state[key] = state[key]
        this.stateChanges[key] = state[key]
      }
    }
    if (props) {
      if (props.position) {
        this.networkPosition.fromArray(props.position)
      }
      if (props.quaternion) {
        this.networkQuaternion.fromArray(props.quaternion)
      }
      if (props.mode) {
        this.mode = props.mode
        this.modeClientId = props.modeClientId
        this.checkMode()
      }
      if (props.hasOwnProperty('uploading')) {
        if (props.uploading !== null) {
          console.error('uploading should only ever be nulled')
        }
        if (this.uploading !== props.uploading) {
          this.uploading = props.uploading
          this.load()
        }
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
