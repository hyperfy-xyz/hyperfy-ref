import * as THREE from 'three'
import StatsGL from 'stats-gl'

import { System } from './System'

let stats
const get = () => {
  if (!stats) {
    stats = new StatsGL({
      logsPerSecond: 20,
      samplesLog: 100,
      samplesGraph: 10,
      precision: 2,
      horizontal: true,
      minimal: false,
      mode: 0,
    })
  }
  return stats
}

export class Stats extends System {
  constructor(space) {
    super(space)
    this.stats = get()
    document.body.appendChild(this.stats.dom)
  }

  start() {
    this.stats.init(this.space.graphics.renderer)
  }

  update(delta) {
    this.stats.update()
  }

  destroy() {
    this.stats.dom.remove()
  }
}
