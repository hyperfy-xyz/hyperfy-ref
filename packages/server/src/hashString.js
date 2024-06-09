import crypto from 'crypto'

export function hashString(str) {
  const hash = crypto.createHash('sha256').update(str).digest('hex')
  return hash
}
