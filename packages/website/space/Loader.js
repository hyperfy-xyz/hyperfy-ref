import { System } from './System'

export class Loader extends System {
  constructor(space) {
    super(space)
  }

  log(...args) {
    console.log('[loader]', ...args)
  }
}
