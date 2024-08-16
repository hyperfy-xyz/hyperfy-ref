import * as THREE from 'three'

import { DEG2RAD, RAD2DEG } from './extras/general'
import { QuaternionLerp } from './extras/QuaternionLerp'
import { Vector3Lerp } from './extras/Vector3Lerp'
import { num } from './extras/num'
import { wrapRawCode } from './extras/wrapRawCode'

import { System } from './System'
import { Vector3Enhanced } from './extras/Vector3Enhanced'
import { clamp } from './extras/utils'
import { Layers } from './extras/Layers'

export class Scripts extends System {
  constructor(world) {
    super(world)
    this.compartment = new Compartment({
      console: {
        log: (...args) => console.log(...args),
        error: (...args) => console.error(...args),
        time: (...args) => console.time(...args),
        timeEnd: (...args) => console.timeEnd(...args),
      },
      eval: undefined,
      harden: undefined,
      lockdown: undefined,
      num: num,
      clamp: clamp,
      Layers,
      Object3D: THREE.Object3D,
      Quaternion: THREE.Quaternion,
      Vector3: Vector3Enhanced,
      Euler: THREE.Euler,
      Matrix4: THREE.Matrix4,
      Vector3Lerp: Vector3Lerp,
      QuaternionLerp: QuaternionLerp,
      DEG2RAD: DEG2RAD,
      RAD2DEG: RAD2DEG,
      // pause: () => this.world.pause(),
    })
    this.scripts = new Map()
    this.raw = new Map() // id -> String
  }

  evaluate(code) {
    return this.compartment.evaluate(code)
  }

  // resolve(code) {
  //   let script = this.scripts.get(code)
  //   if (!script) {
  //     script = this.compartment.evaluate(code)
  //     this.scripts.set(code, script)
  //   }
  //   return script
  // }

  async fetchRaw(id) {
    if (this.raw.has(id)) {
      return this.raw.get(id)
    }
    const url = `${process.env.PUBLIC_API_URL}/scripts/${id}/raw`
    const resp = await fetch(url)
    const raw = await resp.text()
    this.raw.set(id, raw)
    // TODO: evict from cache later, eg as size grows
    return raw
  }

  async upload(raw) {
    const compiled = wrapRawCode(raw) // todo: compile
    const url = `${process.env.PUBLIC_API_URL}/scripts`
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw, compiled }),
    })
    const { id } = await resp.json()
    // this.raw.set(id, raw)
    return id
  }
}
