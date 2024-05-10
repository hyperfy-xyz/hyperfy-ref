import { System } from './System'
import { SockClient } from './SockClient'
import { num } from '@/utils/num'

const SEND_RATE = 1 / 5 // 5Hz (5 times per second)

let ids = 0

export class Network extends System {
  constructor(space) {
    super(space)
    this.server = null
    this.meta = null
    this.permissions = null
    this.clients = new Map()
    this.client = null
    this.delta = {}
    this.lastSendTime = 0
    this.active = false
  }

  async init() {
    const url = `${process.env.PUBLIC_CONTROLLER_WS}/space/${this.space.id}`
    this.log('connecting', url)

    this.server = new SockClient(url)
    this.server.on('connect', this.onConnect)
    this.server.on('init', this.onInit)
    this.server.on('add-client', this.onAddClient)
    this.server.on('update-client', this.onUpdateClient)
    this.server.on('remove-client', this.onRemoveClient)
    this.server.on('add-entity', this.onAddEntity)
    this.server.on('update-entity', this.onUpdateEntity)
    this.server.on('remove-entity', this.onRemoveEntity)
    this.server.on('disconnect', this.onDisconnect)

    this.space.on('auth-change', this.updateClient)
  }

  update(delta) {
    this.server.flush()
    this.lastSendTime += delta
    if (this.lastSendTime >= SEND_RATE) {
      if (Object.keys(this.delta).length) {
        this.server.send('update-entities', this.delta)
        this.delta = {}
      }
      this.lastSendTime = 0
    }
  }

  makeId() {
    return `${this.client.id}.${++ids}`
  }

  onConnect = () => {
    this.log('connect')
    this.space.emit('connect')
    this.server.send('auth', this.space.auth.token)
  }

  onInit = async data => {
    this.log('init', data)
    this.meta = data.meta
    this.permissions = data.permissions
    for (const clientData of data.clients) {
      const client = new Client().deserialize(clientData)
      this.clients.set(client.id, client)
    }
    const client = this.clients.get(data.clientId)
    this.client = client
    for (const entity of data.entities) {
      this.space.entities.add(entity)
    }

    // TODO: preload stuff and get it going
    // await this.space.loader.preload()
    // const place = this.space.items.findPlace('spawn')
    // this.space.avatars.spawn(place)
    // await this.server.call('auth', this.space.token)

    this.active = true
    this.space.emit('active')

    this.updateClient()

    // const avatar = this.space.entities.addLocal({
    //   id: this.makeId(),
    //   type: 'avatar',
    //   creator: this.client.user.id,
    //   authority: client.id,
    //   active: true,
    //   position: [0, 1, 0],
    //   quaternion: [0, 0, 0, 1],
    //   scale: [1, 1, 1],
    //   state: {
    //     position: [num(-1, 1, 2), 2, 0],
    //     quaternion: [0, 0, 0, 1],
    //   },
    //   nodes: [
    //     {
    //       type: 'script',
    //       name: 'my-script',
    //       code: AVATAR_SCRIPT,
    //     },
    //   ],
    // })
    this.avatar = this.space.entities.addLocal({
      id: this.makeId(),
      type: 'avatar',
      creator: this.client.user.id,
      authority: client.id,
      mode: 'active',
      modeClientId: null,
      // position: [0, 1, 0],
      // quaternion: [0, 0, 0, 1],
      position: [num(-1, 1, 2), 1, 0],
      quaternion: [0, 0, 0, 1],
      scale: [1, 1, 1],
      state: {
        // position: [num(-1, 1, 2), 2, 0],
        // quaternion: [0, 0, 0, 1],
      },
      nodes: [
        {
          type: 'script',
          name: 'my-script',
          code: AVATAR_SCRIPT,
        },
      ],
    })
  }

  getEntityDelta(id) {
    if (!this.delta[id]) {
      this.delta[id] = {}
    }
    return this.delta[id]
  }

  updateClient = () => {
    if (!this.active) return
    const user = this.space.auth.user
    const client = this.client
    client.name = user.name
    client.address = user.address
    this.server.send('update-client', client.serialize())
  }

  findUser(userId) {
    for (const client of this.clients.values()) {
      if (client.user.id === userId) return client.user
    }
  }

  onAddClient = data => {
    this.log('add-client', data)
    const client = new Client().deserialize(data)
    this.clients.set(client.id, client)
  }

  onUpdateClient = data => {
    this.log('update-client', data)
    const client = this.clients.get(data.id)
    client.deserialize(data)
  }

  onRemoveClient = id => {
    this.log('remove-client', id)
    this.clients.delete(id)
  }

  onAddEntity = data => {
    this.log('add-entity', data)
    this.space.entities.add(data)
  }

  onUpdateEntity = data => {
    // this.log('update-entity', data)
    const entity = this.space.entities.get(data.id)
    if (data.state) {
      entity.onRemoteStateChanges(data.state)
    }
    if (data.props) {
      entity.onRemotePropChanges(data.props)
    }
  }

  onRemoveEntity = id => {
    this.log('remove-entity', id)
    this.space.entities.remove(id)
  }

  onDisconnect = () => {
    this.log('disconnect')
    this.space.emit('disconnect')
  }

  log(...args) {
    console.log('[network]', ...args)
  }

  destroy() {
    this.server.disconnect()
  }
}

class Client {
  constructor() {
    this.id = null
    this.user = null
    this.permissions = null
  }

  deserialize(data) {
    this.id = data.id
    this.user = data.user
    this.permissions = data.permissions
    return this
  }

  serialize() {
    return {
      id: this.id,
      user: this.user,
      permissions: this.permissions,
    }
  }
}

// const AVATAR_SCRIPT = `
// (function() {
//   return entity => {
//     return class Script {
//       init() {
//         const state = entity.getState()
//         const authority = entity.isAuthority()
//         console.log('state.position', state.position)
//         console.log('authority', authority)
//         this.box = entity.create({
//           type: 'box',
//           name: 'box',
//           position: state.position,
//         })
//         entity.add(this.box)
//       }
//       start() {
//         console.log('state pos', this.box.position)
//       }
//       update(delta) {

//       }
//       onState(newState) {

//       }
//     }
//   }
// })()
// `

const AVATAR_SCRIPT = `
(function() {
  return entity => {
    const PUSH_RATE = 1 / 5 // 5Hz (times per second)
    const ZOOM_DISTANCE = 10 // 10m
    const ZOOM_SPEED = 6

    const o1 = new Object3D()
    const v1 = new Vector3()
    const v2 = new Vector3()
    const e1 = new Euler()
    const e2 = new Euler()
    const e3 = new Euler()
    const q1 = new Quaternion()
    const q2 = new Quaternion()
    const q3 = new Quaternion()

    return class Script {
      init() {        
        const authority = entity.isAuthority()
        if (authority) {
          this.jumpHeight = 1.5
          this.turnSpeed = 3
          this.moveSpeed = 5
          this.displacement = new Vector3(0, 0, 0)
          this.gravity = 20 // 9.81
          this.isJumping = false
          this.isGrounded = false
          this.velocity = new Vector3()
          this.hasControl = false
          this.lastPush = 0          
          this.ctrl = entity.create({
            type: 'controller',
            name: 'ctrl',
            radius: 0.4,
            height: 1,
          })
          this.vrm = entity.create({
            type: 'box',
            name: 'vrm',
            size: [1, 1.8, 1],
            color: 'red',
            position: [0, 1.8 / 2 , 0]
          })
          this.face = entity.create({
            type: 'box',
            name: 'face',
            size: [0.3,0.1,0.1],
            color: 'red',
            position: [0, 1, -0.5]
          })
          entity.add(this.ctrl)
          this.ctrl.add(this.vrm)
          this.vrm.add(this.face)

        } else {
          this.base = entity.create({
            type: 'group',
            name: 'base',
          })
          this.vrm = entity.create({
            type: 'box',
            name: 'vrm',
            size: [1, 1.8, 1],
            color: 'red',
            position: [0, 1.8 / 2 , 0]
          })
          this.face = entity.create({
            type: 'box',
            name: 'face',
            size: [0.3,0.1,0.1],
            color: 'red',
            position: [0, 1, -0.5]
          })
          entity.add(this.base)
          this.base.add(this.vrm)
          this.vrm.add(this.face)
        }
      }
      start() {
        if (entity.isAuthority()) {
          entity.requestControl()
        } else {
          const state = entity.getState()
          if (is(state.px)) this.base.position.x = state.px
          if (is(state.py)) this.base.position.y = state.py
          if (is(state.pz)) this.base.position.z = state.pz
          if (is(state.qx)) this.base.quaternion.x = state.qx
          if (is(state.qy)) this.base.quaternion.y = state.qy
          if (is(state.qz)) this.base.quaternion.z = state.qz
          if (is(state.qw)) this.base.quaternion.w = state.qw
          this.remotePosition = new Vector3Lerp(this.base.position, PUSH_RATE)
          this.remoteQuaternion = new QuaternionLerp(this.base.quaternion, PUSH_RATE)
          this.base.dirty()
        }
      }
      update(delta) {
        const authority = entity.isAuthority()
        if (authority) {
          const control = entity.getControl()
          this.displacement.set(0, 0, 0)
          // movement is either:
          // a) no mouse down = WS forward/back relative to vrm direction + AD to turn left/right + camera constantly tries to stay behind
          // b) left mouse down = WS forward/back relative to vrm direction + AD to turn left/right
          // c) right mouse down = WS forward/back relative to camera direction + AD strafe left/right
          const fp = control && control.look.zoom === 0
          const active = control && control.look.active
          const locked = control.look.locked
          const advance = control.look.advance
          const move = v1.copy(control.move)
          if (advance) move.z = -1
          const moving = move.x || move.z
          const looking = control.look.rotation.x || control.look.rotation.y
          const a = control && !control.look.active
          const b = control && control.look.active && !control.look.locked
          const c = control && control.look.active && control.look.locked 
          // AD swivel left and right?
          if (!active || (active && !locked)) {
            this.vrm.rotation.y -= move.x * this.turnSpeed * delta
          }
          // forward/back displacement only (eg turning not strafing)
          if ((fp && !active) || (!fp && !active) || (!fp && active && !locked)) {
            this.displacement.set(0, 0, move.z).multiplyScalar(this.moveSpeed * delta)
            this.displacement.applyQuaternion(this.vrm.quaternion)
          }
          // forward/back and strafe
          else {
            this.displacement.set(move.x, 0, move.z).multiplyScalar(this.moveSpeed * delta)
            e1.copy(this.vrm.rotation)
            e1.x = 0
            e1.z = 0
            q1.setFromEuler(e1)
            this.displacement.applyQuaternion(q1)
          }
          if (this.isGrounded) {
            this.velocity.y = -this.gravity * delta
          } else {
            this.velocity.y -= this.gravity * delta
          }
          if (control?.jump && this.isGrounded) {
            this.velocity.y = Math.sqrt(2 * this.gravity * this.jumpHeight)
          }
          this.displacement.y = this.velocity.y * delta
          this.ctrl.move(this.displacement)
          this.isGrounded = this.ctrl.isGrounded()
          this.isCeiling = this.ctrl.isCeiling()
          if (this.isCeiling && this.velocity.y > 0) {
            this.velocity.y = -this.gravity * delta
          }
          const camTurn = !active
          if (camTurn) {
            // move camera based on AD
            control.camera.rotation.y -= move.x * this.turnSpeed * delta
          }
          const camAdjust = !active && moving
          if (camAdjust) {
            // slerp camera behind vrm if its not already
            control.camera.rotation.y = lerpAngle(control.camera.rotation.y, this.vrm.rotation.y, 3 * delta)
            // camera too high? slerp down to 20 deg
            if (control.camera.rotation.x * RAD2DEG < -20) {
              control.camera.rotation.x = lerpAngle(control.camera.rotation.x, -20 * DEG2RAD, 3 * delta)
            }
            // camera too low? slerp back to 0
            if (control.camera.rotation.x * RAD2DEG > 0) {
              control.camera.rotation.x = lerpAngle(control.camera.rotation.x, 0 * DEG2RAD, 6 * delta)
            }
          }
          if (control) {
            control.camera.position.copy(this.ctrl.position)
            control.camera.position.y += 1.8

            const from = control.camera.distance
            const to = control.look.zoom * ZOOM_DISTANCE
            const alpha = ZOOM_SPEED * delta
            control.camera.distance += (to - from) * alpha // Vector3.lerp unit

            control.camera.rotation.y += control.look.rotation.y
            control.camera.rotation.x += control.look.rotation.x
            control.look.rotation.set(0, 0, 0) // reset
          }
          // VRM always face camera direction?
          if (fp || (locked && (moving || looking))) {
            this.vrm.rotation.y = control.camera.rotation.y // TODO: camera rotation.y changes later so its one frame behind
          }
          // Hide VRM in first person
          // console.log(this.vrm.getParent())
          if (control && !control.look.zoom && this.vrm.getParent()) {
            console.log('hide')
            this.ctrl.remove(this.vrm)
          }
          if (control && control.look.zoom && !this.vrm.getParent()) {
            console.log('show')
            this.ctrl.add(this.vrm)
          }
          this.ctrl.dirty()
          this.vrm.dirty()
          this.lastPush += delta
          if (this.lastPush > PUSH_RATE) {
            const state = entity.getState()
            state.px = this.ctrl.position.x
            state.py = this.ctrl.position.y
            state.pz = this.ctrl.position.z
            state.qx = this.vrm.quaternion.x
            state.qy = this.vrm.quaternion.y
            state.qz = this.vrm.quaternion.z
            state.qw = this.vrm.quaternion.w
            this.lastPush = 0
          }
        } else {
          const changes = entity.getStateChanges()
          if (changes) {
            if (changes.px || changes.py || changes.pz) {
              v1.copy(this.remotePosition.current)
              if (is(changes.px)) v1.x = changes.px
              if (is(changes.py)) v1.y = changes.py
              if (is(changes.pz)) v1.z = changes.pz
              this.remotePosition.push(v1)
            }
            if (changes.qx || changes.qy || changes.qz || changes.qw) {
              q1.copy(this.remoteQuaternion.current)
              if (is(changes.qx)) q1.x = changes.qx
              if (is(changes.qy)) q1.y = changes.qy
              if (is(changes.qz)) q1.z = changes.qz
              if (is(changes.qw)) q1.w = changes.qw
              this.remoteQuaternion.push(q1)
            }            
          }
          this.remotePosition.update(delta)
          this.remoteQuaternion.update(delta)
          this.base.dirty()
        }
      }
    }

    function lerpAngle(startAngle, endAngle, t) {  
      let difference = (endAngle - startAngle) % (2 * Math.PI);
      if (difference > Math.PI) difference -= 2 * Math.PI;
      if (difference < -Math.PI) difference += 2 * Math.PI;  
      let interpolatedAngle = startAngle + difference * t;
      return interpolatedAngle;
    }

    function is(value) {
      return value !== undefined
    }
  
  }
})()
`
