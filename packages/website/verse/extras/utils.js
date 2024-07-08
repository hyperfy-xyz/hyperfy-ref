export function clamp(n, low, high) {
  return Math.max(Math.min(n, high), low)
}

export function getRandomColorHex() {
  const letters = '0123456789ABCDEF'
  let color = '#'
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)]
  }
  return color
}