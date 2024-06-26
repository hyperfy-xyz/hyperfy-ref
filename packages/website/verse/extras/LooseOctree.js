import * as THREE from 'three'

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _q1 = new THREE.Quaternion()
const _m1 = new THREE.Matrix4()
const _intersects = []
const _mesh = new THREE.Mesh()

export class LooseOctree {
  constructor({ scene, debug, center, size }) {
    this.scene = scene
    this.debug = debug
    this.root = new LooseOctreeNode(this, center, size, 0)
    this.helper = null
    this.totalDepth = 0
    this.totalNodes = 0
  }

  insert(item) {
    if (!item.sphere) item.sphere = new THREE.Sphere()
    if (!item.geometry.boundingSphere) item.geometry.computeBoundingSphere()
    item.sphere.copy(item.geometry.boundingSphere).applyMatrix4(item.matrix)
    this.root.insert(item)
  }

  move(item) {
    // TODO: we can do some magic to only re-insert if it goes outside its current node
    this.remove(item)
    this.insert(item)
  }

  remove(item) {
    item._node.remove(item)
  }

  raycast(raycaster, intersects = []) {
    this.root.raycast(raycaster, intersects)
    intersects.sort(sortAscending)
    // console.log('octree.raycast', intersects)
    return intersects
  }

  // spherecast(sphere, intersects = []) {
  //   // console.time('spherecast')
  //   this.root.spherecast(sphere, intersects)
  //   intersects.sort(sortAscending)
  //   // console.timeEnd('spherecast')
  //   // console.log('octree.spherecast', intersects)
  //   return intersects
  // }

  prune() {
    console.time('prune')
    this.pruneCount = 0
    this.root.prune()
    console.timeEnd('prune')
    console.log('pruned:', this.pruneCount)
  }

  setHelper(enabled) {
    if (enabled && !this.helper) {
      this.helper = createHelper(this)
      this.helper.init()
    }
    if (!enabled && this.helper) {
      this.helper.destroy()
      this.helper = null
    }
  }
}

class LooseOctreeNode {
  constructor(octree, center, size, depth) {
    this.octree = octree
    this.center = center
    this.size = size
    this.depth = depth
    this.inner = new THREE.Box3(
      new THREE.Vector3(center.x - size, center.y - size, center.z - size),
      new THREE.Vector3(center.x + size, center.y + size, center.z + size)
    )
    this.outer = new THREE.Box3(
      new THREE.Vector3(center.x - size * 2, center.y - size * 2, center.z - size * 2), // prettier-ignore
      new THREE.Vector3(center.x + size * 2, center.y + size * 2, center.z + size * 2) // prettier-ignore
    )
    this.items = []
    this.children = []
    this.mountHelper()
    if (octree.totalDepth < depth) {
      octree.totalDepth = depth
    }
    octree.totalNodes++
  }

  insert(item) {
    if (this.size < item.sphere.radius) {
      return false
    }
    if (!this.inner.containsPoint(item.sphere.center)) {
      return false
    }
    if (this.size / 2 < item.sphere.radius) {
      this.items.push(item)
      item._node = this
      return true
    }
    if (!this.children.length) {
      this.subdivide()
    }
    for (const child of this.children) {
      if (child.insert(item)) {
        return true
      }
    }
    // this should never happen
    console.error('octree insert fail')
    // this.items.push(item)
    // item._node = this
    // return true
  }

  remove(item) {
    const idx = this.items.indexOf(item)
    this.items.splice(idx, 1)
    item._node = null
  }

  subdivide() {
    if (this.children.length) return // Ensure we don't subdivide twice
    const halfSize = this.size / 2
    for (let x = 0; x < 2; x++) {
      for (let y = 0; y < 2; y++) {
        for (let z = 0; z < 2; z++) {
          const center = new THREE.Vector3(
            this.center.x + halfSize * (2 * x - 1),
            this.center.y + halfSize * (2 * y - 1),
            this.center.z + halfSize * (2 * z - 1)
          )
          const child = new LooseOctreeNode(
            this.octree,
            center,
            halfSize,
            this.depth + 1
          )
          this.children.push(child)
        }
      }
    }
  }

  raycast(raycaster, intersects) {
    if (!raycaster.ray.intersectsBox(this.outer)) {
      return intersects
    }
    for (const item of this.items) {
      if (raycaster.ray.intersectsSphere(item.sphere)) {
        _mesh.geometry = item.geometry
        _mesh.material = item.material
        _mesh.matrixWorld = item.matrix
        _mesh.raycast(raycaster, _intersects)
        for (let i = 0, l = _intersects.length; i < l; i++) {
          const intersect = _intersects[i]
          intersect.getEntity = item.getEntity
          intersects.push(intersect)
        }
        _intersects.length = 0
      }
    }
    for (const child of this.children) {
      child.raycast(raycaster, intersects)
    }
    return intersects
  }

  // spherecast(sphere, intersects) {
  //   if (!sphere.intersectsBox(this.outer)) {
  //     return intersects
  //   }
  //   for (const item of this.items) {
  //     if (sphere.intersectsSphere(item.sphere)) {
  //       // just sphere-to-sphere is good enough for now
  //       const centerToCenterDistance = sphere.center.distanceTo(
  //         item.sphere.center
  //       )
  //       const overlapDistance =
  //         item.sphere.radius + sphere.radius - centerToCenterDistance
  //       const distance = Math.max(0, overlapDistance)
  //       const intersect = {
  //         distance: distance,
  //         point: null,
  //         object: null,
  //         getEntity: item.getEntity,
  //       }
  //       intersects.push(intersect)
  //       // _mesh.geometry = item.geometry
  //       // _mesh.material = item.material
  //       // _mesh.matrixWorld = item.matrix
  //       // _mesh.raycast(raycaster, _intersects)
  //       // for (let i = 0, l = _intersects.length; i < l; i++) {
  //       //   const intersect = _intersects[i]
  //       //   intersect.getEntity = item.getEntity
  //       //   intersects.push(intersect)
  //       // }
  //       // _intersects.length = 0
  //     }
  //   }
  //   for (const child of this.children) {
  //     child.spherecast(sphere, intersects)
  //   }
  //   return intersects
  // }

  prune() {
    let empty = true
    for (const child of this.children) {
      const canPrune = !child.items.length && child.prune()
      if (!canPrune) {
        empty = false
      }
    }
    if (empty) {
      for (const child of this.children) {
        this.octree.helper?.remove(child)
      }
      this.children.length = 0
      this.octree.pruneCount++
    }
    return empty
  }

  mountHelper() {
    this.octree.helper?.insert(this)
  }

  unmountHelper() {
    this.octree.helper?.remove(this)
  }
}

function sortAscending(a, b) {
  return a.distance - b.distance
}

// function getRandomHexColor() {
//   // Generate a random integer between 0 and 0xFFFFFF (16777215 in decimal)
//   const randomInt = Math.floor(Math.random() * 16777216);
//   // Convert the integer to a hexadecimal string and pad with leading zeros if necessary
//   const hexColor = randomInt.toString(16).padStart(6, '0');
//   // Prefix with '#' to form a valid hex color code
//   return '#' + hexColor;
// }

function createHelper(octree) {
  const boxes = new THREE.BoxGeometry(1, 1, 1)
  const edges = new THREE.EdgesGeometry(boxes)
  const geometry = new THREE.InstancedBufferGeometry().copy(edges)
  const iMatrix = new THREE.InstancedBufferAttribute(
    new Float32Array(100000 * 16),
    16
  )
  iMatrix.setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('iMatrix', iMatrix)
  const offset = new THREE.InstancedBufferAttribute(
    new Float32Array(100000 * 3),
    3
  )
  geometry.setAttribute('offset', offset)
  const scale = new THREE.InstancedBufferAttribute(
    new Float32Array(100000 * 3),
    3
  )
  geometry.setAttribute('scale', scale)
  geometry.instanceCount = 0
  const material = new THREE.LineBasicMaterial({
    color: 'red',
    onBeforeCompile: shader => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `
        attribute mat4 iMatrix;
        #include <common>
        `
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        transformed = (iMatrix * vec4(position, 1.0)).xyz;
        `
      )
    },
  })
  const mesh = new THREE.LineSegments(geometry, material)
  mesh.frustumCulled = false
  const items = []
  function insert(node) {
    const idx = mesh.geometry.instanceCount
    mesh.geometry.instanceCount++
    const position = _v1.copy(node.center)
    const quaternion = _q1.set(0, 0, 0, 1)
    const scale = _v2.setScalar(node.size * 2)
    const matrix = new THREE.Matrix4().compose(position, quaternion, scale)
    iMatrix.set(matrix.elements, idx * 16)
    iMatrix.needsUpdate = true
    node._helperItem = { idx, matrix }
    items.push(node._helperItem)
  }
  function remove(node) {
    const item = node._helperItem
    const last = items[items.length - 1]
    const isOnly = items.length === 1
    const isLast = item === last
    if (isOnly) {
      items.length = 0
      mesh.geometry.instanceCount = 0
    } else if (isLast) {
      items.pop()
      mesh.geometry.instanceCount--
    } else {
      iMatrix.set(last.matrix.elements, item.idx * 16)
      last.idx = item.idx
      items[item.idx] = last
      items.pop()
      mesh.geometry.instanceCount--
    }
    iMatrix.needsUpdate = true
  }
  function traverse(node, callback) {
    callback(node)
    for (const child of node.children) {
      traverse(child, callback)
    }
  }
  function destroy() {
    octree.scene.remove(mesh)
  }
  function init() {
    traverse(octree.root, node => {
      node.mountHelper()
    })
  }
  octree.scene.add(mesh)
  return {
    init,
    insert,
    remove,
    destroy,
  }
}