import { System } from './System'
import { SockClient } from './SockClient'
import { num } from '@/utils/num'

const SEND_RATE = 1 / 5 // 5Hz (5 times per second)

let ids = 0

export class Network extends System {
  constructor(space) {
    super(space)
    this.server = null
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
  }

  onInit = async data => {
    this.log('init', data)
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

    const avatar = this.space.entities.addLocal({
      id: this.makeId(),
      type: 'avatar',
      authority: client.id,
      active: true,
      position: [num(-1, 1, 2), 3, 0],
      quaternion: [0, 0, 0, 1],
      scale: [1, 1, 1],
      state: {},
      nodes: [
        {
          type: 'script',
          name: 'my-script',
          code: AVATAR_SCRIPT,
        },
        // {
        //   type: 'box',
        //   name: 'my-box',
        //   position: [0, 0, 0],
        //   quaternion: [0, 0, 0, 1],
        //   scale: [1, 1, 1],
        //   children: [],
        // },
      ],
    })
  }

  updateClient = () => {
    if (!this.active) return
    const user = this.space.auth.user
    const client = this.client
    client.name = user.name
    client.address = user.address
    this.server.send('update-client', client.serialize())
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
      entity.onRemoteState(data.state)
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
    this.name = null
    this.address = null
  }

  deserialize(data) {
    this.id = data.id
    this.name = data.name
    this.address = data.address
    return this
  }

  serialize() {
    return {
      id: this.id,
      name: this.name,
      address: this.address,
    }
  }
}

const AVATAR_SCRIPT = `
(function() {
  return entity => {
    const PUSH_RATE = 1 / 5 // 5Hz (times per second)

    return class Script {
      init() {
        this.box = entity.create({
          type: 'box',
          name: 'box',
          // position: [1, 0, 0],
          // quaternion: new Quaternion().setFromEuler(new Euler(0, 0, DEG2RAD * 20)).toArray(),
          size: [1, 1, 10],
          physics: 'static',
          visible: true,
        })
        entity.add(this.box)

        if (entity.isAuthority()) {
          this.jumpHeight = 1.5
          this.moveSpeed = 5
          this.displacement = new Vector3(0, 0, 0)
          this.gravity = 20 // 9.81
          this.isJumping = false
          this.isGrounded = false
          this.velocity = new Vector3()
          this.hasControl = false
          this.lastPush = 0

          this.dirEul = new Euler()
          this.dirQuat = new Quaternion()
          
          this.character = entity.create({
            type: 'character',
            name: 'character',
            radius: 0.4,
            height: 1,
          })
          this.vrm = entity.create({
            type: 'box',
            name: 'vrm',
            size: [1, 1.8, 1],
            position: [0, 1.8 / 2 , 0]
          })
          this.character.add(this.vrm)
          entity.add(this.character)
        } else {
          this.base = entity.create({
            type: 'group',
            name: 'base',
          })
          this.vrm = entity.create({
            type: 'box',
            name: 'vrm',
            size: [1, 1.8, 1],
            position: [0, 1.8 / 2 , 0]
          })
          this.base.add(this.vrm)
          entity.add(this.base)
          this.remotePosition = new Vector3Lerp(this.base.position, PUSH_RATE)
          this.remoteQuaternion = new QuaternionLerp(this.base.quaternion, PUSH_RATE)
        }
      }
      start() {
        if (entity.isAuthority()) {
          entity.requestControl()
        }
      }
      update(delta) {
        if (entity.isAuthority()) {
          const control = entity.getControl()
          if (this.isGrounded) {
            this.velocity.y = -this.gravity * delta
          } else {
            this.velocity.y -= this.gravity * delta
          }
          if (control?.getJump() && this.isGrounded) {
            this.velocity.y = Math.sqrt(2 * this.gravity * this.jumpHeight)
          }
          if (control) {
            this.displacement.set(control.move.x, 0, control.move.z).multiplyScalar(this.moveSpeed * delta)
            this.dirEul.copy(control.look.rotation)
            this.dirEul.x = 0
            this.dirEul.z = 0
            this.dirQuat.setFromEuler(this.dirEul)
            this.displacement.applyQuaternion(this.dirQuat)
          } else {
            this.displacement.set(0, 0, 0)
          }
          this.displacement.y = this.velocity.y * delta
          this.character.move(this.displacement)
          this.isGrounded = this.character.isGrounded()
          this.isCeiling = this.character.isCeiling()
          if (this.isCeiling && this.velocity.y > 0) {
            this.velocity.y = -this.gravity * delta
          }
          if (control) {
            control.camera.position.copy(this.character.position)
            control.camera.rotation.copy(control.look.rotation)
            control.camera.distance = control.distance * 10
          }
          this.character.dirty()
          this.lastPush += delta
          if (this.lastPush > PUSH_RATE) {
            entity.pushState({
              position: this.character.position.toArray(),
              quaternion: this.character.quaternion.toArray(),
            })
            this.lastPush = 0
          }
        } else {
          this.remotePosition.update(delta)
          this.remoteQuaternion.update(delta)
          this.base.dirty()
        }
      }
      onState(newState) {
        if (newState.position) {
          this.remotePosition.push(newState.position)
        }
        if (newState.quaternion) {
          this.remoteQuaternion.push(newState.quaternion)
        }
      }
    }
  }
})()
`
