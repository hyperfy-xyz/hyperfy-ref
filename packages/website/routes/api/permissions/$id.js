import moment from 'moment'

export async function get(ctx) {
  if (!ctx.hasApiSecret) return Response.error()
  const { id } = ctx.params
  const isSpace = !id.includes('@')
  let permissions = await ctx.db('permissions').where('id', id).first()
  if (!permissions) {
    const now = moment().toISOString()
    if (isSpace) {
      permissions = {
        id,
        spaceAdmin: false,
        spaceMeta: false,
        prototypeCreate: true,
        prototypeEdit: true,
        prototypeMove: true,
        prototypeDestroy: true,
        itemSpawn: true,
        itemMove: true,
        itemReturn: true,
        avatarVoice: true,
        avatarMute: true,
        avatarKick: true,
        createdAt: now,
        updatedAt: now,
      }
    } else {
      permissions = {
        id,
        spaceAdmin: false,
        spaceMeta: false,
        prototypeCreate: false,
        prototypeEdit: false,
        prototypeMove: false,
        prototypeDestroy: false,
        itemSpawn: false,
        itemMove: false,
        itemReturn: false,
        avatarVoice: false,
        avatarMute: false,
        avatarKick: false,
        createdAt: now,
        updatedAt: now,
      }
    }
    await ctx.db('permissions').insert(permissions)
  }
  return permissions
}
