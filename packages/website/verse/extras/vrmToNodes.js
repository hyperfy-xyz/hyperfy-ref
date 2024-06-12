import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'
import * as THREE from 'three'

import * as Nodes from '../nodes'

import { DEG2RAD } from './general'

const v1 = new THREE.Vector3()
const v2 = new THREE.Vector3()

const DIST_CHECK_RATE = 1 // once every second
const DIST_MIN_RATE = 1 / 5 // 3 times per second
const DIST_MAX_RATE = 1 / 25 // 25 times per second
const DIST_MIN = 10 // <= 10m = min rate
const DIST_MAX = 30 // >= 30m = max rate

export function vrmToNodes(glb, world) {
  const nodes = new Map()
  function createNode(data) {
    if (nodes.has(data.name)) {
      console.error('node name already exists:', data.name)
      return
    }
    const Node = Nodes[data.type]
    const node = new Node(data)
    nodes.set(node.name, node)
    return node
  }
  const root = createNode({
    type: 'group',
    name: 'root',
  })
  const vrm = createNode({
    type: 'vrm',
    name: 'vrm',
    factory: buildVRMFactory(glb, world),
  })
  root.add(vrm)
  return root
}

function buildVRMFactory(glb, world) {
  // we'll update matrix ourselves
  glb.scene.matrixAutoUpdate = false
  glb.scene.matrixWorldAutoUpdate = false
  // remove expressions from scene
  const expressions = glb.scene.children.filter(n => n.type === 'VRMExpression') // prettier-ignore
  for (const node of expressions) node.removeFromParent()
  // remove VRMHumanoidRig
  const vrmHumanoidRigs = glb.scene.children.filter(n => n.name === 'VRMHumanoidRig') // prettier-ignore
  for (const node of vrmHumanoidRigs) node.removeFromParent()
  // remove secondary
  const secondaries = glb.scene.children.filter(n => n.name === 'secondary') // prettier-ignore
  for (const node of secondaries) node.removeFromParent()
  // enable shadows
  glb.scene.traverse(obj => {
    if (obj.isMesh) {
      obj.castShadow = true
      obj.receiveShadow = true
    }
  })
  // calculate root to hips
  const bones = glb.userData.vrm.humanoid._rawHumanBones.humanBones
  const hipsPosition = v1.setFromMatrixPosition(bones.hips.node.matrixWorld)
  const rootPosition = v2.set(0, 0, 0) //setFromMatrixPosition(bones.root.node.matrixWorld)
  const rootToHips = hipsPosition.y - rootPosition.y
  // get vrm version
  const version = glb.userData.vrm.meta?.metaVersion
  // convert skinned mesh to detached bind mode
  // this lets us remove root bone from scene and then only perform matrix updates on the whole skeleton
  // when we actually need to  for massive performance
  const skinnedMeshes = []
  glb.scene.traverse(node => {
    if (node.isSkinnedMesh) {
      node.bindMode = THREE.DetachedBindMode
      node.bindMatrix.copy(node.matrixWorld)
      node.bindMatrixInverse.copy(node.bindMatrix).invert()
      skinnedMeshes.push(node)
    }
  })
  // remove root bone from scene
  // const rootBone = glb.scene.getObjectByName('RootBone')
  // console.log({ rootBone })
  // rootBone.parent.remove(rootBone)
  // rootBone.updateMatrixWorld(true)

  const getBoneName = vrmBoneName => {
    return glb.userData.vrm.humanoid.getRawBoneNode(vrmBoneName)?.name
  }

  const noop = () => {
    // ...
  }

  return (node, matrix) => {
    const vrm = cloneGLB(glb)
    const tvrm = vrm.userData.vrm
    const skinnedMeshes = getSkinnedMeshes(vrm.scene)
    const skeleton = skinnedMeshes[0].skeleton // should be same across all skinnedMeshes
    const rootBone = skeleton.bones[0] // should always be 0
    rootBone.parent.remove(rootBone)
    rootBone.updateMatrixWorld(true)
    vrm.scene.matrix.copy(matrix)
    world.graphics.scene.add(vrm.scene)

    // link back node for raycasts
    vrm.scene.traverse(n => {
      n.node = node
    })

    // pose arms down
    const bones = glb.userData.vrm.humanoid._normalizedHumanBones.humanBones
    const leftArm = bones.leftUpperArm.node
    leftArm.rotation.z = 75 * DEG2RAD
    const rightArm = bones.rightUpperArm.node
    rightArm.rotation.z = -75 * DEG2RAD
    tvrm.humanoid.update(0)
    skeleton.update()

    // i have no idea how but the mixer only needs one of the skinned meshes
    // and if i set it to vrm.scene it no longer works with detached bind mode
    const mixer = new THREE.AnimationMixer(skinnedMeshes[0])

    let elapsed = 0
    let rate = 0
    let rateCheckedAt = 999
    const update = delta => {
      // periodically calculate update rate based on distance to camera
      rateCheckedAt += delta
      if (rateCheckedAt >= DIST_CHECK_RATE) {
        const vrmPos = v1.setFromMatrixPosition(vrm.scene.matrix)
        const camPos = v2.setFromMatrixPosition(world.graphics.camera.matrixWorld) // prettier-ignore
        const distance = vrmPos.distanceTo(camPos)
        const clampedDistance = Math.max(distance - DIST_MIN, 0)
        const normalizedDistance = Math.min(clampedDistance / (DIST_MAX - DIST_MIN), 1) // prettier-ignore
        rate = DIST_MAX_RATE + normalizedDistance * (DIST_MIN_RATE - DIST_MAX_RATE) // prettier-ignore
        // console.log('distance', distance)
        // console.log('rate per second', 1 / rate)
        rateCheckedAt = 0
      }
      elapsed += delta
      const should = elapsed >= rate
      if (should) {
        mixer.update(elapsed)
        skeleton.bones.forEach(bone => bone.updateMatrixWorld())
        skeleton.update = THREE.Skeleton.prototype.update
        tvrm.humanoid.update(elapsed)
        elapsed = 0
      } else {
        skeleton.update = noop
        elapsed += delta
      }
    }
    world.updater.add(update)
    const emotes = {
      // [id]: {
      //   id: String
      //   loading: Boolean
      //   action: AnimationAction
      // }
    }
    let currentEmote
    const setEmote = id => {
      if (currentEmote?.id === id) return
      if (currentEmote) {
        currentEmote.action?.fadeOut(0.15)
        currentEmote = null
      }
      if (emotes[id]) {
        currentEmote = emotes[id]
        currentEmote.action?.reset().fadeIn(0.15).play()
      } else {
        const emote = {
          id,
          loading: true,
          action: null,
        }
        emotes[id] = emote
        currentEmote = emote
        const url = `${process.env.PUBLIC_ASSETS_URL}/${id}`
        world.loader.load(url, 'emo').then(emo => {
          const clip = emo.create({
            rootToHips,
            version,
            getBoneName,
          })
          const action = mixer.clipAction(clip)
          emote.action = action
          // if its still this emote, play it!
          if (currentEmote === emote) {
            action.play()
          }
        })
      }
    }

    return {
      setEmote,
      move(matrix) {
        vrm.scene.matrix.copy(matrix)
      },
      destroy() {
        world.graphics.scene.remove(vrm.scene)
        world.updater.remove(update)
      },
    }
  }
}

function cloneGLB(glb) {
  // returns a shallow clone of the gltf but a deep clone of the scene.
  // uses SkeletonUtils.clone which is the same as Object3D.clone except also clones skinned meshes etc
  return { ...glb, scene: SkeletonUtils.clone(glb.scene) }
}

function getSkinnedMeshes(scene) {
  let meshes = []
  scene.traverse(node => {
    if (node.isSkinnedMesh) {
      meshes.push(node)
    }
  })
  return meshes
}