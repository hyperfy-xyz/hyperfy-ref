import * as THREE from 'three'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { VOXLoader } from './extras/VoxLoader'
import { glbToNodes } from './extras/glbToNodes'

import { System } from './System'
import { voxToNodes } from './extras/voxToNodes'

// cache across loaders
THREE.Cache.enabled = true

export class Loader extends System {
  constructor(world) {
    super(world)
    this.results = new Map() // url -> promise
    this.rgbeLoader = new RGBELoader()
    this.gltfLoader = new GLTFLoader()
    this.voxLoader = new VOXLoader()
  }

  has(url) {
    return this.results.has(url)
  }

  set(url, type, file) {
    if (!type) {
      type = url.split('.').pop()
    }
    const localUrl = URL.createObjectURL(file)
    if (type === 'js') {
      const promise = this.loadJS(localUrl)
      this.results.set(url, promise)
    }
    if (type === 'glb') {
      const promise = this.loadGLB(localUrl)
      this.results.set(url, promise)
    }
    if (type === 'vox') {
      const promise = this.loadVOX(localUrl)
      this.results.set(url, promise)
    }
    if (type === 'hdr') {
      const promise = this.loadHDR(localUrl)
      this.results.set(url, promise)
    }
  }

  load(url, type) {
    if (this.results.get(url)) {
      return this.results.get(url)
    }
    if (!type) {
      type = url.split('.').pop()
    }
    if (type === 'js') {
      const promise = this.loadJS(url)
      this.results.set(url, promise)
      return promise
    }
    if (type === 'glb') {
      const promise = this.loadGLB(url)
      this.results.set(url, promise)
      return promise
    }
    if (type === 'vox') {
      const promise = this.loadVOX(url)
      this.results.set(url, promise)
      return promise
    }
    if (type === 'hdr') {
      const promise = this.loadHDR(url)
      this.results.set(url, promise)
      return promise
    }
  }

  async loadJS(url) {
    const resp = await fetch(url)
    const code = await resp.text()
    return this.world.scripts.resolve(code)
  }

  loadGLB(url) {
    return this.gltfLoader.loadAsync(url).then(glb => {
      return glbToNodes(glb, world)
    })
  }

  loadVOX(url) {
    return this.voxLoader.loadAsync(url).then(vox => {
      return voxToNodes(vox, world)
    })
  }

  loadHDR(url) {
    return this.rgbeLoader.loadAsync(url)
  }

  async uploadModel(file) {
    const form = new FormData()
    form.append('file', file)
    const url = `${process.env.PUBLIC_API_URL}/models`
    const resp = await fetch(url, {
      method: 'POST',
      body: form,
    })
    const data = await resp.json()
    return data.url
  }

  log(...args) {
    console.log('[loader]', ...args)
  }
}
