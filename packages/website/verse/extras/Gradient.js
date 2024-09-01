// data example:
// a,0,1|a,1,1|c,0,1,0,0|c,1,0,0,1
// a = alpha and c = color
// this is a gradient from red to blue, 100% alpha to 0% alpha
// first number is time (0 to 1)

let ids = 0

export class Gradient {
  constructor() {
    this.alphas = []
    this.colors = []
  }

  deserialize(data) {
    if (!data) return this
    this.alphas = []
    this.colors = []
    for (const str of data.split('|')) {
      const type = str[0]
      if (type === 'a') {
        this.alphas.push(new Alpha().deserialize(str))
      }
      if (type === 'c') {
        this.colors.push(new Color().deserialize(str))
      }
    }
    this.sort()
    return this
  }

  serialize() {
    let data = []
    for (const alpha of this.alphas) {
      data.push(alpha.serialize())
    }
    for (const color of this.colors) {
      data.push(color.serialize())
    }
    return data.join('|')
  }

  clone() {
    return new Gradient().deserialize(this.serialize())
  }

  sort() {
    this.sortAlphas()
    this.sortColors()
  }

  sortAlphas() {
    this.alphas.sort((a, b) => a.time - b.time)
  }

  sortColors() {
    this.colors.sort((a, b) => a.time - b.time)
  }

  addAlpha(time) {
    const alpha = new Alpha()
    alpha.time = time
    alpha.value = this.evaluate(time).a
    this.alphas.push(alpha)
    this.sortAlphas()
    return alpha
  }

  addColor(time) {
    const color = new Color()
    color.time = time
    const val = this.evaluate(time)
    color.r = val.r
    color.g = val.g
    color.b = val.b
    this.colors.push(color)
    this.sortColors()
    return color
  }

  remove(item) {
    if (item.isAlpha) {
      if (this.alphas.length === 2) return false
      this.alphas = this.alphas.filter(a => a !== item)
      this.sortAlphas()
    } else {
      if (this.colors.length === 2) return false
      this.colors = this.colors.filter(c => c !== item)
      this.sortColors()
    }
    return true
  }

  evaluateAlpha(time) {
    let a1
    let a2
    let a = null
    const alphas = this.alphas
    if (time <= alphas[0].time) {
      // time is less than first alpha
      a = alphas[0].value
    } else if (time >= alphas[alphas.length - 1].time) {
      // time is greater than last alpha
      a = alphas[alphas.length - 1].value
    } else {
      // find the alpha
      for (let i = 0; i < alphas.length; i++) {
        if (alphas[i].time === time) {
          a = alphas[i].value
        } else if (alphas[i].time < time) {
          a1 = alphas[i]
        } else if (alphas[i].time > time && !a2) {
          a2 = alphas[i]
        }
      }
      // if no value before the given time, return the first value.
      //   if (!a1) a = a2
      // if no value after the given time, return the last value.
      //   if (!a2) a = a1
      if (a === null) {
        const factor = (time - a1.time) / (a2.time - a1.time)
        a = a1.value + factor * (a2.value - a1.value)
      }
    }
    return a
  }

  evaluateColor(time) {
    let c1
    let c2
    let r = null
    let g = null
    let b = null
    const colors = this.colors
    if (time <= colors[0].time) {
      // time is less than first color
      r = colors[0].r
      g = colors[0].g
      b = colors[0].b
    } else if (time >= colors[colors.length - 1].time) {
      // time is greater than last color
      r = colors[colors.length - 1].r
      g = colors[colors.length - 1].g
      b = colors[colors.length - 1].b
    } else {
      // find the color
      for (let i = 0; i < colors.length; i++) {
        if (colors[i].time === time) {
          r = colors[i].r
          g = colors[i].g
          b = colors[i].b
        } else if (colors[i].time < time) {
          c1 = colors[i]
        } else if (colors[i].time > time && !c2) {
          c2 = colors[i]
        }
      }
      // if no value before the given time, return the first value.
      //   if (!c1) r = c2
      // if no value after the given time, return the last value.
      //   if (!c2) r = c1
      if (r === null) {
        const factor = (time - c1.time) / (c2.time - c1.time)
        r = c1.r + factor * (c2.r - c1.r)
        g = c1.g + factor * (c2.g - c1.g)
        b = c1.b + factor * (c2.b - c1.b)
      }
    }
    return {
      r,
      g,
      b,
    }
  }

  evaluate(time) {
    const color = this.evaluateColor(time)
    color.a = this.evaluateAlpha(time)
    return color
  }

  getStyle() {
    let style = 'linear-gradient(90deg'
    let prevTime
    const add = time => {
      if (prevTime === time) return
      prevTime = time
      const color = this.evaluateColor(time)
      const a = this.evaluateAlpha(time)
      const perc = time * 100
      const r = color.r * 255
      const g = color.g * 255
      const b = color.b * 255
      style += `, rgba(${r}, ${g}, ${b}, ${a}) ${perc}%`
    }

    // sample at 5% intervals for proper blending
    for (let i = 0; i < 100 / 5; i++) {
      add((i * 5) / 100)
    }
    add(1)

    // sample at all stops (not accurate)
    // note: red alpha 1 to blue alpha 0 displays ZERO blue in the visual
    // const items = this.alphas.concat(this.colors)
    // items.sort((a, b) => a.time - b.time)
    // add(0)
    // for (const item of items) {
    //   add(item.time)
    // }
    // add(1)
    style += ')'
    // console.log('style', style)
    return style
  }
}

class Alpha {
  constructor() {
    this.isAlpha = true
    this.id = ++ids
    this.time = 0
    this.value = 1
  }

  deserialize(data) {
    const [type, time, value] = data.split(',')
    this.time = parseFloat(time)
    this.value = parseFloat(value)
    return this
  }

  serialize() {
    // prettier-ignore
    return [
      'a', 
      numToString(this.time), 
      numToString(this.value)
    ].join(',')
  }

  getStyle() {
    return `rgba(255, 255, 255, ${this.value})`
  }
}

class Color {
  constructor() {
    this.isColor = true
    this.id = ++ids
    this.time = 0
    this.r = 0
    this.g = 0
    this.b = 0
  }

  deserialize(data) {
    const [type, time, r, g, b] = data.split(',')
    this.time = parseFloat(time)
    this.r = parseFloat(r)
    this.g = parseFloat(g)
    this.b = parseFloat(b)
    return this
  }

  serialize() {
    return ['c', numToString(this.time), numToString(this.r), numToString(this.g), numToString(this.b)].join(',')
  }

  getStyle(a) {
    const r = this.r * 255
    const g = this.g * 255
    const b = this.b * 255
    if (a === undefined) {
      return `rgb(${r}, ${g}, ${b})`
    } else {
      return `rgba(${r}, ${g}, ${b}, ${a})`
    }
  }

  getHex() {
    return '#' + this.componentToHex(this.r) + this.componentToHex(this.g) + this.componentToHex(this.b)
  }

  setHex(str) {
    this.r = parseInt(str.slice(1, 3), 16) / 255
    this.g = parseInt(str.slice(3, 5), 16) / 255
    this.b = parseInt(str.slice(5, 7), 16) / 255
    return this
  }

  componentToHex(c) {
    let hex = Math.round(c * 255).toString(16)
    return hex.length == 1 ? '0' + hex : hex
  }
}

function numToString(num) {
  if (Number.isInteger(num)) return num.toString()
  return num.toFixed(3)
}
