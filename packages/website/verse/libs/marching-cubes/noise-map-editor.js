import { CHUNK_HEIGHT, CHUNK_SIZE } from './constants'
import { generateNoiseMap } from './noise-map-generator'
import { getChunkKey } from './utils'

export function editNoiseMapChunks(
  loadedChunks,
  worldPoint,
  remove,
  noiseLayers,
  seed
) {
  const chunkX = Math.floor((worldPoint.x + CHUNK_SIZE / 2) / CHUNK_SIZE)
  const chunkZ = Math.floor((worldPoint.z + CHUNK_SIZE / 2) / CHUNK_SIZE)

  worldPoint.x += CHUNK_SIZE * (chunkX + 0.5)
  worldPoint.y += 0
  worldPoint.z += CHUNK_SIZE * (chunkZ + 0.5)

  const mapX =
    ((Math.floor(worldPoint.x) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
  const mapY =
    ((Math.floor(worldPoint.y) % CHUNK_HEIGHT) + CHUNK_HEIGHT) % CHUNK_HEIGHT
  const mapZ =
    ((Math.floor(worldPoint.z) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE

  let noiseMap =
    getChunkKey(chunkX, chunkZ) in loadedChunks
      ? loadedChunks[getChunkKey(chunkX, chunkZ)].noiseMap
      : null
  if (!noiseMap) {
    noiseMap = generateNoiseMap(chunkX, 0, chunkZ, noiseLayers, seed)
  }

  let noiseMapX = null
  let noiseMapZ = null
  let noiseMapXZ = null

  let chunkXOffset = 0
  let chunkZOffset = 0

  const radius = 2

  const addOrRemove = remove ? 1 : -1

  for (let y = mapY - radius; y <= mapY + radius; y++) {
    if (y <= 0 || y >= CHUNK_HEIGHT) continue
    for (let z = mapZ - radius; z <= mapZ + radius; z++) {
      for (let x = mapX - radius; x <= mapX + radius; x++) {
        try {
          let editNoise =
            (addOrRemove *
              (radius * radius * 3 -
                ((mapY - y) * (mapY - y) +
                  (mapZ - z) * (mapZ - z) +
                  (mapX - x) * (mapX - x)))) /
            120

          // Check if x and z are in or out of bounds
          // -1 = out of bounds, 1 = in bounds, 0 = in both bounds
          let xInBound = 1
          let zInBound = 1

          if (x <= 0) {
            chunkXOffset = -1
            xInBound = -1
            if (x === 0) xInBound = 0
          } else if (x >= CHUNK_SIZE) {
            chunkXOffset = 1
            xInBound = -1
            if (x === CHUNK_SIZE) xInBound = 0
          }
          if (z <= 0) {
            chunkZOffset = -1
            zInBound = -1
            if (z === 0) zInBound = 0
          } else if (z >= CHUNK_SIZE) {
            chunkZOffset = 1
            zInBound = -1
            if (z === CHUNK_SIZE) zInBound = 0
          }

          if (xInBound <= 0 && zInBound >= 0) {
            const chunkKeyX = getChunkKey(chunkX + chunkXOffset, chunkZ)
            if (chunkKeyX in loadedChunks) {
              if (!noiseMapX)
                noiseMapX =
                  loadedChunks[chunkKeyX].noiseMap ||
                  generateNoiseMap(
                    chunkX + chunkXOffset,
                    0,
                    chunkZ,
                    noiseLayers,
                    seed
                  )

              noiseMapX[y][z][x - chunkXOffset * CHUNK_SIZE] += editNoise
            }
          }

          if (zInBound <= 0 && xInBound >= 0) {
            const chunkKeyZ = getChunkKey(chunkX, chunkZ + chunkZOffset)
            if (chunkKeyZ in loadedChunks) {
              if (!noiseMapZ)
                noiseMapZ =
                  loadedChunks[chunkKeyZ].noiseMap ||
                  generateNoiseMap(
                    chunkX,
                    0,
                    chunkZ + chunkZOffset,
                    noiseLayers,
                    seed
                  )

              noiseMapZ[y][z - chunkZOffset * CHUNK_SIZE][x] += editNoise
            }
          }

          if (xInBound <= 0 && zInBound <= 0) {
            const chunkKeyXZ = getChunkKey(
              chunkX + chunkXOffset,
              chunkZ + chunkZOffset
            )
            if (chunkKeyXZ in loadedChunks) {
              if (!noiseMapXZ)
                noiseMapXZ =
                  loadedChunks[chunkKeyXZ].noiseMap ||
                  generateNoiseMap(
                    chunkX + chunkXOffset,
                    0,
                    chunkZ + chunkZOffset,
                    noiseLayers,
                    seed
                  )

              noiseMapXZ[y][z - chunkZOffset * CHUNK_SIZE][
                x - chunkXOffset * CHUNK_SIZE
              ] += editNoise
            }
          }

          if (xInBound >= 0 && zInBound >= 0) {
            noiseMap[y][z][x] += editNoise
          }
        } catch (e) {
          console.error(e)
        }
      }
    }
  }

  let editChunks = []
  try {
    if (noiseMapX) {
      loadedChunks[getChunkKey(chunkX + chunkXOffset, chunkZ)].noiseMap =
        noiseMapX
      editChunks.push([chunkX + chunkXOffset, chunkZ])
    }
    if (noiseMapZ) {
      loadedChunks[getChunkKey(chunkX, chunkZ + chunkZOffset)].noiseMap =
        noiseMapZ
      editChunks.push([chunkX, chunkZ + chunkZOffset])
    }
    if (noiseMapXZ) {
      loadedChunks[
        getChunkKey(chunkX + chunkXOffset, chunkZ + chunkZOffset)
      ].noiseMap = noiseMapXZ
      editChunks.push([chunkX + chunkXOffset, chunkZ + chunkZOffset])
    }

    loadedChunks[getChunkKey(chunkX, chunkZ)].noiseMap = noiseMap
    editChunks.push([chunkX, chunkZ])
  } catch (e) {
    console.error(e)
  }
  return editChunks
}
