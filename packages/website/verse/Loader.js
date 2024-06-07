import * as THREE from 'three'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { VOXLoader } from './extras/VoxLoader'
import { glbToNodes } from './extras/glbToNodes'

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
    this.voxLoader = new VOXLoader()
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
      return this.loadGLB(url)
    }
    if (type === 'vox') {
      return this.loadVOX(url)
    }
    if (type === 'hdr') {
      return this.loadHDR(url)
    }
  }

  loadGLB(url) {
    const promise = this.gltfLoader.loadAsync(url).then(glb => {
      return glbToNodes(glb, world)
    })
    this.cache.set(url, promise)
    return promise
  }

  loadVOX(url) {
    const promise = this.voxLoader.loadAsync(url).then(vox => {
      console.error('TODO: voxToNodes')
      return new VOXModel(vox)
    })
    this.cache.set(url, promise)
    return promise
  }

  loadHDR(url) {
    return this.rgbeLoader.loadAsync(url)
  }

  log(...args) {
    console.log('[loader]', ...args)
  }
}
