import * as THREE from 'three'
import { Vector3, Quaternion } from 'three'
import { createNoise2D } from 'simplex-noise'

import { cloneDeep, isEmpty, isString } from 'lodash-es'

import * as Nodes from './nodes'

import { QuaternionLerp } from './extras/QuaternionLerp'
import { Vector3Lerp } from './extras/Vector3Lerp'
import { Events } from './extras/Events'
import { smoothDamp } from './extras/smoothDamp'

import { Entity } from './Entity'
import { BombIcon, CopyIcon, EyeIcon, GrabIcon, HandIcon, PencilRulerIcon, Trash2Icon, UnlinkIcon } from 'lucide-react'
import { DEG2RAD } from './extras/general'
import { num } from './extras/num'
import { glbToNodes } from './extras/glbToNodes'
import { bindRotations } from './extras/bindRotations'

const MOVING_SEND_RATE = 1 / 5

const e1 = new THREE.Euler()
const q1 = new THREE.Quaternion()

const defaultPosition = [0, 0, 0]
const defaultQuaternion = [0, 0, 0, 1]

const hotEventNames = ['fixedUpdate', 'update', 'lateUpdate']

export class Object extends Entity {
  constructor(world, props) {
    super(world, props)

    this.creator = props.creator

    this.schema = this.world.entities.getSchema(props.schemaId)
    console.log(this.schema)

    this.authority = this.createNetworkProp('authority', props.authority)
    this.uploading = this.createNetworkProp('uploading', props.uploading)
    this.uploading.onChange = this.onUploadingChange.bind(this)
    this.mode = this.createNetworkProp('mode', props.mode)
    this.mode.onChange = this.onModeChange.bind(this)
    this.modeClientId = this.createNetworkProp('modeClientId', props.modeClientId) // prettier-ignore
    this.modeClientId.onChange = this.onModeClientIdChange.bind(this)
    this.position = this.createNetworkProp('position', new Vector3().fromArray(props.position || defaultPosition)) // prettier-ignore
    // this.position.onChange = this.onPositionChange.bind(this)
    this.quaternion = this.createNetworkProp('quaternion', new Quaternion().fromArray(props.quaternion || defaultQuaternion)) // prettier-ignore
    // this.quaternion.onChange = this.onQuaternionChange.bind(this)

    this.root = new Nodes.group({ id: '$root' })
    this.root.position.copy(this.position.value)
    this.root.quaternion.copy(this.quaternion.value)

    this.ctx = { world: this.world, entity: this }

    this.scriptVarIds = 0

    this.hotCounter = 0
    this.hotEvents = 0

    this.modeChanged = false

    this.nodes = new Map()
    this.worldNodes = new Set()
    this.events = {}
    this.blueprint = null
    this.script = null
    this.loadNum = 0
    this.load()

    // console.log(this)
  }

  serialize() {
    return {
      type: 'object',
      id: null,
      creator: this.creator,
      schemaId: this.schema.id,
      authority: null,
      uploading: false,
      mode: this.mode.value,
      modeClientId: this.modeClientId.value,
      position: this.position.value.toArray(),
      quaternion: this.quaternion.value.toArray(),
    }
  }

  onUploadingChange(newValue, oldValue) {
    // console.log('onUploadingChange', newValue)
    this.load()
  }

  onModeChange(newValue, oldValue) {
    // console.log('onModeChange', newValue)
    // NOTE: we can't just call checkMode() here because the modeClientId may also have changed
    if (!this.modeChanged) {
      this.modeChanged = true
      this.incHot() // get the next update
    }
  }

  onModeClientIdChange(newValue, oldValue) {
    // console.log('onModeClientIdChange', newValue)
    // NOTE: we can't just call checkMode() here because the modeClientId may also have changed
    if (!this.modeChanged) {
      this.modeChanged = true
      this.incHot() // get the next update
    }
  }

  onPositionChange(newValue, oldValue) {
    // if (this.isAuthority()) {
    //   this.root.position.copy(newValue)
    //   this.root.dirty()
    // } else {
    //   this.networkPosition.copy(newValue)
    // }
  }

  onQuaternionChange(newValue, oldValue) {
    // console.log('onQuaternionChange', newValue)
    // this.networkQuaternion.copy(newValue)
  }

  isAuthority() {
    return this.authority.value === this.world.network.client.id
  }

  isUploading() {
    if (!this.uploading.value) return false
    if (this.schema.modelType === 'glb' && this.world.loader.hasGLB(this.schema.model)) {
      return false // we already have this locally lets go!
    }
    if (this.schema.modelType === 'vrm' && this.world.loader.hasVRM(this.schema.model)) {
      return false // we already have this locally lets go!
    }
    return this.uploading.value !== this.world.network.client.id
  }

  async load() {
    if (!this.isUploading()) {
      try {
        this.blueprint = null
        this.script = null
        const promises = []
        if (this.schema.modelType === 'glb') {
          promises.push(
            this.world.loader.loadGLB(this.schema.model).then(glb => {
              return glb.node
            })
          )
        }
        if (this.schema.modelType === 'vrm') {
          promises.push(
            this.world.loader.loadVRM(this.schema.model).then(vrm => {
              return vrm.node
            })
          )
        }
        if (this.schema.script) {
          const url = `${process.env.PUBLIC_API_URL}/scripts/${this.schema.script}`
          promises.push(this.world.loader.loadScript(url))
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
    const Node = Nodes[data.name]
    const node = new Node(data)
    node.setContext(this.ctx)
    if (this.nodes.has(node.id)) {
      console.error('node with id already exists: ', node.id)
      return
    }
    this.nodes.set(node.id, node)
    return node
  }

  rebuild() {
    const prevRoot = this.root
    // unmount nodes
    this.root.deactivate()
    for (const node of this.worldNodes) {
      node.deactivate()
    }
    this.worldNodes.clear()
    this.nodes.clear()
    // release script control
    this.control?.release(false)
    this.control = null
    // clear script events and unregister those hot updates
    this.events = {}
    this.decHot(this.hotEvents)
    this.hotEvents = 0
    // clear script vars
    // for (let i = 0; i < this.scriptVarIds; i++) {
    //   this.destroyVar(`$${i}`)
    // }
    this.scriptVarIds = 0
    // reconstruct
    if (this.isUploading()) {
      // show loading
      this.root = this.createNode({
        id: '$root',
        name: 'group',
      })
      const box = this.createNode({
        id: 'loading',
        name: 'box',
        color: 'blue',
        position: [0, 0.5, 0],
      })
      this.root.add(box)
    } else if (!this.blueprint) {
      // not uploading but no blueprint? must be dead!
      this.root = this.createNode({
        id: '$root',
        name: 'group',
      })
      const box = this.createNode({
        id: 'error',
        name: 'box',
        color: 'red',
        position: [0, 0.5, 0],
      })
      this.root.add(box)
    } else {
      // TEMP: use our test blueprint
      // this.root = this.createNode({
      //   id: '$root',
      //   name: 'group',
      // })
      // const mesh = this.createNode({
      //   id: 'box',
      //   name: 'mesh',
      //   type: 'sphere',
      // })
      // this.root.add(mesh)

      // construct from blueprint
      this.root = this.blueprint.clone(true)
      // collect nodes by id
      this.root.traverse(node => {
        if (this.nodes.has(node.id)) {
          console.warn('duplicate node id found', node.id)
        }
        this.nodes.set(node.id, node)
      })
    }
    this.root.setContext(this.ctx)
    // copy over transforms
    this.root.position.copy(this.position.value)
    this.root.quaternion.copy(this.quaternion.value)
    // bind all nodes to this entity
    // this.root.bind(this)
  }

  checkMode(forceRespawn) {
    const prevMode = this.prevMode
    const prevModeClientId = this.prevModeClientId
    const mode = this.mode.value
    const modeClientId = this.modeClientId.value
    if (prevMode === mode && !forceRespawn) return
    // cleanup previous
    if (prevMode === 'active') {
      // ...
    }
    if (prevMode === 'moving') {
      this.decHot()
      const isMover = prevModeClientId === this.world.network.client.id
      if (!isMover) {
        // before rebuilding, snap to final network transforms for accuracy
        this.root.position.copy(this.position.value)
        this.root.quaternion.copy(this.quaternion.value)
      }
    }
    // rebuild
    this.rebuild()
    // console.log('entity', this)
    // console.log('stats', this.getStats())
    // configure new
    if (mode === 'active') {
      // instantiate script
      if (this.script) {
        try {
          this.script(this.getWorldProxy(), this.getObjectProxy())
        } catch (err) {
          console.error('entity instantiate failed', this)
          console.error(err)
          return this.kill()
        }
      }
      // // activate (mount) nodes
      // this.ctx.active = true
      // this.root.activate()
      // emit script 'mount' event (post-mount)
      // try {
      //   this.emit('mount')
      // } catch (err) {
      //   console.error('entity mount failed', this)
      //   console.error(err)
      //   return this.kill()
      // }
      // register for script update/fixedUpdate etc
      // if (this.script) {
      //   this.world.entities.incActive(this)
      // }
    }
    if (mode === 'moving') {
      if (modeClientId === this.world.network.client.id) {
        this.world.environment.setMoving(this)
      }
      // ensure we get updates
      this.incHot()
      // activate (mount) nodes
      // this.ctx.active = false
      // this.root.activate()
    }
    // activate (mount) nodes
    this.ctx.active = mode === 'active'
    this.root.activate()
    for (const node of this.worldNodes) {
      node.activate()
    }
    // this.nodes.forEach(node => node.setMode(mode))
    this.prevMode = mode
    this.prevModeClientId = modeClientId
  }

  update(delta) {
    // console.log('update')
    if (this.modeChanged) {
      this.modeChanged = false
      this.decHot()
      this.checkMode()
    }
    // only called when
    // - it has scripts
    // - its being moved
    // also applies to fixed/late update
    if (this.mode.value === 'active') {
      try {
        this.emit('update', delta)
      } catch (err) {
        console.error('entity update failed', this)
        console.error(err)
        this.kill()
        return
      }
    }
    if (this.mode.value === 'moving') {
      const isMover = this.modeClientId.value === this.world.network.client.id
      if (isMover) {
        this.root.position.copy(this.position.value)
        this.root.quaternion.copy(this.quaternion.value)
        // this.root.setDirty()
      } else {
        // this is broken because it modifes target (position.value) lol
        // smoothDamp(
        //   this.root.position,
        //   this.position.value,
        //   MOVING_SEND_RATE * 3,
        //   delta
        // )
        this.root.position.lerp(this.position.value, 5 * delta)
        this.root.quaternion.slerp(this.quaternion.value, 5 * delta)
        // this.root.dirty()
      }
    }
  }

  fixedUpdate(delta) {
    if (this.mode.value === 'active') {
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
    if (this.mode.value === 'active') {
      try {
        this.emit('lateUpdate', delta)
      } catch (err) {
        console.error('entity lateUpdate failed', this)
        console.error(err)
        this.kill()
      }
    }
  }

  on(name, callback) {
    if (!this.events[name]) {
      this.events[name] = new Set()
    }
    this.events[name].add(callback)
    if (hotEventNames.includes(name)) {
      this.hotEvents++
      this.incHot()
    }
  }

  off(name, callback) {
    if (!this.events[name]) return
    this.events[name].delete(callback)
    if (hotEventNames.includes(name)) {
      this.hotEvents--
      this.decHot()
    }
  }

  emit(name, a1, a2) {
    if (!this.events[name]) return
    for (const callback of this.events[name]) {
      callback(a1, a2)
    }
  }

  incHot() {
    this.hotCounter++
    if (this.hotCounter === 1) {
      this.world.entities.setHot(this, true)
    }
  }

  decHot(n = 1) {
    this.hotCounter -= n
    if (this.hotCounter === 0) {
      this.world.entities.setHot(this, false)
    }
    if (this.hotCounter < 0) {
      console.warn('hot counter dropped below zero')
    }
  }

  kill() {
    this.blueprint = null
    this.script = null
    this.checkMode(true)
  }

  getWorldProxy() {
    const entity = this
    const world = this.world
    return {
      add(pNode) {
        const node = entity.nodes.get(pNode.id)
        if (!node) return
        if (node.parent) {
          node.parent.remove(node)
        }
        entity.worldNodes.add(node)
        if (entity.ctx.active) {
          node.activate()
        }
      },
      remove(pNode) {
        const node = entity.nodes.get(pNode.id)
        if (!node) return
        if (node.parent) return // its not in world
        if (!entity.worldNodes.has(node)) return
        entity.worldNodes.delete(node)
        node.deactivate()
      },
    }
  }

  getObjectProxy() {
    const entity = this
    const world = this.world
    return {
      on(name, callback) {
        entity.on(name, callback)
      },
      off(name, callback) {
        entity.off(name, callback)
      },
      get(id) {
        const node = entity.nodes.get(id)
        if (!node) return null
        return node.getProxy()
      },
      create(name) {
        if (isString(name)) {
          const node = entity.createNode({ name })
          return node.getProxy()
        } else {
          console.warn('TODO: migrate script to create(String)')
          const node = entity.createNode(name)
          return node.getProxy()
        }
      },
      isAuthority() {
        return entity.authority.value === world.network.client.id
      },
      takeAuthority() {
        entity.authority.value = world.network.client.id
      },
      getState() {
        return entity.state
      },
      getStateChanges() {
        return entity._stateChanges
      },
      createNetworkProp(value, onChange) {
        const key = `__${entity.scriptVarIds++}`
        return entity.createNetworkProp(key, value, onChange)
      },
      control(options) {
        // TODO: only allow on user interaction
        // TODO: show UI with a button to release()
        entity.control = world.input.bind({
          ...options,
          priority: 50,
          object: entity,
        })
        return entity.control
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

  // applyLocalProps(props, sync = true) {
  //   let moved
  //   let moded
  //   const changed = {}
  //   if (props.position) {
  //     this.root.position.copy(props.position)
  //     changed.position = this.root.position.toArray()
  //     moved = true
  //   }
  //   if (props.quaternion) {
  //     this.root.quaternion.copy(props.quaternion)
  //     changed.quaternion = this.root.quaternion.toArray()
  //     moved = true
  //   }
  //   if (props.hasOwnProperty('mode')) {
  //     if (this.mode !== props.mode) {
  //       this.mode = props.mode
  //       changed.mode = props.mode
  //       moded = true
  //     }
  //   }
  //   if (props.hasOwnProperty('modeClientId')) {
  //     if (this.modeClientId !== props.modeClientId) {
  //       this.modeClientId = props.modeClientId
  //       changed.modeClientId = props.modeClientId
  //       moded = true
  //     }
  //   }
  //   if (props.hasOwnProperty('uploading')) {
  //     if (this.uploading !== props.uploading) {
  //       this.uploading = props.uploading
  //       changed.uploading = props.uploading
  //     }
  //   }
  //   if (moved) {
  //     this.root.dirty()
  //   }
  //   if (moded) {
  //     this.checkMode()
  //   }
  //   if (sync && !isEmpty(changed)) {
  //     const data = this.getUpdate()
  //     data.props = {
  //       ...data.props,
  //       ...changed,
  //     }
  //   }
  // }

  // applyNetworkProps(props) {
  //   if (props.position) {
  //     this.networkPosition.fromArray(props.position)
  //   }
  //   if (props.quaternion) {
  //     this.networkQuaternion.fromArray(props.quaternion)
  //   }
  //   if (props.mode) {
  //     this.mode = props.mode
  //     this.modeClientId = props.modeClientId
  //     this.checkMode()
  //   }
  //   if (props.hasOwnProperty('uploading')) {
  //     if (props.uploading !== null) {
  //       console.error('uploading should only ever be nulled')
  //     }
  //     if (this.uploading !== props.uploading) {
  //       this.uploading = props.uploading
  //       this.load()
  //     }
  //   }
  // }

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

  getActions(add) {
    const self = this
    const world = this.world
    add({
      label: 'Inspect',
      icon: EyeIcon,
      visible: true,
      disabled: false,
      execute: () => {
        world.panels.inspect(this)
      },
    })
    add({
      label: 'Move',
      icon: HandIcon,
      visible: world.permissions.canMoveEntity(self),
      disabled: self.mode.value !== 'active' && self.mode.value !== 'dead',
      execute: () => {
        self.mode.value = 'moving'
        self.modeClientId.value = world.network.client.id
      },
    })
    // add({
    //   label: 'Edit',
    //   icon: PencilRulerIcon,
    //   visible: world.permissions.canEditEntity(self),
    //   disabled: self.mode.value !== 'active' && self.mode.value !== 'dead',
    //   execute: () => {
    //     world.panels.edit(self)
    //   },
    // })
    if (world.entities.countEntitysBySchema(self.schema.id) > 1) {
      add({
        label: 'Unlink',
        icon: UnlinkIcon,
        visible: world.permissions.canEditEntity(self), // ???
        disabled: false,
        execute: () => {
          // duplicate schema
          const schema = cloneDeep(self.schema)
          schema.id = world.network.makeId()
          world.entities.upsertSchemaLocal(schema)
          // replace current instance with new one
          world.entities.addEntityLocal({
            type: 'object',
            id: world.network.makeId(),
            schemaId: schema.id,
            creator: world.network.client.user.id, // ???
            authority: world.network.client.id,
            mode: 'active',
            modeClientId: null,
            position: self.root.position.toArray(),
            quaternion: self.root.quaternion.toArray(),
          })
          world.entities.removeEntityLocal(self.id)
        },
      })
    }
    add({
      label: 'Duplicate',
      icon: CopyIcon,
      visible: world.permissions.canEditEntity(self),
      disabled: false,
      execute: () => {
        world.entities.addEntityLocal({
          type: 'object',
          id: world.network.makeId(),
          schemaId: self.schema.id,
          creator: world.network.client.user.id, // ???
          authority: world.network.client.id,
          mode: 'moving',
          modeClientId: world.network.client.id,
          position: self.root.position.toArray(),
          quaternion: self.root.quaternion.toArray(),
        })
      },
    })
    add({
      label: 'Bomb',
      icon: BombIcon,
      visible: true,
      disabled: false,
      execute: () => {
        if (!window.bomb) window.bomb = 1000
        for (let i = 0; i < window.bomb; i++) {
          e1.set(0, num(0, 360, 2) * DEG2RAD, 0)
          q1.setFromEuler(e1)
          world.entities.addEntityLocal({
            type: 'object',
            id: world.network.makeId(),
            schemaId: self.schema.id,
            creator: world.network.client.user.id, // ???
            authority: world.network.client.id,
            mode: 'active',
            modeClientId: null,
            position: [num(-200, 200, 3), 0, num(-200, 200, 3)], // ground
            // position: [num(-50, 50, 3), 0, num(-50, 50, 3)], // ground-smaller
            // position: [num(-200, 200, 3), num(0, 200, 3), num(-200, 200, 3)], // box
            // position: [num(-100, 100, 3), num(0, 100, 3), num(-100, 100, 3)], // everywhere
            quaternion: q1.toArray(),
            // quaternion: [0, 0, 0, 1],
          })
        }

        // bomb for physics cube stack test
        // for (let i = 0; i < 1000; i++) {
        //   e1.set(num(0, 360, 2) * DEG2RAD, num(0, 360, 2) * DEG2RAD, num(0, 360, 2) * DEG2RAD)
        //   q1.setFromEuler(e1)
        //   world.entities.addEntityLocal({
        //     type: 'object',
        //     id: world.network.makeId(),
        //     schemaId: self.schema.id,
        //     creator: world.network.client.user.id, // ???
        //     authority: world.network.client.id,
        //     mode: 'active',
        //     modeClientId: null,

        //     position: [num(-20, 20, 3), num(10, 100, 3), num(-20, 20, 3)], // ground
        //     // position: [num(-50, 50, 3), 0, num(-50, 50, 3)], // ground-smaller
        //     // position: [num(-200, 200, 3), num(0, 200, 3), num(-200, 200, 3)], // box
        //     // position: [num(-100, 100, 3), num(0, 100, 3), num(-100, 100, 3)], // everywhere
        //     quaternion: q1.toArray(),
        //     // quaternion: [0, 0, 0, 1],
        //   })
        // }

        // ---------
        // minecraft (use 3d/supaverse/cube-grass)
        // ---------
        // const noise2D = createNoise2D(() => 0.1)
        // function sinToAlpha(value) {
        //   return value / 2 + 0.5 // map (-1, 1) to (0, 1)
        // }
        // const size = 200
        // for (let x = -size; x < size; x++) {
        //   for (let z = -size; z < size; z++) {
        //     const surfaceAmp = 10
        //     const surfaceNoiseScale = 0.01
        //     let surfaceNoise = noise2D(x * surfaceNoiseScale, z * surfaceNoiseScale) // prettier-ignore
        //     surfaceNoise = sinToAlpha(surfaceNoise)
        //     const y = Math.round(surfaceNoise * surfaceAmp)
        //     world.entities.addEntityLocal({
        //       type: 'object',
        //       id: world.network.makeId(),
        //       schemaId: self.schema.id,
        //       creator: world.network.client.user.id, // ???
        //       authority: world.network.client.id,
        //       mode: 'active',
        //       modeClientId: null,
        //       position: [x, y, z],
        //       quaternion: [0, 0, 0, 1],
        //     })
        //   }
        // }
      },
    })
    // add({
    //   label: 'Take',
    //   icon: GrabIcon,
    //   visible: true,
    //   disabled: false,
    //   execute: () => {
    //     world.backpack.take(self)
    //   },
    // })
    add({
      label: 'Destroy',
      icon: Trash2Icon,
      visible: world.permissions.canDestroyEntity(self),
      disabled: false,
      execute: () => {
        world.entities.removeEntityLocal(self.id)
      },
    })
    // add({
    //   label: 'Buy',
    //   icon: GiftIcon,
    //   visible: true,
    //   disabled: false,
    //   execute: () => {
    //     // this.world.entities.removeEntityLocal(entity.id)
    //   },
    // })
  }

  destroy() {
    super.destroy()
    this.world.entities.setHot(this, false)
    this.nodes.forEach(node => {
      node.deactivate()
    })
    this.control?.release(false)
    this.control = null
  }
}
