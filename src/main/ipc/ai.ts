import { ipcMain, app } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { getDb } from '../db'

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
const DEFAULT_SILICONFLOW_MODEL = 'deepseek-ai/DeepSeek-V3'
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

function money(value: unknown) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n.toFixed(2) : '0.00'
}

function qty(value: unknown) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : '0'
}

function safeGet(sql: string, ...params: any[]) {
  return getDb().prepare(sql).get(...params) as any
}

function safeAll(sql: string, ...params: any[]) {
  return getDb().prepare(sql).all(...params) as any[]
}

function formatRows(rows: any[], formatter: (row: any, index: number) => string) {
  return rows.length ? rows.map(formatter).join('\n') : '无'
}

function buildAiDataContext() {
  try {
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const cash = safeGet(`
      SELECT
        COALESCE(SUM(income), 0) AS income,
        COALESCE(SUM(expense), 0) AS expense,
        COALESCE((SELECT balance FROM cash_ledger WHERE deleted_at IS NULL ORDER BY date DESC, id DESC LIMIT 1), 0) AS balance,
        COUNT(*) AS count
      FROM cash_ledger WHERE deleted_at IS NULL
    `)
    const bank = safeGet(`SELECT COALESCE(SUM(amount_in), 0) AS income, COALESCE(SUM(amount_out), 0) AS expense, COUNT(*) AS count FROM bank_ledger WHERE deleted_at IS NULL`)
    const bills = safeGet(`SELECT COALESCE(SUM(amount_in), 0) AS income, COALESCE(SUM(amount_out), 0) AS expense, COUNT(*) AS count FROM acceptance_bills WHERE deleted_at IS NULL`)
    const customer = safeGet(`SELECT COALESCE(SUM(amount_in), 0) AS income, COALESCE(SUM(amount_out), 0) AS expense, COUNT(DISTINCT customer_name) AS customers, COUNT(*) AS count FROM customer_ledger WHERE deleted_at IS NULL`)
    const stockIn = safeGet(`SELECT COALESCE(SUM(quantity), 0) AS quantity, COALESCE(SUM(amount), 0) AS amount, COUNT(DISTINCT supplier_name) AS suppliers, COUNT(*) AS count FROM stock_in_ledger WHERE deleted_at IS NULL`)
    const stockOut = safeGet(`SELECT COALESCE(SUM(quantity), 0) AS quantity, COALESCE(SUM(amount), 0) AS amount, COUNT(DISTINCT customer_name) AS customers, COUNT(*) AS count FROM stock_out_ledger WHERE deleted_at IS NULL`)
    const monthStats = safeGet(`
      SELECT
        COALESCE((SELECT SUM(income) FROM cash_ledger WHERE deleted_at IS NULL AND substr(date, 1, 7) = ?), 0) AS cash_income,
        COALESCE((SELECT SUM(expense) FROM cash_ledger WHERE deleted_at IS NULL AND substr(date, 1, 7) = ?), 0) AS cash_expense,
        COALESCE((SELECT SUM(amount_in) FROM bank_ledger WHERE deleted_at IS NULL AND substr(date, 1, 7) = ?), 0) AS bank_income,
        COALESCE((SELECT SUM(amount_out) FROM bank_ledger WHERE deleted_at IS NULL AND substr(date, 1, 7) = ?), 0) AS bank_expense,
        COALESCE((SELECT SUM(amount) FROM stock_out_ledger WHERE deleted_at IS NULL AND substr(date, 1, 7) = ?), 0) AS stock_out_amount,
        COALESCE((SELECT SUM(amount) FROM stock_in_ledger WHERE deleted_at IS NULL AND substr(date, 1, 7) = ?), 0) AS stock_in_amount
    `, month, month, month, month, month, month)
    const topCustomers = safeAll(`
      SELECT c.customer_name, c.balance, c.date
      FROM customer_ledger c
      WHERE c.deleted_at IS NULL
        AND c.id = (
          SELECT c2.id FROM customer_ledger c2
          WHERE c2.deleted_at IS NULL AND c2.customer_name = c.customer_name
          ORDER BY c2.date DESC, c2.id DESC LIMIT 1
        )
      ORDER BY ABS(COALESCE(c.balance, 0)) DESC
      LIMIT 8
    `)
    const inventoryWarnings = safeAll(`
      SELECT product_name, spec, unit, SUM(in_qty) - SUM(out_qty) AS stock_qty
      FROM (
        SELECT product_name, spec, unit, quantity AS in_qty, 0 AS out_qty FROM stock_in_ledger WHERE deleted_at IS NULL
        UNION ALL
        SELECT product_name, spec, unit, 0 AS in_qty, quantity AS out_qty FROM stock_out_ledger WHERE deleted_at IS NULL
      )
      GROUP BY product_name, spec, unit
      HAVING stock_qty <= 0
      ORDER BY stock_qty ASC, product_name ASC
      LIMIT 8
    `)
    const recentStockOut = safeAll(`
      SELECT date, customer_name, product_name, spec, quantity, unit, amount
      FROM stock_out_ledger
      WHERE deleted_at IS NULL
      ORDER BY date DESC, id DESC
      LIMIT 8
    `)

    return [
      '以下是东昊账务系统本地 SQLite 的只读数据摘要。请基于这些真实数据回答；如数据不足，请说明需要用户提供筛选条件。不要编造明细，不要声称已修改数据库。',
      `数据生成时间：${now.toLocaleString('zh-CN')}`,
      `总账摘要：现金收入 ${money(cash.income)}，现金支出 ${money(cash.expense)}，现金余额 ${money(cash.balance)}，现金记录 ${cash.count} 条；公账进账 ${money(bank.income)}，公账付出 ${money(bank.expense)}；承兑收票 ${money(bills.income)}，承兑付出 ${money(bills.expense)}。`,
      `往来与库存：客户往来收款 ${money(customer.income)}，付款 ${money(customer.expense)}，客户数 ${customer.customers}；材料入库数量 ${qty(stockIn.quantity)}，金额 ${money(stockIn.amount)}，供应商数 ${stockIn.suppliers}；产品出库数量 ${qty(stockOut.quantity)}，金额 ${money(stockOut.amount)}，客户数 ${stockOut.customers}。`,
      `${month} 月摘要：现金收入 ${money(monthStats.cash_income)}，现金支出 ${money(monthStats.cash_expense)}，公账进账 ${money(monthStats.bank_income)}，公账付出 ${money(monthStats.bank_expense)}，出库金额 ${money(monthStats.stock_out_amount)}，入库金额 ${money(monthStats.stock_in_amount)}。`,
      `客户余额较大项：\n${formatRows(topCustomers, (row, index) => `${index + 1}. ${row.customer_name}，余额 ${money(row.balance)}，最近日期 ${row.date}`)}`,
      `库存预警(<=0)：\n${formatRows(inventoryWarnings, (row, index) => `${index + 1}. ${row.product_name} ${row.spec || ''} ${row.unit || ''}，库存 ${qty(row.stock_qty)}`)}`,
      `最近出库：\n${formatRows(recentStockOut, (row, index) => `${index + 1}. ${row.date} ${row.customer_name} ${row.product_name} ${row.spec || ''}，${qty(row.quantity)}${row.unit || ''}，金额 ${money(row.amount)}`)}`,
    ].join('\n\n')
  } catch (error: any) {
    return `本地账务数据读取失败：${error?.message || '未知错误'}。请提醒用户检查数据库状态。`
  }
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
    const dataContext = buildAiDataContext()
    const requestMessages: ChatMessage[] = [
      { role: 'system', content: dataContext },
      ...messages,
    ]

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
          messages: requestMessages,
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
