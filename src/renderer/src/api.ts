declare global {
  interface Window {
    electronAPI: {
      invoke: (channel: string, ...args: any[]) => Promise<any>
      on: (channel: string, listener: (...args: any[]) => void) => () => void
    }
  }
}

export const api = {
  invoke: (channel: string, ...args: any[]) => window.electronAPI.invoke(channel, ...args)
}

// 便捷封装
export const cashAPI = {
  list: (params?: any) => api.invoke('cash:list', params),
  summary: () => api.invoke('cash:summary'),
  monthly: () => api.invoke('cash:monthly'),
  add: (row: any) => api.invoke('cash:add', row),
  update: (row: any) => api.invoke('cash:update', row),
  delete: (id: number) => api.invoke('cash:delete', id),
  trash: () => api.invoke('cash:trash'),
  restore: (id: number) => api.invoke('cash:restore', id),
}

export const bankAPI = {
  list: (params?: any) => api.invoke('bank:list', params),
  summary: () => api.invoke('bank:summary'),
  monthly: () => api.invoke('bank:monthly'),
  add: (row: any) => api.invoke('bank:add', row),
  update: (row: any) => api.invoke('bank:update', row),
  delete: (id: number) => api.invoke('bank:delete', id),
  trash: () => api.invoke('bank:trash'),
  restore: (id: number) => api.invoke('bank:restore', id),
}

export const billsAPI = {
  list: (params?: any) => api.invoke('bills:list', params),
  summary: () => api.invoke('bills:summary'),
  add: (row: any) => api.invoke('bills:add', row),
  update: (row: any) => api.invoke('bills:update', row),
  delete: (id: number) => api.invoke('bills:delete', id),
  trash: () => api.invoke('bills:trash'),
  restore: (id: number) => api.invoke('bills:restore', id),
}

export const customerAPI = {
  names: () => api.invoke('customer:names'),
  list: (params?: any) => api.invoke('customer:list', params),
  summary: (params?: any) => api.invoke('customer:summary', params),
  profile: (customerName: string) => api.invoke('customer:profile', customerName),
  create: (profile: { customer_name: string; opening_balance?: number; note?: string }) => api.invoke('customer:create', profile),
  setProfile: (profile: any) => api.invoke('customer:set-profile', profile),
  anomalies: (customerName?: string) => api.invoke('customer:anomalies', customerName || ''),
  repair: (customerName?: string) => api.invoke('customer:repair', customerName || ''),
  paymentAudit: (customerName?: string) => api.invoke('customer:payment-audit', customerName || ''),
  add: (row: any) => api.invoke('customer:add', row),
  update: (row: any) => api.invoke('customer:update', row),
  delete: (id: number) => api.invoke('customer:delete', id),
  trash: () => api.invoke('customer:trash'),
  restore: (id: number) => api.invoke('customer:restore', id),
  attachments: (id: number) => api.invoke('customer:attachments', id),
  pickAttachments: () => api.invoke('customer:pick-attachments'),
  addAttachment: (id: number, filePaths?: string[]) => api.invoke('customer:add-attachment', id, filePaths),
}

export const attachmentAPI = {
  list: (relatedTable: string, relatedId: number) => api.invoke('attachment:list', relatedTable, relatedId),
  pick: () => api.invoke('attachment:pick'),
  pickChat: () => api.invoke('attachment:pick-chat'),
  add: (relatedTable: string, relatedId: number, filePaths?: string[]) => api.invoke('attachment:add', relatedTable, relatedId, filePaths),
  delete: (id: number) => api.invoke('attachment:delete', id),
}

export const stockInAPI = {
  names: () => api.invoke('stockIn:names'),
  list: (params?: any) => api.invoke('stockIn:list', params),
  summary: (supplierName?: string) => api.invoke('stockIn:summary', supplierName),
  add: (row: any) => api.invoke('stockIn:add', row),
  update: (row: any) => api.invoke('stockIn:update', row),
  delete: (id: number) => api.invoke('stockIn:delete', id),
  trash: () => api.invoke('stockIn:trash'),
  restore: (id: number) => api.invoke('stockIn:restore', id),
}

export const stockOutAPI = {
  names: () => api.invoke('stockOut:names'),
  list: (params?: any) => api.invoke('stockOut:list', params),
  summary: (customerName?: string) => api.invoke('stockOut:summary', customerName),
  add: (row: any) => api.invoke('stockOut:add', row),
  update: (row: any) => api.invoke('stockOut:update', row),
  delete: (id: number) => api.invoke('stockOut:delete', id),
  trash: () => api.invoke('stockOut:trash'),
  restore: (id: number) => api.invoke('stockOut:restore', id),
}

export const inventoryAPI = {
  list: (params?: any) => api.invoke('inventory:list', params),
  options: (keyword?: string) => api.invoke('inventory:options', keyword),
}

export const productAPI = {
  list: (params?: any) => api.invoke('products:list', params),
}

export const printAPI = {
  getSettings: () => api.invoke('print:get-settings'),
  saveSettings: (settings: any) => api.invoke('print:save-settings', settings),
  preview: (params?: {
    ids?: number[]
    template?: 'sales' | 'metal'
    customerPhone?: string
    customerAddress?: string
    paymentReceived?: number
    overlay?: boolean
  }) => api.invoke('print:preview', params),
  lodopScript: (params?: {
    ids?: number[]
    template?: 'sales' | 'metal'
    customerPhone?: string
    customerAddress?: string
    paymentReceived?: number
    overlay?: boolean
  }) => api.invoke('print:lodop-script', params),
  execute: (html: string) => api.invoke('print:execute', html),
  savePdf: (params: string | { html: string; landscape?: boolean }) => api.invoke('print:save-pdf', params),
}

export const systemAPI = {
  appVersion: () => api.invoke('system:app-version'),
  summary: () => api.invoke('system:summary'),
  logs: (params?: any) => api.invoke('system:logs', params),
  trashAll: () => api.invoke('system:trash-all'),
  backup: () => api.invoke('system:backup'),
  exportExcel: (params?: any) => api.invoke('system:export-excel', params),
  backupsList: () => api.invoke('system:backups-list'),
  pickBackup: () => api.invoke('system:pick-backup'),
  pickBackupPackage: () => api.invoke('system:pick-backup-package'),
  restoreBackup: (sourcePath: string) => api.invoke('system:restore-backup', sourcePath),
  restoreBackupByName: (name: string) => api.invoke('system:restore-backup-by-name', name),
  exportBackupPackage: (name: string) => api.invoke('system:export-backup-package', name),
  dataDir: () => api.invoke('system:data-dir'),
  openDataDir: () => api.invoke('system:open-data-dir'),
  openBackupDir: () => api.invoke('system:open-backup-dir'),
  openExcelImagesDir: () => api.invoke('system:open-excel-images-dir'),
  monthlyAll: () => api.invoke('system:monthly-all'),
}

export const authAPI = {
  me: () => api.invoke('auth:me'),
  login: (params: { username: string; password: string }) => api.invoke('auth:login', params),
  changePassword: (params: { oldPassword: string; newPassword: string }) => api.invoke('auth:change-password', params),
  logout: () => api.invoke('auth:logout'),
}

export const importAPI = {
  pickFile: () => api.invoke('import:pick-file'),
  excel: (filePath: string) => api.invoke('import:excel', filePath),
  stockIn: (filePath: string) => api.invoke('import:stock-in', filePath),
}

export const aiAPI = {
  status: () => api.invoke('ai:status'),
  chat: (params: {
    prompt?: string
    messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
    model?: string
  }) => api.invoke('ai:chat', params),
}

export const updateAPI = {
  getState: () => api.invoke('update:get-state'),
  check: (options?: { silent?: boolean }) => api.invoke('update:check', options),
  download: () => api.invoke('update:download'),
  install: () => api.invoke('update:install'),
  onState: (listener: (state: any) => void) => window.electronAPI.on('update:state', listener),
  onOpenDialog: (listener: () => void) => window.electronAPI.on('update:open-dialog', listener),
}
