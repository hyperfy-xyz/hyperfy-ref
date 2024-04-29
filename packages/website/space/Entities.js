import * as THREE from 'three'

import { System } from './System'

export class Entities extends System {
  constructor(space) {
    super(space)
    this.entities = new Map()
    this.compartment = new Compartment({
      console: {
        log: harden(console.log),
        error: harden(console.error),
        time: harden(console.time),
        timeEnd: harden(console.timeEnd),
      },
      eval: undefined,
      harden: undefined,
      lockdown: undefined,
    })
  }

  start() {
    const env = this.compartment.evaluate(code)
    this.create = env({
      THREE,
      PHYSX,
      space: this.space,
    })
  }

  update(delta) {
    // this.entities.forEach(entity => {
    //   entity.update(delta)
    // })
  }

  add(data) {
    console.log('add', data)
    console.log(this.create)
    let entity
    try {
      entity = this.create(data)
    } catch (err) {
      console.error(err)
    }
    // const entity = new Entity(this.space).deserialize(data)
    this.entities.set(entity.id, entity)
    return entity
  }

  addLocal(data) {
    const entity = this.add(data)
    const delta = this.space.network.delta
    delta[data.id] = {
      type: 'add',
      data,
    }
    return entity
  }

  remove(id) {
    const entity = this.entities.get(id)
    entity.destroy() // todo: cleanup
    this.entities.delete(id)
  }

  removeLocal(id) {
    this.remove(id)
    const delta = this.space.network.delta
    delta[id] = {
      type: 'remove',
    }
  }

  log(...args) {
    console.log('[items]', ...args)
  }
}

const code = `
(function() {
  return ({ THREE, PHYSX, space }) => {

    class Entity {
      constructor(data) {
        this.id = data.id
        this.type = data.type
        this.authority = data.authority
        this.root = new Node(this)
        this.root.position.fromArray(data.position)
        this.root.rotation.fromArray(data.rotation)
        this.root.mounted = true
        attachNodes(this, this.root, data.nodes)
      }
    }

    function attachNodes(entity, parent, nodes) {
      for (const data of nodes) {
        const Type = Types[data.type || 'node']
        const node = new Type(entity, data)
        parent.add(node)
        attachNodes(entity, node, data.children)
      }
    }

    let ids = 0

    class Node {
      constructor(entity, data) {
        this.entity = entity
        this.id = ++ids
        this.parent = null
        this.children = []
        this.position = new THREE.Vector3()
        this.quaternion = new THREE.Quaternion()
        this.scale = new THREE.Vector3(1, 1, 1)
        this.matrix = new THREE.Matrix4()
        this.matrixWorld = new THREE.Matrix4()
        this.mounted = false
        this.isDirty = true
      }
      add(node) {
        if (node.parent) {
          node.removeFromParent()
        }
        node.parent = this
        this.children.push(this)
        if (this.mounted) {
          node.project()
          node.traverse(node => {
            node.mounted = true
            node.mount()
          })
        }
        return this
      }
      remove(node) {
        const idx = this.children.indexOf(node)
        if (idx === -1) return
        node.traverse(node => {
          node.mounted = false
          node.unmount()
        })
        node.parent = null
        this.children.splice(idx, 1)
        return this
      }
      removeFromParent() {
        if (!this.parent) return
        this.parent.remove(this)
        return this
      }
      mount() {
        // ...
      }
      unmount() {
        // ...
      }
      project() {
        if (this.isDirty) {
          this.matrix.compose(this.position, this.quaternion, this.scale)
          this.isDirty = false
        }
        if (!this.parent) {
          this.matrixWorld.copy(this.matrix)
        } else {
          this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix)
        }
        const children = this.children
        for (let i = 0, l = children.length; i < l; i++) {
          children[i].project()
        }
      }
      traverse(callback) {
        callback(this)
        const children = this.children
        for (let i = 0, l = children.length; i < l; i++) {
          children[i].traverse(callback)
        }
      }
    }

    class Script extends Node {
      constructor(entity, data) {
        super(entity, data)
        this.code = data.code
      }
      mount() {
        // this.entity.registerScript(this)
        console.log('script mount', this.entity)
      }
    }

    const Types = {
      script: Script,
      node: Node,
    }

    return function create(data) {
      return new Entity(data)
    }
  }
})()
`

const foo = `

    function Node() {
      let localPosition = new THREE.Vector3()
      let localMatrix = new THREE.Matrix4()
      let worldPosition = new THREE.Vector3()
      let worldMatrix = new THREE.Matrix4()
      let localDirty = false
      let worldDirty = false
      let localUpdate = () => {
        // ...
        localDirty = false
      }
      let worldUpdate = () => {
        // ...
        worldDirty = false
      }
      const node = {
        mounted: false,
        parent: null,
        children: [],
        add(node) {
          if (node.parent) {
            node.removeFromParent()
          }
          node.parent = this
          this.children.push(this)
          if (this.mounted) {
            node.project()
            node.traverse(node => {
              node.mounted = true
              node.mount()
            })
          }
          return this
        },
        
        position: {
          get x() {
            if (localDirty) localUpdate()
            return localPosition.x
          },
          set x(val) {
            localPosition.x = val
            worldDirty = true
          }
        },
        worldPosition: {
          get x() {
            if (worldDirty) worldUpdate()
            return worldPosition.x
          },
          set x(val) {
            worldPosition.x = val
            localDirty = true
          }
        }
      }
      return node
    }




    class Entity {
      constructor(data) {
        // ...
        this.node = new Node()
        this.nodes = new Map()
        this.virtual = VEntity(this)
      }
      create(data) {
        const node = new Node(data)
        this.nodes.set(node.id, node)
        return node
      }
      add(node) {
        this.node.add(node)
      }
      remove(node) {
        this.node.remove(node)
      }
      getById(id) {
        return this.nodes.get(id)
      }
    }
    function VEntity(entity) {
      return {
        create(data) {
          const node = entity.create(data)
          return node.virtual
        },
        add(vNode) {
          const node = entity.getById(vNode.id)
          entity.add(node)
          return this
        }
        remove(vNode) {
          const node = entity.getById(vNode.id)
          entity.remove(node)
          return this
        }
      }
    }

    class Node {
      constructor(data) {
        this.children = []
        this.virtual = VNode(this)
      }
      add(node) {
        this.children.push(node)
      }
      remove(node) {
        const idx= this.children.indexOf(node)
        if (idx === -1) return
        this.children.splice(idx, 1)
      }
    }
    function VNode(node) {
      return {
        position: VVector3(node.position),
        add(vNode) {
          const child = node.entity.getById(vNode.id)
          node.add(child)
          return this
        },
        remove(vNode) {
          const child = node.entity.getById(vNode.id)
          node.remove(child)
          return this
        }
      }
    }


    let ids
    class Node {
      constructor() {
        this.id = ++ids

      }
    }


    function Box({ position, size }) {

      const box = space.createBox({ position, size })
      return {

      }
    }



    let ids = 0

    class Node {
      constructor(data) {
        this.id = ++ids
        this.position = new THREE.Vector3()
        this.rotation = new THREE.Euler()
        this.quaternion = new THREE.Quaternion()
        this.scale = new THREE.Vector3(1, 1, 1)
        this.matrix = new THREE.Matrix4()
        this.matrixWorld = new THREE.Matrix4()
        this.parent = null
        this.children = []
        this.mounted = false
        this.isDirty = true
        // this.proxy = INode(this)
      }
      add(node) {
        if (node.parent) {
          node.removeFromParent()
        }
        node.parent = this
        this.children.push(this)
        if (this.mounted) {
          node.project()
          node.traverse(node => {
            node.mounted = true
            node.mount()
          })
        }
        return this
      }
      remove(node) {
        const idx = this.children.indexOf(node)
        if (idx === -1) return
        node.traverse(node => {
          node.mounted = false
          node.unmount()
        })
        node.parent = null
        this.children.splice(idx, 1)
        return this
      }
      removeFromParent() {
        if (!this.parent) return
        this.parent.remove(this)
        return this
      }
      dirty() {
        this.isDirty = true
        space.nodes.setDirty(this)
        return this
      }
      project() {
        if (this.isDirty) {
          this.matrix.compose(this.position, this.quaternion, this.scale)
          this.isDirty = false
        }
        if (!this.parent) {
          this.matrixWorld.copy(this.matrix)
        } else {
          this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix)
        }
        const children = this.children
        for (let i = 0, l = children.length; i < l; i++) {
          children[i].project()
        }
      }
      mount() {
        /**
         * This is called immediately when the element is attached to the worlds hierarchy.
         * Transforms are already updated.
         */
      }
      unmount() {
        /**
         * This is called immediately when the element is detached from the worlds hierarchy.
         */
      }
      update() {
        /**
         * This is called once per frame, only if the element has moved.
         */
      }
      traverse(callback) {
        callback(this)
        const children = this.children
        for (let i = 0, l = children.length; i < l; i++) {
          children[i].traverse(callback)
        }
      }
    }

    function INode(node) {
      return {

      }
    }

    class Box extends Node {
      constructor({ size }) {
        this.size = size
        this.idx = null
        this.proxy = IBox(this)
      }
      mount() {
        this.idx = space.boxes
      }
    }

    function IBox(box) {
      return {
        ...INode(box),
        setSize(x,y,z) {
          // ...
        }
      }
    }



    function INode(node) {
      return {
        add(iChild) {
          const child = node.entity.getNodeById(iChild.id)
          node.add(child)
        }
      }
    }

    class Box extends Node {
      constructor(entity, data) {
        super(entity, data)
      }
    }


    class Entity {
      constructor() {
        this.nodes = new Map()
        this.root = new Node(this)
        this.proxy = IEntity(this)
      }
      create(data) {
        const node = new Node(this, data)
        this.nodes.set(node.id, node)
        return node
      }
      add(node) {
        this.root.add(node)
      }
    }

    function IEntity(entity) {
      return {
        create(data) {
          const node = entity.create(data)
          return node.proxy
        }
        add(iNode) {
          const node = entity.nodes.get(iNode.id)
          entity.add(node)
        }
      }
    }

    


    function Entity(data) {
      const group = new THREE.Group()

      return {
        create(data) {
          const node = Node()
        }
      }
    }

    function EntityProxy(entity) {
      return {
        add(nodeProxy) {

        }
      }
    }



    const Nodes = {
      box: Box,
    }
    function Box(entity, data) {
      const geometry = new THREE.BoxGeometry(1,1,1)
      const material = new THREE.MeshBasicMaterial({ color: 'red' })
      const mesh = new THREE.Mesh(geometry, material)
      const add = node => {

      }
      const position = new Vector3()
      const quaternion = new Quaternion()
      return {
        add,
        position,
        quaternion,
      }
    }
    function Entity(data) {
      const entity = {
        // ...
      }
      return {
        create(data) {
          const Node = Nodes[data.type]
          const node = Node(entity, data)
          return node
        },
        add(iNode) {
          const node = entity.nodes.get(iNode.id)

        }
      }
    }


  }

  function Box(space, entity, data) {

    const position = new Vector3()
    const quaternion = new Quaternion()
    return {
      position,
      quaternion,
    }
  }

  const Nodes = {
    box: Box,
  }

  function createEntity(space, data) {
    const entity = {
      // ...
    }
    const create = data => {
      const Node = Nodes[data.type]
      const node = Node(entity, data)
      return node
    }
    return {
      create
    }
  }



  function createEntityInterface(entity) {
    const create = data => {
      const node = entity.create(data)
      return createNodeInterface(node)
    }
    return {
      create
    }
  }
  function createNodeInterface(node) {
    return {

    }
  }

  return {
    createEntityInterface(entity) {
      const create = data => {
        const node = entity.create(data)
        return 
      }
      return {
        create
      }
    }
  }


  const createNode = (data => {

  }
  class Entity {
    constructor(space) {
      this.space = space
      this.api = createEntityAPI(this)
    }

    fromData(data) {
      this.id = data.id
      this.type = data.type
      this.authority = data.authority
      // this.position = new Vector3()
      // this.quaternion = new Quaternion()
      this.state = data.state
      this.nodes = new Node(this, null, { children: data.nodes })
      this.mode = data.mode
      if (this.mode === 'active') {
        this.nodes.traverse(node => node.start())
      }
      return this
    }
  }
  function creatEntityAPI(entity) {
    return {
      create(data) {
        const NodeType = 
      }
    }
  }
  return space => {
    return function create(data) {
      return new Entity(space).fromData(data)
    }
  }



  function createEntityAPI(entity) {
    const create = data => {
      const node = entity.create(data)
      return node.api
    }
    return {
      create
    }
  }

  class Node {
    constructor() {
      this.api = createNodeAPI(this)
    }
  }

  class Entity {
    constructor(space) {
      this.space = space
      this.api = createEntityAPI(this)
    }
    fromData(data) {
      this.id = data.id
      this.type = data.type
    }
    create(data) {
      const node = new Node(this)
      return node
    }
  }
})()
`
