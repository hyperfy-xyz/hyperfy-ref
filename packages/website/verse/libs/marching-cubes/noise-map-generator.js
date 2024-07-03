import { createNoise3D } from 'simplex-noise'

import { CHUNK_HEIGHT, CHUNK_SIZE, DEFAULT_NOISE_LAYERS } from './constants'
import { getChunkKey } from './utils'

let noiseMapCache = {}

export function generateNoiseMap(
  chunkX,
  chunkY,
  chunkZ,
  noiseLayers,
  seed,
  cacheNoiseMap = false
) {
  const currentSeed = seed || Math.random()
  const noise = createNoise3D(() => currentSeed)

  const noiseMap = []
  if (!noiseLayers) noiseLayers = DEFAULT_NOISE_LAYERS

  const noiseLayerChanged = [true, true, true]

  const chunkKey = getChunkKey(chunkX, chunkZ)
  let initialCache = cacheNoiseMap && !(chunkKey in noiseMapCache)
  if (initialCache)
    noiseMapCache[chunkKey] = {
      noiseMap: [],
      noiseLayers: [0, 0, 0],
      seed: currentSeed,
    }

  // Cache noise layers
  if (cacheNoiseMap) {
    for (let i = 0; i < noiseLayers.length; i++) {
      if (
        noiseLayers[i] === noiseMapCache[chunkKey].noiseLayers[i] &&
        currentSeed === noiseMapCache[chunkKey].seed
      ) {
        noiseLayerChanged[i] = false
      } else {
        noiseMapCache[chunkKey].noiseLayers[i] = noiseLayers[i]
      }
    }
  }

  let y = 0
  while (y <= CHUNK_HEIGHT) {
    const plane = []
    const planeCache = []
    let z = 0
    while (z <= CHUNK_SIZE) {
      const buffer = new ArrayBuffer((CHUNK_SIZE + 1) * 4)
      const line = new Float32Array(buffer)
      const lineCache = []
      let x = 0
      while (x <= CHUNK_SIZE) {
        // Add offset to create a ground level
        let noiseOffset = 0
        if (y === 0) {
          noiseOffset = -2
        } else if (y === CHUNK_HEIGHT) {
          noiseOffset = 2
        } else if (y < 10) {
          noiseOffset = 0.002 * Math.pow(y - 10, 3)
        } else {
          noiseOffset = (y - 10) / 20
        }

        const noiseOne = noiseLayerChanged[0]
          ? noise(
              (x + (chunkX - 0.5) * CHUNK_SIZE) / noiseLayers[0],
              (y + chunkY * CHUNK_HEIGHT) / noiseLayers[0],
              (z + (chunkZ - 0.5) * CHUNK_SIZE) / noiseLayers[0]
            )
          : noiseMapCache[chunkKey].noiseMap[y][z][x][0]

        const noiseTwo = noiseLayerChanged[1]
          ? 0.5 *
            noise(
              (x + (chunkX - 0.5) * CHUNK_SIZE) / noiseLayers[1],
              (y + chunkY * CHUNK_HEIGHT) / noiseLayers[1],
              (z + (chunkZ - 0.5) * CHUNK_SIZE) / noiseLayers[1]
            )
          : noiseMapCache[chunkKey].noiseMap[y][z][x][1]

        const noiseThree = noiseLayerChanged[2]
          ? 0.25 *
            noise(
              (x + (chunkX - 0.5) * CHUNK_SIZE) / noiseLayers[2],
              (y + chunkY * CHUNK_HEIGHT) / noiseLayers[2],
              (z + (chunkZ - 0.5) * CHUNK_SIZE) / noiseLayers[2]
            )
          : noiseMapCache[chunkKey].noiseMap[y][z][x][2]

        // Layer three noise values for more varied terrain
        let noiseValue = noiseOne + noiseTwo + noiseThree + noiseOffset

        if (cacheNoiseMap) {
          if (initialCache) {
            lineCache.push([noiseOne, noiseTwo, noiseThree])
          } else {
            // Cache noise values
            if (noiseLayerChanged[0])
              noiseMapCache[chunkKey].noiseMap[y][z][x][0] = noiseOne
            if (noiseLayerChanged[1])
              noiseMapCache[chunkKey].noiseMap[y][z][x][1] = noiseTwo
            if (noiseLayerChanged[2])
              noiseMapCache[chunkKey].noiseMap[y][z][x][2] = noiseThree
          }
        }

        line[x] = noiseValue
        x++
      }
      if (initialCache) planeCache.push(lineCache)
      plane.push(line)
      z++
    }
    if (initialCache) noiseMapCache[chunkKey].noiseMap.push(planeCache)
    noiseMap.push(plane)
    y++
  }

  return noiseMap
}
