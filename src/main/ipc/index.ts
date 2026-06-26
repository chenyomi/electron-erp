import { ipcMain } from 'electron'
import { registerCashHandlers } from './cash'
import { registerBankHandlers } from './bank'
import { registerBillsHandlers } from './bills'
import { registerCustomerHandlers } from './customer'
import { registerSupplierHandlers } from './supplier'
import { registerStockInHandlers } from './stock-in'
import { registerStockOutHandlers } from './stock-out'
import { registerInventoryHandlers } from './inventory'
import { registerProductHandlers } from './products'
import { registerSystemHandlers } from './system'
import { registerImportHandlers } from './import'
import { registerAuthHandlers } from './auth'
import { registerAiHandlers } from './ai'
import { registerAttachmentHandlers } from './attachments'
import { registerPrintHandlers } from './print'
import { registerUpdateHandlers } from './update'
import { registerCloudHandlers } from './cloud'

export function registerIpcHandlers(): void {
  registerAuthHandlers()
  registerCashHandlers()
  registerBankHandlers()
  registerBillsHandlers()
  registerCustomerHandlers()
  registerSupplierHandlers()
  registerStockInHandlers()
  registerStockOutHandlers()
  registerInventoryHandlers()
  registerProductHandlers()
  registerSystemHandlers()
  registerAttachmentHandlers()
  registerPrintHandlers()
  registerImportHandlers()
  registerAiHandlers()
  registerUpdateHandlers()
  registerCloudHandlers()
}
