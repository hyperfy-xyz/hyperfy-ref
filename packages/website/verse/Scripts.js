import * as THREE from 'three'

import { DEG2RAD, RAD2DEG } from './extras/general'
import { QuaternionLerp } from './extras/QuaternionLerp'
import { Vector3Lerp } from './extras/Vector3Lerp'
import { num } from './extras/num'

import { System } from './System'

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
    this.scripts = new Map()
  }

  resolve(code) {
    let script = this.scripts.get(code)
    if (!script) {
      script = this.compartment.evaluate(code)
      this.scripts.set(code, script)
    }
    return script
  }
}
