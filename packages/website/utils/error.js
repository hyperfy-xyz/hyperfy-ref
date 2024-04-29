export function error(code) {
  const body = JSON.stringify({ code })
  return new Response(body, {
    status: 400,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
