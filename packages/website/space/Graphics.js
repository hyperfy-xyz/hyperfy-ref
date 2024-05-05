import * as THREE from 'three'

import { System } from './System'
import { CSM } from './libs/csm/CSM'

// THREE.Object3D.DEFAULT_MATRIX_AUTO_UPDATE = false
// THREE.Object3D.DEFAULT_MATRIX_WORLD_AUTO_UPDATE = false

// THREE.ColorManagement.enabled = true

export class Graphics extends System {
  constructor(space) {
    super(space)
    this.viewport = space.viewport
  }

  async init() {
    this.scene = new THREE.Scene()
    // this.scene.matrixAutoUpdate = false
    // this.scene.matrixWorldAutoUpdate = false
    this.camera = new THREE.PerspectiveCamera(
      75,
      this.viewport.offsetWidth / this.viewport.offsetHeight,
      0.1,
      1000
    )
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(this.viewport.offsetWidth, this.viewport.offsetHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    // this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    // this.renderer.toneMappingExposure = 1
    // this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.viewport.appendChild(this.renderer.domElement)

    this.csm = new CSM({
      // mode: 'practical', // uniform, logarithmic, practical, custom
      mode: 'custom',
      customSplitsCallback: function (cascadeCount, nearDistance, farDistance) {
        return [0.05, 0.2, 0.5]
      },
      maxFar: 400,
      fade: true,
      cascades: 3,
      shadowMapSize: 2048,
      lightDirection: new THREE.Vector3(0, -1, 2).normalize(),
      camera: this.camera,
      parent: this.scene,
      lightNear: 0.1,
      lightFar: 1000,
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

    this.cameraRig = new THREE.Object3D()
    this.cameraRig.add(this.camera)
    this.scene.add(this.cameraRig)

    // hdr
    {
      const texture = await this.space.loader.load('/assets/sky.hdr')
      // texture.colorSpace = THREE.SRGBColorSpace
      texture.mapping = THREE.EquirectangularReflectionMapping
      this.scene.environment = texture
    }

    // ground
    {
      const geometry = new THREE.BoxGeometry(1000, 1, 1000)
      const material = new THREE.MeshStandardMaterial({ color: 'blue' })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.receiveShadow = true
      mesh.castShadow = true
      mesh.position.y = -0.5
      this.scene.add(mesh)
    }
  }

  start() {
    // const geometry = new THREE.BoxGeometry(1, 1, 1)
    // const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 })
    // const cube = new THREE.Mesh(geometry, material)
    // this.scene.add(cube)
  }

  update(delta) {
    this.csm.update()
    this.render()
  }

  render() {
    this.renderer.render(this.scene, this.camera)
  }
}
