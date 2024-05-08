import * as THREE from 'three'
import EventEmitter from 'eventemitter3'
import Stats from 'stats-gl'

import { num } from '@/utils/num'

import { DEG2RAD, RAD2DEG } from '@/utils/general'
import { extendThreePhysX } from '@/utils/extendThreePhysX'
import { Vector3Lerp } from '@/utils/Vector3Lerp'
import { QuaternionLerp } from '@/utils/QuaternionLerp'

import { Permissions } from './Permissions'
import { Control } from './Control'
import { Loader } from './Loader'
import { Network } from './Network'
import { Physics } from './Physics'
import { Entities } from './Entities'
import { Graphics } from './Graphics'
import { Panels } from './Panels'

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
      num: num,
      Object3D: THREE.Object3D,
      Quaternion: THREE.Quaternion,
      Vector3: THREE.Vector3,
      Euler: THREE.Euler,
      Matrix4: THREE.Matrix4,
      Vector3Lerp: Vector3Lerp,
      QuaternionLerp: QuaternionLerp,
      DEG2RAD: DEG2RAD,
      RAD2DEG: RAD2DEG,
    })
    this.stats = new Stats({
      logsPerSecond: 20,
      samplesLog: 100,
      samplesGraph: 10,
      precision: 2,
      horizontal: true,
      minimal: false,
      mode: 0,
    })
    document.body.appendChild(this.stats.dom)
    this.panels = new Panels(this)
    this.permissions = new Permissions(this)
    this.control = new Control(this)
    this.loader = new Loader(this)
    this.network = new Network(this)
    this.physics = new Physics(this)
    this.entities = new Entities(this)
    this.graphics = new Graphics(this)
    this.time = 0
    this.fixedTime = 0
    this.frame = 0
    this.init()
  }

  async init() {
    // await this.panels.init()
    // await this.permissions.init()
    await this.control.init()
    await this.loader.init()
    await this.network.init()
    await this.physics.init()
    extendThreePhysX()
    await this.entities.init()
    await this.graphics.init()
    this.start()
  }

  start() {
    // this.panels.start()
    // this.permissions.start()
    this.control.start()
    this.loader.start()
    this.network.start()
    this.physics.start()
    this.entities.start()
    this.graphics.start()
    this.stats.init(this.graphics.renderer)
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
    // this.panels.update(delta)
    // this.permissions.update(delta)
    this.control.update(delta)
    this.loader.update(delta)
    this.network.update(delta)
    this.physics.update(delta)
    this.entities.update(delta)
    this.graphics.update(delta)
    this.stats.update()
  }

  fixedUpdate(delta) {
    this.fixedTime += delta
    while (this.fixedTime >= FIXED_TIMESTEP) {
      this.fixedTime -= FIXED_TIMESTEP
      // this.panels.fixedUpdate(FIXED_TIMESTEP)
      // this.permissions.fixedUpdate(FIXED_TIMESTEP)
      this.control.fixedUpdate(FIXED_TIMESTEP)
      this.loader.fixedUpdate(FIXED_TIMESTEP)
      this.network.fixedUpdate(FIXED_TIMESTEP)
      this.physics.fixedUpdate(FIXED_TIMESTEP)
      this.entities.fixedUpdate(FIXED_TIMESTEP)
      this.graphics.fixedUpdate(FIXED_TIMESTEP)
    }
  }

  lateUpdate(delta) {
    // this.panels.lateUpdate(delta)
    // this.permissions.lateUpdate(delta)
    this.control.lateUpdate(delta)
    this.loader.lateUpdate(delta)
    this.network.lateUpdate(delta)
    this.physics.lateUpdate(delta)
    this.entities.lateUpdate(delta)
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
    this.stop()
    this.panels.destroy()
    this.permissions.destroy()
    this.control.destroy()
    this.loader.destroy()
    this.network.destroy()
    this.physics.destroy()
    this.entities.destroy()
    this.graphics.destroy()
  }
}
