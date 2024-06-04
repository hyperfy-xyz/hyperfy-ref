export function num(min, max, dp = 0) {
  const value = Math.random() * (max - min) + min
  return parseFloat(value.toFixed(dp))
}
