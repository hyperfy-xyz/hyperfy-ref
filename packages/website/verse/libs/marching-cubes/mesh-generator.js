import * as THREE from 'three'
import { CHUNK_HEIGHT, CHUNK_SIZE } from './constants'
import { generateNoiseMap } from './noise-map-generator'
import { edgeCorners, edges, table } from './triangulation'

const SURFACE_LEVEL = 0

export function generateMesh(
  chunkX,
  chunkY,
  chunkZ,
  generate,
  interpolate,
  wireframe
) {
  let noiseMap = generate?.noiseMap
  if (!noiseMap) {
    if (generate?.noiseLayers) {
      noiseMap = generateNoiseMap(
        chunkX,
        chunkY,
        chunkZ,
        generate.noiseLayers,
        generate.seed
      )
    } else {
      noiseMap = generateNoiseMap(chunkX, chunkY, chunkZ, null, generate?.seed)
    }
  }

  const vertices = []
  let cubeCounter = 0

  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        let cubeIndex = 0
        const noiseMapYBot = noiseMap[y]
        const noiseMapYTop = noiseMap[y + 1]

        let cornerNoises = [
          noiseMapYBot[z][x],
          noiseMapYBot[z][x + 1],
          noiseMapYBot[z + 1][x + 1],
          noiseMapYBot[z + 1][x],
          noiseMapYTop[z][x],
          noiseMapYTop[z][x + 1],
          noiseMapYTop[z + 1][x + 1],
          noiseMapYTop[z + 1][x],
        ]

        for (let n = 0; n < cornerNoises.length; n++) {
          if (cornerNoises[n] < SURFACE_LEVEL) {
            cubeIndex += 1 << n
          }
        }

        if (cubeIndex !== 0 && cubeIndex !== 255) {
          const tableEdges = table[cubeIndex]

          for (let e = 0; e < tableEdges.length; e += 3) {
            for (let i = 0; i < 3; i++) {
              const edge = edges[tableEdges[e + i]]
              let vertex

              if (interpolate) {
                const edgeCorner = edgeCorners[tableEdges[e + i]]
                const edgeInterpolate =
                  Math.abs(cornerNoises[edgeCorner[0]] - SURFACE_LEVEL) /
                  Math.abs(
                    cornerNoises[edgeCorner[1]] - cornerNoises[edgeCorner[0]]
                  )

                vertex = edge.map(v => (v === 0.5 ? edgeInterpolate : v))
              } else {
                vertex = [...edge]
              }

              const xOffset = x + (chunkX - 0.5) * CHUNK_SIZE
              const yOffset = y - chunkY * CHUNK_HEIGHT
              const zOffset = z + (chunkZ - 0.5) * CHUNK_SIZE

              vertices.push(
                vertex[0] + xOffset,
                vertex[1] + yOffset,
                vertex[2] + zOffset
              )
            }
          }
        }
        cubeCounter++
      }
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3)
  )
  geometry.computeVertexNormals()

  const material = new THREE.MeshStandardMaterial({
    color: 'green',
    roughness: 1,
    metalness: 0,
    // flatShading: true,
    // side: THREE.DoubleSide,
    // wireframe: true,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = true
  mesh.receiveShadow = true

  return mesh
}

// import * as THREE from 'three'
// import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// import { CHUNK_HEIGHT, CHUNK_SIZE, storageKeys } from './constants'
// import { generateNoiseMap } from './noise-map-generator'
// import { edgeCorners, edges, table } from './triangulation'

// const SURFACE_LEVEL = 0

// export function generateMesh(
//   chunkX,
//   chunkY,
//   chunkZ,
//   generate,
//   interpolate,
//   wireframe
// ) {
//   let geoms = []

//   let noiseMap = generate?.noiseMap
//   if (!noiseMap) {
//     if (generate?.noiseLayers) {
//       noiseMap = generateNoiseMap(
//         chunkX,
//         chunkY,
//         chunkZ,
//         generate.noiseLayers,
//         generate.seed
//       )
//     } else {
//       noiseMap = generateNoiseMap(chunkX, chunkY, chunkZ, null, generate?.seed)
//     }
//   }

//   // Create cube based on noise map
//   let cubeCounter = 0
//   let y = 0
//   while (y < CHUNK_HEIGHT) {
//     let z = 0
//     while (z < CHUNK_SIZE) {
//       let x = 0
//       while (x < CHUNK_SIZE) {
//         let cubeIndex = 0
//         const noiseMapYBot = noiseMap[y]
//         const noiseMapYTop = noiseMap[y + 1]

//         // Get noise value of each corner of the cube
//         let cornerNoises = [
//           noiseMapYBot[z][x],
//           noiseMapYBot[z][x + 1],
//           noiseMapYBot[z + 1][x + 1],
//           noiseMapYBot[z + 1][x],
//           noiseMapYTop[z][x],
//           noiseMapYTop[z][x + 1],
//           noiseMapYTop[z + 1][x + 1],
//           noiseMapYTop[z + 1][x],
//         ]

//         // Calculate cube index based on corner noises
//         for (let n = 0; n < cornerNoises.length; n++) {
//           if (cornerNoises[n] < SURFACE_LEVEL) {
//             cubeIndex += 1 << n
//           }
//         }

//         if (cubeIndex !== 0 && cubeIndex !== 255) {
//           // Get edges from table based on cube index
//           const tableEdges = table[cubeIndex]

//           let e = 0
//           while (e < tableEdges.length) {
//             let geom = new THREE.BufferGeometry()
//             let vertices = new Float32Array(9)

//             // Vectors of edges
//             const edge1 = edges[tableEdges[e]]
//             const edge2 = edges[tableEdges[e + 1]]
//             const edge3 = edges[tableEdges[e + 2]]

//             if (interpolate) {
//               // Id of corners that make up the edges
//               const edgeCorners1 = edgeCorners[tableEdges[e]]
//               const edgeCorners2 = edgeCorners[tableEdges[e + 1]]
//               const edgeCorners3 = edgeCorners[tableEdges[e + 2]]

//               // Interpolate edges for smoother surface
//               let edgeInterpolate1 =
//                 Math.abs(cornerNoises[edgeCorners1[0]] - SURFACE_LEVEL) /
//                 Math.abs(
//                   cornerNoises[edgeCorners1[1]] - cornerNoises[edgeCorners1[0]]
//                 )

//               let edgeInterpolate2 =
//                 Math.abs(cornerNoises[edgeCorners2[0]] - SURFACE_LEVEL) /
//                 Math.abs(
//                   cornerNoises[edgeCorners2[1]] - cornerNoises[edgeCorners2[0]]
//                 )

//               let edgeInterpolate3 =
//                 Math.abs(cornerNoises[edgeCorners3[0]] - SURFACE_LEVEL) /
//                 Math.abs(
//                   cornerNoises[edgeCorners3[1]] - cornerNoises[edgeCorners3[0]]
//                 )

//               vertices = new Float32Array([
//                 edge1[0] === 0.5 ? edgeInterpolate1 : edge1[0],
//                 edge1[1] === 0.5 ? edgeInterpolate1 : edge1[1],
//                 edge1[2] === 0.5 ? edgeInterpolate1 : edge1[2],
//                 edge2[0] === 0.5 ? edgeInterpolate2 : edge2[0],
//                 edge2[1] === 0.5 ? edgeInterpolate2 : edge2[1],
//                 edge2[2] === 0.5 ? edgeInterpolate2 : edge2[2],
//                 edge3[0] === 0.5 ? edgeInterpolate3 : edge3[0],
//                 edge3[1] === 0.5 ? edgeInterpolate3 : edge3[1],
//                 edge3[2] === 0.5 ? edgeInterpolate3 : edge3[2],
//               ])
//             } else {
//               vertices = new Float32Array([
//                 edge1[0],
//                 edge1[1],
//                 edge1[2],
//                 edge2[0],
//                 edge2[1],
//                 edge2[2],
//                 edge3[0],
//                 edge3[1],
//                 edge3[2],
//               ])
//             }

//             const xOffset =
//               (cubeCounter % CHUNK_SIZE) + (chunkX - 0.5) * CHUNK_SIZE
//             const yOffset =
//               Math.floor(cubeCounter / (CHUNK_SIZE * CHUNK_SIZE)) -
//               chunkY * CHUNK_HEIGHT
//             const zOffset =
//               Math.floor(
//                 (cubeCounter % (CHUNK_SIZE * CHUNK_SIZE)) / CHUNK_SIZE
//               ) +
//               (chunkZ - 0.5) * CHUNK_SIZE

//             // Create surface from vertices
//             geom.setAttribute(
//               'position',
//               new THREE.BufferAttribute(vertices, 3)
//             )
//             geom.translate(xOffset, yOffset, zOffset)
//             geoms.push(geom)

//             e += 3
//           }
//         }
//         cubeCounter++
//         x++
//       }
//       z++
//     }
//     y++
//   }

//   const geometry = mergeGeometries(geoms)
//   geometry.computeVertexNormals()
//   // mergeVertices(geometry)
//   // geometry.mergeVertices()
//   return geometry

//   // Merge chunk
//   let chunk = mergeGeometries(geoms)
//   chunk.computeVertexNormals()
//   let mesh = new THREE.Mesh(
//     chunk,
//     new THREE.MeshNormalMaterial({
//       side: THREE.DoubleSide,
//       wireframe: !!wireframe,
//     })
//   )
//   return mesh
// }
