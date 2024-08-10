export function wrapRawCode(code) {
  return `
(function() {
  return (world, object) => {
    ${code}
  }
})()
`
}
