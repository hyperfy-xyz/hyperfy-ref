import { readToken } from '@/utils/jwt'

export async function get(ctx) {
  if (!ctx.hasApiSecret) return Response.error()
  const { token } = ctx.params
  let value
  try {
    value = await readToken(token)
  } catch (err) {
    return null
  }
  const { userId } = value
  const user = await ctx.db('users').where('id', userId).first()
  return user
}
