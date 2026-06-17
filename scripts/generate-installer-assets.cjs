#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const root = path.resolve(__dirname, '..')
const resourcesDir = path.join(root, 'resources')

const BRAND = {
  primary: '#6f8cff',
  primary2: '#58c4dc',
  bg: '#07111f',
  surface: '#0f1b2d',
  text: '#e8f0ff',
  muted: '#91a4bf',
}

function gridPattern(id) {
  return `
    <pattern id="${id}" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(148,163,184,0.06)" stroke-width="1"/>
    </pattern>
  `
}

function logoMark(x, y, size, radius = 18) {
  const fontSize = Math.round(size * 0.46)
  return `
    <g transform="translate(${x}, ${y})">
      <rect width="${size}" height="${size}" rx="${radius}" fill="url(#logoGrad)"/>
      <rect width="${size}" height="${size}" rx="${radius}" fill="url(#logoShine)" opacity="0.35"/>
      <text x="${size / 2}" y="${size / 2 + fontSize * 0.04}" text-anchor="middle" dominant-baseline="middle"
        font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans CJK SC, Arial, sans-serif"
        font-size="${fontSize}" font-weight="800" fill="#FFFFFF">东</text>
    </g>
  `
}

function defs(prefix) {
  return `
    <defs>
      ${gridPattern(`${prefix}Grid`)}
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${BRAND.bg}"/>
        <stop offset="55%" stop-color="${BRAND.surface}"/>
        <stop offset="100%" stop-color="#12243a"/>
      </linearGradient>
      <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${BRAND.primary}"/>
        <stop offset="100%" stop-color="${BRAND.primary2}"/>
      </linearGradient>
      <linearGradient id="logoShine" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.28"/>
        <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
      </linearGradient>
      <radialGradient id="glowA" cx="18%" cy="12%" r="42%">
        <stop offset="0%" stop-color="${BRAND.primary}" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="${BRAND.primary}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="glowB" cx="88%" cy="8%" r="36%">
        <stop offset="0%" stop-color="${BRAND.primary2}" stop-opacity="0.16"/>
        <stop offset="100%" stop-color="${BRAND.primary2}" stop-opacity="0"/>
      </radialGradient>
      <marker id="arrowHead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
        <path d="M0,0 L8,4 L0,8 Z" fill="${BRAND.primary}" opacity="0.85"/>
      </marker>
    </defs>
  `
}

function dmgBackgroundSvg() {
  const w = 540
  const h = 380
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  ${defs('dmg')}
  <rect width="${w}" height="${h}" fill="url(#bgGrad)"/>
  <rect width="${w}" height="${h}" fill="url(#dmgGrid)"/>
  <rect width="${w}" height="${h}" fill="url(#glowA)"/>
  <rect width="${w}" height="${h}" fill="url(#glowB)"/>

  ${logoMark(28, 24, 44, 14)}
  <text x="84" y="44" font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans CJK SC, Arial, sans-serif"
    font-size="22" font-weight="800" fill="${BRAND.text}">东昊账务</text>
  <text x="84" y="64" font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans CJK SC, Arial, sans-serif"
    font-size="11" fill="${BRAND.muted}">温州东昊汽车配件 · 账务管理系统</text>

  <rect x="24" y="88" width="492" height="1" fill="rgba(148,163,184,0.12)"/>

  <rect x="96" y="168" width="96" height="96" rx="22" fill="rgba(111,140,255,0.06)" stroke="rgba(111,140,255,0.18)" stroke-width="1.5" stroke-dasharray="6 4"/>
  <rect x="348" y="168" width="96" height="96" rx="22" fill="rgba(88,196,220,0.06)" stroke="rgba(88,196,220,0.18)" stroke-width="1.5" stroke-dasharray="6 4"/>

  <path d="M 208 216 C 248 216, 288 216, 328 216" fill="none" stroke="${BRAND.primary}" stroke-width="2.5"
    stroke-dasharray="7 5" marker-end="url(#arrowHead)" opacity="0.9"/>

  <text x="144" y="292" text-anchor="middle"
    font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans CJK SC, Arial, sans-serif"
    font-size="12" font-weight="700" fill="${BRAND.text}">东昊账务</text>
  <text x="396" y="292" text-anchor="middle"
    font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans CJK SC, Arial, sans-serif"
    font-size="12" font-weight="700" fill="${BRAND.text}">应用程序</text>

  <text x="270" y="338" text-anchor="middle"
    font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans CJK SC, Arial, sans-serif"
    font-size="13" fill="${BRAND.muted}">将左侧图标拖到右侧文件夹完成安装</text>

  <rect x="0" y="${h - 4}" width="${w}" height="4" fill="url(#logoGrad)" opacity="0.55"/>
</svg>`
}

function nsisSidebarSvg() {
  const w = 164
  const h = 314
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  ${defs('side')}
  <rect width="${w}" height="${h}" fill="url(#bgGrad)"/>
  <rect width="${w}" height="${h}" fill="url(#sideGrid)"/>
  <rect width="${w}" height="${h}" fill="url(#glowA)"/>
  <rect width="${w}" height="${h}" fill="url(#glowB)"/>

  ${logoMark(52, 36, 60, 18)}

  <text x="82" y="128" text-anchor="middle"
    font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans CJK SC, Arial, sans-serif"
    font-size="18" font-weight="800" fill="${BRAND.text}">东昊账务</text>
  <text x="82" y="152" text-anchor="middle"
    font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans CJK SC, Arial, sans-serif"
    font-size="10" fill="${BRAND.muted}">Enterprise Ledger</text>

  <rect x="28" y="172" width="108" height="1" fill="rgba(148,163,184,0.16)"/>

  <text x="82" y="198" text-anchor="middle"
    font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans CJK SC, Arial, sans-serif"
    font-size="10" fill="${BRAND.muted}">现金账 · 公账 · 承兑票</text>
  <text x="82" y="216" text-anchor="middle"
    font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans CJK SC, Arial, sans-serif"
    font-size="10" fill="${BRAND.muted}">客户往来 · 数据备份</text>

  <rect x="20" y="248" width="124" height="44" rx="14" fill="rgba(111,140,255,0.1)" stroke="rgba(111,140,255,0.22)" stroke-width="1"/>
  <text x="82" y="268" text-anchor="middle"
    font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans CJK SC, Arial, sans-serif"
    font-size="10" font-weight="700" fill="${BRAND.text}">安全 · 本地 · 离线</text>
  <text x="82" y="282" text-anchor="middle"
    font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans CJK SC, Arial, sans-serif"
    font-size="9" fill="${BRAND.muted}">更新前请先备份</text>
</svg>`
}

function nsisHeaderSvg() {
  const w = 150
  const h = 57
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  ${defs('head')}
  <rect width="${w}" height="${h}" fill="url(#bgGrad)"/>
  <rect width="${w}" height="${h}" fill="url(#glowA)"/>
  ${logoMark(10, 8, 40, 12)}
  <text x="58" y="26"
    font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans CJK SC, Arial, sans-serif"
    font-size="13" font-weight="800" fill="${BRAND.text}">东昊账务</text>
  <text x="58" y="42"
    font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans CJK SC, Arial, sans-serif"
    font-size="9" fill="${BRAND.muted}">安装向导</text>
  <rect x="0" y="${h - 2}" width="${w}" height="2" fill="url(#logoGrad)" opacity="0.7"/>
</svg>`
}

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
