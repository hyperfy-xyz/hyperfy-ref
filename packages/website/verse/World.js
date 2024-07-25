import EventEmitter from 'eventemitter3'

import { Spatial } from './Spatial'
import { Terrain } from './Terrain'
import { HeightTerrain } from './HeightTerrain'
import { Wind } from './Wind'
import { Actions } from './Actions'
import { Models } from './Models'
import { LODs } from './LODs'
import { Scripts } from './Scripts'
import { Panels } from './Panels'
import { Permissions } from './Permissions'
import { Updater } from './Updater'
import { Input } from './Input'
import { Loader } from './Loader'
import { Network } from './Network'
import { Physics } from './Physics'
import { Entities } from './Entities'
import { Graphics } from './Graphics'
import { Stats } from './Stats'

const FIXED_TIMESTEP = 1 / 60 // 60Hz
const FIXED_TIME_MAX = FIXED_TIMESTEP * 20

export class World extends EventEmitter {
  constructor({ id, auth }) {
    super()
    this.id = id
    this.auth = auth

    this.systems = []
    this.time = 0
    this.fixedTime = 0
    this.frame = 0

    this.spatial = this.register(Spatial)
    // this.terrain = this.register(Terrain)
    // this.terrain = this.register(HeightTerrain)
    this.wind = this.register(Wind)
    this.actions = this.register(Actions)
    this.models = this.register(Models)
    this.lods = this.register(LODs)
    this.scripts = this.register(Scripts)
    this.panels = this.register(Panels)
    this.permissions = this.register(Permissions)
    this.updater = this.register(Updater)
    this.input = this.register(Input)
    this.loader = this.register(Loader)
    this.network = this.register(Network)
    this.physics = this.register(Physics)
    this.entities = this.register(Entities)
    this.graphics = this.register(Graphics)
    this.stats = this.register(Stats)

    this.started = new Promise(resolve => {
      this.startComplete = resolve
    })
    this.init()

    window.world = this
  }

  setAuth(auth) {
    this.auth = auth
    this.emit('auth-change')
  }

  register(System) {
    const system = new System(this)
    this.systems.push(system)
    return system
  }

  async init() {
    for (const system of this.systems) {
      await system.init()
    }
    this.start()
  }

  async start() {
    if (this.dead) return
    for (const system of this.systems) {
      system.start()
    }
    this.graphics.renderer.setAnimationLoop(this.tick)
    this.startComplete()
  }

  async mount(viewport) {
    await this.started
    for (const system of this.systems) {
      system.mount(viewport)
    }
  }

  tick = time => {
    this.stats.begin()
    time /= 1000
    const delta = this.time ? time - this.time : 0
    this.time = time
    this.frame++
    this.update(delta)
    this.fixedUpdate(delta)
    this.lateUpdate(delta)
    this.stats.end()
  }

  update(delta) {
    for (const system of this.systems) {
      system.update(delta)
    }
  }

  fixedUpdate(delta) {
    this.fixedTime += delta
    if (this.fixedTime > FIXED_TIME_MAX) {
      this.fixedTime = FIXED_TIME_MAX // prevent huge build-up while tab is inactive
    }
    while (this.fixedTime >= FIXED_TIMESTEP) {
      this.fixedTime -= FIXED_TIMESTEP
      for (const system of this.systems) {
        system.fixedUpdate(FIXED_TIMESTEP)
      }
    }
  }

  lateUpdate(delta) {
    for (const system of this.systems) {
      system.lateUpdate(delta)
    }
  }

  destroy() {
    this.graphics.renderer.setAnimationLoop(null)
    for (const system of this.systems) {
      system.destroy()
    }
    this.systems = []
    this.dead = true
  }
}
