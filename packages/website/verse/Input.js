import * as THREE from 'three'

import { System } from './System'

import { DnD } from './extras/DnD'
import { hashFile } from './extras/hashFile'

const LMB = 1 // bitmask
const RMB = 2 // bitmask

export class Input extends System {
  constructor(world) {
    super(world)
    this.pressed = {} // once
    this.down = {} // always
    this.pointer = new THREE.Vector2()
    this.pan = new THREE.Vector2()
    this.wheel = 0
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
    // ...
  }

  lateUpdate() {
    this.pressed = {}
    this.wheel = 0
  }

  onDnD = async ({ event, file, ext, url }) => {
    return // temp disabled
    console.log(event, file, ext, url)

    if (file && ['glb', 'vox'].includes(ext)) {
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
        id: this.world.network.makeId(),
        schemaId: schema.id,
        creator: this.world.network.client.user.id,
        authority: this.world.network.client.id,
        uploading: this.world.network.client.id,
        mode: 'moving',
        modeClientId: this.world.network.client.id,
        position: [0, 0, 0], // hit.point.toArray(),
        quaternion: [0, 0, 0, 1],
        state: {},
      })
      try {
        await this.world.loader.uploadAsset(file)
        entity.applyLocalChanges({
          sync: true,
          props: {
            uploading: null,
          },
        })
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
    const lmb = !!(e.buttons & LMB)
    if (!this.down.LMB && lmb) {
      this.down.LMB = true
      this.pressed.LMB = true
    }
    if (this.down.LMB && !lmb) {
      this.down.LMB = false
    }
    const rmb = !!(e.buttons & RMB)
    if (!this.down.RMB && rmb) {
      this.down.RMB = true
      this.pressed.RMB = true
    }
    if (this.down.RMB && !rmb) {
      this.down.RMB = false
    }
    this.requestPointerLock()
  }

  onPointerMove = e => {
    if (!e.buttons) return
    // console.log('onPointerMove', e)
    const lmb = !!(e.buttons & LMB)
    if (!this.down.LMB && lmb) {
      this.down.LMB = true
      this.pressed.LMB = true
    }
    if (this.down.LMB && !lmb) {
      this.down.LMB = false
    }
    const rmb = !!(e.buttons & RMB)
    if (!this.down.RMB && rmb) {
      this.down.RMB = true
      this.pressed.RMB = true
    }
    if (this.down.RMB && !rmb) {
      this.down.RMB = false
    }

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
    const lmb = !!(e.buttons & LMB)
    if (!lmb) this.down.LMB = false
    const rmb = !!(e.buttons & RMB)
    if (!rmb) this.down.RMB = false
    if (!e.buttons) {
      this.exitPointerLock()
    }
  }

  onWheel = e => {
    e.preventDefault()
    this.wheel += e.deltaY
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
    // pointerlock is async so if pointer is no longer down, exit
    if (!this.down.LMB && !this.down.RMB) this.exitPointerLock()
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
