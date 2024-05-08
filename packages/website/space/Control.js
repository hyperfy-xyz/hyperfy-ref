import * as THREE from 'three'

import { System } from './System'
import {
  ArrowRightLeftIcon,
  AxeIcon,
  BanIcon,
  EyeIcon,
  HandIcon,
  MicIcon,
  MicOffIcon,
  PencilRulerIcon,
  PlusCircleIcon,
  ShieldPlusIcon,
  SmileIcon,
  Trash2Icon,
  UserIcon,
} from 'lucide-react'
import { num } from '@/utils/num'

const PI_2 = Math.PI / 2
const LOOK_SPEED = 0.005
const WHEEL_SPEED = 0.002

const MOVING_SEND_RATE = 1 / 5

const vec2 = new THREE.Vector2()

export class Control extends System {
  constructor(space) {
    super(space)
    this.keys = {}
    this.controls = []
    this.current = null
    this.isPointerLocked = false
    this.pointer = {
      coords: new THREE.Vector2(),
      start: null,
      rmb: false,
      move: new THREE.Vector2(),
    }
    this.moving = null
  }

  start() {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    this.space.viewport.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointermove', this.onPointerMove)
    this.space.viewport.addEventListener('wheel', this.onWheel, { passive: false }) // prettier-ignore
    this.space.viewport.addEventListener('contextmenu', this.onContextMenu)
  }

  update(delta) {
    if (!this.current) return
    this.current.move.set(0, 0, 0)
    if (this.keys.forward) this.current.move.z -= 1
    if (this.keys.back) this.current.move.z += 1
    if (this.keys.left) this.current.move.x -= 1
    if (this.keys.right) this.current.move.x += 1
    this.current.move.normalize() // prevent surfing

    if (this.moving) {
      const hit = this.space.graphics.raycastViewport(
        this.space.control.pointer.coords,
        this.space.graphics.maskMoving
      )
      if (hit) {
        this.moving.entity.positionLerp.push(hit.point, true)
        this.moving.entity.root.dirty()
        this.moving.lastSend += delta
        if (this.moving.lastSend >= MOVING_SEND_RATE) {
          const delta = this.space.network.getEntityDelta(this.moving.entity.id)
          if (!delta.props) delta.props = {}
          delta.props.position = this.moving.entity.root.position.toArray()
          delta.props.quaternion = this.moving.entity.root.quaternion.toArray()
          this.moving.lastSend = 0
        }
      }
    }
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
    if (this.moving) {
      this.moving.entity.mode = 'active'
      this.moving.entity.modeClientId = null
      this.moving.entity.checkMode()
      const delta = this.space.network.getEntityDelta(this.moving.entity.id)
      if (!delta.props) delta.props = {}
      delta.props.mode = 'active'
      delta.props.modeClientId = null
      delta.props.position = this.moving.entity.root.position.toArray()
      delta.props.quaternion = this.moving.entity.root.quaternion.toArray()
      this.moving = null
      return
    }
    this.closeContext()
    this.pointer.down = true
    this.pointer.downAt = performance.now()
    this.pointer.rmb = e.button === 2
    this.pointer.move.set(0, 0)
    // this.space.viewport.setPointerCapture(e.pointerId)
    this.space.viewport.addEventListener('pointerup', this.onPointerUp)
    if (this.current) {
      this.current.look.active = true
      this.current.look.locked = e.button === 2
    }
    this.requestPointerLock()
  }

  onPointerMove = e => {
    const rect = this.space.viewport.getBoundingClientRect()
    const offsetX = e.pageX - rect.left // - window.scrollX
    const offsetY = e.pageY - rect.top // - window.scrollY
    this.pointer.coords.x = offsetX
    this.pointer.coords.y = offsetY
    if (!this.pointer.down) return
    this.pointer.move.x += e.movementX
    this.pointer.move.y += e.movementY
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
    if (this.pointer.rmb) {
      const elapsed = performance.now() - this.pointer.downAt
      if (elapsed < 500 && this.pointer.move.length() < 10) {
        this.openContext(e.clientX, e.clientY)
      }
    }
    // this.space.viewport.releasePointerCapture(e.pointerId)
    this.space.viewport.removeEventListener('pointerup', this.onPointerUp)
    if (this.current) {
      this.current.look.active = false
      this.current.look.locked = false
      this.current.look.advance = false
    }
    this.exitPointerLock()
    this.pointer.down = false
    this.pointer.downAt = null
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

    // pointerlock is async so if pointer is no longer down, exit
    if (!this.pointer.down) this.exitPointerLock()
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
    vec2.set(x, y)
    const hit = this.space.graphics.raycastViewport(vec2)
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
    console.log(hit)
    const hitVoid = !hit
    const hitSpace = hit && !entity
    const hitSelf = entity === this.space.network.avatar
    const hitAvatar = !hitSelf && entity?.type === 'avatar'
    const hitPrototype = entity?.type === 'prototype'
    const hitItem = entity?.type === 'item'
    if (hitSelf) {
      add('Profile', UserIcon, () => {
        this.space.panels.inspect(entity)
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
        this.space.panels.inspect(entity)
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
      if (this.space.permissions.canCreatePrototype()) {
        add('Create', PlusCircleIcon, () => {
          this.space.entities.addLocal({
            id: this.space.network.makeId(),
            type: 'prototype',
            creator: this.space.network.client.user.id,
            authority: this.space.network.client.id,
            mode: 'editing',
            modeClientId: this.space.network.client.id,
            position: hit.point.toArray(),
            quaternion: [0, 0, 0, 1],
            scale: [1, 1, 1],
            state: {},
            nodes: [
              {
                type: 'box',
                name: 'box',
                color: 'red',
                position: [0, 0.5, 0],
              },
              {
                type: 'script',
                name: 'my-script',
                code: `
                  (function(){
                    return entity => {
                      return class Script {
                        init() {
                          this.box = entity.find('box')
                        }
                        update(delta) {
                          this.box.rotation.y += 10 * delta
                          this.box.dirty()
                        }
                      }
                    }
                  })()
                `,
              },
            ],
          })
          // LOTSA STATIC CUBES
          // for (let i = 0; i < 1000; i++) {
          //   this.space.entities.addLocal({
          //     id: this.space.network.makeId(),
          //     type: 'prototype',
          //     creator: this.space.network.client.user.id,
          //     authority: this.space.network.client.id,
          //     mode: 'active',
          //     modeClientId: null,
          //     position: [num(-100, 100, 2), 0, num(-100, 100, 2)],
          //     quaternion: [0, 0, 0, 1],
          //     scale: [1, 1, 1],
          //     state: {},
          //     nodes: [
          //       {
          //         type: 'box',
          //         name: 'box',
          //         color: 'red',
          //         position: [0, 0.5, 0],
          //       },
          //     ],
          //   })
          // }
          // LOTSA CUBES
          // console.time('lotsa')
          // for (let i = 0; i < 1000; i++) {
          //   this.space.entities.addLocal({
          //     id: this.space.network.makeId(),
          //     type: 'prototype',
          //     creator: this.space.network.client.user.id,
          //     authority: this.space.network.client.id,
          //     mode: 'active',
          //     modeClientId: null,
          //     position: [num(-100, 100, 2), num(-100, 100, 2), num(-100, 100, 2)],
          //     quaternion: [0, 0, 0, 1],
          //     scale: [1, 1, 1],
          //     state: {},
          //     nodes: [
          //       {
          //         type: 'box',
          //         name: 'box',
          //         color: 'red',
          //         position: [0, 0.5, 0],
          //       },
          //       {
          //         type: 'script',
          //         name: 'my-script',
          //         code: `
          //           (function(){
          //             return entity => {
          //               return class Script {
          //                 init() {
          //                   this.box = entity.find('box')
          //                 }
          //                 update(delta) {
          //                   this.box.rotation.y += 10 * delta
          //                   this.box.dirty()
          //                 }
          //               }
          //             }
          //           })()
          //         `,
          //       },
          //     ],
          //   })
          // }
          // console.timeEnd('lotsa')
          // SPINNING CUBES
          // this.space.entities.addLocal({
          //   id: this.space.network.makeId(),
          //   type: 'prototype',
          //   creator: this.space.network.client.user.id,
          //   authority: this.space.network.client.id,
          //   mode: 'active',
          //   modeClientId: null,
          //   position: hit.point.toArray(),
          //   quaternion: [0, 0, 0, 1],
          //   scale: [1, 1, 1],
          //   state: {},
          //   nodes: [
          //     {
          //       type: 'box',
          //       name: 'box',
          //       color: 'red',
          //       position: [0, 0.5, 0],
          //     },
          //     {
          //       type: 'script',
          //       name: 'my-script',
          //       code: `
          //         (function(){
          //           return entity => {
          //             return class Script {
          //               init() {
          //                 this.box = entity.find('box')
          //               }
          //               update(delta) {
          //                 this.box.rotation.y += 10 * delta
          //                 this.box.dirty()
          //               }
          //             }
          //           }
          //         })()
          //       `,
          //     },
          //   ],
          // })
          // PHYSICS CUBES
          // this.space.entities.addLocal({
          //   id: this.space.network.makeId(),
          //   type: 'prototype',
          //   creator: this.space.network.client.user.id,
          //   authority: this.space.network.client.id,
          //   mode: 'active',
          //   modeClientId: null,
          //   position: hit.point.toArray(),
          //   quaternion: [0, 0, 0, 1],
          //   scale: [1, 1, 1],
          //   state: {},
          //   nodes: [
          //     {
          //       type: 'box',
          //       name: 'box',
          //       position: [0, 0.5, 0],
          //       size: [1, 1, 1],
          //       physics: 'dynamic',
          //       visible: true,
          //     },
          //     {
          //       type: 'script',
          //       name: 'my-script',
          //       code: `
          //         (function(){
          //           return entity => {
          //             return class Script {
          //               init() {
          //                 this.box = entity.find('box')
          //                 entity.add(this.box)
          //               }
          //             }
          //           }
          //         })()
          //       `,
          //     },
          //   ],
          // })
        })
      }
    }
    if (hitPrototype) {
      add('Inspect', EyeIcon, () => {
        this.space.panels.inspect(entity)
      })
      if (this.space.permissions.canMoveEntity(entity)) {
        add('Move', HandIcon, () => {
          this.space.network.server.send('entity-mode-request', {
            entityId: entity.id,
            mode: 'moving',
          })
        })
      }
      if (this.space.permissions.canEditEntity(entity)) {
        add('Edit', PencilRulerIcon, () => {
          this.space.network.server.send('entity-mode-request', {
            entityId: entity.id,
            mode: 'editing',
          })
        })
      }
      if (this.space.permissions.canDestroyEntity(entity)) {
        add('Destroy', Trash2Icon, () => {
          this.space.entities.removeLocal(entity.id)
        })
      }
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

  setMoving(entity) {
    if (entity) {
      this.moving = {
        entity,
        lastSend: 0,
      }
    } else {
      this.moving = null
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
    window.removeEventListener('pointermove', this.onPointerMove)
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
