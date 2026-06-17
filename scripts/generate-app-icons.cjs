#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const sharp = require('sharp')

const root = path.resolve(__dirname, '..')
const resourcesDir = path.join(root, 'resources')
const iconsetDir = path.join(resourcesDir, 'icon.iconset')

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="192" y1="128" x2="832" y2="896" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#3B82F6"/>
      <stop offset="1" stop-color="#2563EB"/>
    </linearGradient>
    <filter id="shadow" x="40" y="48" width="944" height="944" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="28" stdDeviation="34" flood-color="#071225" flood-opacity="0.28"/>
    </filter>
  </defs>
  <rect x="96" y="96" width="832" height="832" rx="214" fill="url(#bg)" filter="url(#shadow)"/>
  <text
    x="512"
    y="524"
    text-anchor="middle"
    dominant-baseline="middle"
    font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans CJK SC, Arial, sans-serif"
    font-size="500"
    font-weight="800"
    fill="#FFFFFF"
  >东</text>
</svg>
`

async function png(size) {
  return sharp(Buffer.from(svg))
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

  fs.writeFileSync(path.join(resourcesDir, 'icon.svg'), svg)
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
