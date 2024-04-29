import { System } from './System'

import { uuid } from '@/utils/uuid'

export class Items extends System {
  constructor(space) {
    super(space)
    // this.items = new Map()
  }

  update(delta) {
    // ...
  }

  // add(data, local) {
  //   const item = new Item(this.space).deserialize(data)
  //   this.items.set(item.id, item)
  //   if (local) {
  //     const update = this.network.update
  //     if (!update.addItems) {
  //       update.addItems = []
  //     }
  //     update.addItems.push(item.serialize())
  //   }
  // }

  log(...args) {
    console.log('[items]', ...args)
  }
}

// class Item {
//   constructor(space) {
//     this.space = space
//     this.id = null
//     this.name = null
//   }

//   deserialize(data) {
//     this.id = data.id || uuid()
//     this.name = data.name
//   }

//   serialize() {
//     return {
//       id: this.id,
//       name: this.name,
//     }
//   }
// }
