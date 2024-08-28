export function wrapRawCode(code) {
  return `
(function() {
  const shared = {}
  return (world, object) => {
    ${code}
  }
})()
`
}
