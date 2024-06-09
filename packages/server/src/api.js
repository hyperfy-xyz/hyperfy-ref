import express from 'express'
import moment from 'moment'
import { recoverMessageAddress } from 'viem'
import fs from 'fs-extra'
import multer from 'multer'
import path from 'path'

import { db, migrate } from './db'
import { generateName } from './names'
import { createToken, readToken } from './jwt'
import { uuid } from './uuid'
import { hashFile } from './hashFile'
import { avatarSchema, avatarScriptCompiled } from './avatarSchema'
import { hashString } from './hashString'

export const api = express.Router()

const uploadsDir = path.join('./uploads')

const multerUpload = multer()

// copy avatar.glb to uploads dir
await fs.ensureDir(uploadsDir)
await fs.copy(path.join('src/avatar.glb'), path.join(uploadsDir, 'avatar.glb'))

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

api.post('/models', multerUpload.single('file'), async (req, res) => {
  await new Promise(resolve => setTimeout(resolve, 2000))
  const { file } = req
  // TODO: record in db
  const hash = await hashFile(file)
  const filePath = path.join(uploadsDir, hash)
  await fs.writeFile(filePath, file.buffer, 'binary')
  console.log(
    'TODO: POST /models should return just the hash and store just the hash on schema'
  )
  res.status(201).json({ hash })
})

api.post('/scripts', async (req, res) => {
  await new Promise(resolve => setTimeout(resolve, 1000))
  const { raw, compiled } = req.body
  const id = hashString(raw)
  const now = moment().toISOString()
  await db('scripts')
    .insert({
      id,
      raw,
      compiled,
      createdAt: now,
      updatedAt: now,
    })
    .onConflict('id')
    .merge({
      raw,
      compiled,
      updatedAt: now,
    })
  res.status(201).json({ id })
})

api.get('/scripts/:id', async (req, res) => {
  const id = req.params.id
  if (id === '$avatar') {
    res.status(200).send(avatarScriptCompiled)
    return
  }
  const script = await db('scripts').where({ id }).first()
  res.status(200).send(script.compiled)
})

api.get('/scripts/:id/raw', async (req, res) => {
  const id = req.params.id
  const script = await db('scripts').where({ id }).first()
  res.status(200).send(script.raw)
})
