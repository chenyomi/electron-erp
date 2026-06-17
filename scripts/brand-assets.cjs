const path = require('path')
const fs = require('fs')
const opentype = require('opentype.js')

const BRAND = {
  primary: '#6f8cff',
  primary2: '#58c4dc',
  bg: '#07111f',
  surface: '#0f1b2d',
  text: '#e8f0ff',
  muted: '#91a4bf',
}

let fontCache = null

function getFont() {
  if (!fontCache) {
    const fontPath = path.join(
      path.dirname(require.resolve('@fontsource/noto-sans-sc/package.json')),
      'files/noto-sans-sc-chinese-simplified-700-normal.woff'
    )
    const buffer = fs.readFileSync(fontPath)
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    fontCache = opentype.parse(arrayBuffer)
  }
  return fontCache
}

function centerTextPath(char, cx, cy, fontSize) {
  const font = getFont()
  const probe = font.getPath(char, 0, 0, fontSize)
  const bbox = probe.getBoundingBox()
  const x = cx - (bbox.x1 + bbox.x2) / 2
  const y = cy - (bbox.y1 + bbox.y2) / 2
  return font.getPath(char, x, y, fontSize).toPathData(2)
}

function sharedDefs(prefix = '') {
  const id = suffix => `${prefix}${suffix}`
  return `
    <defs>
      <linearGradient id="${id('logoGrad')}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${BRAND.primary}"/>
        <stop offset="100%" stop-color="${BRAND.primary2}"/>
      </linearGradient>
      <linearGradient id="${id('logoShine')}" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.24"/>
        <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="${id('bgGrad')}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${BRAND.bg}"/>
        <stop offset="55%" stop-color="${BRAND.surface}"/>
        <stop offset="100%" stop-color="#12243a"/>
      </linearGradient>
      <radialGradient id="${id('glowA')}" cx="18%" cy="10%" r="40%">
        <stop offset="0%" stop-color="${BRAND.primary}" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="${BRAND.primary}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="${id('glowB')}" cx="84%" cy="8%" r="34%">
        <stop offset="0%" stop-color="${BRAND.primary2}" stop-opacity="0.12"/>
        <stop offset="100%" stop-color="${BRAND.primary2}" stop-opacity="0"/>
      </radialGradient>
    </defs>
  `
}

function logoMarkSvg(cx, cy, size, radius, prefix = '') {
  const x = cx - size / 2
  const y = cy - size / 2
  const fontSize = size * 0.46
  const textPath = centerTextPath('东', cx, cy, fontSize)
  const id = suffix => `${prefix}${suffix}`

  return `
    <g>
      <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}" fill="url(#${id('logoGrad')})"/>
      <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}" fill="url(#${id('logoShine')})"/>
      <path d="${textPath}" fill="#FFFFFF"/>
    </g>
  `
}

function appIconSvg(size = 1024) {
  const padding = Math.round(size * 0.08)
  const inner = size - padding * 2
  const radius = Math.round(inner * 0.22)
  const cx = size / 2
  const cy = size / 2
  const fontSize = inner * 0.46
  const textPath = centerTextPath('东', cx, cy, fontSize)

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  ${sharedDefs('icon')}
  <rect x="${padding}" y="${padding}" width="${inner}" height="${inner}" rx="${radius}" fill="url(#iconlogoGrad)"/>
  <rect x="${padding}" y="${padding}" width="${inner}" height="${inner}" rx="${radius}" fill="url(#iconlogoShine)"/>
  <path d="${textPath}" fill="#FFFFFF"/>
</svg>`
}

function dmgBackgroundSvg() {
  const w = 540
  const h = 380

  // 中间区域留给系统放 app 图标和「应用程序」文件夹，不要画任何图案
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  ${sharedDefs('dmg')}
  <rect width="${w}" height="${h}" fill="url(#dmgbgGrad)"/>
  <rect width="${w}" height="${h}" fill="url(#dmgglowA)"/>
  <rect width="${w}" height="${h}" fill="url(#dmgglowB)"/>

  <text x="${w / 2}" y="36" text-anchor="middle"
    font-family="sans-serif" font-size="20" font-weight="700" fill="${BRAND.text}">东昊账务</text>
  <text x="${w / 2}" y="58" text-anchor="middle"
    font-family="sans-serif" font-size="11" fill="${BRAND.muted}">将左侧图标拖到右侧「应用程序」文件夹</text>

  <rect x="0" y="${h - 3}" width="${w}" height="3" fill="url(#dmglogoGrad)" opacity="0.55"/>
</svg>`
}

function nsisSidebarSvg() {
  const w = 164
  const h = 314

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  ${sharedDefs('side')}
  <rect width="${w}" height="${h}" fill="url(#sidebgGrad)"/>
  <rect width="${w}" height="${h}" fill="url(#sideglowA)"/>
  <rect width="${w}" height="${h}" fill="url(#sideglowB)"/>

  ${logoMarkSvg(82, 68, 60, 18, 'side')}

  <text x="82" y="128" text-anchor="middle"
    font-family="sans-serif" font-size="17" font-weight="700" fill="${BRAND.text}">东昊账务</text>
  <text x="82" y="150" text-anchor="middle"
    font-family="sans-serif" font-size="10" fill="${BRAND.muted}">Enterprise Ledger</text>

  <rect x="28" y="168" width="108" height="1" fill="rgba(148,163,184,0.16)"/>

  <text x="82" y="196" text-anchor="middle"
    font-family="sans-serif" font-size="10" fill="${BRAND.muted}">现金账 · 公账 · 承兑票</text>
  <text x="82" y="214" text-anchor="middle"
    font-family="sans-serif" font-size="10" fill="${BRAND.muted}">客户往来 · 数据备份</text>

  <rect x="20" y="244" width="124" height="44" rx="14"
    fill="rgba(111,140,255,0.1)" stroke="rgba(111,140,255,0.22)" stroke-width="1"/>
  <text x="82" y="264" text-anchor="middle"
    font-family="sans-serif" font-size="10" font-weight="700" fill="${BRAND.text}">安全 · 本地 · 离线</text>
  <text x="82" y="278" text-anchor="middle"
    font-family="sans-serif" font-size="9" fill="${BRAND.muted}">更新前请先备份</text>
</svg>`
}

function nsisHeaderSvg() {
  const w = 150
  const h = 57

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  ${sharedDefs('head')}
  <rect width="${w}" height="${h}" fill="url(#headbgGrad)"/>
  <rect width="${w}" height="${h}" fill="url(#headglowA)"/>
  ${logoMarkSvg(30, 28, 40, 12, 'head')}
  <text x="58" y="26"
    font-family="sans-serif" font-size="13" font-weight="700" fill="${BRAND.text}">东昊账务</text>
  <text x="58" y="42"
    font-family="sans-serif" font-size="9" fill="${BRAND.muted}">安装向导</text>
  <rect x="0" y="${h - 2}" width="${w}" height="2" fill="url(#headlogoGrad)" opacity="0.7"/>
</svg>`
}

module.exports = {
  BRAND,
  appIconSvg,
  dmgBackgroundSvg,
  nsisSidebarSvg,
  nsisHeaderSvg,
}
