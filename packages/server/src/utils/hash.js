import crypto from 'crypto'

export async function hashFile(file) {
  const hasher = crypto.createHash('sha256')
  hasher.update(file.buffer) // expects file from multer
  const hash = hasher.digest('hex')
  return hash
}

export function hashString(str) {
  const hash = crypto.createHash('sha256').update(str).digest('hex')
  return hash
}
