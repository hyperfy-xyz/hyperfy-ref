import EventEmitter from 'eventemitter3'

import { Spatial } from './Spatial'
import { Terrain } from './Terrain'
import { HeightTerrain } from './HeightTerrain'
import { Backpack } from './Backpack'
import { Wind } from './Wind'
import { Actions } from './Actions'
import { Models } from './Models'
import { LODs } from './LODs'
import { Scripts } from './Scripts'
import { Panels } from './Panels'
import { Permissions } from './Permissions'
import { Updater } from './Updater'
import { Input } from './Input'
import { Environment } from './Environment'
import { Loader } from './Loader'
import { Network } from './Network'
import { Cam } from './Cam'
import { Physics } from './Physics'
import { Entities } from './Entities'
import { Graphics } from './Graphics'
import { Stats } from './Stats'

const MAX_DELTA_TIME = 1 / 3 // 0.33333
const FIXED_DELTA_TIME = 1 / 50 //  0.01666

export class World extends EventEmitter {
  constructor({ id, auth }) {
    super()
    this.id = id
    this.auth = auth

    this.systems = []
    this.frame = 0
    this.time = 0
    this.accumulator = 0

    this.spatial = this.register(Spatial)
    // this.terrain = this.register(Terrain)
    // this.terrain = this.register(HeightTerrain)
    this.backpack = this.register(Backpack)
    this.wind = this.register(Wind)
    this.actions = this.register(Actions)
    this.models = this.register(Models)
    this.lods = this.register(LODs)
    this.scripts = this.register(Scripts)
    this.panels = this.register(Panels)
    this.permissions = this.register(Permissions)
    this.updater = this.register(Updater)
    this.input = this.register(Input)
    this.environment = this.register(Environment)
    this.loader = this.register(Loader)
    this.network = this.register(Network)
    this.entities = this.register(Entities)
    this.physics = this.register(Physics)
    this.cam = this.register(Cam)
    this.graphics = this.register(Graphics)
    this.stats = this.register(Stats)

    this.paused = false
    this.started = new Promise(resolve => {
      this.startComplete = resolve
    })
    this.init()

    window.world = this

    document.addEventListener('visibilitychange', this.onVisibilityChange)
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
    let delta = time - this.time
    if (delta > MAX_DELTA_TIME) {
      delta = MAX_DELTA_TIME
    }
    this.frame++
    this.time = time
    this.accumulator += delta
    // prepare physics, letting it know if we will step
    this.physics.prepare(this.accumulator >= FIXED_DELTA_TIME)
    // run as many fixed updates as we can for this delta
    while (this.accumulator >= FIXED_DELTA_TIME) {
      // trigger fixedUpdate
      this.fixedUpdate(FIXED_DELTA_TIME)
      // simulate the physics step + read in actor changes for later
      this.physics.step(FIXED_DELTA_TIME)
      this.accumulator -= FIXED_DELTA_TIME
    }
    // interpolate active actors for remaining delta time
    const alpha = this.accumulator / FIXED_DELTA_TIME
    this.physics.interpolate(alpha)
    // trigger updates
    this.update(delta, alpha)
    this.entities.clean()
    // trigger lateUpdates
    this.lateUpdate(delta, alpha)
    this.entities.clean()
    // update the camera target for active camera
    this.input.finalize(delta)
    // interpolate or snap to final camera target
    this.cam.finalize(delta)
    // finally render
    this.graphics.render()
    // end stats
    this.stats.end()
  }

  fixedUpdate(delta) {
    for (const system of this.systems) {
      system.fixedUpdate(delta)
    }
  }

  update(delta) {
    for (const system of this.systems) {
      system.update(delta)
    }
  }

  lateUpdate(delta) {
    for (const system of this.systems) {
      system.lateUpdate(delta)
    }
  }

  pause() {
    this.graphics.renderer.setAnimationLoop(null)
    this.paused = true
  }

  step() {
    if (!this.paused) this.pause()
    const time = this.time * 1000 + 16.6666
    this.tick(time)
  }

  resume() {
    if (!this.paused) return
    this.paused = false
    this.graphics.renderer.setAnimationLoop(this.tick)
  }

  onVisibilityChange = () => {
    // if the tab is no longer active, browsers stop triggering requestAnimationFrame.
    // this is obviously bad because physics stop running and we stop processing websocket messages etc.
    // instead, we stop using requestAnimationFrame and get a worker to tick at a slower rate using setInterval
    // and notify us.
    // this allows us to keep everything running smoothly.
    // See: https://gamedev.stackexchange.com/a/200503 (kinda fucking genius)
    if (document.hidden) {
      // spawn worker if we haven't yet
      if (!this.worker) {
        const script = `
          const rate = 1000 / 5 // 5 FPS, more often than MAX_DELTA_TIME
          let intervalId = null;
          self.onmessage = e => {
            if (e.data === 'start' && !intervalId) {
              intervalId = setInterval(() => {
                self.postMessage(1);
              }, rate);
              console.log('[worker] tick started')
            }
            if (e.data === 'stop' && intervalId) {
              clearInterval(intervalId);
              intervalId = null;
              console.log('[worker] tick stopped')
            }
          }
        `
        const blob = new Blob([script], { type: 'application/javascript' })
        this.worker = new Worker(URL.createObjectURL(blob))
        this.worker.onmessage = () => {
          const time = performance.now()
          this.tick(time)
        }
      }
      // stop rAF
      this.graphics.renderer.setAnimationLoop(null)
      // tell the worker to start
      this.worker.postMessage('start')
    } else {
      // tell the worker to stop
      this.worker.postMessage('stop')
      // resume rAF
      this.graphics.renderer.setAnimationLoop(this.tick)
    }
  }

  destroy() {
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    this.graphics.renderer.setAnimationLoop(null)
    for (const system of this.systems) {
      system.destroy()
    }
    this.systems = []
    this.dead = true
  }
}
