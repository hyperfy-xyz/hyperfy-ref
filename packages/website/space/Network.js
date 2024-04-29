import { System } from './System'
import { SockClient } from './SockClient'
import { num } from '@/utils/rand'

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
      position: [0, 0, 0],
      quaternion: [0, 0, 0, 1],
      state: {},
      nodes: [
        {
          type: 'script',
          code: TEMP_SCRIPT,
          children: [],
        },
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
    this.log('update-entity', data)
    // ...
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

const TEMP_SCRIPT = `
(function() {
  return entity => {
    const avatar = entity.create({
      type: 'avatar',
      url: 'something.vrm',
    })
    const body = entity.create({
      type: 'capsule',
      size: [0.2, 1],
      physics: 'dynamic',
    })
    body.add(avatar)
    entity.add(body)

    entity.onUpdate(delta => {
      body.position.x -= 0.5 * delta
    })
  }
  return class Script {
    init() {
      this.avatar = entity.create({
        type: 'avatar',
        url: 'something.vrm',
      })
      this.body = entity.create({
        type: 'capsule',
        size: [0.2, 1],
        physics: 'dynamic',
      })
      entity.add(this.avatar)
      entity.add(this.body)

      this.cube = this.create('box', { size: [1,1,1] })
      this.foo = true
      console.log('init!!!!')
    }
    // update(delta) {
    //   this.foo = !this.foo
    //   console.log(delta, this.foo)
    // }
  }
})()
`
