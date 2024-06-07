import * as Nodes from '../nodes'

const LOD_REGEX = /_lod(\d+)/ // eg mesh_lod0 & mesh_lod100

const groupTypes = ['Scene', 'Group', 'Object3D']

export function glbToNodes(glb, world) {
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
  function parse(object3ds, parentNode) {
    const lodsByName = {}
    for (const object3d of object3ds) {
      if (groupTypes.includes(object3d.type)) {
        const node = createNode({
          type: 'group',
          name: object3d.name,
          position: object3d.position.toArray(),
          quaternion: object3d.quaternion.toArray(),
          scale: object3d.scale.toArray(),
        })
        parentNode.add(node)
        parse(object3d.children, node)
      }
      if (object3d.type === 'Mesh') {
        object3d.geometry.computeBoundsTree() // three-mesh-bvh
        enhanceMaterial(object3d.material)
        if (LOD_REGEX.test(object3d.name)) {
          let [name, maxDistance] = object3d.name.split(LOD_REGEX)
          maxDistance = parseInt(maxDistance)
          if (!lodsByName[name]) {
            lodsByName[name] = []
          }
          lodsByName[name].push({ mesh: object3d, maxDistance })
        } else {
          lodsByName[object3d.name] = [
            { mesh: object3d, maxDistance: Infinity },
          ]
        }
      }
    }
    for (const name in lodsByName) {
      const lods = lodsByName[name]
      lods.sort((a, b) => a.maxDistance - b.maxDistance) // ascending
      const lod0 = lods[0]
      lods[lods.length - 1].maxDistance = Infinity // for now there is no dropoff
      const src = world.models.create(lods) // TODO: rename world.models to world.composites
      const node = createNode({
        type: 'composite',
        name,
        src,
        position: lod0.mesh.position.toArray(),
        quaternion: lod0.mesh.quaternion.toArray(),
        scale: lod0.mesh.scale.toArray(),
      })
      parentNode.add(node)
      // note: lods are combined, children are ignored
    }
  }
  parse(glb.scene.children, root)
  return root
}

function enhanceMaterial(material) {
  // to have cross-fading we need transparent=true
  // but this introduces sorting by threejs.
  // with 100k cubes toggling transparent=true takes GPU from
  // 10ms to 14ms
  return
  if (material.isMeshStandardMaterial) {
    material.transparent = true
    material.needsUpdate = true
    material.onBeforeCompile = function (shader) {
      console.log(shader)

      // add the fade attribute to the vertex shader
      shader.vertexShader =
        'attribute float fade;\nvarying float vFade;\n' + shader.vertexShader

      // pass fade value from vertex to fragment shader
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vFade = fade;`
      )

      // add varying to fragment shader
      shader.fragmentShader = 'varying float vFade;\n' + shader.fragmentShader

      // modify the diffuseColor alpha with fade value
      shader.fragmentShader = shader.fragmentShader.replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        'vec4 diffuseColor = vec4( diffuse, opacity * (1.0 - vFade) );'
      )

      // ensure premultiplied alpha is handled correctly if used
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <premultiplied_alpha_fragment>',
        'gl_FragColor.rgb *= gl_FragColor.a;\n#include <premultiplied_alpha_fragment>'
      )
    }
  }
}
