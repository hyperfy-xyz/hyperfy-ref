import EventEmitter from 'eventemitter3'

import { Network } from './Network'
import { Test } from './Test'
import { Physics } from './Physics'
import { Graphics } from './Graphics'
import { Entities } from './Entities'
import { Loader } from './Loader'
import { Scripts } from './Scripts'

const FIXED_TIMESTEP = 1 / 60 // 60Hz

export class Space extends EventEmitter {
  constructor({ id, auth, viewport }) {
    super()
    this.id = id
    this.auth = auth
    this.viewport = viewport
    this.compartment = new Compartment({
      console: {
        log: harden(console.log),
        error: harden(console.error),
        time: harden(console.time),
        timeEnd: harden(console.timeEnd),
      },
      eval: undefined,
      harden: undefined,
      lockdown: undefined,
    })
    this.network = new Network(this)
    this.entities = new Entities(this)
    this.scripts = new Scripts(this)
    this.loader = new Loader(this)
    this.test = new Test(this)
    this.physics = new Physics(this)
    this.graphics = new Graphics(this)
    this.time = 0
    this.fixedTime = 0
    this.frame = 0
    this.init()
  }

  async init() {
    await this.network.init()
    await this.entities.init()
    await this.scripts.init()
    await this.loader.init()
    await this.test.init()
    await this.physics.init()
    await this.graphics.init()
    this.start()
  }

  start() {
    this.network.start()
    this.entities.start()
    this.scripts.start()
    this.loader.start()
    this.test.start()
    this.physics.start()
    this.graphics.start()
    this.graphics.renderer.setAnimationLoop(this.tick)
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
    this.network.update(delta)
    this.entities.update(delta)
    this.scripts.update(delta)
    this.loader.update(delta)
    this.test.update(delta)
    this.physics.update(delta)
    this.graphics.update(delta)
  }

  fixedUpdate(delta) {
    this.fixedTime += delta
    while (this.fixedTime >= FIXED_TIMESTEP) {
      this.fixedTime -= FIXED_TIMESTEP
      this.network.fixedUpdate(FIXED_TIMESTEP)
      this.entities.fixedUpdate(FIXED_TIMESTEP)
      this.scripts.fixedUpdate(FIXED_TIMESTEP)
      this.loader.fixedUpdate(FIXED_TIMESTEP)
      this.test.fixedUpdate(FIXED_TIMESTEP)
      this.physics.fixedUpdate(FIXED_TIMESTEP)
      this.graphics.fixedUpdate(FIXED_TIMESTEP)
    }
  }

  lateUpdate(delta) {
    this.network.lateUpdate(delta)
    this.entities.lateUpdate(delta)
    this.scripts.lateUpdate(delta)
    this.loader.lateUpdate(delta)
    this.physics.lateUpdate(delta)
    this.test.lateUpdate(delta)
    this.graphics.lateUpdate(delta)
  }

  stop() {
    this.graphics.renderer.setAnimationLoop(null)
  }

  setAuth(auth) {
    this.auth = auth
    this.emit('auth-change')
  }

  destroy() {
    console.log('destroy')
    this.stop()
    this.network.destroy()
    this.entities.destroy()
    this.scripts.destroy()
    this.loader.destroy()
    this.physics.destroy()
    this.test.destroy()
    this.graphics.destroy()
  }
}
