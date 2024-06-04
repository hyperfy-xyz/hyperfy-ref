import express from 'express'
import moment from 'moment'
import { recoverMessageAddress } from 'viem'

import { db, migrate } from './db'
import { generateName } from './names'
import { createToken, readToken } from './jwt'
import { uuid } from './uuid'

export const api = express.Router()

migrate()

const checkAuth = async req => {
  const token = req.headers['x-auth-token']
  if (token) {
    try {
      const { userId } = await readToken(token)
      req.userId = userId
    } catch (err) {
      // ...
    }
  }
}

// const getCookie = (req, key) => {
//   const data = req.cookies[key]
//   let value
//   try {
//     value = JSON.parse(decodeURIComponent(data))
//   } catch (err) {
//     console.error(`could not deserialize cookie ${key} with value:`, data)
//     return null
//   }
//   return value
// }

// const setCookie = (req, key, value) => {
//   let data
//   try {
//     data = encodeURIComponent(JSON.stringify(value))
//     req.cookies[key] = data
//   } catch (err) {
//     return console.error(`could not serialize cookie ${key} with value:`, value)
//   }
// }

api.post('/user', async (req, res) => {
  const name = await generateName()
  const now = moment().toISOString()
  const user = {
    id: uuid(),
    name,
    address: null,
    createdAt: now,
    updatedAt: now,
  }
  await db('users').insert(user)
  const token = await createToken({ userId: user.id })
  res.json({ token, user })
})

api.get('/user', async (req, res) => {
  await checkAuth(req)
  const { userId } = req
  if (!userId) {
    res.status(401).send('not_authorized')
    return
  }
  const user = await db('users').where('id', userId).first()
  res.json(user)
})

api.post('/connect', async (req, res) => {
  let address = req.body.address
  let signature = req.body.signature
  if (!address) {
    return res.status(400).send('address_required')
  }
  if (!signature) {
    return res.status(400).send('signature_required')
  }
  address = address.toLowerCase()
  let recoveredAddress = await recoverMessageAddress({
    message: 'Connect to XYZ!',
    signature,
  })
  recoveredAddress = recoveredAddress.toLowerCase()
  if (address !== recoveredAddress) {
    return res.status(401).send('not_authorized')
  }
  const now = moment().toISOString()
  let user = await db('users').where('address', address).first()
  if (!user) {
    user = {
      id: uuid(),
      name: await generateName(),
      address,
      createdAt: now,
      updatedAt: now,
    }
    await db('users').insert(user)
  }
  const token = await createToken({ userId: user.id })
  const auth = { token, user }
  // const auths = getCookie(req, 'auths') || []
  // auths.push(auth)
  // setCookie(req, 'auths', auths)
  res.json(auth)
})
