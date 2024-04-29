import { useEffect } from 'react'
import 'ses'

export function Lockdown() {
  useEffect(() => {
    lockdown()
  }, [])
}
