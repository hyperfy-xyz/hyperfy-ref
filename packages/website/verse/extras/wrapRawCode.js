export function wrapRawCode(code) {
  return `
(function() {
  return object => {
    ${code}
  }
})()
`
}
