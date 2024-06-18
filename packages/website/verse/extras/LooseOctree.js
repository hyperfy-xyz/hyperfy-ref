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

  setHelper(enabled) {
    if (enabled && !this.helper) {
      this.helper = createHelper(this)
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
    this.octree.helper?.insert(this)
  }

  insert(item) {
    if (this.size < item.sphere.radius) {
      return false
    }
    if (!this.inner.containsPoint(item.sphere.center)) {
      return false
    }
    if (!this.children.length) {
      this.subdivide()
    }
    for (const child of this.children) {
      if (child.insert(item)) {
        return true
      }
    }
    this.items.push(item)
    item._node = this
    return true
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
  // iMatrix.setUsage(THREE.DynamicDrawUsage)
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
      console.log(shader.vertexShader)
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

  function insert(node) {
    const idx = mesh.geometry.instanceCount
    mesh.geometry.instanceCount++
    const position = _v1.copy(node.center)
    const quaternion = _q1.set(0, 0, 0, 1)
    const scale = _v2.setScalar(node.size * 2)
    const matrix = _m1.compose(position, quaternion, scale)
    iMatrix.set(matrix.elements, idx * 16)
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
  traverse(octree.root, node => {
    insert(node)
  })
  octree.scene.add(mesh)
  return {
    insert,
    destroy,
  }
}
