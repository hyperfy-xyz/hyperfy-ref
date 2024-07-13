import { fork } from 'child_process'
import chokidar from 'chokidar'
import * as esbuild from 'esbuild'
import _ from 'lodash'

const options = {
  watch: process.argv.includes('--watch'),
  run: process.argv.includes('--run'),
}

let server

async function build() {
  await esbuild.build({
    entryPoints: ['src/index.js'],
    loader: {},
    bundle: true,
    treeShaking: true,
    minify: false,
    sourcemap: true,
    outfile: 'dist/index.js',
    platform: 'node',
    format: 'esm',
    packages: 'external',
  })
}

async function run() {
  server = fork('dist/index.js', {
    // env: {
    //   PATH: process.env.PATH,
    // },
  })
}

async function watch() {
  const watcher = chokidar.watch(['src'], {
    ignoreInitial: true,
  })
  const handleChanges = _.debounce(async () => {
    server.kill('SIGTERM')
    await build()
    if (options.run) {
      await run()
    }
  })
  watcher.on('all', async (type, path) => {
    handleChanges()
  })
}

process.on('exit', () => {
  server?.kill('SIGTERM')
})

async function start() {
  await build()
  if (options.run) {
    await run()
  }
  if (options.watch) {
    await watch()
  }
}

start()
