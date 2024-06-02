export async function get(ctx) {
  if (!ctx.hasApiSecret) return Response.error()
  const { worldId } = ctx.params
  console.log('GET /entities', { worldId })
  return [
    // {
    //     type: 'box',
    //     name
    // }
  ]
}
