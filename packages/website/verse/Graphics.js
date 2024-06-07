import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js'
import {
  computeBoundsTree,
  disposeBoundsTree,
  acceleratedRaycast,
} from 'three-mesh-bvh'
import { N8AOPass } from 'n8ao'

import { Layers } from './extras/Layers'

import { CSM } from './libs/csm/CSM'

import { System } from './System'

// three-mesh-bvh
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree
// THREE.Mesh.prototype.raycast = acceleratedRaycast

// THREE.Object3D.DEFAULT_MATRIX_AUTO_UPDATE = false
// THREE.Object3D.DEFAULT_MATRIX_WORLD_AUTO_UPDATE = false

// THREE.ColorManagement.enabled = true

const _identity = new THREE.Matrix4()
THREE.InstancedMesh.prototype.addFades = function () {
  const size = this.instanceMatrix.array.length / 16
  const fades = new Float32Array(size)
  // for (let i = 0; i < 10; i++) {
  //   fades[i] = Math.random() // Assign random fade values (for demonstration)
  // }
  const fadeAttr = new THREE.InstancedBufferAttribute(fades, 1)
  this.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  this.geometry.setAttribute('fade', fadeAttr)
}
THREE.InstancedMesh.prototype.resize = function (size) {
  const prevSize = this.instanceMatrix.array.length / 16
  if (size <= prevSize) return
  const array = new Float32Array(size * 16)
  array.set(this.instanceMatrix.array)
  this.instanceMatrix = new THREE.InstancedBufferAttribute(array, 16)
  this.instanceMatrix.needsUpdate = true
  // for (let i = prevSize; i < size; i++) {
  //   this.setMatrixAt(i, _identity)
  // }
  if (this.geometry.hasAttribute('fade')) {
    const fades = new Float32Array(size)
    fades.set(this.geometry.getAttribute('fade').array)
    const fadeAttr = new THREE.InstancedBufferAttribute(fades, 1)
    this.geometry.setAttribute('fade', fadeAttr)
  }
}

const v1 = new THREE.Vector3()
const vec2 = new THREE.Vector2()

const FOV = 70

export class Graphics extends System {
  constructor(world) {
    super(world)
  }

  async init() {
    this.width = 200
    this.height = 200
    this.aspect = this.width / this.height

    this.scene = new THREE.Scene()
    // this.scene.matrixAutoUpdate = false
    // this.scene.matrixWorldAutoUpdate = false
    this.camera = new THREE.PerspectiveCamera(FOV, this.aspect, 0.1, 20000)
    this.camera.layers.enableAll()
    this.renderer = new THREE.WebGLRenderer({
      // antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setSize(this.width, this.height)
    this.renderer.setClearColor(0xffffff, 0)
    this.renderer.setPixelRatio(1) // window.devicePixelRatio
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    // this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    // this.renderer.toneMappingExposure = 1
    // this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.csm = new CSM({
      mode: 'practical', // uniform, logarithmic, practical, custom
      // mode: 'custom',
      // customSplitsCallback: function (cascadeCount, nearDistance, farDistance) {
      //   return [0.05, 0.2, 0.5]
      // },
      maxFar: 100,
      fade: true,
      cascades: 3,
      shadowMapSize: 2048,
      // lightDirection: new THREE.Vector3(0, -1, 2).normalize(),
      camera: this.camera,
      parent: this.scene,
      lightNear: 0.1,
      lightFar: 500,
      // shadowBias: -0.00003,
      // shadowMapSize: 1024,
      // lightDirection: new THREE.Vector3(-1, -1, -1).normalize(),
      // lightIntensity: 2,
      // lightNear: 0.0000001,
      // lightFar: 5000,
      // lightMargin: 200,
      // camera: this.camera,
      // parent: this.scene,
    })
    this.csm.fade = true // must be set after!
    for (const light of this.csm.lights) {
      light.intensity = 1
      light.color.set(0xffffff)
    }
    this.sunPosition = new THREE.Vector3(200, 400, 200)
    this.csm.lightDirection
      .subVectors(v1.set(0, 0, 0), this.sunPosition)
      .normalize() // directional vector from sun position to location

    this.composer = new EffectComposer(this.renderer)
    this.aoPass = new N8AOPass(this.scene, this.camera, this.width, this.height)
    this.aoPass.configuration.aoRadius = 1
    this.aoPass.configuration.distanceFalloff = 1
    this.aoPass.configuration.intensity = 3
    this.composer.addPass(this.aoPass)
    this.aaPass = new SMAAPass()
    this.composer.addPass(this.aaPass)

    this.cameraRig = new THREE.Object3D()
    this.cameraRig.add(this.camera)
    this.scene.add(this.cameraRig)

    this.raycaster = new THREE.Raycaster()
    this.raycaster.firstHitOnly = true
    this.raycastHits = []

    this.maskNone = new THREE.Layers()
    this.maskNone.enableAll()
    this.maskMoving = new THREE.Layers()
    this.maskMoving.enableAll()
    this.maskMoving.disable(Layers.MOVING)

    window.THREE = THREE

    // hdr
    {
      const texture = await this.world.loader.load('/static/day2.hdr')
      // texture.colorSpace = THREE.SRGBColorSpace
      texture.mapping = THREE.EquirectangularReflectionMapping
      this.scene.environment = texture
    }

    // ground
    {
      const geometry = new THREE.BoxGeometry(1000, 1, 1000)
      geometry.computeBoundsTree()
      const material = new THREE.MeshStandardMaterial({ color: 'green' })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = 'ground'
      mesh.receiveShadow = true
      mesh.castShadow = true
      mesh.position.y = -0.5
      this.scene.add(mesh)
    }
  }

  start(viewport) {
    this.viewport = viewport
    // this.width = this.viewport.offsetWidth
    // this.height = this.viewport.offsetHeight
    // this.aspect = this.width / this.height
    this.resizer = new ResizeObserver(() => {
      this.resize(this.viewport.offsetWidth, this.viewport.offsetHeight)
    })
    this.resizer.observe(this.viewport)
    this.viewport.appendChild(this.renderer.domElement)
    this.resize(this.viewport.offsetWidth, this.viewport.offsetHeight)
  }

  resize(width, height) {
    this.width = width
    this.height = height
    this.aspect = this.width / this.height
    this.camera.aspect = this.aspect
    // if (this.aspect > PLANE_ASPECT_RATIO) {
    //   // improved portrait FOV
    //   // see: https://discourse.threejs.org/t/keeping-an-object-scaled-based-on-the-bounds-of-the-canvas-really-battling-to-explain-this-one/17574/10
    //   const cameraHeight = Math.tan(degToRad(FOV / 2))
    //   const ratio = this.camera.aspect / PLANE_ASPECT_RATIO
    //   const newCameraHeight = cameraHeight / ratio
    //   this.camera.fov = radToDeg(Math.atan(newCameraHeight)) * 2
    // } else {
    //   this.camera.fov = FOV
    // }
    this.camera.updateProjectionMatrix()
    this.csm.updateFrustums()
    this.renderer.setSize(this.width, this.height)
    this.composer.setSize(this.width, this.height)
    this.render()
  }

  // start() {
  //   // const geometry = new THREE.BoxGeometry(1, 1, 1)
  //   // const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  //   // const cube = new THREE.Mesh(geometry, material)
  //   // this.scene.add(cube)
  // }

  update(delta) {
    this.csm.update()
    this.render()
  }

  render() {
    this.composer.render()
    // this.renderer.render(this.scene, this.camera)
  }

  raycast(origin, direction, layers = this.maskNone, min = 0, max = Infinity) {
    this.raycaster.set(origin, direction)
    this.raycaster.layers = layers
    this.raycaster.near = min
    this.raycaster.far = max
    this.raycastHits.length = 0
    this.raycaster.intersectObjects(this.scene.children, true, this.raycastHits)
    return this.raycastHits
  }

  raycastViewport(coords, layers = this.maskNone, min = 0, max = Infinity) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    vec2.x = ((coords.x - rect.left) / rect.width) * 2 - 1
    vec2.y = -((coords.y - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(vec2, this.camera)
    this.raycaster.layers = layers
    this.raycaster.near = min
    this.raycaster.far = max
    this.raycastHits.length = 0
    this.raycaster.intersectObjects(this.scene.children, true, this.raycastHits)
    return this.raycastHits
  }

  destroy() {
    this.viewport.removeChild(this.renderer.domElement)
  }
}
