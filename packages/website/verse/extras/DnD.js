const allowedExt = ['glb', 'vox']

export class DnD {
  constructor(viewport, emit) {
    this.viewport = viewport
    this.emit = emit
    this.target = null
    this.dropping = false
    viewport.addEventListener('dragover', this.onOver)
    viewport.addEventListener('dragenter', this.onEnter)
    viewport.addEventListener('dragleave', this.onLeave)
    viewport.addEventListener('drop', this.onDrop)
  }

  onOver = e => {
    e.preventDefault()
    this.emit({ event: 'over' })
  }

  onEnter = e => {
    this.target = e.target
    this.dropping = true
    this.emit({ event: 'enter' })
  }

  onLeave = e => {
    if (this.target === e.target) {
      this.dropping = false
    }
    this.emit({ event: 'leave' })
  }

  onDrop = async e => {
    e.preventDefault()
    this.dropping = false
    const dt = e.dataTransfer
    const file = dt.files[0]
    const ext = file.name.slice(-3)
    if (allowedExt.includes(ext)) {
      return this.emit({ event: 'file', file, ext })
    }
    // const url = dt.getData('URL') || dt.getData('text/uri-list')
    // if (url) {
    //   return this.emit({ event: 'url', url })
    // }
  }

  destroy() {
    this.viewport.removeEventListener('dragover', this.onOver)
    this.viewport.removeEventListener('dragenter', this.onEnter)
    this.viewport.removeEventListener('dragleave', this.onLeave)
    this.viewport.removeEventListener('drop', this.onDrop)
    this.viewport = null
  }
}
