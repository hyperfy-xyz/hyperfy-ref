import * as THREE from 'three'

import { System } from './System'

import { DnD } from './extras/DnD'
import { hashFile } from './extras/hashFile'
import { DEG2RAD } from './extras/general'

const UP = new THREE.Vector3(0, 1, 0)
const PI_2 = Math.PI / 2
const MOVE_SEND_RATE = 1 / 5
const MOVE_ROTATE_SPEED = 0.1 * DEG2RAD

const q1 = new THREE.Quaternion()
const arr1 = []

export class Environment extends System {
  constructor(world) {
    super(world)
    this.viewport = null
    this.dnd = null
    this.lastRay = 0
    this.hits = []
    this.moving = null
    this.pointerPosition = new THREE.Vector3()
    this.context = null
    this.mouseRightDownAt = 0
    this.mouseRightDelta = new THREE.Vector3()
  }

  start() {
    this.control = this.world.input.bind({
      priority: 100,
      btnDown: code => {
        if (this.context) {
          this.closeContext()
        }
        if (code === 'MouseLeft') {
          if (this.moving) {
            // TODO: there's still problems with this trigger player attacks somehow
            const entity = this.moving.entity
            entity.mode.value = 'active'
            entity.modeClientId.value = null
            entity.position.value = entity.root.position
            entity.quaternion.value = entity.root.quaternion
            this.setMoving(null)
          }
        }
        if (code === 'MouseRight') {
          this.mouseRightDownAt = performance.now()
          this.mouseRightDelta.set(0, 0, 0)
        }
      },
      btnUp: code => {
        if (code === 'MouseRight') {
          const elapsed = performance.now() - this.mouseRightDownAt
          const travel = this.mouseRightDelta.length()
          if (elapsed < 500 && travel < 30 && !this.moving) {
            this.openContext()
          }
        }
      },
      pointer: info => {
        this.pointerPosition = info.position
        this.mouseRightDelta.add(info.delta)
      },
      zoom: delta => {
        if (this.moving) {
          q1.setFromAxisAngle(UP, MOVE_ROTATE_SPEED * delta).multiply(this.moving.entity.root.quaternion)
          this.moving.entity.quaternion.value = q1
          // this.moving.entity.applyLocalProps({
          //   quaternion: q1,
          // })
          return true
        }
      },
    })
  }

  mount(viewport) {
    this.viewport = viewport
    this.dnd = new DnD(viewport, this.onDropFile)
  }

  update(delta) {
    this.updateHits()
    if (this.moving) {
      const [hit, entity] = this.resolveHit(this.hits)
      if (hit) {
        this.moving.lastSend += delta
        const sync = this.moving.lastSend >= MOVE_SEND_RATE
        if (sync) this.moving.lastSend = 0
        this.moving.entity.position.value.copy(hit.point)
        this.moving.entity.authority.value = this.world.network.client.id
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

  updateHits() {
    this.hits = this.world.graphics.raycastViewport(this.pointerPosition)
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

  onDropFile = async ({ event, file, ext, url }) => {
    console.log(event, file, ext, url)

    if (file && ['glb', 'vox'].includes(ext)) {
      this.updateHits()
      const [hit] = this.resolveHit(this.hits)
      // if (!hit) return console.warn('no hit, no place to drop dnd')
      const position = hit?.point || new THREE.Vector3(0, 0, 0)
      const hash = await hashFile(file)
      const url = `${process.env.PUBLIC_ASSETS_URL}/${hash}`
      this.world.loader.setGLB(url, file)
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
        position: position.toArray(),
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
      this.world.loader.setVRM(url, file)
      console.error('TODO: vrm dialog to verify, preview and upload')
      try {
        await this.world.loader.uploadAsset(file)
      } catch (err) {
        console.error('Could not upload VRM: ', err)
        return
      }
      const player = this.world.network.player
      player.vrmUrl.value = url
      // const entity = this.world.network.avatar
      // entity.schema.model = url
      // entity.schema.modelType = 'vrm'
      // this.world.entities.upsertSchemaLocal(entity.schema)
    }
  }

  openContext() {
    const coords = this.pointerPosition
    // console.log(coords.toArray())
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
    // console.log('entity', entity)
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
    this.control?.release()
    this.control = null
    this.dnd.destroy()
  }
}
