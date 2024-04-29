import * as THREE from 'three'

import { System } from './System'

export class Graphics extends System {
  constructor(space) {
    super(space)
    this.viewport = space.viewport
  }

  async init() {
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(
      75,
      this.viewport.offsetWidth / this.viewport.offsetHeight,
      0.1,
      1000
    )
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(this.viewport.offsetWidth, this.viewport.offsetHeight)
    this.viewport.appendChild(this.renderer.domElement)
  }

  start() {
    // const geometry = new THREE.BoxGeometry(1, 1, 1)
    // const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 })
    // const cube = new THREE.Mesh(geometry, material)
    // this.scene.add(cube)
    this.camera.position.z = 10
  }

  update(delta) {
    this.render()
  }

  render() {
    this.renderer.render(this.scene, this.camera)
  }
}
