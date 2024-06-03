import * as THREE from 'three'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { System } from './System'

// cache across loaders
THREE.Cache.enabled = true

export class Loader extends System {
  constructor(world) {
    super(world)
    this.redirects = {}
    this.cache = new Map() // url -> promise
    this.rgbeLoader = new RGBELoader()
    this.gltfLoader = new GLTFLoader()
  }

  redirect(from, to, immutable) {
    if (immutable && this.redirects[from]) {
      return
    }
    this.redirects[from] = to
  }

  load(url, type) {
    if (this.redirects[url]) {
      url = this.redirects[url]
    }
    if (this.cache.get(url)) {
      return this.cache.get(url)
    }
    if (!type) {
      type = url.split('.').pop()
    }
    if (type === 'glb') {
      const promise = this.gltfLoader.loadAsync(url)
      this.cache.set(url, promise)
      return promise
    }
    if (type === 'hdr') {
      return this.rgbeLoader.loadAsync(url)
    }
  }

  log(...args) {
    console.log('[loader]', ...args)
  }
}
