import { useEffect } from 'react'
import 'ses'

export function Lockdown() {
  useEffect(() => {
    lockdown({
      // TODO: in production we may want to flip these
      // but for now this lets us see errors during dev
      errorTaming: 'unsafe',
      errorTrapping: 'none',
      unhandledRejectionTrapping: 'none',
    })
  }, [])
}
