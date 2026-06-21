#!/usr/bin/env node
/**
 * Rename release artifacts to match electron-updater manifest URLs.
 * electron-builder writes ASCII urls in latest*.yml while local files may use
 * productName (e.g. 东昊账务-*.zip). GitHub uploads use disk names, causing 404.
 */
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const releaseDir = process.argv[2] || 'release'
const manifestNames = ['latest-mac.yml', 'latest.yml']

function sha512Base64(filePath) {
  const hash = crypto.createHash('sha512')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('base64')
}

function listFiles(dir) {
  const result = []
  if (!fs.existsSync(dir)) return result
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) result.push(...listFiles(fullPath))
    else result.push(fullPath)
  }
  return result
}

function parseManifestEntries(content) {
  const entries = []
  let current = null

  for (const line of content.split('\n')) {
    const urlMatch = line.match(/^\s*url:\s*(.+?)\s*$/)
    if (urlMatch) {
      current = { url: urlMatch[1] }
      continue
    }
    const shaMatch = line.match(/^\s*sha512:\s*(.+?)\s*$/)
    if (shaMatch && current && !current.sha512) {
      current.sha512 = shaMatch[1]
      entries.push(current)
      current = null
      continue
    }
    const pathMatch = line.match(/^\s*path:\s*(.+?)\s*$/)
    if (pathMatch) {
      entries.push({ url: pathMatch[1], sha512: null })
    }
  }

  return entries
}

function readManifest(filePath) {
  if (!fs.existsSync(filePath)) return []
  return parseManifestEntries(fs.readFileSync(filePath, 'utf8'))
}

function uniqueEntries(manifests) {
  const byUrl = new Map()
  for (const entry of manifests) {
    if (!entry.url || byUrl.has(entry.url)) continue
    byUrl.set(entry.url, entry)
  }
  return [...byUrl.values()]
}

if (!fs.existsSync(releaseDir)) {
  console.error(`Release directory not found: ${releaseDir}`)
  process.exit(1)
}

const manifestEntries = uniqueEntries(
  manifestNames.flatMap(name => readManifest(path.join(releaseDir, name)))
)

if (manifestEntries.length === 0) {
  console.log(`No update manifests found in ${releaseDir}, skipping rename`)
  process.exit(0)
}

const allFiles = listFiles(releaseDir).filter(filePath => {
  const base = path.basename(filePath)
  return !manifestNames.includes(base) && base !== 'builder-debug.yml'
})

const used = new Set()

for (const entry of manifestEntries) {
  const targetPath = path.join(releaseDir, entry.url)
  if (fs.existsSync(targetPath)) {
    used.add(targetPath)
    continue
  }

  let sourcePath = null
  if (entry.sha512) {
    sourcePath = allFiles.find(filePath => {
      if (used.has(filePath)) return false
      return sha512Base64(filePath) === entry.sha512
    }) || null
  }

  if (!sourcePath) {
    const guess = allFiles.find(filePath => {
      if (used.has(filePath)) return false
      return path.basename(filePath).endsWith(path.basename(entry.url))
    })
    sourcePath = guess || null
  }

  if (!sourcePath) {
    console.error(`Cannot locate release file for manifest url: ${entry.url}`)
    process.exit(1)
  }

  fs.renameSync(sourcePath, targetPath)
  used.add(targetPath)
  console.log(`Renamed ${path.basename(sourcePath)} -> ${entry.url}`)

  const sourceBlockmap = `${sourcePath}.blockmap`
  const targetBlockmap = `${targetPath}.blockmap`
  if (fs.existsSync(sourceBlockmap) && !fs.existsSync(targetBlockmap)) {
    fs.renameSync(sourceBlockmap, targetBlockmap)
    console.log(`Renamed ${path.basename(sourceBlockmap)} -> ${path.basename(targetBlockmap)}`)
  }
}

console.log(`Aligned ${manifestEntries.length} manifest entries in ${releaseDir}`)
