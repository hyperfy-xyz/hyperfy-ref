import * as THREE from 'three'

import { DEG2RAD } from './extras/general'
import { num } from './extras/num'

import { System } from './System'
import { Sock } from './Sock'

const SEND_RATE = 1 / 5 // 5Hz (5 times per second)

let ids = 0

export class Network extends System {
  constructor(world) {
    super(world)
    this.sock = null
    this.meta = null
    this.permissions = null
    this.clients = new Map()
    this.client = null
    this.packet = {}
    this.lastSendTime = 0
    this.status = 'connecting'
  }

  async start() {
    const url = `${process.env.PUBLIC_WORLDS_URL}/${this.world.id}`
    this.log('connecting', url)

    this.sock = new Sock(url, false)
    this.sock.on('connect', this.onConnect)
    this.sock.on('init', this.onInit)
    this.sock.on('add-client', this.onAddClient)
    this.sock.on('update-client', this.onUpdateClient)
    this.sock.on('remove-client', this.onRemoveClient)
    this.sock.on('upsert-schema', this.onUpsertSchema)
    this.sock.on('add-entity', this.onAddEntity)
    this.sock.on('update-entity', this.onUpdateEntity)
    this.sock.on('remove-entity', this.onRemoveEntity)
    this.sock.on('disconnect', this.onDisconnect)

    this.world.on('auth-change', this.updateClient)
  }

  update(delta) {
    this.sock.flush()
    this.lastSendTime += delta
    if (this.lastSendTime >= SEND_RATE) {
      if (Object.keys(this.packet).length) {
        this.sock.send('packet', this.packet)
        this.packet = {}
      }
      this.lastSendTime = 0
    }
  }

  makeId() {
    return `${this.client.id}.${++ids}`
  }

  onConnect = async () => {
    this.status = 'connected'
    this.world.emit('status', this.status)
    this.sock.send('auth', this.world.auth.token)
  }

  onInit = async data => {
    this.log('init', data)
    this.sock.useQueue = true
    this.meta = data.meta
    this.permissions = data.permissions
    for (const clientData of data.clients) {
      const client = new Client().deserialize(clientData)
      this.clients.set(client.id, client)
    }
    const client = this.clients.get(data.clientId)
    this.client = client
    for (const schema of data.schemas) {
      this.world.entities.upsertSchema(schema)
    }
    for (const entity of data.entities) {
      this.world.entities.addEntity(entity)
    }

    // TODO: preload stuff and get it going
    // await this.world.loader.preload()
    // const place = this.world.items.findPlace('spawn')
    // this.world.avatars.spawn(place)
    // await this.sock.call('auth', this.world.token)

    this.updateClient()

    // when the avatar below is created, it will call control.camera.ready() when it has
    // successfully spawned, which in turn will notify us here to continue.
    // this allows us to mount the viewport at the perfect time without flickering or
    // incorrect camera transforms
    this.onCameraReady = () => {
      // yeah yeah its a timeout
      setTimeout(() => {
        this.status = 'active'
        this.world.emit('status', this.status)
      }, 100)
      this.onCameraReady = null
    }

    // // ground
    // {
    //   const schema = {
    //     id: this.world.network.makeId(),
    //     type: 'prototype',
    //     model: '/static/ground.glb',
    //     modelType: 'glb',
    //     script: null,
    //   }
    //   this.world.entities.upsertSchema(schema)
    //   const entity = this.world.entities.addEntity({
    //     id: this.world.network.makeId(),
    //     schemaId: schema.id,
    //     creator: this.world.network.client.user.id, // ???
    //     authority: this.world.network.client.id,
    //     mode: 'active',
    //     modeClientId: null,
    //     // position: entity.root.position.toArray(),
    //     // quaternion: entity.root.quaternion.toArray(),
    //     // state: entity.state,
    //   })
    //   // this.world.loader.loadGLBRaw('/static/ground.glb').then(glb => {
    //   //   const mesh = glb.scene.children[0]
    //   //   mesh.geometry.computeBoundsTree() // three-mesh-bvh
    //   //   mesh.material.shadowSide = THREE.BackSide // fix csm shadow banding
    //   //   mesh.castShadow = true
    //   //   mesh.receiveShadow = true
    //   //   mesh.matrixAutoUpdate = false
    //   //   mesh.matrixWorldAutoUpdate = false
    //   //   this.scene.add(mesh)
    //   // })
    // }

    const schema = {
      id: this.world.network.makeId(),
      type: 'avatar',
      model: `${process.env.PUBLIC_ASSETS_URL}/bunny.vrm`,
      modelType: 'vrm',
      script: '$avatar',
    }
    this.world.entities.upsertSchemaLocal(schema)
    const avatar = {
      id: this.makeId(),
      schemaId: schema.id,
      creator: this.client.user.id,
      authority: client.id,
      mode: 'active',
      modeClientId: null,
      // position: [num(-1, 1, 2), 0, 10],
      // quaternion: new THREE.Quaternion()
      //   .setFromEuler(new THREE.Euler(0, num(0, 270, 2) * DEG2RAD, 0, 'YXZ'))
      //   .toArray(),
      position: [0, 0, 0],
      quaternion: [0, 0, 0, 1],
      state: {},
    }
    this.avatar = this.world.entities.addEntityLocal(avatar)

    // temp: bots
    let n = 0
    window.addBot = (amount = 1) => {
      for (let i = 0; i < amount; i++) {
        n++
        const schema = {
          id: this.world.network.makeId(),
          type: 'prototype',
          // model: ca[num(0, ca.length)], // CRYPTOAVATARS
          model: `https://nftz.forgottenrunes.com/dev/3d/wizards/${n}/wizard_${n}.vrm`, // FRWC
          // model: `http://localhost:3001/assets/bbh/${n}.vrm`,
          modelType: 'vrm',
          script: '$bot',
        }
        this.world.entities.upsertSchemaLocal(schema)
        const bot = {
          id: this.makeId(),
          schemaId: schema.id,
          creator: this.client.user.id,
          authority: client.id,
          mode: 'active',
          modeClientId: null,
          position: [num(-10, 10, 2), 0, num(-10, 10, 2)],
          quaternion: new THREE.Quaternion()
            .setFromEuler(
              new THREE.Euler(0, num(0, 360, 2) * DEG2RAD, 0, 'YXZ')
            )
            .toArray(),
          // position: [0, 0, 10],
          // quaternion: [0, 0, 0, 1],
          state: {},
        }
        this.world.entities.addEntityLocal(bot)
      }
    }
  }

  pushSchema(schema) {
    if (!this.packet.schemas) {
      this.packet.schemas = {}
    }
    this.packet.schemas[schema.id] = schema
  }

  updateClient = () => {
    if (this.status !== 'active') return
    const user = this.world.auth.user
    const client = this.client
    client.name = user.name
    client.address = user.address
    this.sock.send('update-client', client.serialize())
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

  onUpsertSchema = schema => {
    this.world.entities.upsertSchema(schema)
  }

  onAddEntity = data => {
    this.log('add-entity', data)
    this.world.entities.addEntity(data)
  }

  onUpdateEntity = data => {
    // this.log('update-entity', data)
    const entity = this.world.entities.getEntity(data.id)
    entity?.applyNetworkChanges(data)
  }

  onRemoveEntity = id => {
    this.log('remove-entity', id)
    this.world.entities.removeEntity(id)
  }

  onDisconnect = () => {
    this.status === 'disconnected'
    this.world.emit('status', this.status)
  }

  log(...args) {
    console.log('[network]', ...args)
  }

  destroy() {
    this.sock.disconnect()
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

var ca = [
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/101_Egg_BOY.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/102_Biz_dude.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/103_Cool_Pizza.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/104_Sunflower_Person.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/105_Goldfish_Bag_Person.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/106_Cool_Loops.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/107_Pyre_Sorcerer.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/108_Chill_Palm.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/109_Alien_Skeleton.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/110_Unicorn_Person.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/111_Square_Cosmonaut.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/112_Ban_Hammer_Dude.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/113_EYE_Wizard.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/114_Wop_Wop.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/115_LaloBOT.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/116_Mr_ZurbZurb.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/117_Slim_Ringo.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/118_COOL_FRIES.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/119_Captain_Lantern.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/120_Shark_Person.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/121_Balloony.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/122_Mowchok.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/123_SUPER_SUP.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/124_Cosmic_Dweller.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/125_Hodler_King.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/126_Cool_Battery.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/127_Cool_Jam.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/128_Random_Boi.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/129_Cosmic_Person.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/130_Falcon_Dude.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/131_Cool_Shovel.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/132_SaltySalt.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/133_Cool_Baguette.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/134_Cool_Ketchup.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/135_Coffee_Maker.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/136_Slug_Person.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/137_Cool_Can.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/138_Cool_Ramen.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/139_Cool_Hydrant.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/140_Bubble_Boi.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/141_Cool_Drumstick.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/142_Cool_Pan.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/143_Cool_Guitar.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/144_Real_Cake.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/145_Cool_Pirate.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/146_Cool_Trash.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/147_Wonkerls.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/148_EYE_Cleric.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/149_EYE_Summoner.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/150_COOL_Asparagoose.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/151_Lup_Lup.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/152_COOL_TNT.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/153_Cool_Barrel.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/154_Cool_Mail.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/155_Cool_Plunger.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/156_COOL_PIN.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/157_Awesome_Lemon.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/158_Super_ICE_POP.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/159_Cool_Drink.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/160_Chill_Penguin.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/161_Cool_Pancake.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/162_Cool_Taco.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/163_EYE_MOUTH_EYE.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/164_Pencil_Being.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/165_Cool_Candle.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/166_Cool_Broom.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/167_Mister_Contract.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/168_EYE_Fighter.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/169_Cool_Cone.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/170_Cool_Board.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/171_Cool_Door.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/172_Conehead_Being.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/173_Circle_Boi.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/174_Cylinder_Head.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/175_Cool_Orange.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/176_Cool_Poo.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/177_Moon_Girl.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/178_DOPE_Screwdriver.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/179_Cool_Bunny.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/180_Sr._Stickbug_.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/181_Hourglass_Person.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/182_Cool_Turtle.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/183_Cool_Bed.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/184_Cool_Coconut.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/185_Tasty_Sandwich.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/186_Cool_Sword.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/187_Cool_Peanut.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/188_Cool_Potato.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/189_Cool_Egg.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/190_Cool_Cow.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/191_Cool_Steak.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/192_Cool_Washing_Machine.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/193_Cool_Cola.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/194_Cool_Cloud.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/195_Cool_Shield.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/196_Cool_Fridge.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/197_Cool_Bell.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/198_Cool_Stickman.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/199_Cool_Money_Bag.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/200_Cool_Polygonal_Mind.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/01_Crimsom_Avatar.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/02_CoolAlien_Avatar.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/03_Jimmy_Avatar.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/04_OldMoustache_Avatar.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/05_Skull_Avatar.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/06_Cappy_Avatar.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/07_Observer_Avatar.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/08_Hugo_Avatar.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/09_CactusBoy_Avatar.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/10_Froggy_Avatar.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/11_Teddy_Avatar.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/12_Chill_Avatar.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/13_Mint_Avatar.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/14_Anchor_Avatar.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/15_Nightmare_Avatar.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/16_Pumpkin_Avatar.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/17_Robothead.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/18_Retroman_Avatar.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/19_Wizzir_Avatar.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/20_Wambo_Avatar.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/21_Polydancer.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/22_WireFriend.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/23_Carrot_Kid.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/24_CoolBanana.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/25_Mushy.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/26_Udom.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/27_Astrodisco.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/28_Bullidan.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/29_Skelly.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/30_Bloody.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/31_Devil.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/32_Clown.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/33_Franky.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/34_Ghost.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/35_Wolfman.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/36_Mummy.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/37_Eyelids.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/38_Kate.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/39_Witch.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/40_Sticker.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/41_HorrorNurse.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/42_Scarecrow.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/43_Dracula.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/44_Zombie.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/45_DinoKid.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/46_Mafiossini.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/47_David.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/48_Astronaut.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/49_CaptainLobster.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/50_Samuela.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/51_Polybot.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/52_Jennifer.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/53_Erika.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/54_Lydia.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/55_Fungus.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/56_Olivia.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/57_Rose.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/58_Shiro.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/59_Rabbit.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/60_Angry.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/61_Amazonas.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/62_Aesthetica.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/63_Cubiq.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/64_Confirmed.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/65_DisturbingEyes.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/66_Bacondude.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/67_Ferk.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/68_AlwaysWatching.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/69_Kyle.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/70_Robert.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/71_LilBro.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/72_Mikel.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/73_Pepo.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/74_Baldman.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/75_Expol.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/76_Muscary.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/77_WeirdFlexButOk.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/78_Pipe.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/79_Chad.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/80_Coffee.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/81_Toothpaste.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/82_GoodTomato.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/83_Butter.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/84_Milk.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/85_Cucumber.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/86_ToiletPaper.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/87_Hotdog.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/88_Avocado.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/89_Watermelon.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/90_Eggplant.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/91_BigBro.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/92_Chilli.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/93_IceCream.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/94_CoolChoco.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/95_CandyCane.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/96_XmasTree.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/97_Snowy.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/98_Cookieman.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/99_Present.vrm',
  'https://storage.cryptoavatars.io/VRMsByContractAddress/0xc1def47cf1e15ee8c2a92f4e0e968372880d18d1/100_SaintClaus.vrm',
]
