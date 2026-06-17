import { ipcMain } from 'electron'
import { registerCashHandlers } from './cash'
import { registerBankHandlers } from './bank'
import { registerBillsHandlers } from './bills'
import { registerCustomerHandlers } from './customer'
import { registerStockInHandlers } from './stock-in'
import { registerStockOutHandlers } from './stock-out'
import { registerSystemHandlers } from './system'
import { registerImportHandlers } from './import'
import { registerAuthHandlers } from './auth'
import { registerAiHandlers } from './ai'
import { registerAttachmentHandlers } from './attachments'
import { registerPrintHandlers } from './print'

export function registerIpcHandlers(): void {
  registerAuthHandlers()
  registerCashHandlers()
  registerBankHandlers()
  registerBillsHandlers()
  registerCustomerHandlers()
  registerStockInHandlers()
  registerStockOutHandlers()
  registerSystemHandlers()
  registerAttachmentHandlers()
  registerPrintHandlers()
  registerImportHandlers()
  registerAiHandlers()
}
