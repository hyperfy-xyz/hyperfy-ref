import * as THREE from 'three'

import { Node } from './Node'

const v1 = new THREE.Vector3()

export class LOD extends Node {
  constructor(data = {}) {
    super(data)
    this.name = 'lod'
    this.isLod = true
    this.lods = [] // [...{ node, maxDistance }]
  }

  insert(node, maxDistance) {
    this.lods.push({ node, maxDistance })
    this.lods.sort((a, b) => a.maxDistance - b.maxDistance) // ascending
    node.setVisible(false)
    this.add(node)
  }

  mount() {
    this.ctx.world.lods.register(this)
    this.check()
  }

  check() {
    const cameraPos = this.ctx.world.graphics.cameraRig.position
    const itemPos = v1.set(this.matrixWorld.elements[12], this.matrixWorld.elements[13], this.matrixWorld.elements[14]) // prettier-ignore
    const distance = cameraPos.distanceTo(itemPos)
    const lod = this.lods.find(lod => distance <= lod.maxDistance)
    // console.log('check', this.lod, lod)
    if (this.lod === lod) return
    if (this.lod) {
      // console.log('remove lod', this.lod)
      this.lod.node.setVisible(false)
    }
    this.lod = lod
    if (this.lod) {
      // console.log('add lod', this.lod)
      this.lod.node.setVisible(true)
    }
  }

  unmount() {
    this.ctx.world.lods.unregister(this)
  }

  copy(source, recursive) {
    super.copy(source, recursive)
    this.lods = source.lods.map(lod => {
      return {
        node: this.children.find(node => node.id === lod.node.id),
        maxDistance: lod.maxDistance,
      }
    })
    return this
  }

  getProxy() {
    if (!this.proxy) {
      const proxy = {
        ...super.getProxy(),
      }
      this.proxy = proxy
    }
    return this.proxy
  }
}
