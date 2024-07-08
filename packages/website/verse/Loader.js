import * as THREE from 'three'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'

import { VRMLoaderPlugin as VRMLoader } from './libs/three-vrm.js'

import { getRandomColorHex } from './extras/utils'
import { VOXLoader } from './extras/VoxLoader'
import { glbToNodes } from './extras/glbToNodes'
import { voxToNodes } from './extras/voxToNodes'
import { vrmToNodes } from './extras/vrmToNodes'

import { System } from './System'
import { createEmoFactory } from './extras/createEmoFactory'

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
    console.log('loadGLB', url)
    if (url.startsWith('tmp/')) {
      return new Promise(async resolve => {
        function canvasToPNG(canvas) {
          return new Promise((resolve) => {
            canvas.toBlob((blob) => {
              const url = URL.createObjectURL(blob);
              resolve(url);
            }, 'image/png');
          });
        }
        async function createTexture() {
          const size = 512
          const color = getRandomColorHex()

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          canvas.width = size;
          canvas.height = size;
          
          const cellSize = size / 10;
          
          for (let i = 0; i < 10; i++) {
            for (let j = 0; j < 10; j++) {
              ctx.fillStyle = (i + j) % 2 === 0 ? color : 'black';
              ctx.fillRect(i * cellSize, j * cellSize, cellSize, cellSize);
            }
          }

          const pngUrl = await canvasToPNG(canvas);

          const loader = new THREE.TextureLoader();
          const texture = await loader.loadAsync(pngUrl)
          URL.revokeObjectURL(pngUrl); // Clean up the object URL
          
          return texture;
        }
        const scene = new THREE.Scene()
        scene.name = 'Scene'
        const geometry = new THREE.TorusKnotGeometry( 10, 3, 50, 16 ); 
        const texture = await createTexture()
        const material = new THREE.MeshStandardMaterial( { map: texture } ); 
        const mesh = new THREE.Mesh( geometry, material ); 
        mesh.scale.setScalar(0.1)
        mesh.name = 'Torus'
        scene.add(mesh)
        const nodes = glbToNodes({ scene }, this.world)
        setTimeout(() => resolve(nodes), 100)

      })
    }
    return this.gltfLoader.loadAsync(url).then(glb => {
      return glbToNodes(glb, this.world)
    })
  }

  loadGLBRaw(url) {
    // hmmm
    return this.gltfLoader.loadAsync(url)
  }

  loadVRM(url) {
    return this.gltfLoader.loadAsync(url).then(vrm => {
      return vrmToNodes(vrm, this.world)
    })
  }

  loadEMO(url) {
    return this.gltfLoader.loadAsync(url).then(glb => {
      return createEmoFactory(glb)
    })
  }

  loadVOX(url) {
    return this.voxLoader.loadAsync(url).then(vox => {
      return voxToNodes(vox, this.world)
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
