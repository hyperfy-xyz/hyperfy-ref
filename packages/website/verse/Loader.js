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
    if (type === 'vrm') {
      const promise = this.loadVRM(localUrl)
      this.results.set(url, promise)
    }
    if (type === 'emo') {
      const promise = this.loadEMO(localUrl)
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
    if (type === 'vrm') {
      // TODO: loader.load should just cache and return factories for everything like this
      // and if they need nodes, DIY
      const promise = this.loadVRM(url)
      this.results.set(url, promise)
      return promise
    }
    if (type === 'emo') {
      const promise = this.loadEMO(url)
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

  loadGLBRaw(url) {
    // hmmm
    return this.gltfLoader.loadAsync(url)
  }

  loadVRM(url) {
    return this.gltfLoader.loadAsync(url).then(glb => {
      return createVRMFactory(glb, this.world)
      // return vrmToNodes(glb, world)
    })
  }

  loadEMO(url) {
    return this.gltfLoader.loadAsync(url).then(glb => {
      return createEmoFactory(glb, url)
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

  loadTEX(url) {
    return this.texLoader.loadAsync(url)
  }

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
