import * as THREE from 'three'

import { System } from './System'
import {
  ArrowRightLeftIcon,
  AxeIcon,
  BanIcon,
  EyeIcon,
  MicIcon,
  MicOffIcon,
  PlusCircleIcon,
  ShieldPlusIcon,
  SmileIcon,
  UserIcon,
} from 'lucide-react'

const PI_2 = Math.PI / 2
const LOOK_SPEED = 0.005
const WHEEL_SPEED = 0.002

const coords = new THREE.Vector2()

export class Control extends System {
  constructor(space) {
    super(space)
    this.keys = {}
    this.controls = []
    this.current = null
    this.isPointerLocked = false
    this.clickTracker = {
      start: null,
      rmb: false,
      move: new THREE.Vector2(),
    }
  }

  start() {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    this.space.viewport.addEventListener('pointerdown', this.onPointerDown)
    this.space.viewport.addEventListener('wheel', this.onWheel, { passive: false }) // prettier-ignore
    this.space.viewport.addEventListener('contextmenu', this.onContextMenu)
  }

  update() {
    if (!this.current) return
    this.current.move.set(0, 0, 0)
    if (this.keys.forward) this.current.move.z -= 1
    if (this.keys.back) this.current.move.z += 1
    if (this.keys.left) this.current.move.x -= 1
    if (this.keys.right) this.current.move.x += 1
    this.current.move.normalize() // prevent surfing
  }

  lateUpdate() {
    if (!this.current) return
    const rig = this.space.graphics.cameraRig
    const cam = this.space.graphics.camera
    rig.position.copy(this.current.camera.position)
    rig.quaternion.copy(this.current.camera.quaternion)
    cam.position.z = this.current.camera.distance
  }

  onKeyDown = e => {
    if (e.repeat) return
    if (this.isInputFocused()) return
    // console.log(e.code)
    const meta = e.metaKey
    const ctrl = e.ctrlKey
    const shift = e.shiftKey
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        if (!meta) {
          this.closeContext()
          this.keys.forward = true
        }
        break
      case 'KeyS':
      case 'ArrowDown':
        if (!meta) {
          this.closeContext()
          this.keys.back = true
        }
        break
      case 'KeyA':
      case 'ArrowLeft':
        if (!meta) {
          this.closeContext()
          this.keys.left = true
        }
        break
      case 'KeyD':
      case 'ArrowRight':
        if (!meta) {
          this.closeContext()
          this.keys.right = true
        }
        break
      case 'Space':
        if (!meta) {
          this.closeContext()
          this.keys.space = true
          if (this.current) {
            this.current.jump = true
          }
        }
        break
    }
  }

  onKeyUp = e => {
    if (e.repeat) return
    if (this.isInputFocused()) return
    // console.log(e.code)
    const meta = e.metaKey
    const ctrl = e.ctrlKey
    const shift = e.shiftKey
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        if (!meta) {
          this.keys.forward = false
        }
        break
      case 'KeyS':
      case 'ArrowDown':
        if (!meta) {
          this.keys.back = false
        }
        break
      case 'KeyA':
      case 'ArrowLeft':
        if (!meta) {
          this.keys.left = false
        }
        break
      case 'KeyD':
      case 'ArrowRight':
        if (!meta) {
          this.keys.right = false
        }
        break
      case 'Space':
        if (!meta) {
          this.keys.space = false
        }
        break
    }
  }

  onPointerDown = e => {
    this.closeContext()
    this.clickTracker.start = performance.now()
    this.clickTracker.rmb = e.button === 2
    this.clickTracker.move.set(0, 0)
    // this.space.viewport.setPointerCapture(e.pointerId)
    this.space.viewport.addEventListener('pointermove', this.onPointerMove)
    this.space.viewport.addEventListener('pointerup', this.onPointerUp)
    if (this.current) {
      this.current.look.active = true
      this.current.look.locked = e.button === 2
    }
    this.requestPointerLock()
  }

  onPointerMove = e => {
    this.clickTracker.move.x += e.movementX
    this.clickTracker.move.y += e.movementY
    if (this.current) {
      switch (e.buttons) {
        case 1:
          this.current.look.locked = false
          this.current.look.advance = false
          break
        case 2:
          this.current.look.locked = true
          this.current.look.advance = false
          break
        case 3:
          this.current.look.locked = true
          this.current.look.advance = true
          break
      }
      this.current.look.rotation.y -= e.movementX * LOOK_SPEED
      this.current.look.rotation.x -= e.movementY * LOOK_SPEED
      this.current.look.rotation.x = Math.max(
        -PI_2,
        Math.min(PI_2, this.current.look.rotation.x)
      )
    }
  }

  onPointerUp = e => {
    if (this.clickTracker.rmb) {
      const elapsed = performance.now() - this.clickTracker.start
      if (elapsed < 500 && this.clickTracker.move.length() < 10) {
        this.openContext(e.clientX, e.clientY)
      }
    }
    // this.space.viewport.releasePointerCapture(e.pointerId)
    this.space.viewport.removeEventListener('pointermove', this.onPointerMove)
    this.space.viewport.removeEventListener('pointerup', this.onPointerUp)
    if (this.current) {
      this.current.look.active = false
      this.current.look.locked = false
      this.current.look.advance = false
    }
    this.exitPointerLock()
  }

  onWheel = e => {
    e.preventDefault()
    this.closeContext()
    if (this.current) {
      this.current.look.zoom += e.deltaY * WHEEL_SPEED
      if (this.current.look.zoom < 0) {
        this.current.look.zoom = 0
      }
      if (this.current.look.zoom > 1) {
        this.current.look.zoom = 1
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
    if (this.isPointerLocked) return
    // this.viewElem.focus()
    // document.addEventListener('mousemove', this.onMouseMove)
    this.mouseMoveFirst = true // bugfix, see onMouseMove
    this.isPointerLocked = true
    // this.engine.driver.toggleReticle(true)
    // this.engine.worldEvents.emit('focus')
  }

  onPointerLockEnd() {
    if (!this.isPointerLocked) return
    // document.removeEventListener('mousemove', this.onMouseMove)
    // if (document.activeElement === this.viewElem) {
    //   this.viewElem.blur()
    // }
    // this.emit('pointerlock-exit')
    this.isPointerLocked = false
    // this.engine.driver.toggleReticle(false)
    // this.engine.worldEvents.emit('blur')
  }

  async requestPointerLock() {
    try {
      await this.space.viewport.requestPointerLock()
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

  request(entity) {
    // todo: type avatar always gets preference
    const control = {
      entityId: entity.id,
      move: new THREE.Vector3(),
      jump: false,
      getJump() {
        if (this.jump) {
          this.jump = false
          return true
        }
        return false
      },
      look: {
        rotation: new THREE.Euler(0, 0, 0, 'YXZ'),
        quaternion: new THREE.Quaternion(),
        zoom: 0.5,
        active: false,
        locked: false,
        advance: false,
      },
      camera: {
        position: new THREE.Vector3(),
        rotation: new THREE.Euler(0, 0, 0, 'YXZ'),
        quaternion: new THREE.Quaternion(),
        distance: 0,
      },
    }
    control.camera.rotation._onChange(() => {
      control.camera.quaternion.setFromEuler(control.camera.rotation, false)
    })
    control.camera.quaternion._onChange(() => {
      control.camera.rotation.setFromQuaternion(
        control.camera.quaternion,
        undefined,
        false
      )
    })
    control.look.rotation._onChange(() => {
      control.look.quaternion.setFromEuler(control.look.rotation, false)
    })
    control.look.quaternion._onChange(() => {
      control.look.rotation.setFromQuaternion(
        control.look.quaternion,
        undefined,
        false
      )
    })
    this.controls.push(control)
    this.check()
  }

  get(entity) {
    if (!this.current) return null
    if (this.current.entityId !== entity.id) return
    return this.current
  }

  release(entity) {
    const idx = this.controls.findIndex(
      control => control.entityId === entity.id
    )
    this.controls.splice(idx, 1)
    this.check()
  }

  check() {
    if (this.current && this.controls[0] !== this.current) {
      this.current = null
    }
    if (this.controls[0] && !this.current) {
      this.current = this.controls[0]
    }
  }

  openContext(x, y) {
    const rect = this.space.viewport.getBoundingClientRect()
    coords.x = ((x - rect.left) / (rect.right - rect.left)) * 2 - 1
    coords.y = -((y - rect.top) / (rect.bottom - rect.top)) * 2 + 1
    const hit = this.space.graphics.raycastFromViewport(coords)
    if (!hit) return // void
    const entity = hit?.object?.node?.entity
    const actions = []
    const add = (label, icon, fn) => {
      actions.push({
        label,
        icon,
        exec: () => {
          this.closeContext()
          fn()
        },
      })
    }
    const hitVoid = !hit
    const hitSpace = hit && !entity
    const hitSelf = entity === this.space.network.avatar
    const hitAvatar = !hitSelf && entity?.type === 'avatar'
    const hitPrototype = entity?.type === 'prototype'
    const hitItem = entity?.type === 'item'
    if (hitSelf) {
      add('Profile', UserIcon, () => {
        console.log('TODO')
      })
      add('Emotes', SmileIcon, () => {
        console.log('TODO')
      })
      add('Enable Mic', MicIcon, () => {
        console.log('TODO')
      })
    }
    if (hitAvatar) {
      add('Inspect', EyeIcon, () => {
        console.log('TODO')
      })
      add('Trade', ArrowRightLeftIcon, () => {
        console.log('TODO')
      })
      add('Permissions', ShieldPlusIcon, () => {
        console.log('TODO')
      })
      add('Mute', MicOffIcon, () => {
        console.log('TODO')
      })
      add('Kick', AxeIcon, () => {
        console.log('TODO')
      })
      add('Ban', BanIcon, () => {
        console.log('TODO')
      })
    }
    if (hitSpace || hitPrototype || hitItem) {
      add('Create', PlusCircleIcon, () => {
        console.log('TODO: create')
      })
    }
    if (actions.length) {
      this.context = {
        x,
        y,
        actions,
      }
      this.space.emit('context:open', this.context)
    }
  }

  closeContext() {
    if (!this.context) return
    this.context = null
    this.space.emit('context:close')
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    this.space.viewport.removeEventListener('pointerdown', this.onPointerDown)
    this.space.viewport.removeEventListener('wheel', this.onWheel, { passive: false }) // prettier-ignore
    this.space.viewport.removeEventListener('contextmenu', this.onContextMenu)
    this.controls = []
    this.current = null
    // while(this.controls.length) {
    //   this.controls.pop().callback(false)
    // }
  }

  log(...args) {
    console.log('[loader]', ...args)
  }
}

// note1: we have to use a custom context otherwise the script gets access to the "controller" object which includes the entity variable
