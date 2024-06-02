import moment from 'moment'

export async function get(ctx) {
  if (!ctx.hasApiSecret) return Response.error()
  const { id } = ctx.params
  let world = await ctx.db('worlds').where('id', id).first()
  if (!world) {
    const now = moment().toISOString()
    world = {
      id,
      name: 'New World',
      ownerId: null,
      createdAt: now,
      updatedAt: now,
    }
    await ctx.db('worlds').insert(world)
  }
  return world
}
