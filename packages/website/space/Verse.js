import EventEmitter from 'eventemitter3'

import { Scripts } from './Scripts'
import { Panels } from './Panels'
import { Permissions } from './Permissions'
import { Control } from './Control'
import { Loader } from './Loader'
import { Network } from './Network'
import { Physics } from './Physics'
import { Entities } from './Entities'
import { Graphics } from './Graphics'
import { Stats } from './Stats'

const FIXED_TIMESTEP = 1 / 60 // 60Hz
const FIXED_TIME_MAX = FIXED_TIMESTEP * 20

export class Verse extends EventEmitter {
  constructor() {
    super()
    this.systems = []
    this.time = 0
    this.fixedTime = 0
    this.frame = 0

    this.scripts = this.register(Scripts)
    this.panels = this.register(Panels)
    this.permissions = this.register(Permissions)
    this.control = this.register(Control)
    this.loader = this.register(Loader)
    this.network = this.register(Network)
    this.physics = this.register(Physics)
    this.entities = this.register(Entities)
    this.graphics = this.register(Graphics)
    this.stats = this.register(Stats)

    this.world = null

    this.ready = new Promise(async resolve => {
      for (const system of this.systems) {
        await system.init()
      }
      resolve()
    })

    window.verse = this
  }

  register(System) {
    const system = new System(this)
    this.systems.push(system)
    return system
  }

  async launch(id, auth, viewport) {
    await this.ready
    for (const system of this.systems) {
      system.start()
    }
    this.graphics.setViewport(viewport)
    this.graphics.renderer.setAnimationLoop(this.tick)

    if (!this.world) {
      this.world = new World(this, {
        type: 'local',
        auth,
      })
    }
    const world = new World(this, {
      type: 'remote',
      id,
      auth,
      onConnect: () => {
        if (this.world) {
          this.world.destroy()
        }
        this.world = world
      },
    })
  }

  tick = time => {
    const delta = (this.time ? time - this.time : 0) / 1000
    this.time = time
    this.frame++
    this.update(delta)
    this.fixedUpdate(delta)
    this.lateUpdate(delta)
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

  stop() {
    this.graphics.setViewport(null)
    this.graphics.renderer.setAnimationLoop(null)
  }

  // setAuth(auth) {
  //   this.auth = auth
  //   this.emit('auth-change')
  // }

  // destroy() {
  //   this.stop()
  //   for (const system of this.systems) {
  //     system.destroy()
  //   }
  //   this.systems = []
  // }
}
