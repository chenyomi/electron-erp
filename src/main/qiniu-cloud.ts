import * as crypto from 'crypto'
import * as fs from 'fs'
import * as http from 'http'
import * as https from 'https'
import { join, dirname } from 'path'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { getDataDir } from './db'
import {
  applyIncrementalSync,
  buildLiveDataManifest,
  exportLiveSyncFile,
  hashLiveLedgerDbEntry,
  localFileMatchesRemoteEntry,
  type SyncFileEntry,
  type SyncManifest,
} from './backup'

export interface QiniuCloudConfig {
  accessKey: string
  secretKey: string
  bucket: string
  domain: string
  prefix: string
}

export interface QiniuCloudConfigView {
  accessKey: string
  bucket: string
  domain: string
  prefix: string
  configured: boolean
  hasSecretKey: boolean
}

export interface CloudBackupItem {
  key: string
  name: string
  size: number
  updatedAt: string
}

export interface CloudSyncResult {
  ok: boolean
  uploaded?: number
  downloaded?: number
  skipped?: number
  bytes?: number
  totalFiles?: number
  error?: string
}

export interface CloudSyncStatus {
  configured: boolean
  remoteUpdatedAt?: string
  remoteFileCount?: number
  localFileCount?: number
}

export type CloudSyncPhase = 'preparing' | 'transferring' | 'applying' | 'done'

export interface CloudSyncProgress {
  mode: 'upload' | 'download'
  phase: CloudSyncPhase
  current: number
  total: number
  file?: string
  message?: string
}

export type CloudSyncProgressReporter = (progress: CloudSyncProgress) => void

const CONFIG_FILE = 'qiniu-cloud.json'

function configPath(): string {
  return join(getDataDir(), CONFIG_FILE)
}

function urlSafeBase64(input: Buffer | string): string {
  const buffer = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
}

function createUploadToken(config: QiniuCloudConfig, key: string): string {
  const deadline = Math.floor(Date.now() / 1000) + 3600
  const putPolicy = JSON.stringify({ scope: `${config.bucket}:${key}`, deadline })
  const encoded = urlSafeBase64(putPolicy)
  const sign = urlSafeBase64(crypto.createHmac('sha1', config.secretKey).update(encoded).digest())
  return `${config.accessKey}:${sign}:${encoded}`
}

function manifestsMatch(local: SyncManifest, remote: SyncManifest): boolean {
  const localFiles = local.files || {}
  const remoteFiles = remote.files || {}
  const localKeys = Object.keys(localFiles)
  if (localKeys.length !== Object.keys(remoteFiles).length) return false
  return localKeys.every(path => remoteFiles[path]?.hash === localFiles[path]?.hash)
}

function parseQiniuError(body: string, fallback: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: string; error_code?: string }
    if (parsed.error_code === 'BadToken' || parsed.error === 'bad token') {
      return 'SecretKey 错误或上传凭证无效，请重新填写 SecretKey 并点击「保存云配置」'
    }
    if (parsed.error === 'file exists' || parsed.error_code === 'FileExists') {
      return '云端已有同名文件且无法覆盖，请稍后重试或联系技术支持'
    }
    if (parsed.error) return parsed.error
  } catch {
    // ignore
  }
  return body || fallback
}

interface BucketRegionInfo {
  uploadUrl: string
  region?: string
  downloadDomainBases: string[]
}

let cachedRegionInfo: { key: string; info: BucketRegionInfo; expires: number } | null = null

function qboxAuthorization(config: QiniuCloudConfig, pathWithQuery: string): string {
  const sign = urlSafeBase64(crypto.createHmac('sha1', config.secretKey).update(`${pathWithQuery}\n`).digest())
  return `QBox ${config.accessKey}:${sign}`
}

function normalizeDomainBase(domain: string): string {
  const trimmed = domain.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
}

function domainProtocolVariants(base: string): string[] {
  if (!base) return []
  if (base.startsWith('http://')) return [base, `https://${base.slice('http://'.length)}`]
  if (base.startsWith('https://')) return [base, `http://${base.slice('https://'.length)}`]
  return [base]
}

function extractIoDownloadHosts(data: any): string[] {
  const hosts: string[] = []
  for (const value of [
    data?.io?.download?.main?.[0],
    data?.io?.src?.main?.[0],
    data?.io?.main?.[0],
    data?.ioHosts?.[0],
    data?.downloadHosts?.[0],
  ]) {
    if (typeof value === 'string' && value.trim()) hosts.push(value.trim())
  }
  return hosts
}

async function fetchRegionQueryData(config: QiniuCloudConfig): Promise<any> {
  const queryUrl = `https://uc.qiniuapi.com/v2/query?ak=${encodeURIComponent(config.accessKey)}&bucket=${encodeURIComponent(config.bucket)}`
  const response = await requestText(queryUrl)
  if (response.statusCode >= 400) {
    throw new Error(parseQiniuError(response.body, `七牛空间查询失败（HTTP ${response.statusCode}）`))
  }
  return JSON.parse(response.body)
}

async function fetchBucketDomainList(config: QiniuCloudConfig): Promise<string[]> {
  const path = `/v2/domains?tbl=${encodeURIComponent(config.bucket)}`
  const response = await requestText(`https://uc.qiniuapi.com${path}`, {
    headers: { Authorization: qboxAuthorization(config, path) },
  })
  if (response.statusCode >= 400) return []
  try {
    const parsed = JSON.parse(response.body)
    if (Array.isArray(parsed)) {
      return parsed.filter((domain): domain is string => typeof domain === 'string' && domain.trim().length > 0)
    }
  } catch {
    // ignore
  }
  return []
}

async function resolveDownloadDomainBases(config: QiniuCloudConfig, queryData?: any): Promise<string[]> {
  const ordered: string[] = []
  const seen = new Set<string>()

  const pushDomain = (domain: string, prepend = false) => {
    for (const variant of domainProtocolVariants(normalizeDomainBase(domain))) {
      if (!variant || seen.has(variant)) continue
      seen.add(variant)
      if (prepend) ordered.unshift(variant)
      else ordered.push(variant)
    }
  }

  try {
    const data = queryData || await fetchRegionQueryData(config)
    for (const host of extractIoDownloadHosts(data)) pushDomain(host, true)
  } catch {
    // ignore
  }

  try {
    for (const domain of await fetchBucketDomainList(config)) pushDomain(domain, true)
  } catch {
    // ignore
  }

  pushDomain(config.domain, false)
  return ordered
}

async function resolveBucketRegionInfo(config: QiniuCloudConfig): Promise<BucketRegionInfo> {
  const cacheKey = `${config.accessKey}:${config.bucket}`
  const now = Date.now()
  if (cachedRegionInfo?.key === cacheKey && cachedRegionInfo.expires > now) {
    return cachedRegionInfo.info
  }

  const data = await fetchRegionQueryData(config)

  const hostCandidates: string[] = []
  for (const value of [
    data?.up?.acc?.main?.[0],
    data?.up?.main?.[0],
    data?.upHosts?.[0],
    data?.hosts?.[0]?.up?.domains?.[0],
  ]) {
    if (typeof value === 'string' && value.trim()) hostCandidates.push(value.trim())
  }

  const regionMap: Record<string, string> = {
    z0: 'https://up-z0.qiniup.com',
    z1: 'https://up-z1.qiniup.com',
    z2: 'https://up-z2.qiniup.com',
    na0: 'https://up-na0.qiniup.com',
    as0: 'https://up-as0.qiniup.com',
    'cn-east-2': 'https://up-cn-east-2.qiniup.com',
    'ap-southeast-2': 'https://up-ap-southeast-2.qiniup.com',
    'ap-southeast-3': 'https://up-ap-southeast-3.qiniup.com',
  }
  if (typeof data?.region === 'string' && regionMap[data.region]) {
    hostCandidates.push(regionMap[data.region])
  }

  const uploadHost = hostCandidates.find(Boolean)
  if (!uploadHost) {
    throw new Error('无法解析上传域名，请检查空间名称是否正确')
  }

  const uploadUrl = `${uploadHost.startsWith('http') ? uploadHost : `https://${uploadHost}`}`.replace(/\/+$/, '') + '/'
  const info: BucketRegionInfo = {
    uploadUrl,
    region: typeof data?.region === 'string' ? data.region : undefined,
    downloadDomainBases: await resolveDownloadDomainBases(config, data),
  }
  cachedRegionInfo = { key: cacheKey, info, expires: now + 3600_000 }
  return info
}

async function resolveBucketHosts(config: QiniuCloudConfig): Promise<BucketRegionInfo> {
  return resolveBucketRegionInfo(config)
}

function readConfigFile(): QiniuCloudConfig | null {
  const path = configPath()
  if (!fs.existsSync(path)) return null
  try {
    const parsed = JSON.parse(fs.readFileSync(path, 'utf8')) as Partial<QiniuCloudConfig>
    if (!parsed.accessKey || !parsed.secretKey || !parsed.bucket || !parsed.domain || !parsed.prefix) return null
    return {
      accessKey: String(parsed.accessKey).trim(),
      secretKey: String(parsed.secretKey).trim(),
      bucket: String(parsed.bucket).trim(),
      domain: normalizeDomain(String(parsed.domain || '')),
      prefix: normalizePrefix(String(parsed.prefix || '')),
    }
  } catch {
    return null
  }
}

function normalizeDomain(domain: string): string {
  const trimmed = domain.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `http://${trimmed}`
}

function normalizePrefix(prefix: string): string {
  const trimmed = prefix.trim().replace(/^\/+/, '')
  if (!trimmed) return ''
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

export function getQiniuConfigView(): QiniuCloudConfigView {
  const config = readConfigFile()
  return {
    accessKey: config?.accessKey || '',
    bucket: config?.bucket || '',
    domain: config?.domain || '',
    prefix: config?.prefix || '',
    configured: Boolean(config),
    hasSecretKey: Boolean(config?.secretKey),
  }
}

export function saveQiniuConfig(input: Partial<QiniuCloudConfig>): QiniuCloudConfigView {
  const current = readConfigFile()
  const next: QiniuCloudConfig = {
    accessKey: String(input.accessKey ?? current?.accessKey ?? '').trim(),
    secretKey: String(input.secretKey ?? current?.secretKey ?? '').trim(),
    bucket: String(input.bucket ?? current?.bucket ?? '').trim(),
    domain: normalizeDomain(String(input.domain ?? current?.domain ?? '')),
    prefix: normalizePrefix(String(input.prefix ?? current?.prefix ?? '')),
  }
  if (!next.accessKey || !next.secretKey || !next.bucket || !next.domain || !next.prefix) {
    throw new Error('请填写 AccessKey、SecretKey、空间名称、外链域名和目录前缀')
  }
  if (next.accessKey === next.secretKey) {
    throw new Error('SecretKey 不能与 AccessKey 相同。请到七牛控制台「密钥管理」分别复制 AccessKey 和 SecretKey')
  }
  fs.writeFileSync(configPath(), JSON.stringify(next, null, 2), 'utf8')
  cachedRegionInfo = null
  return getQiniuConfigView()
}

function requestText(url: string, options: { method?: string; headers?: Record<string, string>; body?: Buffer } = {}): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const client = target.protocol === 'https:' ? https : http
    const req = client.request(target, {
      method: options.method || 'GET',
      headers: options.headers,
    }, (res) => {
      const chunks: Buffer[] = []
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

function requestBuffer(url: string, options: { method?: string; headers?: Record<string, string>; body?: Buffer } = {}): Promise<{ statusCode: number; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const client = target.protocol === 'https:' ? https : http
    const req = client.request(target, {
      method: options.method || 'GET',
      headers: options.headers,
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          body: Buffer.concat(chunks),
        })
      })
    })
    req.on('error', reject)
    if (options.body) req.write(options.body)
    req.end()
  })
}

function buildMultipartBody(
  fields: Record<string, string>,
  fileField: string,
  fileName: string,
  fileBuffer: Buffer,
  contentType = 'application/octet-stream',
): { body: Buffer; contentType: string } {
  const boundary = `----donghao-${Date.now()}`
  const chunks: Buffer[] = []
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

function requireConfig(): QiniuCloudConfig {
  const config = readConfigFile()
  if (!config) throw new Error('请先配置七牛云 AccessKey 和 SecretKey')
  return config
}

function encodeObjectKey(key: string): string {
  return key.split('/').map(part => encodeURIComponent(part)).join('/')
}

function buildPrivateDownloadUrl(domainBase: string, key: string, deadlineSec: number, config: QiniuCloudConfig): string {
  const base = `${domainBase.replace(/\/+$/, '')}/${encodeObjectKey(key)}`
  const withDeadline = `${base}?e=${deadlineSec}`
  const sign = urlSafeBase64(crypto.createHmac('sha1', config.secretKey).update(withDeadline).digest())
  return `${withDeadline}&token=${config.accessKey}:${sign}`
}

function formatDownloadError(body: Buffer, statusCode: number, domain: string): string {
  const text = body.toString('utf8').trim()
  if (text.startsWith('<')) {
    if (statusCode === 401) return `HTTP 401 鉴权失败（${domain}）`
    return `HTTP ${statusCode}（${domain}）`
  }
  return text.slice(0, 200) || `HTTP ${statusCode}（${domain}）`
}

export async function listCloudBackups(): Promise<CloudBackupItem[]> {
  const status = await getCloudSyncStatus()
  if (!status.configured || !status.remoteUpdatedAt) return []
  try {
    const config = requireConfig()
    return [{
      key: manifestObjectKey(config),
      name: '差异化同步快照',
      size: 0,
      updatedAt: status.remoteUpdatedAt,
    }]
  } catch {
    return []
  }
}

function syncRootPrefix(config: QiniuCloudConfig): string {
  return `${config.prefix}sync/`
}

function manifestObjectKey(config: QiniuCloudConfig): string {
  return `${syncRootPrefix(config)}manifest.json`
}

function fileObjectKey(config: QiniuCloudConfig, relativePath: string): string {
  return `${syncRootPrefix(config)}${relativePath.replace(/\\/g, '/')}`
}

function emptyManifest(): SyncManifest {
  return { version: 2, type: 'incremental', updatedAt: '', files: {} }
}

function reportSyncProgress(onProgress: CloudSyncProgressReporter | undefined, progress: CloudSyncProgress): void {
  onProgress?.(progress)
}

const DOWNLOAD_CONCURRENCY = 6

async function runConcurrent<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  if (!items.length) return
  let index = 0
  async function next(): Promise<void> {
    const current = index++
    if (current >= items.length) return
    await worker(items[current])
    await next()
  }
  const workers = Math.min(concurrency, items.length)
  await Promise.all(Array.from({ length: workers }, () => next()))
}

async function uploadObjectFile(config: QiniuCloudConfig, key: string, filePath: string): Promise<void> {
  const { uploadUrl } = await resolveBucketHosts(config)
  const token = createUploadToken(config, key)
  const fileBuffer = fs.readFileSync(filePath)
  const fileName = key.split('/').pop() || 'file'
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  const contentType = ext === 'json' ? 'application/json'
    : ext === 'db' ? 'application/octet-stream'
      : ext === 'webp' ? 'image/webp'
        : ext === 'png' ? 'image/png'
          : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
            : 'application/octet-stream'
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
    throw new Error(`上传云端失败：${parseQiniuError(response.body, String(response.statusCode))}`)
  }
}

async function uploadObjectBuffer(config: QiniuCloudConfig, key: string, buffer: Buffer, fileName: string, contentType: string): Promise<void> {
  const { uploadUrl } = await resolveBucketHosts(config)
  const token = createUploadToken(config, key)
  const multipart = buildMultipartBody({ token, key }, 'file', fileName, buffer, contentType)
  const response = await requestText(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': multipart.contentType,
      'Content-Length': String(multipart.body.length),
    },
    body: multipart.body,
  })
  if (response.statusCode >= 400) {
    throw new Error(`上传云端失败：${parseQiniuError(response.body, String(response.statusCode))}`)
  }
}

async function downloadCloudFile(config: QiniuCloudConfig, key: string, destPath: string): Promise<void> {
  const deadline = Math.floor(Date.now() / 1000) + 3600
  const { downloadDomainBases } = await resolveBucketRegionInfo(config)
  const domains = downloadDomainBases.length
    ? downloadDomainBases
    : domainProtocolVariants(normalizeDomainBase(config.domain))

  let lastError = '下载失败'
  for (const domain of domains) {
    const url = buildPrivateDownloadUrl(domain, key, deadline, config)
    try {
      const response = await requestBuffer(url)
      if (response.statusCode >= 400 || response.body.length === 0) {
        lastError = formatDownloadError(response.body, response.statusCode || 0, domain)
        continue
      }
      fs.mkdirSync(dirname(destPath), { recursive: true })
      fs.writeFileSync(destPath, response.body)
      return
    } catch (error: any) {
      lastError = error?.message || lastError
    }
  }
  throw new Error(`下载云端文件失败：${lastError}`)
}

async function fetchRemoteManifest(config: QiniuCloudConfig): Promise<SyncManifest> {
  const tempPath = join(getDataDir(), 'cloud-manifest.tmp.json')
  try {
    await downloadCloudFile(config, manifestObjectKey(config), tempPath)
    return JSON.parse(fs.readFileSync(tempPath, 'utf8')) as SyncManifest
  } catch {
    return emptyManifest()
  } finally {
    fs.rmSync(tempPath, { force: true })
  }
}

export async function getCloudSyncStatus(): Promise<CloudSyncStatus> {
  const view = getQiniuConfigView()
  if (!view.configured) return { configured: false }
  try {
    const config = requireConfig()
    const remote = await fetchRemoteManifest(config)
    const local = await buildLiveDataManifest()
    return {
      configured: true,
      remoteUpdatedAt: remote.updatedAt || undefined,
      remoteFileCount: Object.keys(remote.files || {}).length,
      localFileCount: Object.keys(local.files || {}).length,
    }
  } catch {
    const local = await buildLiveDataManifest()
    return {
      configured: true,
      localFileCount: Object.keys(local.files || {}).length,
    }
  }
}

export async function syncCloudUpload(onProgress?: CloudSyncProgressReporter): Promise<CloudSyncResult> {
  try {
    const config = requireConfig()
    reportSyncProgress(onProgress, {
      mode: 'upload',
      phase: 'preparing',
      current: 0,
      total: 0,
      message: '正在扫描本地文件…',
    })
    const localManifest = await buildLiveDataManifest()
    const fileEntries = Object.entries(localManifest.files)
    const total = fileEntries.length
    reportSyncProgress(onProgress, {
      mode: 'upload',
      phase: 'preparing',
      current: 0,
      total,
      message: '正在对比云端差异…',
    })
    const remoteManifest = await fetchRemoteManifest(config)
    const tempRoot = mkdtempSync(join(tmpdir(), 'donghao-cloud-up-'))
    let uploaded = 0
    let skipped = 0
    let bytes = 0
    let processed = 0

    try {
      for (const [relativePath, entry] of fileEntries) {
        processed += 1
        if (remoteManifest.files?.[relativePath]?.hash === entry.hash) {
          skipped += 1
          reportSyncProgress(onProgress, {
            mode: 'upload',
            phase: 'transferring',
            current: processed,
            total,
            file: relativePath,
            message: `跳过未变化文件 (${processed}/${total})`,
          })
          continue
        }
        reportSyncProgress(onProgress, {
          mode: 'upload',
          phase: 'transferring',
          current: processed,
          total,
          file: relativePath,
          message: `正在上传 (${processed}/${total})`,
        })
        const tempFile = join(tempRoot, relativePath)
        await exportLiveSyncFile(relativePath, tempFile)
        await uploadObjectFile(config, fileObjectKey(config, relativePath), tempFile)
        uploaded += 1
        bytes += entry.size
      }

      if (uploaded === 0 && manifestsMatch(localManifest, remoteManifest)) {
        reportSyncProgress(onProgress, {
          mode: 'upload',
          phase: 'done',
          current: total,
          total,
          message: '本地已与云端一致',
        })
        return {
          ok: true,
          uploaded: 0,
          skipped,
          bytes: 0,
          totalFiles: total,
        }
      }

      reportSyncProgress(onProgress, {
        mode: 'upload',
        phase: 'transferring',
        current: total,
        total,
        file: 'manifest.json',
        message: '正在更新同步清单…',
      })
      const manifestBuffer = Buffer.from(JSON.stringify(localManifest, null, 2), 'utf8')
      await uploadObjectBuffer(
        config,
        manifestObjectKey(config),
        manifestBuffer,
        'manifest.json',
        'application/json',
      )

      reportSyncProgress(onProgress, {
        mode: 'upload',
        phase: 'done',
        current: total,
        total,
        message: '上传完成',
      })

      return {
        ok: true,
        uploaded,
        skipped,
        bytes,
        totalFiles: total,
      }
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  } catch (error: any) {
    return { ok: false, error: error?.message || '差异化上传失败' }
  }
}

export async function syncCloudDownload(onProgress?: CloudSyncProgressReporter): Promise<CloudSyncResult> {
  try {
    const config = requireConfig()
    reportSyncProgress(onProgress, {
      mode: 'download',
      phase: 'preparing',
      current: 0,
      total: 0,
      message: '正在读取云端清单…',
    })
    const remoteManifest = await fetchRemoteManifest(config)
    const remoteEntries = Object.entries(remoteManifest.files || {})
    if (!remoteEntries.length) {
      return { ok: false, error: '云端还没有同步数据，请先在另一台电脑上传' }
    }

    const total = remoteEntries.length
    reportSyncProgress(onProgress, {
      mode: 'download',
      phase: 'preparing',
      current: 0,
      total,
      message: '正在对比本地差异…',
    })

    const needsLedgerCompare = remoteEntries.some(([path]) => path === 'ledger.db')
    const localLedger = needsLedgerCompare ? await hashLiveLedgerDbEntry() : undefined

    const toDownload: Array<{ relativePath: string; entry: SyncFileEntry }> = []
    let skipped = 0
    let compared = 0
    for (const [relativePath, entry] of remoteEntries) {
      compared += 1
      if (localFileMatchesRemoteEntry(relativePath, entry, localLedger)) {
        skipped += 1
        if (compared === total || compared % 20 === 0) {
          reportSyncProgress(onProgress, {
            mode: 'download',
            phase: 'preparing',
            current: compared,
            total,
            message: `对比差异 (${compared}/${total})，${toDownload.length} 个待下载`,
          })
        }
        continue
      }
      toDownload.push({ relativePath, entry })
    }

    if (!toDownload.length) {
      reportSyncProgress(onProgress, {
        mode: 'download',
        phase: 'done',
        current: total,
        total,
        message: '本地已与云端一致',
      })
      return { ok: true, downloaded: 0, skipped, bytes: 0, totalFiles: total }
    }

    const tempRoot = mkdtempSync(join(tmpdir(), 'donghao-cloud-down-'))
    const changed: string[] = []
    let downloaded = 0
    let bytes = 0
    let processed = skipped

    try {
      await runConcurrent(toDownload, DOWNLOAD_CONCURRENCY, async ({ relativePath, entry }) => {
        processed += 1
        reportSyncProgress(onProgress, {
          mode: 'download',
          phase: 'transferring',
          current: processed,
          total,
          file: relativePath,
          message: `正在下载 (${processed}/${total})`,
        })
        const tempFile = join(tempRoot, relativePath)
        fs.mkdirSync(dirname(tempFile), { recursive: true })
        await downloadCloudFile(config, fileObjectKey(config, relativePath), tempFile)
        changed.push(relativePath)
        downloaded += 1
        bytes += entry.size
      })

      reportSyncProgress(onProgress, {
        mode: 'download',
        phase: 'applying',
        current: total,
        total,
        message: '正在合并到本地账本…',
      })
      const applied = await applyIncrementalSync(changed, tempRoot, { preBackup: 'db-only' })
      if (!applied.ok) return { ok: false, error: applied.error || '应用云端差异失败' }

      reportSyncProgress(onProgress, {
        mode: 'download',
        phase: 'done',
        current: total,
        total,
        message: '恢复完成',
      })

      return {
        ok: true,
        downloaded,
        skipped,
        bytes,
        totalFiles: total,
      }
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  } catch (error: any) {
    return { ok: false, error: error?.message || '差异化下载失败' }
  }
}

export interface CloudPendingDownloadStatus {
  configured: boolean
  hasUpdates: boolean
  pendingFiles: number
  remoteUpdatedAt?: string
}

export async function checkCloudPendingDownload(): Promise<CloudPendingDownloadStatus> {
  const view = getQiniuConfigView()
  if (!view.configured) {
    return { configured: false, hasUpdates: false, pendingFiles: 0 }
  }
  try {
    const config = requireConfig()
    const remoteManifest = await fetchRemoteManifest(config)
    const remoteEntries = Object.entries(remoteManifest.files || {})
    if (!remoteEntries.length) {
      return { configured: true, hasUpdates: false, pendingFiles: 0 }
    }
    const needsLedgerCompare = remoteEntries.some(([path]) => path === 'ledger.db')
    const localLedger = needsLedgerCompare ? await hashLiveLedgerDbEntry() : undefined
    let pendingFiles = 0
    for (const [relativePath, entry] of remoteEntries) {
      if (!localFileMatchesRemoteEntry(relativePath, entry, localLedger)) pendingFiles += 1
    }
    return {
      configured: true,
      hasUpdates: pendingFiles > 0,
      pendingFiles,
      remoteUpdatedAt: remoteManifest.updatedAt || undefined,
    }
  } catch {
    return { configured: true, hasUpdates: false, pendingFiles: 0 }
  }
}

export async function runExitCloudUpload(): Promise<void> {
  if (!getQiniuConfigView().configured) return
  try {
    const result = await syncCloudUpload()
    if (!result.ok && result.error) {
      console.warn('Exit cloud upload:', result.error)
    }
  } catch (error) {
    console.warn('Exit cloud upload failed:', error)
  }
}

export async function uploadCloudBackup(_backupName?: string, onProgress?: CloudSyncProgressReporter): Promise<CloudSyncResult> {
  return syncCloudUpload(onProgress)
}

export async function restoreCloudBackup(_key?: string, onProgress?: CloudSyncProgressReporter): Promise<{ ok: boolean; error?: string }> {
  const result = await syncCloudDownload(onProgress)
  return { ok: result.ok, error: result.error }
}

export async function testCloudConnection(): Promise<{ ok: boolean; error?: string; count?: number; region?: string }> {
  try {
    const config = requireConfig()
    const hosts = await resolveBucketHosts(config)
    const probeKey = `${syncRootPrefix(config)}.connection-probe`
    await uploadObjectBuffer(config, probeKey, Buffer.from('ok', 'utf8'), 'connection-probe.txt', 'text/plain')
    const status = await getCloudSyncStatus()
    return {
      ok: true,
      count: status.remoteFileCount || 0,
      region: hosts.region,
    }
  } catch (error: any) {
    return { ok: false, error: error?.message || '连接七牛云失败' }
  }
}
