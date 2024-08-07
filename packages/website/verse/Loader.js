import * as THREE from 'three'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'

import { VRMLoaderPlugin as VRMLoader } from './libs/three-vrm'

import { VOXLoader } from './extras/VoxLoader'
import { glbToNodes } from './extras/glbToNodes'
import { voxToNodes } from './extras/voxToNodes'
import { vrmToNodes } from './extras/vrmToNodes'

import { System } from './System'
import { createEmoFactory } from './extras/createEmoFactory'
import { createVRMFactory } from './extras/createVRMFactory'

// cache across loaders
THREE.Cache.enabled = true

export class Loader extends System {
  constructor(world) {
    super(world)
    this.cache = new Map() // key -> value
    this.results = new Map() // url -> promise
    this.voxLoader = new VOXLoader()
    this.gltfLoader = new GLTFLoader()
    this.ktx2Loader = new KTX2Loader()
    this.dracoLoader = new DRACOLoader()
    this.gltfLoader.register(parser => new VRMLoader(parser))
    this.rgbeLoader = new RGBELoader()
    this.texLoader = new THREE.TextureLoader()
  }

  start() {
    this.ktx2Loader.setTranscoderPath('/static/basis/')
    this.ktx2Loader.detectSupport(this.world.graphics.renderer)
    this.dracoLoader.setDecoderPath('/static/draco/')
    this.dracoLoader.preload()
    this.gltfLoader.setKTX2Loader(this.ktx2Loader)
    this.gltfLoader.setDRACOLoader(this.dracoLoader)
  }

  loadScript(url) {
    const key = `script/${url}`
    if (this.cache.has(key)) {
      return this.cache.get(key)
    }
    const promise = new Promise(async (resolve, reject) => {
      const resp = await fetch(url)
      const code = await resp.text()
      const script = this.world.scripts.evaluate(code)
      resolve(script)
    })
    this.cache.set(key, promise)
    return promise
  }

  loadHDR(url) {
    const key = `hdr/${url}`
    if (this.cache.has(key)) {
      return this.cache.get(key)
    }
    const promise = this.rgbeLoader.loadAsync(url).then(texture => {
      return texture
    })
    this.cache.set(key, promise)
    return promise
  }

  loadTexture(url) {
    const key = `texture/${url}`
    if (this.cache.has(key)) {
      return this.cache.get(key)
    }
    const promise = this.texLoader.loadAsync(url).then(texture => {
      return texture
    })
    this.cache.set(key, promise)
    return promise
  }

  loadEmote(url) {
    const key = `emote/${url}`
    if (this.cache.has(key)) {
      return this.cache.get(key)
    }
    const promise = this.gltfLoader.loadAsync(url).then(glb => {
      const factory = createEmoFactory(glb, url)
      return factory
    })
    this.cache.set(key, promise)
    return promise
  }

  loadVRM(url) {
    const key = `vrm/${url}`
    if (this.cache.has(key)) {
      return this.cache.get(key)
    }
    const promise = this.gltfLoader.loadAsync(url).then(glb => {
      const factory = createVRMFactory(glb, this.world)
      const node = vrmToNodes(factory)
      return { node, factory }
    })
    this.cache.set(key, promise)
    return promise
  }

  setVRM(url, file) {
    const localUrl = URL.createObjectURL(file)
    const key = `vrm/${url}`
    const promise = this.gltfLoader.loadAsync(localUrl).then(glb => {
      const factory = createVRMFactory(glb, this.world)
      const node = vrmToNodes(factory)
      return { node, factory }
    })
    this.cache.set(key, promise)
    return promise
  }

  hasVRM(url) {
    const key = `vrm/${url}`
    return this.cache.has(key)
  }

  loadGLB(url) {
    const key = `glb/${url}`
    if (this.cache.has(key)) {
      return this.cache.get(key)
    }
    const promise = this.gltfLoader.loadAsync(url).then(raw => {
      const node = glbToNodes(raw, this.world)
      return { raw, node }
    })
    this.cache.set(key, promise)
    return promise
  }

  setGLB(url, file) {
    const localUrl = URL.createObjectURL(file)
    const key = `glb/${url}`
    const promise = this.gltfLoader.loadAsync(localUrl).then(raw => {
      const node = glbToNodes(raw, this.world)
      return { raw, node }
    })
    this.cache.set(key, promise)
  }

  hasGLB(url) {
    const key = `glb/${url}`
    return this.cache.has(key)
  }

  // loadVOX(url) {
  //   return this.voxLoader.loadAsync(url).then(vox => {
  //     return voxToNodes(vox, world)
  //   })
  // }

  async uploadAsset(file) {
    const form = new FormData()
    form.append('file', file)
    const url = `${process.env.PUBLIC_API_URL}/assets`
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
