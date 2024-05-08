import moment from 'moment'

export async function get(ctx) {
  if (!ctx.hasApiSecret) return Response.error()
  const { id } = ctx.params
  let space = await ctx.db('spaces').where('id', id).first()
  if (!space) {
    const now = moment().toISOString()
    space = {
      id,
      name: 'New Space',
      ownerId: null,
      createdAt: now,
      updatedAt: now,
    }
    await ctx.db('spaces').insert(space)
  }
  return space
}
