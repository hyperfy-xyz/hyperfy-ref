import * as THREE from 'three'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'

import { System } from './System'

// cache across loaders
THREE.Cache.enabled = true

export class Loader extends System {
  constructor(world) {
    super(world)
    this.rgbeLoader = new RGBELoader()
  }

  load(url, type) {
    if (!type) type = url.split('.').pop()
    if (type === 'hdr') {
      return this.rgbeLoader.loadAsync(url)
    }
  }

  log(...args) {
    console.log('[loader]', ...args)
  }
}
