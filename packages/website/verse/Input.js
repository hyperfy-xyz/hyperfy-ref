import * as THREE from 'three'

import { System } from './System'

const LMB = 1 // bitmask
const RMB = 2 // bitmask

export class Input extends System {
  constructor(world) {
    super(world)

    this.handlers = []

    this.pointer = {
      locked: false,
      shouldLock: false,
      coords: new THREE.Vector3(), // [0,0] to [1,1]
      position: new THREE.Vector3(), // [0,0] to [viewportWidth,viewportHeight]
      delta: new THREE.Vector3(), // position delta (pixels)
    }

    this.mouseLeftDown = false
    this.mouseRightDown = false
  }

  mount(viewport) {
    this.viewport = viewport
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    this.viewport.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointermove', this.onPointerMove)
    this.viewport.addEventListener('pointerup', this.onPointerUp)
    this.viewport.addEventListener('wheel', this.onWheel, { passive: false }) // prettier-ignore
    this.viewport.addEventListener('contextmenu', this.onContextMenu)
  }

  register(handler) {
    const idx = this.handlers.findIndex(h => h.priority < handler.priority)
    if (idx === -1) {
      this.handlers.push(handler)
    } else {
      this.handlers.splice(idx, 0, handler)
    }
    return () => {
      const idx = this.handlers.indexOf(handler)
      if (idx === -1) return
      this.handlers.splice(idx, 1)
    }
  }

  async lockPointer() {
    this.pointer.shouldLock = true
    try {
      await this.viewport.requestPointerLock()
      return true
    } catch (err) {
      // console.log('pointerlock denied, too quick?')
      return false
    }
  }

  unlockPointer() {
    this.pointer.shouldLock = false
    if (!this.pointer.locked) return
    document.exitPointerLock()
    this.onPointerLockEnd()
  }

  onKeyDown = e => {
    if (e.repeat) return
    if (this.isInputFocused()) return
    const code = e.code
    // console.log(code)
    const meta = e.metaKey
    const ctrl = e.ctrlKey
    const shift = e.shiftKey
    for (const handler of this.handlers) {
      if (handler.btnDown?.(code)) {
        break
      }
    }
  }

  onKeyUp = e => {
    if (e.repeat) return
    if (this.isInputFocused()) return
    const code = e.code
    // console.log(code)
    const meta = e.metaKey
    const ctrl = e.ctrlKey
    const shift = e.shiftKey
    for (const handler of this.handlers) {
      if (handler.btnUp?.(code)) {
        break
      }
    }
  }

  onPointerDown = e => {
    // console.log('onPointerDown', e)
    this.checkPointerChanges(e)
  }

  onPointerMove = e => {
    // console.log('onPointerMove', e)
    this.checkPointerChanges(e)

    const rect = this.viewport.getBoundingClientRect()
    const offsetX = e.pageX - rect.left // - window.scrollX
    const offsetY = e.pageY - rect.top // - window.scrollY
    this.pointer.coords.x = Math.max(0, Math.min(1, offsetX / rect.width)) // prettier-ignore
    this.pointer.coords.y = Math.max(0, Math.min(1, offsetY / rect.width)) // prettier-ignore
    this.pointer.position.x = offsetX
    this.pointer.position.y = offsetY
    this.pointer.delta.x = e.movementX
    this.pointer.delta.y = e.movementY
    for (const handler of this.handlers) {
      if (handler.pointer?.(this.pointer)) {
        break
      }
    }
  }

  onPointerUp = e => {
    this.checkPointerChanges(e)
  }

  checkPointerChanges(e) {
    const lmb = !!(e.buttons & LMB)
    // left mouse down
    if (!this.mouseLeftDown && lmb) {
      this.mouseLeftDown = true
      for (const handler of this.handlers) {
        if (handler.btnDown?.('MouseLeft')) {
          break
        }
      }
    }
    // left mouse up
    if (this.mouseLeftDown && !lmb) {
      this.mouseLeftDown = false
      for (const handler of this.handlers) {
        if (handler.btnUp?.('MouseLeft')) {
          break
        }
      }
    }
    const rmb = !!(e.buttons & RMB)
    // right mouse down
    if (!this.mouseRightDown && rmb) {
      this.mouseRightDown = true
      for (const handler of this.handlers) {
        if (handler.btnDown?.('MouseRight')) {
          break
        }
      }
    }
    // right mouse up
    if (this.mouseRightDown && !rmb) {
      this.mouseRightDown = false
      for (const handler of this.handlers) {
        if (handler.btnUp?.('MouseRight')) {
          break
        }
      }
    }
  }

  onWheel = e => {
    e.preventDefault()
    for (const handler of this.handlers) {
      if (handler.zoom?.(e.deltaY)) {
        break
      }
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
    if (this.pointer.locked) return
    this.pointer.locked = true
    // pointerlock is async so if its no longer meant to be locked, exit
    if (!this.pointer.shouldLock) this.unlockPointer()
  }

  onPointerLockEnd() {
    if (!this.pointer.locked) return
    this.pointer.locked = false
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
  }
}
