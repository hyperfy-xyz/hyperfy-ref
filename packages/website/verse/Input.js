import * as THREE from 'three'
import { cloneDeep } from 'lodash-es'
import {
  ArrowRightLeftIcon,
  AxeIcon,
  BanIcon,
  BombIcon,
  CopyIcon,
  EyeIcon,
  GiftIcon,
  HandIcon,
  LinkIcon,
  MicIcon,
  MicOffIcon,
  PencilRulerIcon,
  PlusCircleIcon,
  ShieldPlusIcon,
  SmileIcon,
  Trash2Icon,
  UnlinkIcon,
  UserIcon,
} from 'lucide-react'

import { System } from './System'

import { DnD } from './extras/DnD'
import { DEG2RAD } from './extras/general'
import { num } from './extras/num'
import { hashFile } from './extras/hashFile'

const UP = new THREE.Vector3(0, 1, 0)
const PI_2 = Math.PI / 2

const LMB = 1 // bitmask
const RMB = 2 // bitmask

const MOVE_SEND_RATE = 1 / 5
const MOVE_ROTATE_SPEED = 0.1 * DEG2RAD

const e1 = new THREE.Euler(0, 0, 0, 'YXZ')
const q1 = new THREE.Quaternion()
const arr1 = []

export class Input extends System {
  constructor(world) {
    super(world)

    this.pressed = {} // once
    this.down = {} // always
    this.pointer = new THREE.Vector2()
    this.pan = new THREE.Vector2()
    this.wheel = 0

    this.lastRay = 0
    this.hits = []

    this.moving = null

    this.isPointerLocked = false
  }

  mount(viewport) {
    this.viewport = viewport
    this.dnd = new DnD(viewport, this.onDnD)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    this.viewport.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointermove', this.onPointerMove)
    this.viewport.addEventListener('pointerup', this.onPointerUp)
    this.viewport.addEventListener('wheel', this.onWheel, { passive: false }) // prettier-ignore
    this.viewport.addEventListener('contextmenu', this.onContextMenu)
  }

  update(delta) {
    this.updateHits()

    if (this.moving) {
      const [hit, entity] = this.resolveHit(this.hits)
      if (hit) {
        this.moving.lastSend += delta
        const sync = this.moving.lastSend >= MOVE_SEND_RATE
        if (sync) this.moving.lastSend = 0
        this.moving.entity.position.value = hit.point
        // this.moving.entity.applyLocalProps(
        //   {
        //     position: hit.point,
        //     // quaternion ???
        //   },
        //   sync
        // )
      }
    }
  }

  lateUpdate() {
    this.pressed = {}
    this.wheel = 0
  }

  updateHits() {
    this.hits = this.world.graphics.raycastViewport(this.pointer)
  }

  resolveHit(hits) {
    arr1.length = 0
    for (const hit of hits) {
      if (hit.getEntity) {
        const entity = hit.getEntity()
        if (entity?.type === 'object' && entity.mode.value === 'moving') {
          continue
        }
        arr1[0] = hit
        arr1[1] = entity
        return arr1
      }
      arr1[0] = hit
      return arr1
    }
    return arr1
  }

  setMoving(entity) {
    if (entity) {
      this.moving = {
        entity,
        lastSend: 0,
      }
      this.viewport.style.cursor = 'grabbing'
    } else {
      this.moving = null
      this.viewport.style.cursor = null // 'grab'
    }
  }

  onEntityDestroyed(entity) {
    if (this.moving?.entity === entity) {
      this.setMoving(null)
    }
  }

  onDnD = async ({ event, file, ext, url }) => {
    console.log(event, file, ext, url)

    if (file && ['glb', 'vox'].includes(ext)) {
      this.updateHits()
      const [hit] = this.resolveHit(this.hits)
      if (!hit) return console.warn('no hit, no place to drop dnd')
      const hash = await hashFile(file)
      const url = `${process.env.PUBLIC_ASSETS_URL}/${hash}`
      this.world.loader.set(url, ext, file)
      const schema = {
        id: this.world.network.makeId(),
        type: 'prototype',
        model: url,
        modelType: ext,
        script: null,
      }
      this.world.entities.upsertSchemaLocal(schema)
      const entity = this.world.entities.addEntityLocal({
        type: 'object',
        id: this.world.network.makeId(),
        schemaId: schema.id,
        creator: this.world.network.client.user.id,
        authority: this.world.network.client.id,
        uploading: this.world.network.client.id,
        mode: 'moving',
        modeClientId: this.world.network.client.id,
        position: hit.point.toArray(),
        quaternion: [0, 0, 0, 1],
      })
      try {
        await this.world.loader.uploadAsset(file)
        entity.uploading.value = null
        // entity.applyLocalProps({
        //   uploading: null,
        // })
      } catch (err) {
        console.error('failed to upload', err)
        this.world.entities.removeEntityLocal(entity.id)
      }
    }
    if (file && ext === 'vrm') {
      // hash
      const hash = await hashFile(file)
      const url = `${process.env.PUBLIC_ASSETS_URL}/${hash}`
      this.world.loader.set(url, 'vrm', file)
      console.error('TODO: vrm dialog to verify, preview and upload')
      try {
        await this.world.loader.uploadAsset(file)
      } catch (err) {
        console.error('Could not upload VRM: ', err)
        return
      }
      const entity = this.world.network.avatar
      entity.schema.model = url
      entity.schema.modelType = 'vrm'
      this.world.entities.upsertSchemaLocal(entity.schema)
    }
  }

  onKeyDown = e => {
    if (e.repeat) return
    if (this.isInputFocused()) return
    // console.log(e.code)
    const meta = e.metaKey
    const ctrl = e.ctrlKey
    const shift = e.shiftKey
    this.pressed[e.code] = true
    this.down[e.code] = true
    if (!meta) this.closeContext()
  }

  onKeyUp = e => {
    if (e.repeat) return
    if (this.isInputFocused()) return
    // console.log(e.code)
    const meta = e.metaKey
    const ctrl = e.ctrlKey
    const shift = e.shiftKey
    this.down[e.code] = false
  }

  onPointerDown = e => {
    // console.log('onPointerDown', e)
    this.closeContext()
    this.checkPointerChanges(e)
    // const lmb = !!(e.buttons & LMB)
    // if (!this.down.LMB && lmb) {
    //   this.down.LMB = true
    //   this.pressed.LMB = true
    // }
    // if (this.down.LMB && !lmb) {
    //   this.down.LMB = false
    // }
    // const rmb = !!(e.buttons & RMB)
    // if (!this.down.RMB && rmb) {
    //   this.down.RMB = true
    //   this.pressed.RMB = true
    // }
    // if (this.down.RMB && !rmb) {
    //   this.down.RMB = false
    // }
    // this.requestPointerLock()
  }

  onPointerMove = e => {
    // if (!e.buttons) return
    // console.log('onPointerMove', e)
    this.checkPointerChanges(e)
    // const lmb = !!(e.buttons & LMB)
    // if (!this.down.LMB && lmb) {
    //   this.down.LMB = true
    //   this.pressed.LMB = true
    // }
    // if (this.down.LMB && !lmb) {
    //   this.down.LMB = false
    // }
    // const rmb = !!(e.buttons & RMB)
    // if (!this.down.RMB && rmb) {
    //   this.down.RMB = true
    //   this.pressed.RMB = true
    // }
    // if (this.down.RMB && !rmb) {
    //   this.down.RMB = false
    // }
    const rect = this.viewport.getBoundingClientRect()
    const offsetX = e.pageX - rect.left // - window.scrollX
    const offsetY = e.pageY - rect.top // - window.scrollY
    this.pointer.x = offsetX
    this.pointer.y = offsetY
    this.pan.x += e.movementX
    this.pan.y += e.movementY
    // console.log(this.pan)
  }

  onPointerUp = e => {
    // console.log('onPointerUp', e)
    // const lmb = !!(e.buttons & LMB)
    // if (!lmb) this.down.LMB = false
    // const rmb = !!(e.buttons & RMB)
    // if (!rmb) this.down.RMB = false
    // if (!e.buttons) {
    //   this.exitPointerLock()
    // }
    this.checkPointerChanges(e)
  }

  checkPointerChanges(e) {
    const lmb = !!(e.buttons & LMB)
    // left mouse down
    if (!this.down.LMB && lmb) {
      if (this.moving) {
        // TODO: there's still problems with this trigger player attacks somehow
        const entity = this.moving.entity
        entity.mode.value = 'active'
        entity.modeClientId.value = null
        entity.position.value = entity.root.position
        entity.quaternion.value = entity.root.quaternion
        this.setMoving(null)
      } else {
        this.down.LMB = true
        this.pressed.LMB = true
      }
    }
    // left mouse up
    if (this.down.LMB && !lmb) {
      this.down.LMB = false
    }
    const rmb = !!(e.buttons & RMB)
    // right mouse down
    if (!this.down.RMB && rmb) {
      this.down.RMB = true
      this.pressed.RMB = true
      this.requestPointerLock()
      this.rightDownAt = performance.now()
      this.rightPanStart = this.pan.clone()
    }
    // right mouse up
    if (this.down.RMB && !rmb) {
      this.down.RMB = false
      this.exitPointerLock()
      const elapsed = performance.now() - this.rightDownAt
      if (elapsed < 500 && this.rightPanStart.distanceTo(this.pan) < 10) {
        this.openContext()
      }
    }
  }

  onWheel = e => {
    e.preventDefault()
    if (this.moving) {
      q1.setFromAxisAngle(UP, MOVE_ROTATE_SPEED * e.deltaY).multiply(
        this.moving.entity.root.quaternion
      )
      this.moving.entity.quaternion.value = q1
      // this.moving.entity.applyLocalProps({
      //   quaternion: q1,
      // })
    } else {
      this.wheel += e.deltaY
    }
  }

  onContextMenu = e => {
    e.preventDefault()
  }

  onPointerLockChange = e => {
    const didPointerLock = !!document.pointerLockElement
    if (didPointerLock) {
      this.onPointerLockStart()
    } else {
      this.onPointerLockEnd()
    }
  }

  onPointerLockStart() {
    if (this.isPointerLocked) return
    this.isPointerLocked = true
    // pointerlock is async so if pointer is no longer down, exit
    if (!this.down.RMB) this.exitPointerLock()
  }

  onPointerLockEnd() {
    if (!this.isPointerLocked) return
    this.isPointerLocked = false
  }

  async requestPointerLock() {
    try {
      await this.viewport.requestPointerLock()
      return true
    } catch (err) {
      // console.log('pointerlock denied, too quick?')
      return false
    }
  }

  exitPointerLock() {
    if (!this.isPointerLocked) return
    document.exitPointerLock()
    this.onPointerLockEnd()
  }

  isInputFocused() {
    return (
      document.activeElement?.tagName === 'INPUT' ||
      document.activeElement?.tagName === 'TEXTAREA'
    )
  }

  openContext() {
    const coords = this.pointer
    console.log(coords.toArray())
    const [hit, entity] = this.resolveHit(this.hits)
    const actions = []
    const add = opts => {
      actions.push({
        ...opts,
        onClick: () => {
          this.closeContext()
          opts.execute()
        },
      })
    }
    // hit void
    if (!hit) return
    // hit world
    if (hit && !entity) return
    // hit entity
    console.log('entity', entity)
    entity.getActions(add)
    // const hitVoid = !hit
    // const hitWorld = hit && !entity
    // const hitSelf = entity === this.world.network.player
    // const hitAvatar = !hitSelf && entity?.type === 'player'
    // const hitPrototype = entity?.schema.type === 'prototype'
    // // const hitItem = entity?.schema.type === 'item'
    // console.log('hit', hit, entity)
    // if (hitVoid) {
    //   return
    // }
    // if (hitWorld) {
    //   return
    // }
    // if (hitSelf) {
    //   add({
    //     label: 'Profile',
    //     icon: UserIcon,
    //     visible: true,
    //     disabled: false,
    //     execute: () => {
    //       this.world.panels.inspect(entity)
    //     },
    //   })
    //   add({
    //     label: 'Emotes',
    //     icon: SmileIcon,
    //     visible: true,
    //     disabled: false,
    //     execute: () => {
    //       console.log('TODO')
    //     },
    //   })
    //   add({
    //     label: 'Enable Mic',
    //     icon: MicIcon,
    //     visible: true,
    //     disabled: false,
    //     execute: () => {
    //       console.log('TODO')
    //     },
    //   })
    // }
    // if (hitAvatar) {
    //   add({
    //     label: 'Profile',
    //     icon: UserIcon,
    //     visible: true,
    //     disabled: false,
    //     execute: () => {
    //       this.world.panels.inspect(entity)
    //     },
    //   })
    //   add({
    //     label: 'Trade',
    //     icon: ArrowRightLeftIcon,
    //     visible: true,
    //     disabled: false,
    //     execute: () => {
    //       console.log('TODO')
    //     },
    //   })
    //   add({
    //     label: 'Permissions',
    //     icon: ShieldPlusIcon,
    //     visible: true,
    //     disabled: false,
    //     execute: () => {
    //       console.log('TODO')
    //     },
    //   })
    //   add({
    //     label: 'Mute',
    //     icon: MicOffIcon,
    //     visible: true,
    //     disabled: false,
    //     execute: () => {
    //       console.log('TODO')
    //     },
    //   })
    //   add({
    //     label: 'Kick',
    //     icon: AxeIcon,
    //     visible: true,
    //     disabled: false,
    //     execute: () => {
    //       console.log('TODO')
    //     },
    //   })
    //   add({
    //     label: 'Ban',
    //     icon: BanIcon,
    //     visible: true,
    //     disabled: false,
    //     execute: () => {
    //       console.log('TODO')
    //     },
    //   })
    // }
    // if (hitPrototype) {
    //   add({
    //     label: 'Inspect',
    //     icon: EyeIcon,
    //     visible: true,
    //     disabled: false,
    //     execute: () => {
    //       this.world.panels.inspect(entity)
    //     },
    //   })
    //   add({
    //     label: 'Move',
    //     icon: HandIcon,
    //     visible: this.world.permissions.canMoveEntity(entity),
    //     disabled: entity.mode !== 'active' && entity.mode !== 'dead',
    //     execute: () => {
    //       entity.applyLocalProps({
    //         mode: 'moving',
    //         modeClientId: this.world.network.client.id,
    //       })
    //     },
    //   })
    //   add({
    //     label: 'Edit',
    //     icon: PencilRulerIcon,
    //     visible: this.world.permissions.canEditEntity(entity),
    //     disabled: entity.mode !== 'active' && entity.mode !== 'dead',
    //     execute: () => {
    //       this.world.panels.edit(entity)
    //     },
    //   })
    //   if (this.world.entities.countEntitysBySchema(entity.schema.id) > 1) {
    //     add({
    //       label: 'Unlink',
    //       icon: UnlinkIcon,
    //       visible: this.world.permissions.canEditEntity(entity), // ???
    //       disabled: false,
    //       execute: () => {
    //         // duplicate schema
    //         const schema = cloneDeep(entity.schema)
    //         schema.id = this.world.network.makeId()
    //         this.world.entities.upsertSchemaLocal(schema)
    //         // replace current instance with new one
    //         this.world.entities.addEntityLocal({
    //           type: 'object',
    //           id: this.world.network.makeId(),
    //           schemaId: schema.id,
    //           creator: this.world.network.client.user.id, // ???
    //           authority: this.world.network.client.id,
    //           mode: 'active',
    //           modeClientId: null,
    //           position: entity.root.position.toArray(),
    //           quaternion: entity.root.quaternion.toArray(),
    //           state: entity.state,
    //           vars: {},
    //         })
    //         this.world.entities.removeEntityLocal(entity.id)
    //       },
    //     })
    //   }
    //   add({
    //     label: 'Duplicate',
    //     icon: CopyIcon,
    //     visible: this.world.permissions.canEditEntity(entity),
    //     disabled: false,
    //     execute: () => {
    //       this.world.entities.addEntityLocal({
    //         type: 'object',
    //         id: this.world.network.makeId(),
    //         schemaId: entity.schema.id,
    //         creator: this.world.network.client.user.id, // ???
    //         authority: this.world.network.client.id,
    //         mode: 'moving',
    //         modeClientId: this.world.network.client.id,
    //         position: entity.root.position.toArray(),
    //         quaternion: entity.root.quaternion.toArray(),
    //         state: {},
    //         vars: {},
    //       })
    //     },
    //   })
    //   add({
    //     label: 'Bomb',
    //     icon: BombIcon,
    //     visible: true,
    //     disabled: false,
    //     execute: () => {
    //       if (!window.bomb) window.bomb = 1000
    //       for (let i = 0; i < window.bomb; i++) {
    //         e1.set(0, num(0, 360, 2) * DEG2RAD, 0)
    //         q1.setFromEuler(e1)
    //         this.world.entities.addEntityLocal({
    //           type: 'object',
    //           id: this.world.network.makeId(),
    //           schemaId: entity.schema.id,
    //           creator: this.world.network.client.user.id, // ???
    //           authority: this.world.network.client.id,
    //           mode: 'active',
    //           modeClientId: null,
    //           position: [num(-200, 200, 3), 0, num(-200, 200, 3)], // ground
    //           quaternion: q1.toArray(),
    //           // position: [num(-100, 100, 3), num(0, 100, 3), num(-100, 100, 3)], // everywhere
    //           // quaternion: [0, 0, 0, 1],
    //           state: entity.state,
    //           vars: {},
    //         })
    //       }
    //     },
    //   })
    //   add({
    //     label: 'Destroy',
    //     icon: Trash2Icon,
    //     visible: this.world.permissions.canDestroyEntity(entity),
    //     disabled: false,
    //     execute: () => {
    //       this.world.entities.removeEntityLocal(entity.id)
    //     },
    //   })
    //   // add({
    //   //   label: 'Buy',
    //   //   icon: GiftIcon,
    //   //   visible: true,
    //   //   disabled: false,
    //   //   execute: () => {
    //   //     // this.world.entities.removeEntityLocal(entity.id)
    //   //   },
    //   // })
    // }
    const hasVisibleActions = actions.find(action => action.visible)
    if (hasVisibleActions) {
      this.context = {
        x: coords.x,
        y: coords.y,
        actions,
      }
      this.world.emit('context', this.context)
    }
  }

  closeContext() {
    if (!this.context) return
    this.context = null
    this.world.emit('context', null)
  }

  destroy() {
    if (!this.viewport) return
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    this.viewport.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('pointermove', this.onPointerMove)
    this.viewport.addEventListener('pointerup', this.onPointerUp)
    this.viewport.removeEventListener('wheel', this.onWheel, { passive: false }) // prettier-ignore
    this.viewport.removeEventListener('contextmenu', this.onContextMenu)
    this.dnd.destroy()
    this.controls = []
    this.current = null
    // while(this.controls.length) {
    //   this.controls.pop().callback(false)
    // }
  }
}
