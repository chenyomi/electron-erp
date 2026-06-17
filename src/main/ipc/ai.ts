import { ipcMain, app } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatParams {
  messages?: ChatMessage[]
  prompt?: string
  model?: string
}

const SILICONFLOW_API_URL = 'https://api.siliconflow.com/v1/chat/completions'
const DEFAULT_SILICONFLOW_MODEL = 'deepseek-ai/DeepSeek-R1'
const REQUEST_TIMEOUT_MS = 90000

function loadLocalEnv() {
  const envPaths = [
    join(process.cwd(), '.env.local'),
    join(app.getAppPath(), '.env.local'),
  ]

  for (const envPath of envPaths) {
    if (!existsSync(envPath)) continue

    const lines = readFileSync(envPath, 'utf8').split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      const separatorIndex = trimmed.indexOf('=')
      if (separatorIndex === -1) continue

      const key = trimmed.slice(0, separatorIndex).trim()
      const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '')
      if (key && process.env[key] === undefined) {
        process.env[key] = value
      }
    }
  }
}

loadLocalEnv()

function getDefaultModel() {
  return process.env.SILICONFLOW_MODEL || DEFAULT_SILICONFLOW_MODEL
}

function getApiKey() {
  return process.env.SILICONFLOW_API_KEY || ''
}

function getKeyTail(apiKey: string) {
  return apiKey ? apiKey.slice(-4) : ''
}

function getRemoteError(data: any) {
  if (!data) return ''
  return data?.message || data?.error?.message || data?.error || data?.code || JSON.stringify(data).slice(0, 240)
}

function extractAssistantContent(data: any) {
  const message = data?.choices?.[0]?.message
  if (!message) return ''

  const content = typeof message.content === 'string' ? message.content.trim() : ''
  const reasoning = typeof message.reasoning_content === 'string' ? message.reasoning_content.trim() : ''

  return content || reasoning
}

function normalizeMessages(params: ChatParams): ChatMessage[] {
  if (Array.isArray(params.messages) && params.messages.length > 0) {
    return params.messages
      .filter((message) => message && typeof message.content === 'string' && message.content.trim())
      .map((message) => ({
        role: message.role === 'assistant' || message.role === 'system' ? message.role : 'user',
        content: message.content.trim(),
      }))
  }

  if (typeof params.prompt === 'string' && params.prompt.trim()) {
    return [{ role: 'user', content: params.prompt.trim() }]
  }

  return []
}

export function registerAiHandlers(): void {
  ipcMain.handle('ai:status', () => {
    const apiKey = getApiKey()
    return {
      ok: Boolean(apiKey),
      model: getDefaultModel(),
      keyTail: getKeyTail(apiKey),
    }
  })

  ipcMain.handle('ai:chat', async (_, params: ChatParams = {}) => {
    const apiKey = getApiKey()
    if (!apiKey) {
      return {
        ok: false,
        error: '未配置 SILICONFLOW_API_KEY，请先在启动环境里设置你的 SiliconFlow Key。',
      }
    }

    const messages = normalizeMessages(params)
    if (!messages.length) {
      return { ok: false, error: '请输入要发送给 AI 的内容。' }
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(SILICONFLOW_API_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: params.model || getDefaultModel(),
          messages,
          temperature: 0.3,
          stream: false,
        }),
      })
      clearTimeout(timeoutId)

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        const remoteError = getRemoteError(data)
        if (response.status === 401) {
          return {
            ok: false,
            error: `SiliconFlow 认证失败 HTTP 401。当前读取的 Key 后 4 位：${getKeyTail(apiKey)}。平台返回：${remoteError || '无详细信息'}`,
          }
        }

        return {
          ok: false,
          error: remoteError || `SiliconFlow 请求失败：HTTP ${response.status}`,
        }
      }

      const content = extractAssistantContent(data)
      if (!content) {
        return { ok: false, error: 'SiliconFlow 未返回有效内容，请检查模型权限或余额。' }
      }

      return {
        ok: true,
        content,
        model: data?.model || params.model || getDefaultModel(),
      }
    } catch (error: any) {
      clearTimeout(timeoutId)
      return {
        ok: false,
        error: error?.name === 'AbortError'
          ? 'SiliconFlow 请求超时，请检查网络、余额或模型是否可用。'
          : error?.message || 'SiliconFlow 请求异常。',
      }
    }
  })
}
