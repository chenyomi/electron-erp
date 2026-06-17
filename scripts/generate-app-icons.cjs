#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const sharp = require('sharp')
const { appIconSvg } = require('./brand-assets.cjs')

const root = path.resolve(__dirname, '..')
const resourcesDir = path.join(root, 'resources')
const iconsetDir = path.join(resourcesDir, 'icon.iconset')

async function png(size) {
  return sharp(Buffer.from(appIconSvg(size)))
    .resize(size, size)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer()
}

function writeIco(entries, outputPath) {
  const headerSize = 6
  const entrySize = 16
  let offset = headerSize + entries.length * entrySize
  const header = Buffer.alloc(offset)

  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)

  entries.forEach((entry, index) => {
    const pos = headerSize + index * entrySize
    header.writeUInt8(entry.size >= 256 ? 0 : entry.size, pos)
    header.writeUInt8(entry.size >= 256 ? 0 : entry.size, pos + 1)
    header.writeUInt8(0, pos + 2)
    header.writeUInt8(0, pos + 3)
    header.writeUInt16LE(1, pos + 4)
    header.writeUInt16LE(32, pos + 6)
    header.writeUInt32LE(entry.buffer.length, pos + 8)
    header.writeUInt32LE(offset, pos + 12)
    offset += entry.buffer.length
  })

  fs.writeFileSync(outputPath, Buffer.concat([header, ...entries.map(entry => entry.buffer)]))
}

async function main() {
  fs.mkdirSync(resourcesDir, { recursive: true })
  fs.rmSync(iconsetDir, { recursive: true, force: true })
  fs.mkdirSync(iconsetDir, { recursive: true })

  fs.writeFileSync(path.join(resourcesDir, 'icon.svg'), appIconSvg(1024))
  fs.writeFileSync(path.join(resourcesDir, 'icon.png'), await png(1024))

  const iconsetFiles = [
    ['icon_16x16.png', 16],
    ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32],
    ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128],
    ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256],
    ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512],
    ['icon_512x512@2x.png', 1024]
  ]

  for (const [name, size] of iconsetFiles) {
    fs.writeFileSync(path.join(iconsetDir, name), await png(size))
  }

  if (process.platform === 'darwin') {
    try {
      execFileSync('xattr', ['-cr', iconsetDir])
    } catch {
      // ignore when xattr is unavailable
    }
    execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', path.join(resourcesDir, 'icon.icns')])
  } else {
    console.log('Skipped icon.icns (macOS only)')
  }
  fs.rmSync(iconsetDir, { recursive: true, force: true })

  const icoSizes = [16, 24, 32, 48, 64, 128, 256]
  const icoEntries = []
  for (const size of icoSizes) {
    icoEntries.push({ size, buffer: await png(size) })
  }
  writeIco(icoEntries, path.join(resourcesDir, 'icon.ico'))

  console.log('Generated app icons in resources/')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
