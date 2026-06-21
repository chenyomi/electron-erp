#!/usr/bin/env node
/**
 * Verify electron-updater manifests reference files that exist in the release folder.
 * Prevents 404 auto-update failures when artifact names diverge from latest*.yml.
 */
const fs = require('fs')
const path = require('path')

const releaseDir = process.argv[2] || 'release'

function listFiles(dir) {
  const names = new Set()
  if (!fs.existsSync(dir)) return names
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      for (const nested of listFiles(fullPath)) names.add(nested)
    } else {
      names.add(entry.name)
    }
  }
  return names
}

function parseYamlRefs(content) {
  const refs = []
  for (const line of content.split('\n')) {
    const match = line.match(/^\s*(?:-\s*)?(?:path|url):\s*(.+?)\s*$/)
    if (match) refs.push(match[1])
  }
  return refs
}

function readManifestRefs(filePath) {
  if (!fs.existsSync(filePath)) return []
  return parseYamlRefs(fs.readFileSync(filePath, 'utf8'))
}

const files = listFiles(releaseDir)
const manifests = ['latest-mac.yml', 'latest.yml']
const missing = []

for (const manifest of manifests) {
  const manifestPath = path.join(releaseDir, manifest)
  if (!fs.existsSync(manifestPath)) continue

  for (const ref of readManifestRefs(manifestPath)) {
    if (!files.has(ref)) missing.push({ manifest, ref })
    const blockmap = `${ref}.blockmap`
    if (files.has(blockmap) || manifest === 'latest-mac.yml') {
      // blockmap is optional for some refs; only warn when explicitly listed in release
    }
  }
}

if (missing.length > 0) {
  console.error('Release manifest references missing files:')
  for (const item of missing) {
    console.error(`  ${item.manifest} -> ${item.ref}`)
  }
  console.error('\nAvailable files:')
  for (const name of [...files].sort()) console.error(`  ${name}`)
  process.exit(1)
}

console.log(`Verified ${manifests.filter(name => files.has(name)).join(', ') || 'no manifests'} in ${releaseDir}`)
