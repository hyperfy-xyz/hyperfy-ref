import * as THREE from 'three'

const _mesh = new THREE.Mesh()
const _itemIntersects = []

const v1 = new THREE.Vector3()
const v2 = new THREE.Vector3()

class OctreeNode {
  constructor(octree, box, maxItems) {
    this.octree = octree
    this.box = box
    this.maxItems = maxItems
    this.items = []
    this.nodes = []

    if (this.octree.debug) {
      const helper = new THREE.Box3Helper(this.box, 'red')
      this.octree.scene.add(helper)
    }
  }

  subdivide() {
    const size = v1.set(
      (this.box.max.x - this.box.min.x) / 2,
      (this.box.max.y - this.box.min.y) / 2,
      (this.box.max.z - this.box.min.z) / 2
    )
    for (let x = 0; x < 2; x++) {
      for (let y = 0; y < 2; y++) {
        for (let z = 0; z < 2; z++) {
          const min = this.box.min.clone().add(v2.set(x, y, z).multiply(size)) // prettier-ignore
          const max = this.box.min.clone().add(v2.set(x + 1, y + 1, z + 1).multiply(size)) // prettier-ignore
          const box = new THREE.Box3(min, max)
          const node = new OctreeNode(this.octree, box, this.maxItems)
          this.nodes.push(node)
        }
      }
    }
  }

  insert(item) {
    if (!this.box.intersectsBox(item.box)) {
      return false
    }

    if (this.items.length < this.maxItems) {
      this.items.push(item)
      return true
    }

    if (!this.nodes.length) {
      this.subdivide()
    }

    let added = false
    for (const child of this.nodes) {
      if (child.insert(item)) {
        added = true
      }
    }

    if (!added) {
      this.items.push(item)
    }

    return true
  }

  move(item) {
    this.remove(item)
    return this.insert(item)
  }

  remove(item) {
    const index = this.items.indexOf(item)
    if (index !== -1) {
      this.items.splice(index, 1)
      return true
    }

    let removed = false
    for (const child of this.nodes) {
      if (child.remove(item)) {
        removed = true
      }
    }

    return removed
  }

  raycast(raycaster, intersects) {
    if (!raycaster.ray.intersectsBox(this.box)) {
      return intersects
    }

    for (const item of this.items) {
      if (raycaster.ray.intersectsBox(item.box)) {
        _mesh.geometry = item.geometry
        _mesh.material = item.material
        _mesh.matrixWorld = item.matrix
        _mesh.raycast(raycaster, _itemIntersects)
        for (let i = 0, l = _itemIntersects.length; i < l; i++) {
          const intersect = _itemIntersects[i]
          intersect.getEntity = item.getEntity
          intersects.push(intersect)
        }
        _itemIntersects.length = 0
      }
    }

    for (const child of this.nodes) {
      child.raycast(raycaster, intersects)
    }

    return intersects
  }
}

export class Octree {
  constructor({ scene, debug, box, maxItems }) {
    this.scene = scene
    this.debug = debug
    this.root = new OctreeNode(this, box, maxItems)
  }

  insert(item) {
    if (!item.box) item.box = new THREE.Box3()
    item.box.copy(item.geometry.boundingBox).applyMatrix4(item.matrix)
    return this.root.insert(item)
  }

  move(item) {
    // console.time('octreeMove')
    this.root.move(item)
    // console.timeEnd('octreeMove')
  }

  remove(item) {
    return this.root.remove(item)
  }

  raycast(raycaster, intersects = []) {
    this.root.raycast(raycaster, intersects)
    intersects.sort(ascSort)
    // console.log('octree intersects', intersects)
    return intersects
  }
}

function ascSort(a, b) {
  return a.distance - b.distance
}
