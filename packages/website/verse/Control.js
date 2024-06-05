import * as THREE from 'three'

import { System } from './System'
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
import { cloneDeep } from 'lodash-es'

import { DnD } from './extras/DnD'
import { DEG2RAD } from './extras/general'
import { num } from './extras/num'

const PI_2 = Math.PI / 2
const LOOK_SPEED = 0.005
const WHEEL_SPEED = 0.002

const MOVING_SEND_RATE = 1 / 5

const vec2 = new THREE.Vector2()

export class Control extends System {
  constructor(world) {
    super(world)
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

  start(viewport) {
    this.viewport = viewport
    this.dnd = new DnD(viewport, this.onDnD)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    this.viewport.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointermove', this.onPointerMove)
    this.viewport.addEventListener('wheel', this.onWheel, { passive: false }) // prettier-ignore
    this.viewport.addEventListener('contextmenu', this.onContextMenu)
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
      const hit = this.world.graphics.raycastViewport(
        this.world.control.pointer.coords,
        this.world.graphics.maskMoving
      )
      if (hit) {
        this.moving.entity.positionLerp.push(hit.point, true)
        this.moving.entity.root.dirty()
        this.moving.lastSend += delta
        if (this.moving.lastSend >= MOVING_SEND_RATE) {
          this.world.network.pushEntityUpdate(this.moving.entity.id, update => {
            if (!update.props) update.props = {}
            update.props.position = this.moving.entity.root.position.toArray()
            update.props.quaternion = this.moving.entity.root.quaternion.toArray() // prettier-ignore
          })
          this.moving.lastSend = 0
        }
      }
    }
  }

  lateUpdate() {
    if (!this.current) return
    const rig = this.world.graphics.cameraRig
    const cam = this.world.graphics.camera
    rig.position.copy(this.current.camera.position)
    rig.quaternion.copy(this.current.camera.quaternion)
    cam.position.z = this.current.camera.distance
  }

  onDnD = async ({ event, file, ext, url }) => {
    console.log(event, file, ext, url)

    if (file) {
      // hash
      const buf = await file.arrayBuffer()
      const hashBuf = await crypto.subtle.digest('SHA-256', buf)
      const hash = Array.from(new Uint8Array(hashBuf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
      console.log(hash)
      // TODO: upload UI
      const url = 'https://temp.com/' + hash
      // const url = URL.createObjectURL(file) // await this.world.network.uploadFile(file)
      const localUrl = URL.createObjectURL(file)
      this.world.loader.redirect(url, localUrl, true)
      const schema = {
        id: this.world.network.makeId(),
        type: 'prototype',
        model: url,
        modelType: ext,
        script: null,
        scriptRaw: null,
      }
      this.world.entities.upsertSchemaLocal(schema)
      this.world.entities.addInstanceLocal({
        id: this.world.network.makeId(),
        schemaId: schema.id,
        creator: this.world.network.client.user.id,
        authority: this.world.network.client.id,
        mode: 'moving',
        modeClientId: this.world.network.client.id,
        position: [0, 0, 0], // hit.point.toArray(),
        quaternion: [0, 0, 0, 1],
        state: {},
      })
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
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.shift = true
        if (this.current) {
          this.current.run = true
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
          if (this.current) {
            this.current.jump = false
          }
        }
        break
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.shift = false
        if (this.current) {
          this.current.run = false
        }
        break
    }
  }

  onPointerDown = e => {
    if (this.moving) {
      this.moving.entity.mode = 'active'
      this.moving.entity.modeClientId = null
      this.moving.entity.checkMode()
      this.world.network.pushEntityUpdate(this.moving.entity.id, update => {
        if (!update.props) update.props = {}
        update.props.mode = this.moving.entity.mode
        update.props.modeClientId = this.moving.entity.modeClientId
        update.props.position = this.moving.entity.root.position.toArray()
        update.props.quaternion = this.moving.entity.root.quaternion.toArray()
      })
      this.moving = null
      return
    }
    this.closeContext()
    this.pointer.down = true
    this.pointer.downAt = performance.now()
    this.pointer.rmb = e.button === 2
    this.pointer.move.set(0, 0)
    // this.viewport.setPointerCapture(e.pointerId)
    this.viewport.addEventListener('pointerup', this.onPointerUp)
    if (this.current) {
      this.current.look.active = true
      this.current.look.locked = e.button === 2
    }
    this.requestPointerLock()
  }

  onPointerMove = e => {
    const rect = this.viewport.getBoundingClientRect()
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
    // this.viewport.releasePointerCapture(e.pointerId)
    this.viewport.removeEventListener('pointerup', this.onPointerUp)
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

  request(entity) {
    // todo: type avatar always gets preference
    const control = {
      entityId: entity.id,
      move: new THREE.Vector3(),
      run: false,
      jump: false,
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
        rotation: new THREE.Euler(-20 * DEG2RAD, 0, 0, 'YXZ'),
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
    const hit = this.world.graphics.raycastViewport(vec2)
    console.log('hit', hit)
    if (!hit) return // void
    let entity
    if (hit.object) {
      if (hit.object.instanceGroup) {
        entity = hit.object.instanceGroup.getNode(hit.instanceId)?.entity
      } else {
        entity = hit.object.node?.entity
      }
    }
    // const entity = hit?.object?.node?.entity
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
    const hitVoid = !hit
    const hitWorld = hit && !entity
    const hitSelf = entity === this.world.network.avatar
    const hitAvatar = !hitSelf && entity?.schema.type === 'avatar'
    const hitPrototype = entity?.schema.type === 'prototype'
    const hitItem = entity?.schema.type === 'item'
    if (hitSelf) {
      add({
        label: 'Profile',
        icon: UserIcon,
        visible: true,
        disabled: false,
        execute: () => {
          this.world.panels.inspect(entity)
        },
      })
      add({
        label: 'Emotes',
        icon: SmileIcon,
        visible: true,
        disabled: false,
        execute: () => {
          console.log('TODO')
        },
      })
      add({
        label: 'Enable Mic',
        icon: MicIcon,
        visible: true,
        disabled: false,
        execute: () => {
          console.log('TODO')
        },
      })
    }
    if (hitAvatar) {
      add({
        label: 'Profile',
        icon: UserIcon,
        visible: true,
        disabled: false,
        execute: () => {
          this.world.panels.inspect(entity)
        },
      })
      add({
        label: 'Trade',
        icon: ArrowRightLeftIcon,
        visible: true,
        disabled: false,
        execute: () => {
          console.log('TODO')
        },
      })
      add({
        label: 'Permissions',
        icon: ShieldPlusIcon,
        visible: true,
        disabled: false,
        execute: () => {
          console.log('TODO')
        },
      })
      add({
        label: 'Mute',
        icon: MicOffIcon,
        visible: true,
        disabled: false,
        execute: () => {
          console.log('TODO')
        },
      })
      add({
        label: 'Kick',
        icon: AxeIcon,
        visible: true,
        disabled: false,
        execute: () => {
          console.log('TODO')
        },
      })
      add({
        label: 'Ban',
        icon: BanIcon,
        visible: true,
        disabled: false,
        execute: () => {
          console.log('TODO')
        },
      })
    }
    if (hitWorld || hitPrototype || hitItem) {
      add({
        label: 'Create',
        icon: PlusCircleIcon,
        visible: this.world.permissions.canCreatePrototype(),
        disabled: false,
        execute: () => {
          const script = `
let box

object.on('setup', () => {
  box = object.get('box')
})

object.on('update', delta => {
  box.rotation.y += 10 * delta
  box.dirty()
})
          `
          const schema = {
            id: this.world.network.makeId(),
            type: 'prototype',
            model: '/static/cube.glb',
            modelType: 'glb',
            script: null,
            scriptRaw: null,
          }
          this.world.entities.upsertSchemaLocal(schema)
          this.world.entities.addInstanceLocal({
            id: this.world.network.makeId(),
            schemaId: schema.id,
            creator: this.world.network.client.user.id,
            authority: this.world.network.client.id,
            mode: 'editing',
            modeClientId: this.world.network.client.id,
            position: hit.point.toArray(),
            quaternion: [0, 0, 0, 1],
            state: {},
          })
        },
      })
    }
    if (hitPrototype) {
      add({
        label: 'Inspect',
        icon: EyeIcon,
        visible: true,
        disabled: false,
        execute: () => {
          this.world.panels.inspect(entity)
        },
      })
      add({
        label: 'Move',
        icon: HandIcon,
        visible: this.world.permissions.canMoveEntity(entity),
        disabled: entity.mode !== 'active' && entity.mode !== 'dead',
        execute: () => {
          this.world.network.server.send('entity-mode-request', {
            entityId: entity.id,
            mode: 'moving',
          })
        },
      })
      add({
        label: 'Edit',
        icon: PencilRulerIcon,
        visible: this.world.permissions.canEditEntity(entity),
        disabled: entity.mode !== 'active' && entity.mode !== 'dead',
        execute: () => {
          this.world.network.server.send('entity-mode-request', {
            entityId: entity.id,
            mode: 'editing',
          })
        },
      })
      if (this.world.entities.countInstancesBySchema(entity.schema.id) > 1) {
        add({
          label: 'Unlink',
          icon: UnlinkIcon,
          visible: this.world.permissions.canEditEntity(entity), // ???
          disabled: false,
          execute: () => {
            // duplicate schema
            const schema = cloneDeep(entity.schema)
            schema.id = this.world.network.makeId()
            this.world.entities.upsertSchemaLocal(schema)
            // replace current instance with new one
            this.world.entities.addInstanceLocal({
              id: this.world.network.makeId(),
              schemaId: schema.id,
              creator: this.world.network.client.user.id, // ???
              authority: this.world.network.client.id,
              mode: 'active',
              modeClientId: null,
              position: entity.root.position.toArray(),
              quaternion: entity.root.quaternion.toArray(),
              state: entity.state,
            })
            this.world.entities.removeInstanceLocal(entity.id)
          },
        })
      }
      add({
        label: 'Duplicate',
        icon: CopyIcon,
        visible: this.world.permissions.canEditEntity(entity),
        disabled: false,
        execute: () => {
          this.world.entities.addInstanceLocal({
            id: this.world.network.makeId(),
            schemaId: entity.schema.id,
            creator: this.world.network.client.user.id, // ???
            authority: this.world.network.client.id,
            mode: 'moving',
            modeClientId: this.world.network.client.id,
            position: entity.root.position.toArray(),
            quaternion: entity.root.quaternion.toArray(),
            state: {},
          })
        },
      })
      add({
        label: 'Bomb',
        icon: BombIcon,
        visible: true,
        disabled: false,
        execute: () => {
          for (let i = 0; i < 9999; i++) {
            this.world.entities.addInstanceLocal({
              id: this.world.network.makeId(),
              schemaId: entity.schema.id,
              creator: this.world.network.client.user.id, // ???
              authority: this.world.network.client.id,
              mode: 'active',
              modeClientId: null,
              position: [num(-100, 100, 3), 0, num(-100, 100, 3)], // ground
              // position: [num(-30, 30, 3), num(0, 30, 3), num(-30, 30, 3)], // everywhere
              quaternion: [0, 0, 0, 1],
              state: entity.state,
            })
          }
        },
      })
      add({
        label: 'Destroy',
        icon: Trash2Icon,
        visible: this.world.permissions.canDestroyEntity(entity),
        disabled: false,
        execute: () => {
          this.world.entities.removeInstanceLocal(entity.id)
        },
      })
      // add({
      //   label: 'Buy',
      //   icon: GiftIcon,
      //   visible: true,
      //   disabled: false,
      //   execute: () => {
      //     // this.world.entities.removeInstanceLocal(entity.id)
      //   },
      // })
    }
    const hasVisibleActions = actions.find(action => action.visible)
    if (hasVisibleActions) {
      this.context = {
        x,
        y,
        actions,
      }
      this.world.emit('context', this.context)
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
    this.world.emit('context', null)
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    this.viewport.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('pointermove', this.onPointerMove)
    this.viewport.removeEventListener('wheel', this.onWheel, { passive: false }) // prettier-ignore
    this.viewport.removeEventListener('contextmenu', this.onContextMenu)
    this.dnd.destroy()
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

// LOTSA STATIC CUBES
// for (let i = 0; i < 1000; i++) {
//   this.world.entities.addInstanceLocal({
//     id: this.world.network.makeId(),
//     type: 'prototype',
//     creator: this.world.network.client.user.id,
//     authority: this.world.network.client.id,
//     mode: 'active',
//     modeClientId: null,
//     position: [num(-100, 100, 2), 0, num(-100, 100, 2)],
//     quaternion: [0, 0, 0, 1],
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
//   this.world.entities.addInstanceLocal({
//     id: this.world.network.makeId(),
//     type: 'prototype',
//     creator: this.world.network.client.user.id,
//     authority: this.world.network.client.id,
//     mode: 'active',
//     modeClientId: null,
//     position: [num(-100, 100, 2), num(-100, 100, 2), num(-100, 100, 2)],
//     quaternion: [0, 0, 0, 1],
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
// this.world.entities.addInstanceLocal({
//   id: this.world.network.makeId(),
//   type: 'prototype',
//   creator: this.world.network.client.user.id,
//   authority: this.world.network.client.id,
//   mode: 'active',
//   modeClientId: null,
//   position: hit.point.toArray(),
//   quaternion: [0, 0, 0, 1],
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
// this.world.entities.addInstanceLocal({
//   id: this.world.network.makeId(),
//   type: 'prototype',
//   creator: this.world.network.client.user.id,
//   authority: this.world.network.client.id,
//   mode: 'active',
//   modeClientId: null,
//   position: hit.point.toArray(),
//   quaternion: [0, 0, 0, 1],
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
