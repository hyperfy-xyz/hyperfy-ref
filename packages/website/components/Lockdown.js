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

      //
      // regExpTaming: 'unsafe',
      // localeTaming: 'unsafe',
      // consoleTaming: 'unsafe',
      // evalTaming: 'unsafeEval',
      // // stackFiltering: ''
      // overrideTaming: 'min',
      // domainTaming: 'unsafe',

      // this is needed for monaco to work correctly.
      // specifically the theming seems to be broken.
      // this shouldn't be an issue as we are not using harden()
      __hardenTaming__: 'unsafe',
    })
  }, [])
}
