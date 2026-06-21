#!/usr/bin/env node
/**
 * Rename release artifacts to match electron-updater manifest URLs.
 * electron-builder writes ASCII urls in latest*.yml while local files may use
 * productName (e.g. 东昊账务-*.zip) or include arch suffixes that yml omits
 * for the default mac architecture.
 */
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const releaseDir = process.argv[2] || 'release'
const manifestNames = ['latest-mac.yml', 'latest.yml']
const skipNames = new Set([...manifestNames, 'builder-debug.yml'])

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

function flattenNestedReleaseDir(dir) {
  const nested = path.join(dir, 'release')
  if (!fs.existsSync(nested) || !fs.statSync(nested).isDirectory()) return
  for (const name of fs.readdirSync(nested)) {
    const source = path.join(nested, name)
    const target = path.join(dir, name)
    if (fs.existsSync(target)) continue
    fs.renameSync(source, target)
  }
  if (fs.readdirSync(nested).length === 0) fs.rmdirSync(nested)
}

function parseManifestEntries(content) {
  const entries = []
  let current = null

  for (const line of content.split('\n')) {
    const urlMatch = line.match(/^\s*(?:-\s*)?url:\s*(.+?)\s*$/)
    if (urlMatch) {
      current = { url: urlMatch[1] }
      continue
    }
    const pathMatch = line.match(/^\s*path:\s*(.+?)\s*$/)
    if (pathMatch) {
      current = { url: pathMatch[1] }
      continue
    }
    const shaMatch = line.match(/^\s*sha512:\s*(.+?)\s*$/)
    if (shaMatch && current && !current.sha512) {
      current.sha512 = shaMatch[1]
      entries.push(current)
      current = null
      continue
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

function parseMacZipRef(name) {
  const match = name.match(/-(\d+\.\d+\.\d+(?:\.\d+)?)(?:-(arm64|x64|ia32|universal))?-mac\.zip$/i)
  if (!match) return null
  return { version: match[1], arch: match[2] || 'default' }
}

function archKeysCompatible(manifestArch, fileArch) {
  if (manifestArch === fileArch) return true
  if (manifestArch === 'default' && fileArch === 'arm64') return true
  if (manifestArch === 'arm64' && fileArch === 'default') return true
  return false
}

function findBySha512(entry, allFiles, used) {
  if (!entry.sha512) return null
  return allFiles.find(filePath => {
    if (used.has(filePath)) return false
    if (path.extname(filePath).toLowerCase() !== path.extname(entry.url).toLowerCase()) return false
    return sha512Base64(filePath) === entry.sha512
  }) || null
}

function findByMacZipPattern(entry, allFiles, used) {
  const wanted = parseMacZipRef(entry.url)
  if (!wanted) return null

  const candidates = allFiles.filter(filePath => {
    if (used.has(filePath)) return false
    if (!filePath.toLowerCase().endsWith('.zip')) return false
    const info = parseMacZipRef(path.basename(filePath))
    if (!info) return false
    return info.version === wanted.version && archKeysCompatible(wanted.arch, info.arch)
  })

  if (candidates.length === 1) return candidates[0]
  if (candidates.length > 1 && entry.sha512) {
    return candidates.find(filePath => sha512Base64(filePath) === entry.sha512) || null
  }
  return null
}

function findBySuffix(entry, allFiles, used) {
  const suffix = path.basename(entry.url)
  return allFiles.find(filePath => {
    if (used.has(filePath)) return false
    return path.basename(filePath).endsWith(suffix)
  }) || null
}

function findSourceFile(entry, allFiles, used) {
  return findBySha512(entry, allFiles, used)
    || findByMacZipPattern(entry, allFiles, used)
    || findBySuffix(entry, allFiles, used)
}

function renameBlockmap(sourcePath, targetPath) {
  const sourceBlockmap = `${sourcePath}.blockmap`
  const targetBlockmap = `${targetPath}.blockmap`
  if (fs.existsSync(sourceBlockmap) && !fs.existsSync(targetBlockmap)) {
    fs.renameSync(sourceBlockmap, targetBlockmap)
    console.log(`Renamed ${path.basename(sourceBlockmap)} -> ${path.basename(targetBlockmap)}`)
  }
}

function printAvailableFiles(allFiles) {
  console.error('\nAvailable release files:')
  for (const filePath of [...allFiles].sort()) {
    const base = path.basename(filePath)
    if (base.endsWith('.zip') || base.endsWith('.exe') || base.endsWith('.dmg')) {
      console.error(`  ${base}`)
    }
  }
}

if (!fs.existsSync(releaseDir)) {
  console.error(`Release directory not found: ${releaseDir}`)
  process.exit(1)
}

flattenNestedReleaseDir(releaseDir)

const manifestEntries = uniqueEntries(
  manifestNames.flatMap(name => readManifest(path.join(releaseDir, name)))
)

if (manifestEntries.length === 0) {
  console.log(`No update manifests found in ${releaseDir}, skipping rename`)
  process.exit(0)
}

const allFiles = listFiles(releaseDir).filter(filePath => !skipNames.has(path.basename(filePath)))
const used = new Set()

for (const entry of manifestEntries) {
  const targetPath = path.join(releaseDir, entry.url)
  if (fs.existsSync(targetPath)) {
    used.add(targetPath)
    continue
  }

  const sourcePath = findSourceFile(entry, allFiles, used)
  if (!sourcePath) {
    console.error(`Cannot locate release file for manifest url: ${entry.url}`)
    printAvailableFiles(allFiles)
    process.exit(1)
  }

  fs.renameSync(sourcePath, targetPath)
  used.add(targetPath)
  console.log(`Renamed ${path.basename(sourcePath)} -> ${entry.url}`)
  renameBlockmap(sourcePath, targetPath)
}

console.log(`Aligned ${manifestEntries.length} manifest entries in ${releaseDir}`)
