import { fork } from 'child_process'
// import path from 'path'
// import fs from 'fs-extra'
import chokidar from 'chokidar'
import * as esbuild from 'esbuild'
import _ from 'lodash'

const options = {
  watch: process.argv.includes('--watch'),
  run: process.argv.includes('--run'),
}

// const cwd = process.cwd()

let server

async function build() {
  // log('build...')
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
  // log('build complete')
}

async function run() {
  // log('run...')
  server = fork('dist/index.js', {
    // env: {
    //   // PATH: process.env.PATH,
    // },
  })
  // await signal(server, 'hyp_ready')
  // log('run complete')
}

async function watch() {
  // export const cwd = process.cwd()
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
    // changes.push({ type, path });
    handleChanges()
  })
  // log('watching')
}

// function signal(proc, signal) {
//   return new Promise(resolve => {
//     function onMessage(m) {
//       if (m === signal) {
//         proc.off('message', onMessage)
//         resolve()
//       }
//     }
//     proc.on('message', onMessage)
//   })
// }

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

function log(...args) {
  console.log('[build]', ...args)
}

start()
