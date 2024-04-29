import { useState } from 'react'

export function useForceUpdate() {
  const [n, setN] = useState(0)
  return () => setN(n => n + 1)
}
