import jwt from 'jsonwebtoken'

const secret = process.env.JWT_SECRET

export function createToken(data) {
  return new Promise((resolve, reject) => {
    jwt.sign(data, secret, (err, token) => {
      if (err) return reject(err)
      resolve(token)
    })
  })
}

export function readToken(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, secret, (err, data) => {
      resolve(err ? null : data)
    })
  })
}
