#!/usr/bin/env node
/**
 * Upload Windows auto-update artifacts to Qiniu and remove older versions.
 *
 * Required env:
 *   QINIU_ACCESS_KEY, QINIU_SECRET_KEY, QINIU_BUCKET
 * Optional env:
 *   QINIU_UPDATE_PREFIX (default: version/)
 *   QINIU_UPLOAD_URL (skip region lookup)
 *
 * Usage: node scripts/publish-win-update-qiniu.cjs [releaseDir]
 */
const crypto = require('crypto')
const fs = require('fs')
const http = require('http')
const https = require('https')
const path = require('path')

const releaseDir = process.argv[2] || 'release'
const accessKey = process.env.QINIU_ACCESS_KEY || ''
const secretKey = process.env.QINIU_SECRET_KEY || ''
const bucket = process.env.QINIU_BUCKET || ''
const updatePrefix = normalizePrefix(
  process.env.QINIU_UPDATE_PREFIX?.trim() || 'version/',
)

function normalizePrefix(prefix) {
  const trimmed = prefix.trim().replace(/^\/+/, '')
  if (!trimmed) return ''
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

function urlSafeBase64(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8')
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
}

function qboxToken(pathWithQuery, body = '') {
  const sign = crypto.createHmac('sha1', secretKey).update(`${pathWithQuery}\n${body}`).digest()
  return `QBox ${accessKey}:${urlSafeBase64(sign)}`
}

function entryUri(key) {
  return urlSafeBase64(`${bucket}:${key}`)
}

function requestText(url, options = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const client = target.protocol === 'https:' ? https : http
    const req = client.request(target, {
      method: options.method || 'GET',
      headers: options.headers,
    }, (res) => {
      const chunks = []
      res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          body: Buffer.concat(chunks).toString('utf8'),
        })
      })
    })
    req.on('error', reject)
    if (options.body) req.write(options.body)
    req.end()
  })
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

function collectWinUpdateFiles(dir) {
  const names = new Set()
  for (const filePath of listFiles(dir)) {
    const base = path.basename(filePath)
    if (base === 'latest.yml') names.add(base)
    else if (/^donghao-ledger-setup-.+\.exe$/i.test(base)) names.add(base)
    else if (/^donghao-ledger-setup-.+\.exe\.blockmap$/i.test(base)) names.add(base)
  }
  if (!names.has('latest.yml')) {
    throw new Error('latest.yml not found in release directory')
  }
  const exe = [...names].find(name => name.endsWith('.exe'))
  if (!exe) throw new Error('Windows setup exe not found in release directory')
  const files = ['latest.yml', exe]
  const blockmap = `${exe}.blockmap`
  if (names.has(blockmap)) files.push(blockmap)
  return files.map(name => {
    const filePath = listFiles(dir).find(candidate => path.basename(candidate) === name)
    if (!filePath) throw new Error(`Missing release file: ${name}`)
    return { name, filePath }
  })
}

async function resolveUploadUrl() {
  if (process.env.QINIU_UPLOAD_URL) {
    return process.env.QINIU_UPLOAD_URL.replace(/\/+$/, '') + '/'
  }

  const queryPath = `/v2/query?ak=${encodeURIComponent(accessKey)}&bucket=${encodeURIComponent(bucket)}`
  const response = await requestText(`https://uc.qiniuapi.com${queryPath}`)
  if (response.statusCode >= 400) {
    throw new Error(`七牛空间查询失败（HTTP ${response.statusCode}）: ${response.body}`)
  }

  const data = JSON.parse(response.body)
  const host = data?.up?.acc?.main?.[0]
    || data?.up?.main?.[0]
    || data?.upHosts?.[0]
  if (!host) throw new Error('无法解析七牛上传域名，请设置 QINIU_UPLOAD_URL')

  const uploadHost = host.startsWith('http') ? host : `https://${host}`
  return uploadHost.replace(/\/+$/, '') + '/'
}

async function listRemoteObjects() {
  const items = []
  let marker = ''

  do {
    const query = new URLSearchParams({
      bucket,
      prefix: updatePrefix,
      limit: '1000',
    })
    if (marker) query.set('marker', marker)
    const pathWithQuery = `/list?${query.toString()}`
    const response = await requestText(`https://rsf.qbox.me${pathWithQuery}`, {
      headers: { Authorization: qboxToken(pathWithQuery) },
    })
    if (response.statusCode >= 400) {
      throw new Error(`列举七牛文件失败（HTTP ${response.statusCode}）: ${response.body}`)
    }
    const data = JSON.parse(response.body)
    items.push(...(data.items || []))
    marker = data.marker || ''
  } while (marker)

  return items
}

async function deleteRemoteObjects(keys) {
  if (!keys.length) return

  const chunkSize = 1000
  for (let offset = 0; offset < keys.length; offset += chunkSize) {
    const chunk = keys.slice(offset, offset + chunkSize)
    const body = chunk.map(key => `op=/delete/${entryUri(key)}`).join('&')
    const response = await requestText('https://rs.qbox.me/batch', {
      method: 'POST',
      headers: {
        Authorization: qboxToken('/batch', body),
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': String(Buffer.byteLength(body)),
      },
      body,
    })
    if (response.statusCode >= 400) {
      throw new Error(`删除七牛旧版本失败（HTTP ${response.statusCode}）: ${response.body}`)
    }
  }
}

function createUploadToken(key) {
  const deadline = Math.floor(Date.now() / 1000) + 3600
  const putPolicy = JSON.stringify({ scope: `${bucket}:${key}`, deadline })
  const encoded = urlSafeBase64(putPolicy)
  const sign = urlSafeBase64(crypto.createHmac('sha1', secretKey).update(encoded).digest())
  return `${accessKey}:${sign}:${encoded}`
}

function buildMultipartBody(fields, fileField, fileName, fileBuffer, contentType = 'application/octet-stream') {
  const boundary = `----donghao-${Date.now()}`
  const chunks = []
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    ))
  }
  chunks.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${fileName}"\r\nContent-Type: ${contentType}\r\n\r\n`,
  ))
  chunks.push(fileBuffer)
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`))
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  }
}

async function uploadFile(uploadUrl, key, filePath) {
  const fileName = path.basename(filePath)
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  const contentType = ext === 'yml' ? 'text/yaml' : 'application/octet-stream'
  const token = createUploadToken(key)
  const fileBuffer = fs.readFileSync(filePath)
  const multipart = buildMultipartBody({ token, key }, 'file', fileName, fileBuffer, contentType)
  const response = await requestText(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': multipart.contentType,
      'Content-Length': String(multipart.body.length),
    },
    body: multipart.body,
  })
  if (response.statusCode >= 400) {
    throw new Error(`上传 ${fileName} 失败（HTTP ${response.statusCode}）: ${response.body}`)
  }
}

async function main() {
  if (!accessKey || !secretKey || !bucket) {
    console.log('Qiniu secrets not configured, skipping Windows update publish')
    process.exit(0)
  }

  const files = collectWinUpdateFiles(releaseDir)
  const remoteItems = await listRemoteObjects()
  const remoteKeys = remoteItems.map(item => item.key).filter(key => key.startsWith(updatePrefix))

  if (remoteKeys.length > 0) {
    console.log(`Deleting ${remoteKeys.length} old file(s) under ${updatePrefix}`)
    await deleteRemoteObjects(remoteKeys)
  } else {
    console.log(`No existing files under ${updatePrefix}`)
  }

  const uploadUrl = await resolveUploadUrl()
  for (const file of files) {
    const key = `${updatePrefix}${file.name}`
    console.log(`Uploading ${file.name} -> ${key}`)
    await uploadFile(uploadUrl, key, file.filePath)
  }

  console.log(`Published ${files.length} Windows update file(s) to qiniu://${bucket}/${updatePrefix}`)

  const cdnUrl = (process.env.QINIU_UPDATE_CDN_URL || '').trim()
  const exe = files.find(file => file.name.endsWith('.exe'))
  if (process.env.GITHUB_OUTPUT && cdnUrl && exe) {
    const base = cdnUrl.endsWith('/') ? cdnUrl : `${cdnUrl}/`
    const downloadUrl = new URL(exe.name, base).href
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `win_download_url=${downloadUrl}\n`)
    console.log(`Windows download URL: ${downloadUrl}`)
  }
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exit(1)
})
