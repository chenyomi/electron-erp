#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const {
  dmgBackgroundSvg,
  nsisSidebarSvg,
  nsisHeaderSvg,
} = require('./brand-assets.cjs')

const root = path.resolve(__dirname, '..')
const resourcesDir = path.join(root, 'resources')

async function renderSvg(svg, outputPath, format = 'png') {
  const { data, info } = await sharp(Buffer.from(svg))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  if (format === 'bmp') {
    writeBmp(outputPath, data, info.width, info.height)
    return
  }

  await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath)
}

function writeBmp(outputPath, rgba, width, height) {
  const rowSize = Math.ceil((width * 3) / 4) * 4
  const pixelDataSize = rowSize * height
  const fileSize = 54 + pixelDataSize
  const buffer = Buffer.alloc(fileSize)

  buffer.write('BM', 0)
  buffer.writeUInt32LE(fileSize, 2)
  buffer.writeUInt32LE(54, 10)
  buffer.writeUInt32LE(40, 14)
  buffer.writeInt32LE(width, 18)
  buffer.writeInt32LE(height, 22)
  buffer.writeUInt16LE(1, 26)
  buffer.writeUInt16LE(24, 28)
  buffer.writeUInt32LE(pixelDataSize, 34)

  let offset = 54
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      buffer[offset++] = rgba[i + 2]
      buffer[offset++] = rgba[i + 1]
      buffer[offset++] = rgba[i]
    }
    offset += rowSize - width * 3
  }

  fs.writeFileSync(outputPath, buffer)
}

async function main() {
  fs.mkdirSync(resourcesDir, { recursive: true })

  await renderSvg(dmgBackgroundSvg(), path.join(resourcesDir, 'dmg-background.png'))
  await renderSvg(nsisSidebarSvg(), path.join(resourcesDir, 'installer-sidebar.bmp'), 'bmp')
  await renderSvg(nsisHeaderSvg(), path.join(resourcesDir, 'installer-header.bmp'), 'bmp')

  console.log('Generated installer assets in resources/')
  console.log('  - dmg-background.png')
  console.log('  - installer-sidebar.bmp')
  console.log('  - installer-header.bmp')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
