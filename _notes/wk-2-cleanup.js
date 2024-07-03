

let cube_edges = new Int32Array(24)
let edge_table = new Int32Array(256)

let k = 0
for (let i = 0; i < 8; ++i) {
  for (let j = 1; j <= 4; j <<= 1) {
    let p = i ^ j
    if (i <= p) {
      cube_edges[k++] = i
      cube_edges[k++] = p
    }
  }
}

// Initialize the intersection table.
// This is a 2^(cube configuration) ->  2^(edge configuration) map
// There is one entry for each possible cube configuration, and the output is a 12-bit vector enumerating all edges crossing the 0-level.
for (let i = 0; i < 256; ++i) {
  let em = 0
  for (let j = 0; j < 24; j += 2) {
    let a = !!(i & (1 << cube_edges[j])),
      b = !!(i & (1 << cube_edges[j + 1]))
    em |= a !== b ? 1 << (j >> 1) : 0
  }
  edge_table[i] = em
}

// Internal buffer, this may get resized at run time
let buffer = new Array(4096)
for (let i = 0; i < buffer.length; ++i) {
  buffer[i] = 0
}

export function createSurface(data, dims) {
  let vertices = []
  let faces = []
  let n = 0
  let x = new Int32Array(3)
  let R = new Int32Array([1, dims[0] + 1, (dims[0] + 1) * (dims[1] + 1)])
  let grid = new Float32Array(8)
  let buf_no = 1

  // Resize buffer if necessary
  if (R[2] * 2 > buffer.length) {
    buffer = new Int32Array(R[2] * 2)
  }

  // March over the voxel grid
  for (
    x[2] = 0;
    x[2] < dims[2] - 1;
    ++x[2], n += dims[0], buf_no ^= 1, R[2] = -R[2]
  ) {
    // m is the pointer into the buffer we are going to use.
    // This is slightly obtuse because javascript does not have good support for packed data structures, so we must use typed arrays :(
    // The contents of the buffer will be the indices of the vertices on the previous x/y slice of the volume
    let m = 1 + (dims[0] + 1) * (1 + buf_no * (dims[1] + 1))

    for (x[1] = 0; x[1] < dims[1] - 1; ++x[1], ++n, m += 2)
      for (x[0] = 0; x[0] < dims[0] - 1; ++x[0], ++n, ++m) {
        // Read in 8 field values around this vertex and store them in an array
        // Also calculate 8-bit mask, like in marching cubes, so we can speed up sign checks later
        let mask = 0
        let g = 0
        let idx = n
        for (let k = 0; k < 2; ++k, idx += dims[0] * (dims[1] - 2))
          for (let j = 0; j < 2; ++j, idx += dims[0] - 2)
            for (let i = 0; i < 2; ++i, ++g, ++idx) {
              let p = data[idx]
              grid[g] = p
              mask |= p < 0 ? 1 << g : 0
            }

        // Check for early termination if cell does not intersect boundary
        if (mask === 0 || mask === 0xff) {
          continue
        }

        // Sum up edge intersections
        let edge_mask = edge_table[mask]
        let v = [0.0, 0.0, 0.0]
        let e_count = 0

        // For every edge of the cube...
        for (let i = 0; i < 12; ++i) {
          // Use edge mask to check if it is crossed
          if (!(edge_mask & (1 << i))) {
            continue
          }

          // If it did, increment number of edge crossings
          ++e_count

          // Now find the point of intersection
          let e0 = cube_edges[i << 1] //Unpack vertices
          let e1 = cube_edges[(i << 1) + 1]
          let g0 = grid[e0] //Unpack grid values
          let g1 = grid[e1]
          let t = g0 - g1 //Compute point of intersection
          if (Math.abs(t) > 1e-6) {
            t = g0 / t
          } else {
            continue
          }

          // Interpolate vertices and add up intersections (this can be done without multiplying)
          for (let j = 0, k = 1; j < 3; ++j, k <<= 1) {
            let a = e0 & k
            let b = e1 & k
            if (a !== b) {
              v[j] += a ? 1.0 - t : t
            } else {
              v[j] += a ? 1.0 : 0
            }
          }
        }

        // Now we just average the edge intersections and add them to coordinate
        let s = 1.0 / e_count
        for (let i = 0; i < 3; ++i) {
          v[i] = x[i] + s * v[i]
        }

        // Add vertex to buffer, store pointer to vertex index in buffer
        buffer[m] = vertices.length
        vertices.push(v)

        // Now we need to add faces together, to do this we just loop over 3 basis components
        for (let i = 0; i < 3; ++i) {
          // The first three entries of the edge_mask count the crossings along the edge
          if (!(edge_mask & (1 << i))) {
            continue
          }

          // i = axes we are point along.  iu, iv = orthogonal axes
          let iu = (i + 1) % 3
          let iv = (i + 2) % 3

          //If we are on a boundary, skip it
          if (x[iu] === 0 || x[iv] === 0) {
            continue
          }

          //Otherwise, look up adjacent edges in buffer
          let du = R[iu]
          let dv = R[iv]

          //Remember to flip orientation depending on the sign of the corner.
          if (mask & 1) {
            faces.push([
              buffer[m],
              buffer[m - du],
              buffer[m - du - dv],
              buffer[m - dv],
            ])
          } else {
            faces.push([
              buffer[m],
              buffer[m - dv],
              buffer[m - du - dv],
              buffer[m - du],
            ])
          }
        }
      }
  }

  // All done!  Return the result
  return { 
    vertices, 
    indices: faces 
  }
}