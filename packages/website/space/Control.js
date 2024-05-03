import * as THREE from 'three'

import { System } from './System'

const PI_2 = Math.PI / 2
const LOOK_SPEED = 0.002
const WHEEL_SPEED = 0.002

export class Control extends System {
  constructor(space) {
    super(space)
    this.keys = {}
    this.controls = []
    this.active = null
  }

  start() {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    this.space.viewport.addEventListener('pointerdown', this.onPointerDown)
    this.space.viewport.addEventListener('wheel', this.onWheel, {
      passive: false,
    })
    this.space.viewport.addEventListener('contextmenu', this.onContextMenu)
  }

  update() {
    if (!this.active) return
    this.active.move.set(0, 0, 0)
    if (this.keys.forward) this.active.move.z -= 1
    if (this.keys.back) this.active.move.z += 1
    if (this.keys.left) this.active.move.x -= 1
    if (this.keys.right) this.active.move.x += 1
    this.active.move.normalize() // prevent surfing

    // is this the correct time?
    // feels like this is updating based off last frame
    if (this.active) {
      const rig = this.space.graphics.cameraRig
      const cam = this.space.graphics.camera
      rig.position.copy(this.active.camera.position)
      rig.quaternion.copy(this.active.camera.quaternion)
      cam.position.z = this.active.camera.distance
    }
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
          this.keys.forward = true
        }
        break
      case 'KeyS':
      case 'ArrowDown':
        if (!meta) {
          this.keys.back = true
        }
        break
      case 'KeyA':
      case 'ArrowLeft':
        if (!meta) {
          this.keys.left = true
        }
        break
      case 'KeyD':
      case 'ArrowRight':
        if (!meta) {
          this.keys.right = true
        }
        break
      case 'Space':
        if (!meta) {
          this.keys.space = true
          if (this.active) {
            this.active.jump = true
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
    this.space.viewport.setPointerCapture(e.pointerId)
    this.space.viewport.addEventListener('pointermove', this.onPointerMove)
    this.space.viewport.addEventListener('pointerup', this.onPointerUp)
  }

  onPointerMove = e => {
    if (this.active) {
      this.active.look.rotation.y -= e.movementX * LOOK_SPEED
      this.active.look.rotation.x -= e.movementY * LOOK_SPEED
      this.active.look.rotation.x = Math.max(
        -PI_2,
        Math.min(PI_2, this.active.look.rotation.x)
      )
    }
  }

  onPointerUp = e => {
    this.space.viewport.releasePointerCapture(e.pointerId)
    this.space.viewport.removeEventListener('pointermove', this.onPointerMove)
    this.space.viewport.removeEventListener('pointerup', this.onPointerUp)
  }

  onWheel = e => {
    e.preventDefault()
    if (this.active) {
      this.active.distance += e.deltaY * WHEEL_SPEED
      if (this.active.distance < 0) {
        this.active.distance = 0
      }
      if (this.active.distance > 1) {
        this.active.distance = 1
      }
    }
  }

  onContextMenu = e => {
    e.preventDefault()
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
      },
      distance: 0.5,
      camera: {
        position: new THREE.Vector3(),
        rotation: new THREE.Euler(),
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
    if (!this.active) return null
    if (this.active.entityId !== entity.id) return
    return this.active
  }

  release(entity) {
    const idx = this.controls.findIndex(
      control => control.entityId === entity.id
    )
    this.controls.splice(idx, 1)
    this.check()
  }

  check() {
    if (this.active && this.controls[0] !== this.active) {
      this.active = null
    }
    if (this.controls[0] && !this.active) {
      this.active = this.controls[0]
    }
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.controls = []
    this.active = null
    // while(this.controls.length) {
    //   this.controls.pop().callback(false)
    // }
  }

  log(...args) {
    console.log('[loader]', ...args)
  }
}

// note1: we have to use a custom context otherwise the script gets access to the "controller" object which includes the entity variable
