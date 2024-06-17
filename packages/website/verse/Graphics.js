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
THREE.Mesh.prototype.raycast = acceleratedRaycast

// THREE.Object3D.DEFAULT_MATRIX_AUTO_UPDATE = false
// THREE.Object3D.DEFAULT_MATRIX_WORLD_AUTO_UPDATE = false

// THREE.ColorManagement.enabled = true

const _identity = new THREE.Matrix4()
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
    this.renderer.setPixelRatio(1)
    // this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    // this.renderer.toneMappingExposure = 1
    // this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy()

    this.csm = new CSM({
      mode: 'practical', // uniform, logarithmic, practical, custom
      // mode: 'custom',
      // customSplitsCallback: function (cascadeCount, nearDistance, farDistance) {
      //   return [0.05, 0.2, 0.5]
      // },
      cascades: 3,
      shadowMapSize: 2048,
      maxFar: 100,
      // lightDirection: new THREE.Vector3(0, -1, 2).normalize(),
      camera: this.camera,
      parent: this.scene,
      lightNear: 0.01,
      lightFar: 500,
      fade: true,
      // shadowBias: 0.0002,
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
    // old
    // this.aoPass.configuration.aoRadius = 1
    // this.aoPass.configuration.distanceFalloff = 1
    // this.aoPass.configuration.intensity = 3
    // new screenspace!
    this.aoPass.configuration.screenSpaceRadius = true
    this.aoPass.configuration.aoRadius = 64
    this.aoPass.configuration.distanceFalloff = 0.2
    this.aoPass.configuration.intensity = 3
    this.composer.addPass(this.aoPass)
    this.aaPass = new SMAAPass(1822, 1328)
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
  }

  start() {
    // hdr
    {
      this.world.loader.load('/static/day2.hdr').then(texture => {
        // texture.colorSpace = THREE.SRGBColorSpace
        texture.mapping = THREE.EquirectangularReflectionMapping
        this.scene.environment = texture
      })
    }

    // ground
    this.world.loader.loadGLBRaw('/static/ground.glb').then(glb => {
      const mesh = glb.scene.children[0]
      mesh.geometry.computeBoundsTree() // three-mesh-bvh
      mesh.geometry.computeBoundingBox()
      mesh.material.shadowSide = THREE.BackSide // fix csm shadow banding
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.matrixAutoUpdate = false
      mesh.matrixWorldAutoUpdate = false
      this.scene.add(mesh)
      const sItem = {
        matrix: mesh.matrixWorld,
        geometry: mesh.geometry,
        material: mesh.material,
        getEntity: null,
      }
      this.world.spatial.octree.insert(sItem)
    })

    // sky
    this.world.loader.loadTEX('/static/day2-2k.jpg').then(texture => {
      texture.minFilter = texture.magFilter = THREE.LinearFilter
      texture.mapping = THREE.EquirectangularReflectionMapping
      // texture.encoding = Encoding[this.encoding]
      texture.colorSpace = THREE.SRGBColorSpace

      const geometry = new THREE.SphereGeometry(1000, 60, 40)
      const material = new THREE.MeshBasicMaterial({ side: THREE.BackSide })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.geometry.computeBoundsTree()
      mesh.material.map = texture
      mesh.material.needsUpdate = true
      mesh.material.fog = false
      mesh.material.toneMapped = false
      mesh.matrixAutoUpdate = false
      mesh.matrixWorldAutoUpdate = false
      this.scene.add(mesh)
    })
  }

  mount(viewport) {
    this.viewport = viewport
    // this.width = this.viewport.offsetWidth
    // this.height = this.viewport.offsetHeight
    // this.aspect = this.width / this.height
    this.resizer = new ResizeObserver(() => {
      this.resize(this.viewport.offsetWidth, this.viewport.offsetHeight)
    })
    this.resizer.observe(this.viewport)
    this.viewport.appendChild(this.renderer.domElement)
    // this.resize(this.viewport.offsetWidth, this.viewport.offsetHeight)
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
    // console.time('regular')
    // this.raycastHits.length = 0
    // this.raycaster.intersectObjects(this.scene.children, true, this.raycastHits)
    // console.timeEnd('regular')
    this.raycastHits.length = 0
    console.time('spatial')
    this.world.spatial.octree.raycast(this.raycaster, this.raycastHits)
    console.timeEnd('spatial')
    // for (const hit of hits) {
    //   const box = new THREE.Box3Helper(hit.item.box, 'red') // Yellow color for the helper
    //   this.scene.add(box)
    // }
    // if (!this.foo) {
    //   this.foo = true
    //   const world = new THREE.Box3(
    //     new THREE.Vector3(-100, 0.01, -100),
    //     new THREE.Vector3(100, 200, 100)
    //   )
    //   const box = new THREE.Box3Helper(world, 'red')
    //   this.scene.add(box)
    // }

    return this.raycastHits
  }

  scaleUI(object3d, heightPx, pxToMeters) {
    const camera = this.camera
    const vFov = (camera.fov * Math.PI) / 180 // Convert vertical FOV from degrees to radians
    const screenHeight = this.height // Get the actual screen height in pixels
    const distance = object3d.position.distanceTo(
      v1.setFromMatrixPosition(camera.matrixWorld)
    ) // Calculate distance from camera to object
    const heightAtDistance = 2 * Math.tan(vFov / 2) * distance // Calculate the visible height at the distance of the object
    const worldUnitsPerPixel = heightAtDistance / screenHeight // Calculate world units per screen pixel vertically
    const desiredWorldHeight = heightPx * worldUnitsPerPixel // Desired world height for 'height' pixels
    const scale = desiredWorldHeight / (heightPx * pxToMeters) // Calculate the scaling factor based on the original height in meters
    object3d.scale.setScalar(scale)
  }

  destroy() {
    if (!this.viewport) return
    this.viewport.removeChild(this.renderer.domElement)
  }
}
