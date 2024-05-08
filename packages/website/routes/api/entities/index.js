export async function get(ctx) {
  if (!ctx.hasApiSecret) return Response.error()
  const { spaceId } = ctx.params
  console.log('GET /entities', { spaceId })
  return [
    // {
    //     type: 'box',
    //     name
    // }
  ]
}
