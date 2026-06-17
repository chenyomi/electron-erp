#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const {
  nsisSidebarSvg,
  nsisHeaderSvg,
} = require('./brand-assets.cjs')

const root = path.resolve(__dirname, '..')
const resourcesDir = path.join(root, 'resources')
const BRAND = {
  primary: '#4f7df3',
  primary2: '#64d2ff',
  bg: '#07111f',
  text: '#f7fbff',
  muted: '#a9bad6',
}

const installerSlides = [
  {
    image: 'installer-screenshot-1.png',
    eyebrow: 'DASHBOARD',
    titleLines: ['总账首页', '一屏看清'],
    descLines: ['现金、公账、承兑票汇总展示', '经营数据打开就能看'],
  },
  {
    image: 'installer-screenshot-2.png',
    eyebrow: 'PRINT',
    titleLines: ['出库单据', '清晰打印'],
    descLines: ['自动生成单据预览', '支持 PDF、套打和留档'],
  },
  {
    image: 'installer-screenshot-3.png',
    eyebrow: 'DARK MODE',
    titleLines: ['深色模式', '久看不累'],
    descLines: ['现金账流水本地完成', '夜间录入更舒服'],
  },
  {
    image: 'installer-screenshot-4.png',
    eyebrow: 'BILINGUAL',
    titleLines: ['中英文界面', '随时切换'],
    descLines: ['同一套账务数据', '两种语言快速上手'],
  },
]

async function renderSvg(svg, outputPath, format = 'png') {
  if (format === 'bmp') {
    await renderImageAsBmp(sharp(Buffer.from(svg)), outputPath)
    return
  }

  await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath)
}

async function renderImageAsBmp(image, outputPath) {
  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  writeBmp(outputPath, data, info.width, info.height)
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

function xmlEscape(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function baseSlideSvg(slide, index, total) {
  const dots = Array.from({ length: total }, (_, dotIndex) => {
    const x = 280 + dotIndex * 18
    const fill = dotIndex === index ? BRAND.primary2 : 'rgba(169,186,214,0.36)'
    return `<circle cx="${x}" cy="286" r="4" fill="${fill}"/>`
  }).join('')
  const title = slide.titleLines.map((line, lineIndex) => (
    `<text x="42" y="${102 + lineIndex * 38}" font-family="sans-serif" font-size="28" font-weight="700" fill="${BRAND.text}">${xmlEscape(line)}</text>`
  )).join('')
  const desc = slide.descLines.map((line, lineIndex) => (
    `<text x="42" y="${172 + lineIndex * 22}" font-family="sans-serif" font-size="13" fill="${BRAND.muted}">${xmlEscape(line)}</text>`
  )).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="620" height="310" viewBox="0 0 620 310" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="shade" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#07111f" stop-opacity="0.96"/>
      <stop offset="48%" stop-color="#0f1b2d" stop-opacity="0.90"/>
      <stop offset="100%" stop-color="#10243b" stop-opacity="0.82"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${BRAND.primary}"/>
      <stop offset="100%" stop-color="${BRAND.primary2}"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="16" flood-color="#020617" flood-opacity="0.42"/>
    </filter>
  </defs>
  <rect width="620" height="310" fill="url(#shade)"/>
  <circle cx="520" cy="48" r="92" fill="${BRAND.primary2}" opacity="0.13"/>
  <circle cx="88" cy="268" r="104" fill="${BRAND.primary}" opacity="0.12"/>
  <text x="42" y="68" font-family="sans-serif" font-size="12" font-weight="700" letter-spacing="2" fill="${BRAND.primary2}">${xmlEscape(slide.eyebrow)}</text>
  ${title}
  ${desc}
  <rect x="42" y="222" width="132" height="40" rx="15" fill="rgba(79,125,243,0.18)" stroke="rgba(100,210,255,0.28)" stroke-width="1"/>
  <text x="108" y="247" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="700" fill="${BRAND.text}">正在准备安装</text>
  <rect x="248" y="38" width="336" height="224" rx="22" fill="rgba(255,255,255,0.10)" filter="url(#shadow)"/>
  ${dots}
</svg>`
}

function slideFrameSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="620" height="310" viewBox="0 0 620 310" xmlns="http://www.w3.org/2000/svg">
  <rect x="248" y="38" width="336" height="224" rx="22" fill="none" stroke="rgba(255,255,255,0.24)" stroke-width="1"/>
  <rect x="248" y="38" width="336" height="30" rx="22" fill="rgba(255,255,255,0.14)"/>
  <circle cx="268" cy="53" r="4" fill="#ff6b6b"/>
  <circle cx="282" cy="53" r="4" fill="#ffd166"/>
  <circle cx="296" cy="53" r="4" fill="#4ade80"/>
</svg>`
}

async function renderShowcaseSlide(slide, index) {
  const sourcePath = path.join(resourcesDir, slide.image)
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing installer screenshot: ${sourcePath}`)
  }

  const background = await sharp(sourcePath)
    .resize(620, 310, { fit: 'cover' })
    .blur(14)
    .modulate({ brightness: 0.42, saturation: 0.86 })
    .png()
    .toBuffer()
  const screenshot = await sharp(sourcePath)
    .resize(318, 188, { fit: 'cover' })
    .png()
    .toBuffer()

  await renderImageAsBmp(
    sharp(background).composite([
      { input: Buffer.from(baseSlideSvg(slide, index, installerSlides.length)), left: 0, top: 0 },
      { input: screenshot, left: 257, top: 68 },
      { input: Buffer.from(slideFrameSvg()), left: 0, top: 0 },
    ]),
    path.join(resourcesDir, `installer-showcase-${index + 1}.bmp`)
  )
}

function dmgOverlaySvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="680" height="500" viewBox="0 0 680 500" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="shade" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f8fbff" stop-opacity="0.96"/>
      <stop offset="100%" stop-color="#e8efff" stop-opacity="0.90"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${BRAND.primary}"/>
      <stop offset="100%" stop-color="${BRAND.primary2}"/>
    </linearGradient>
  </defs>
  <rect width="680" height="500" fill="url(#shade)"/>
  <circle cx="572" cy="80" r="120" fill="${BRAND.primary}" opacity="0.11"/>
  <circle cx="110" cy="416" r="130" fill="${BRAND.primary2}" opacity="0.13"/>
  <text x="340" y="48" text-anchor="middle" font-family="sans-serif" font-size="24" font-weight="700" fill="#0f1729">安装东昊账务</text>
  <text x="340" y="76" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#64748b">本地账务、库存和单据管理，离线也能稳定使用</text>
  <rect x="88" y="104" width="504" height="236" rx="28" fill="#ffffff" opacity="0.92"/>
  <rect x="88" y="104" width="504" height="236" rx="28" fill="none" stroke="rgba(79,125,243,0.16)" stroke-width="1"/>
  <text x="340" y="452" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="700" fill="#0f1729">将左侧图标拖到右侧「应用程序」文件夹完成安装</text>
  <rect x="0" y="497" width="680" height="3" fill="url(#accent)" opacity="0.70"/>
</svg>`
}

async function renderDmgBackground() {
  const sourcePath = path.join(resourcesDir, installerSlides[0].image)
  const screenshot = await sharp(sourcePath)
    .resize(464, 274, { fit: 'cover' })
    .png()
    .toBuffer()

  await sharp(Buffer.from(dmgOverlaySvg()))
    .composite([{ input: screenshot, left: 108, top: 124 }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(path.join(resourcesDir, 'dmg-background.png'))
}

async function main() {
  fs.mkdirSync(resourcesDir, { recursive: true })

  await renderDmgBackground()
  await renderSvg(nsisSidebarSvg(), path.join(resourcesDir, 'installer-sidebar.bmp'), 'bmp')
  await renderSvg(nsisHeaderSvg(), path.join(resourcesDir, 'installer-header.bmp'), 'bmp')
  for (let index = 0; index < installerSlides.length; index++) {
    await renderShowcaseSlide(installerSlides[index], index)
  }

  console.log('Generated installer assets in resources/')
  console.log('  - dmg-background.png')
  console.log('  - installer-sidebar.bmp')
  console.log('  - installer-header.bmp')
  for (let index = 0; index < installerSlides.length; index++) {
    console.log(`  - installer-showcase-${index + 1}.bmp`)
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
