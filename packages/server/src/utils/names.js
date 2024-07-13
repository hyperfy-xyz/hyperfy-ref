import { db } from '../db'

import { muid } from './uuid'

export async function generateName() {
  let name
  while (!name) {
    name = 'Anon_' + muid()
    const exists = await db('users').whereRaw('LOWER(name) = ?', name.toLowerCase()).first() // prettier-ignore
    if (exists) {
      console.log('generateName: trying again')
      name = null
    }
  }
  return name
}

export async function checkName(name) {
  const exists = await db('users').whereRaw('LOWER(name) = ?', name).first()
  const available = !exists
  return available
}
