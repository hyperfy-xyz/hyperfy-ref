

/**
 * Modifed by Ashxn,
 *
 * This has been cleaned up to use tris instead of quads.
 * It also now takes in a flat data array.
 * And fixes z-fighting by ignoring boundary faces on west & north edges.
 *
 * Original: https://github.com/mikolalysenko/isosurface
 *
 */

/**
 * SurfaceNets in JavaScript
 *
 * Written by Mikola Lysenko (C) 2012
 *
 * MIT License
 *
 * Based on: S.F. Gibson, "Constrained Elastic Surface Nets". (1998) MERL Tech Report.
 */

// Precompute edge table, like Paul Bourke does.
// This saves a bit of time when computing the centroid of each boundary cell
var cube_edges = new Int32Array(24)
var edge_table = new Int32Array(256)

// Initialize the cube_edges table
// This is just the vertex number of each cube
var k = 0
for (var i = 0; i < 8; ++i) {
  for (var j = 1; j <= 4; j <<= 1) {
    var p = i ^ j
    if (i <= p) {
      cube_edges[k++] = i
      cube_edges[k++] = p
    }
  }
}

// Initialize the intersection table.
// This is a 2^(cube configuration) ->  2^(edge configuration) map
// There is one entry for each possible cube configuration, and the output is a 12-bit vector enumerating all edges crossing the 0-level.
for (var i = 0; i < 256; ++i) {
  var em = 0
  for (var j = 0; j < 24; j += 2) {
    var a = !!(i & (1 << cube_edges[j])),
      b = !!(i & (1 << cube_edges[j + 1]))
    em |= a !== b ? 1 << (j >> 1) : 0
  }
  edge_table[i] = em
}

// Internal buffer, this may get resized at run time
var buffer = new Array(4096)
for (var i = 0; i < buffer.length; ++i) {
  buffer[i] = 0
}

export function createSurface(data, dims) {
  var vertices = []
  var indices = []
  var normals = []
  var n = 0,
    x = [0, 0, 0],
    R = [1, dims[0] + 1, (dims[0] + 1) * (dims[1] + 1)],
    grid = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    buf_no = 1

  // Resize buffer if necessary
  if (R[2] * 2 > buffer.length) {
    var ol = buffer.length
    buffer.length = R[2] * 2
    while (ol < buffer.length) {
      buffer[ol++] = 0
    }
  }

  // March over the voxel grid
  for (
    x[2] = 0;
    x[2] < dims[2] - 1;
    ++x[2], n += dims[0], buf_no ^= 1, R[2] = -R[2]
  ) {
    // `m` is the pointer into the buffer we are going to use.
    // This is slightly obtuse because javascript does not have good support for packed data structures, so we must use typed arrays :(
    // The contents of the buffer will be the indices of the vertices on the previous x/y slice of the volume
    var m = 1 + (dims[0] + 1) * (1 + buf_no * (dims[1] + 1))

    for (x[1] = 0; x[1] < dims[1] - 1; ++x[1], ++n, m += 2)
      for (x[0] = 0; x[0] < dims[0] - 1; ++x[0], ++n, ++m) {
        // Read in 8 field values around this vertex and store them in an array
        // Also calculate 8-bit mask, like in marching cubes, so we can speed up sign checks later
        var mask = 0
        var g = 0
        for (var k = 0; k < 2; ++k)
          for (var j = 0; j < 2; ++j)
            for (var i = 0; i < 2; ++i, ++g) {
              var idx =
                (x[2] + k) * dims[1] * dims[0] +
                (x[1] + j) * dims[0] +
                (x[0] + i)
              var p = data[idx]
              grid[g] = p
              mask |= p < 0 ? 1 << g : 0
            }

        // Check for early termination if cell does not intersect boundary
        if (mask === 0 || mask === 0xff) {
          continue
        }

        // Sum up edge intersections
        var edge_mask = edge_table[mask]
        var v = [0.0, 0.0, 0.0]
        var e_count = 0

        // For every edge of the cube...
        for (var i = 0; i < 12; ++i) {
          // Use edge mask to check if it is crossed
          if (!(edge_mask & (1 << i))) {
            continue
          }

          // If it did, increment number of edge crossings
          ++e_count

          // Now find the point of intersection
          var e0 = cube_edges[i << 1] // Unpack vertices
          var e1 = cube_edges[(i << 1) + 1]
          var g0 = grid[e0] // Unpack grid values
          var g1 = grid[e1]
          var t = g0 - g1 // Compute point of intersection
          if (Math.abs(t) > 1e-6) {
            t = g0 / t
          } else {
            continue
          }

          // Interpolate vertices and add up intersections (this can be done without multiplying)
          for (var j = 0, k = 1; j < 3; ++j, k <<= 1) {
            var a = e0 & k
            var b = e1 & k
            if (a !== b) {
              v[j] += a ? 1.0 - t : t
            } else {
              v[j] += a ? 1.0 : 0
            }
          }
        }

        // Now we just average the edge intersections and add them to coordinate
        var s = 1.0 / e_count
        for (var i = 0; i < 3; ++i) {
          v[i] = x[i] + s * v[i]
        }

        // Add vertex to buffer, store pointer to vertex index in buffer
        buffer[m] = vertices.length / 3
        vertices.push(v[0], v[1], v[2])
        normals.push(0,0,0)

        // Now we need to add faces together, to do this we just loop over 3 basis components
        for (var i = 0; i < 3; ++i) {
          // The first three entries of the edge_mask count the crossings along the edge
          if (!(edge_mask & (1 << i))) {
            continue
          }

          // i = axes we are point along.  iu, iv = orthogonal axes
          var iu = (i + 1) % 3
          var iv = (i + 2) % 3

          // If we are on a boundary, skip it
          if (x[iu] === 0 || x[iv] === 0) {
            continue
          }

          // Otherwise, look up adjacent edges in buffer
          var du = R[iu]
          var dv = R[iv]

          // Remember to flip orientation depending on the sign of the corner.
          var v1, v2, v3
          if (mask & 1) {
            v1 = buffer[m]
            v2 = buffer[m - du]
            v3 = buffer[m - dv]
            indices.push(v1, v2, v3)
            indices.push(buffer[m - dv], buffer[m - du], buffer[m - du - dv])
          } else {
            v1 = buffer[m]
            v2 = buffer[m - dv]
            v3 = buffer[m - du]
            indices.push(v1, v2, v3)
            indices.push(buffer[m - du], buffer[m - dv], buffer[m - du - dv])
          }

          // Calculate normal
          var ax = vertices[v2*3] - vertices[v1*3]
          var ay = vertices[v2*3+1] - vertices[v1*3+1]
          var az = vertices[v2*3+2] - vertices[v1*3+2]
          var bx = vertices[v3*3] - vertices[v1*3]
          var by = vertices[v3*3+1] - vertices[v1*3+1]
          var bz = vertices[v3*3+2] - vertices[v1*3+2]
          var nx = ay * bz - az * by
          var ny = az * bx - ax * bz
          var nz = ax * by - ay * bx

          // Accumulate unnormalized normals
          normals[v1*3] += nx; normals[v1*3+1] += ny; normals[v1*3+2] += nz
          normals[v2*3] += nx; normals[v2*3+1] += ny; normals[v2*3+2] += nz
          normals[v3*3] += nx; normals[v3*3+1] += ny; normals[v3*3+2] += nz
        }
      }
  }

  for (var i = 0; i < normals.length; i += 3) {
    var nx = normals[i]
    var ny = normals[i+1]
    var nz = normals[i+2]
    var len = Math.sqrt(nx*nx + ny*ny + nz*nz)
    if (len > 0) {
      normals[i] /= len
      normals[i+1] /= len
      normals[i+2] /= len
    } else {
      normals[i] = 0
      normals[i+1] = 1  // Default to up vector if normal is zero
      normals[i+2] = 0
    }
  }

  return {
    vertices,
    indices,
    normals,
  }
}
