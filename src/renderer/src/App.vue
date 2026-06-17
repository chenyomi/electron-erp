<template>
  <v-app :theme="themeName">
    <div v-if="checkingAuth" class="fill-screen center">
      <v-progress-circular indeterminate color="primary" size="44" />
    </div>

    <div v-else-if="!currentUser" class="login-shell">
      <div class="login-bg-grid" />
      <div class="login-bg-beam" />
      <div class="login-toolbar">
        <button class="toolbar-toggle" type="button" @click="toggleLanguage">
          <span class="toolbar-toggle__item" :class="{ active: languageMode === 'zh' }">中</span>
          <span class="toolbar-toggle__item" :class="{ active: languageMode === 'en' }">EN</span>
        </button>
        <button class="toolbar-toggle icon" type="button" @click="toggleTheme">
          <span class="toolbar-toggle__item" :class="{ active: themeMode === 'light' }">☀</span>
          <span class="toolbar-toggle__item" :class="{ active: themeMode === 'dark' }">☾</span>
        </button>
      </div>

      <v-card class="login-card">
        <div class="login-card__badge">{{ t('companyName') }}</div>
        <div class="brand-row">
          <div class="brand-mark">东</div>
          <div>
            <div class="brand-title">{{ t('appName') }}</div>
            <div class="muted">{{ t('loginSubtitle') }}</div>
          </div>
        </div>

        <v-alert v-if="loginError" type="error" variant="tonal" density="compact" class="mb-4">{{ loginError }}</v-alert>
        <v-form @submit.prevent>
          <v-text-field
            v-model.trim="loginForm.username"
            :label="t('username')"
            :placeholder="t('usernamePlaceholder')"
            autofocus
            class="mb-4"
            @keydown.enter.prevent="handleLogin"
          />
          <v-text-field
            v-model="loginForm.password"
            :label="t('password')"
            :placeholder="t('passwordPlaceholder')"
            type="password"
            class="mb-5"
            @keydown.enter.prevent="handleLogin"
          />
          <v-btn block color="primary" size="large" class="login-submit" :loading="loginLoading" @click="handleLogin">{{ t('login') }}</v-btn>
        </v-form>
      </v-card>
    </div>

    <div v-else class="app-shell">
      <aside class="nav-drawer">
        <div class="drawer-brand">
          <div class="brand-mark small">东</div>
          <div>
            <div class="drawer-title">{{ t('appName') }}</div>
            <div class="muted tiny">{{ t('companyName') }}</div>
          </div>
        </div>

        <div class="nav-scroll">
          <div class="nav-section-label">{{ t('navFinance') }}</div>
          <v-list class="nav-list" bg-color="transparent" density="compact" nav>
            <v-list-item v-for="item in navItems" :key="item.key" class="nav-item-v" :active="page === item.key" rounded="xl" @click="page = item.key">
              <template #prepend>
                <span class="nav-icon">{{ item.icon }}</span>
              </template>
              <v-list-item-title class="nav-item-title">{{ t(item.label) }}</v-list-item-title>
              <v-list-item-subtitle class="nav-item-sub">{{ t(item.sub) }}</v-list-item-subtitle>
            </v-list-item>
          </v-list>

          <div class="drawer-spacer" />
          <div class="nav-section-label">{{ t('navTools') }}</div>
          <v-list class="nav-list" bg-color="transparent" density="compact" nav>
            <v-list-item v-for="item in bottomItems" :key="item.key" class="nav-item-v" :active="page === item.key" rounded="xl" @click="page = item.key">
              <template #prepend>
                <span class="nav-icon">{{ item.icon }}</span>
              </template>
              <v-list-item-title class="nav-item-title">{{ t(item.label) }}</v-list-item-title>
              <v-list-item-subtitle class="nav-item-sub">{{ t(item.sub) }}</v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </div>
      </aside>

      <main class="content-shell">
        <DashboardPage v-if="page === 'dashboard'" :t="t" />
        <LedgerPage v-else-if="isLedgerPage" :page="page" :t="t" @notify="notify" />
        <ImportPage v-else-if="page === 'import'" :t="t" @notify="notify" />
        <TrashPage v-else-if="page === 'trash'" :t="t" @notify="notify" />
        <LogsPage v-else-if="page === 'logs'" :t="t" />
        <AiAssistant v-else-if="page === 'ai'" :compact="false" @notify="notify" />
      </main>

      <v-card class="user-card top-user-card">
        <div class="user-row">
          <div class="user-avatar">{{ userInitial }}</div>
          <div class="min-0">
            <div class="user-name">{{ currentUser.displayName || currentUser.username }}</div>
            <div class="muted tiny">{{ currentUser.role === 'admin' ? t('admin') : currentUser.role }}</div>
          </div>
        </div>
        <div class="user-actions">
          <v-btn icon size="small" variant="tonal" :title="themeMode === 'dark' ? '浅色模式' : '深色模式'" @click="toggleTheme">{{ themeMode === 'dark' ? '☀' : '☾' }}</v-btn>
          <v-btn icon size="small" variant="tonal" :title="languageMode === 'zh' ? 'English' : '中文'" @click="toggleLanguage">{{ languageMode === 'zh' ? 'EN' : '中' }}</v-btn>
          <v-btn icon size="small" variant="tonal" :title="t('changePassword')" @click="passwordDialog = true">🔒</v-btn>
        </div>
        <v-btn class="logout-compact" color="error" variant="tonal" size="small" :title="t('logout')" @click="handleLogout">⏻</v-btn>
      </v-card>
      <v-navigation-drawer v-model="aiDrawer" location="right" temporary width="560">
        <AiAssistant compact @notify="notify" />
      </v-navigation-drawer>
    </div>

    <v-dialog v-model="passwordDialog" max-width="480" scrollable>
      <v-card class="record-dialog">
        <div class="record-dialog__header">
          <div>
            <h2 class="record-dialog__title">{{ t('changePassword') }}</h2>
            <p class="record-dialog__subtitle">{{ t('formAddHint') }}</p>
          </div>
        </div>
        <v-card-text class="record-dialog__body">
          <div class="record-dialog__section">
            <div class="record-dialog__grid">
              <div class="record-dialog__field record-dialog__field--full">
                <v-text-field v-model="passwordForm.oldPassword" :label="t('oldPassword')" type="password" variant="outlined" density="comfortable" hide-details="auto" />
              </div>
              <div class="record-dialog__field record-dialog__field--half">
                <v-text-field v-model="passwordForm.newPassword" :label="t('newPassword')" type="password" variant="outlined" density="comfortable" hide-details="auto" />
              </div>
              <div class="record-dialog__field record-dialog__field--half">
                <v-text-field v-model="passwordForm.confirmPassword" :label="t('confirmNewPassword')" type="password" variant="outlined" density="comfortable" hide-details="auto" />
              </div>
            </div>
          </div>
        </v-card-text>
        <div class="record-dialog__footer">
          <v-btn variant="text" @click="passwordDialog = false">{{ t('cancel') }}</v-btn>
          <v-btn color="primary" :loading="passwordLoading" @click="changePassword">{{ t('save') }}</v-btn>
        </div>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="2600">{{ snackbar.text }}</v-snackbar>
  </v-app>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, nextTick, onMounted, reactive, ref, watch } from 'vue'
import * as echarts from 'echarts'
import {
  VAlert,
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCardTitle,
  VCheckboxBtn,
  VDialog,
  VList,
  VListItem,
  VListItemSubtitle,
  VListItemTitle,
  VPagination,
  VCombobox,
  VSelect,
  VSpacer,
  VTab,
  VTable,
  VTabs,
  VTextarea,
  VTextField,
} from 'vuetify/components'
import { authAPI, bankAPI, billsAPI, cashAPI, customerAPI, stockInAPI, stockOutAPI, importAPI, systemAPI, aiAPI, attachmentAPI, printAPI } from './api'
import { runLodopScript, checkLodopAvailable } from './lodop-print'

type PageKey = 'dashboard' | 'cash' | 'bank' | 'bills' | 'customer' | 'stockIn' | 'stockOut' | 'ai' | 'trash' | 'logs' | 'import'
type ThemeMode = 'dark' | 'light'
type Lang = 'zh' | 'en'

interface LoginUser {
  id: number
  username: string
  displayName: string
  role: string
}

const messages = {
  zh: {
    appName: '东昊账务',
    companyName: '温州东昊汽车配件',
    loginSubtitle: '请登录后继续使用',
    username: '账号',
    password: '密码',
    usernamePlaceholder: '请输入账号',
    passwordPlaceholder: '请输入密码',
    login: '登录',
    admin: '管理员',
    changePassword: '修改密码',
    logout: '退出登录',
    oldPassword: '原密码',
    newPassword: '新密码',
    confirmNewPassword: '确认新密码',
    save: '保存',
    cancel: '取消',
    navFinance: '账务管理',
    navTools: '工具',
    dashboard: '总账首页',
    dashboardSub: '汇总概览',
    cash: '现金账',
    cashSub: '现金收支流水',
    bank: '公账',
    bankSub: '银行账户',
    bills: '承兑票',
    billsSub: '票据管理',
    customer: '客户往来',
    customerSub: '应收应付',
    stockIn: '材料入库',
    stockInSub: '材料/外协入库',
    stockOut: '产品出库',
    stockOutSub: '产品出库记录',
    supplierName: '供应商',
    filterSupplier: '筛选供应商',
    category: '类别',
    contractNo: '合同编号',
    productName: '产品名称',
    spec: '规格',
    unit: '单位',
    quantity: '数量',
    unitPrice: '单价',
    amount: '金额',
    taxRate: '税率',
    taxAmount: '税额',
    invoiceAmount: '开票金额',
    totalQuantity: '总数量',
    totalAmount: '总金额',
    totalRecords: '记录数',
    supplierCount: '供应商数',
    customerCount: '客户数',
    searchStock: '搜索产品/规格/合同号…',
    typeSupplierName: '输入或选择供应商',
    typeCustomerName: '输入或选择客户',
    importStockIn: '导入入库 Excel',
    importStockInDone: '入库导入完成',
    importStockInSummary: '入库 {stockIn} 条，跳过 {skipped} 条，共 {sheets} 个供应商',
    ai: 'AI 助手',
    aiSub: '账务问答',
    importData: '数据管理',
    importSub: '备份与导入',
    trash: '回收站',
    trashSub: '已删除记录',
    logs: '操作日志',
    logsSub: '变更历史',
    date: '日期',
    description: '摘要',
    income: '收入金额',
    expense: '支出金额',
    currentBalance: '当前余额',
    balance: '余额',
    operator: '经办人',
    note: '备注',
    action: '操作',
    edit: '编辑',
    delete: '删除',
    restore: '恢复',
    add: '新增',
    addRecord: '新增记录',
    formAddHint: '填写信息后点击保存',
    formEditHint: '修改完成后点击保存',
    formSectionBasic: '基本信息',
    formSectionParty: '往来单位',
    formSectionProduct: '产品信息',
    formSectionAmount: '金额信息',
    formSectionTax: '税务信息',
    formSectionOther: '备注说明',
    formSectionAttachments: '附件图片',
    images: '图片',
    viewImages: '查看图片',
    addImage: '添加图片',
    chooseImage: '选择图片',
    noImages: '暂无图片',
    search: '搜索…',
    searchCash: '搜索摘要/经办人/日期…',
    export: '导出',
    exportAllExcel: '导出总表',
    exportDone: '导出完成，共 {count} 条',
    exportDoneSelected: '已导出选中 {count} 条',
    exportFailed: '导出失败',
    printSlip: '打印销售单',
    printPreview: '销售单预览',
    printNow: '打印',
    savePdf: '保存 PDF',
    slipSettings: '模板设置',
    customerPhone: '客户电话',
    paymentReceived: '本单收款',
    printDone: '已发送到打印机',
    printFailed: '打印失败',
    pdfSaved: 'PDF 已保存',
    selectRowsToPrint: '请先勾选要打印的出库记录',
    settingsSaved: '模板已保存',
    printTemplate: '单据模板',
    templateSales: '竖版销售单',
    templateMetal: '横版金属单',
    customerAddress: '客户地址',
    lodopPrint: 'Lodop套打',
    lodopDone: '已打开 Lodop 打印预览',
    lodopUnavailable: '未检测到 C-Lodop，请先安装并启动服务',
    lodopSettings: 'Lodop 套打',
    offsetX: '左右偏移(mm)',
    offsetY: '上下偏移(mm)',
    overlayMode: '套打模式(不打印边框)',
    lodopPreview: 'Lodop 先预览',
    auditor: '审核人',
    pickNote: '提货提示',
    dataMgmtTitle: '数据管理',
    dataMgmtSub: '备份、恢复、导出，换电脑也能搬数据',
    restoreSection: '恢复数据',
    restoreTitle: '从备份恢复',
    restoreDesc: '选择一份备份文件夹（本机备份、U 盘或旧电脑拷来的都可以），一键还原全部账本和图片。',
    pickBackupFolder: '选择备份文件夹',
    restoreThisBackup: '恢复',
    restoreDone: '恢复成功',
    restoreFailed: '恢复失败',
    legacySection: '旧版 Excel 迁移',
    legacyHint: '仅限首次从老 Excel 账本迁入，格式需与原账本一致。日常使用请用上面的备份恢复。',
    importLedgerTitle: '导入账本',
    importLedgerDesc: '从以前的 Excel 账本首次迁入历史数据。',
    importStockTitle: '导入入库单',
    importStockDesc: '从材料入库 Excel 按供应商导入记录。',
    importTitle: '导入数据',
    importPageSub: '从 Excel 账本导入历史数据',
    pickExcel: '选择账本文件',
    importDone: '导入完成',
    importSummary: '现金 {cash} 条，公账 {bank} 条，承兑 {bills} 条，客户往来 {customers} 条，图片 {images} 张，已关联 {attachments} 张',
    importFailed: '导入失败',
    backupSection: '备份数据',
    backupTitle: '一键备份',
    backupDesc: '把所有账本数据和图片保存到电脑，换电脑或出问题时可以恢复。',
    backupNow: '立即备份',
    backupDone: '备份成功',
    backupFailed: '备份失败',
    openBackupFolder: '查看备份文件夹',
    exportSection: '导出报表',
    exportTitle: '导出总表',
    exportDesc: '把所有账本导出为一个 Excel 文件，方便查看或发给会计。',
    recentBackups: '最近备份',
    noBackupsYet: '还没有备份，建议先点「立即备份」',
    total: '共 {count} 条',
    totalIncome: '总收入',
    totalExpense: '总支出',
    currentSurplus: '当前结余',
    totalIn: '总进账',
    totalOut: '总付出',
    netAmount: '净额',
    amountIn: '进账',
    amountOut: '付出',
    billIn: '收票',
    receipt: '收款',
    payment: '付款',
    customerName: '客户',
    filterCustomer: '筛选客户',
    allCustomerSummary: '所有客户汇总',
    deletedAt: '删除时间',
    restored: '已恢复',
    logsTitle: '操作日志',
    logsPageSub: '所有增删改记录，用于追溯和审计',
    time: '时间',
    actionType: '操作类型',
    module: '所属模块',
    beforeChange: '变更前',
    afterChange: '变更后',
  },
  en: {
    appName: 'Donghao Ledger',
    companyName: 'Wenzhou Donghao Auto Parts',
    loginSubtitle: 'Sign in to continue',
    username: 'Username',
    password: 'Password',
    usernamePlaceholder: 'Enter username',
    passwordPlaceholder: 'Enter password',
    login: 'Sign In',
    admin: 'Admin',
    changePassword: 'Password',
    logout: 'Logout',
    oldPassword: 'Old Password',
    newPassword: 'New Password',
    confirmNewPassword: 'Confirm Password',
    save: 'Save',
    cancel: 'Cancel',
    navFinance: 'Finance',
    navTools: 'Tools',
    dashboard: 'Dashboard',
    dashboardSub: 'Overview',
    cash: 'Cash',
    cashSub: 'Cash ledger',
    bank: 'Bank',
    bankSub: 'Bank account',
    bills: 'Bills',
    billsSub: 'Acceptance bills',
    customer: 'Customers',
    customerSub: 'Receivable/payable',
    stockIn: 'Stock In',
    stockInSub: 'Material inbound',
    stockOut: 'Stock Out',
    stockOutSub: 'Product outbound',
    supplierName: 'Supplier',
    filterSupplier: 'Supplier',
    category: 'Category',
    contractNo: 'Contract',
    productName: 'Product',
    spec: 'Spec',
    unit: 'Unit',
    quantity: 'Qty',
    unitPrice: 'Price',
    amount: 'Amount',
    taxRate: 'Tax Rate',
    taxAmount: 'Tax',
    invoiceAmount: 'Invoice',
    totalQuantity: 'Total Qty',
    totalAmount: 'Total Amount',
    totalRecords: 'Records',
    supplierCount: 'Suppliers',
    customerCount: 'Customers',
    searchStock: 'Search product/spec/contract…',
    typeSupplierName: 'Type or select supplier',
    typeCustomerName: 'Type or select customer',
    importStockIn: 'Import Stock In Excel',
    importStockInDone: 'Stock in import complete',
    importStockInSummary: 'Imported {stockIn}, skipped {skipped}, {sheets} suppliers',
    ai: 'AI Assistant',
    aiSub: 'Ledger QA',
    importData: 'Data',
    importSub: 'Backup & Import',
    trash: 'Trash',
    trashSub: 'Deleted records',
    logs: 'Logs',
    logsSub: 'History',
    date: 'Date',
    description: 'Description',
    income: 'Income',
    expense: 'Expense',
    currentBalance: 'Balance',
    balance: 'Balance',
    operator: 'Operator',
    note: 'Note',
    action: 'Action',
    edit: 'Edit',
    delete: 'Delete',
    restore: 'Restore',
    add: 'Add',
    addRecord: 'Add Record',
    formAddHint: 'Fill in the form and save',
    formEditHint: 'Update and save your changes',
    formSectionBasic: 'Basic Info',
    formSectionParty: 'Party',
    formSectionProduct: 'Product',
    formSectionAmount: 'Amounts',
    formSectionTax: 'Tax',
    formSectionOther: 'Notes',
    formSectionAttachments: 'Attachments',
    images: 'Images',
    viewImages: 'Preview',
    addImage: 'Add Image',
    chooseImage: 'Choose Image',
    noImages: 'No images',
    search: 'Search…',
    searchCash: 'Search description/operator/date…',
    export: 'Export',
    exportAllExcel: 'Export All',
    exportDone: 'Export complete, {count} rows',
    exportDoneSelected: 'Exported {count} selected rows',
    exportFailed: 'Export failed',
    printSlip: 'Print Slip',
    printPreview: 'Sales Slip Preview',
    printNow: 'Print',
    savePdf: 'Save PDF',
    slipSettings: 'Template',
    customerPhone: 'Customer Phone',
    paymentReceived: 'Payment',
    printDone: 'Sent to printer',
    printFailed: 'Print failed',
    pdfSaved: 'PDF saved',
    selectRowsToPrint: 'Select outbound rows first',
    settingsSaved: 'Template saved',
    printTemplate: 'Template',
    templateSales: 'Sales Slip',
    templateMetal: 'Metal Slip',
    customerAddress: 'Customer Address',
    lodopPrint: 'Lodop Print',
    lodopDone: 'Lodop preview opened',
    lodopUnavailable: 'C-Lodop service not detected',
    lodopSettings: 'Lodop Overlay',
    offsetX: 'Offset X (mm)',
    offsetY: 'Offset Y (mm)',
    overlayMode: 'Overlay mode (no borders)',
    lodopPreview: 'Lodop preview first',
    auditor: 'Auditor',
    pickNote: 'Pickup note',
    dataMgmtTitle: 'Data Management',
    dataMgmtSub: 'Back up, restore, and export — move data between computers easily',
    restoreSection: 'Restore',
    restoreTitle: 'Restore from Backup',
    restoreDesc: 'Pick a backup folder from this computer, a USB drive, or another machine to restore all ledger data and images.',
    pickBackupFolder: 'Choose Backup Folder',
    restoreThisBackup: 'Restore',
    restoreDone: 'Restore complete',
    restoreFailed: 'Restore failed',
    legacySection: 'Legacy Excel Migration',
    legacyHint: 'For first-time migration from the old Excel ledger only. For daily use, prefer backup restore above.',
    importLedgerTitle: 'Import Ledger',
    importLedgerDesc: 'One-time migration from a legacy Excel ledger.',
    importStockTitle: 'Import Stock In',
    importStockDesc: 'Import inbound records from a stock-in Excel file.',
    importTitle: 'Import Data',
    importPageSub: 'Import historical data from Excel',
    pickExcel: 'Choose Ledger File',
    importDone: 'Import complete',
    importSummary: 'Cash {cash}, bank {bank}, bills {bills}, customers {customers}, images {images}, linked {attachments}',
    importFailed: 'Import failed',
    backupSection: 'Backup',
    backupTitle: 'One-Click Backup',
    backupDesc: 'Save all ledger data and images on this computer for recovery or migration.',
    backupNow: 'Backup Now',
    backupDone: 'Backup complete',
    backupFailed: 'Backup failed',
    openBackupFolder: 'Open backup folder',
    exportSection: 'Export',
    exportTitle: 'Export Summary',
    exportDesc: 'Export all ledgers into one Excel file for review or sharing.',
    recentBackups: 'Recent Backups',
    noBackupsYet: 'No backups yet. Tap "Backup Now" to create one.',
    total: '{count} items',
    totalIncome: 'Income',
    totalExpense: 'Expense',
    currentSurplus: 'Current Balance',
    totalIn: 'Total In',
    totalOut: 'Total Out',
    netAmount: 'Net',
    amountIn: 'In',
    amountOut: 'Out',
    billIn: 'Received',
    receipt: 'Receipt',
    payment: 'Payment',
    customerName: 'Customer',
    filterCustomer: 'Customer',
    allCustomerSummary: 'All Customer Summary',
    deletedAt: 'Deleted At',
    restored: 'Restored',
    logsTitle: 'Logs',
    logsPageSub: 'All create/update/delete records',
    time: 'Time',
    actionType: 'Action',
    module: 'Module',
    beforeChange: 'Before',
    afterChange: 'After',
  },
} as const

const page = ref<PageKey>('dashboard')
const currentUser = ref<LoginUser | null>(null)
const checkingAuth = ref(true)
const themeMode = ref<ThemeMode>((localStorage.getItem('themeMode') as ThemeMode) || 'dark')
const languageMode = ref<Lang>((localStorage.getItem('languageMode') as Lang) || 'zh')
const loginLoading = ref(false)
const loginError = ref('')
const loginForm = reactive({ username: '', password: '' })
const passwordDialog = ref(false)
const passwordLoading = ref(false)
const passwordForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })
const aiDrawer = ref(false)
const snackbar = reactive({ show: false, text: '', color: 'success' })

const themeName = computed(() => themeMode.value === 'dark' ? 'donghaoDark' : 'donghaoLight')
const isLedgerPage = computed(() => ['cash', 'bank', 'bills', 'customer', 'stockIn', 'stockOut'].includes(page.value))
const userInitial = computed(() => (currentUser.value?.displayName || currentUser.value?.username || '东').slice(0, 1).toUpperCase())

const navItems = [
  { key: 'dashboard' as PageKey, icon: '◼', label: 'dashboard', sub: 'dashboardSub' },
  { key: 'cash' as PageKey, icon: '💵', label: 'cash', sub: 'cashSub' },
  { key: 'bank' as PageKey, icon: '🏦', label: 'bank', sub: 'bankSub' },
  { key: 'bills' as PageKey, icon: '📄', label: 'bills', sub: 'billsSub' },
  { key: 'customer' as PageKey, icon: '🏭', label: 'customer', sub: 'customerSub' },
  { key: 'stockIn' as PageKey, icon: '📦', label: 'stockIn', sub: 'stockInSub' },
  { key: 'stockOut' as PageKey, icon: '🚚', label: 'stockOut', sub: 'stockOutSub' },
  { key: 'ai' as PageKey, icon: 'AI', label: 'ai', sub: 'aiSub' },
]

const bottomItems = [
  { key: 'import' as PageKey, icon: '📥', label: 'importData', sub: 'importSub' },
  { key: 'trash' as PageKey, icon: '🗑', label: 'trash', sub: 'trashSub' },
  { key: 'logs' as PageKey, icon: '📋', label: 'logs', sub: 'logsSub' },
]

function notifyExportResult(
  emit: (event: 'notify', text: string, color?: string) => void,
  t: (key: string, params?: Record<string, string | number>) => string,
  result: any,
  selectedCount = 0,
) {
  if (result?.ok) {
    const key = selectedCount > 0 ? 'exportDoneSelected' : 'exportDone'
    emit('notify', t(key, { count: result.totalRows || 0 }))
    return
  }
  if (result?.canceled) return
  emit('notify', result?.error || t('exportFailed'), 'error')
}

function t(key: string, params?: Record<string, string | number>) {
  let text = (messages[languageMode.value] as any)[key] || (messages.zh as any)[key] || key
  if (params) for (const [name, value] of Object.entries(params)) text = text.replaceAll(`{${name}}`, String(value))
  return text
}

function notify(text: string, color = 'success') {
  snackbar.text = text
  snackbar.color = color
  snackbar.show = true
}

function toggleTheme() {
  themeMode.value = themeMode.value === 'dark' ? 'light' : 'dark'
}

function toggleLanguage() {
  languageMode.value = languageMode.value === 'zh' ? 'en' : 'zh'
}

async function handleLogin() {
  if (!loginForm.username || !loginForm.password) {
    loginError.value = '请输入账号和密码'
    return
  }
  loginLoading.value = true
  loginError.value = ''
  try {
    const result = await authAPI.login({ username: loginForm.username, password: loginForm.password })
    if (result.ok) currentUser.value = result.user
    else loginError.value = result.error || '登录失败'
  } catch (error: any) {
    loginError.value = error?.message || '登录失败'
  } finally {
    loginLoading.value = false
  }
}

async function handleLogout() {
  await authAPI.logout()
  currentUser.value = null
  page.value = 'dashboard'
}

async function changePassword() {
  if (!passwordForm.oldPassword || !passwordForm.newPassword) return notify('请填写密码', 'error')
  if (passwordForm.newPassword !== passwordForm.confirmPassword) return notify('两次输入的新密码不一致', 'error')
  passwordLoading.value = true
  const result = await authAPI.changePassword({ oldPassword: passwordForm.oldPassword, newPassword: passwordForm.newPassword })
  passwordLoading.value = false
  if (!result.ok) return notify(result.error || '修改密码失败', 'error')
  passwordDialog.value = false
  Object.assign(passwordForm, { oldPassword: '', newPassword: '', confirmPassword: '' })
  notify('密码已修改')
}

watch(themeMode, (mode) => {
  document.body.dataset.theme = mode
  localStorage.setItem('themeMode', mode)
}, { immediate: true })

watch(languageMode, (mode) => {
  document.documentElement.lang = mode === 'zh' ? 'zh-CN' : 'en'
  localStorage.setItem('languageMode', mode)
}, { immediate: true })

onMounted(async () => {
  currentUser.value = await authAPI.me()
  checkingAuth.value = false
})

function money(value: any) {
  return Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatWan(value: number) {
  const abs = Math.abs(value)
  if (abs >= 10000) return `${(value / 10000).toFixed(abs >= 100000 ? 0 : 1)}万`
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
}

const DashboardPage = defineComponent({
  props: { t: { type: Function, required: true } },
  setup(props) {
    const loading = ref(true)
    const summary = ref<any>(null)
    const monthly = ref<any>(null)
    const chartRefs = Array.from({ length: 6 }, () => ref<HTMLElement | null>(null))

    const load = async () => {
      loading.value = true
      const [s, m] = await Promise.all([systemAPI.summary(), systemAPI.monthlyAll()])
      summary.value = s
      monthly.value = m
      loading.value = false
      await nextTick()
      renderCharts()
    }

    const renderCharts = () => {
      const months: string[] = []
      const cashIn: number[] = []
      const cashOut: number[] = []
      const bankInArr: number[] = []
      const bankOutArr: number[] = []
      const monthNet: number[] = []
      const monthTotalIn: number[] = []
      const monthTotalOut: number[] = []
      const cashMap = Object.fromEntries((monthly.value?.cash || []).map((r: any) => [r.month, r]))
      const bankMap = Object.fromEntries((monthly.value?.bank || []).map((r: any) => [r.month, r]))
      for (const m of Array.from(new Set([...Object.keys(cashMap), ...Object.keys(bankMap)])).sort()) {
        months.push(m)
        cashIn.push(cashMap[m]?.income || 0)
        cashOut.push(cashMap[m]?.expense || 0)
        bankInArr.push(bankMap[m]?.income || 0)
        bankOutArr.push(bankMap[m]?.expense || 0)
        monthTotalIn.push((cashMap[m]?.income || 0) + (bankMap[m]?.income || 0))
        monthTotalOut.push((cashMap[m]?.expense || 0) + (bankMap[m]?.expense || 0))
        monthNet.push(monthTotalIn.at(-1)! - monthTotalOut.at(-1)!)
      }

      const s = summary.value || {}
      const cashIncome = s.cash?.totalIncome || 0
      const cashExpense = s.cash?.totalExpense || 0
      const bankIn = s.bank?.totalIn || 0
      const bankOut = s.bank?.totalOut || 0
      const billsIn = s.bills?.totalIn || 0
      const billsOut = s.bills?.totalOut || 0
      const netFlow = cashIncome + bankIn + billsIn - cashExpense - bankOut - billsOut
      const tooltip = { backgroundColor: 'rgba(10,16,28,.96)', borderColor: 'rgba(115,192,222,.22)', textStyle: { color: '#dbeafe' } }
      const axisText = { color: '#7f8ea3' }
      const palette = ['#5470c6', '#73c0de', '#91cc75', '#fac858', '#ee6666', '#9a60b4', '#ea7ccc']
      const init = (index: number, option: any) => {
        const el = chartRefs[index].value
        if (!el) return
        const chart = echarts.getInstanceByDom(el) || echarts.init(el)
        chart.setOption(option, true)
      }

      init(0, {
        color: palette, tooltip: { trigger: 'axis', ...tooltip }, legend: { top: 0, textStyle: axisText },
        grid: { left: 12, right: 16, top: 44, bottom: 8, containLabel: true },
        xAxis: { type: 'category', data: months, axisLabel: axisText }, yAxis: { type: 'value', axisLabel: { ...axisText, formatter: formatWan } },
        series: [
          { name: '现金收入', type: 'bar', data: cashIn, itemStyle: { borderRadius: [6, 6, 0, 0] } },
          { name: '现金支出', type: 'bar', data: cashOut, itemStyle: { borderRadius: [6, 6, 0, 0] } },
          { name: '公账收入', type: 'line', smooth: true, data: bankInArr, areaStyle: { opacity: .18 } },
          { name: '公账支出', type: 'line', smooth: true, data: bankOutArr, lineStyle: { type: 'dashed' } },
        ],
      })
      init(1, {
        color: palette, tooltip: { trigger: 'item', ...tooltip }, legend: { bottom: 0, textStyle: axisText },
        series: [{ type: 'pie', radius: ['38%', '72%'], roseType: 'radius', itemStyle: { borderRadius: 8, borderColor: '#0b1020', borderWidth: 2 }, data: [
          { name: '现金收入', value: cashIncome }, { name: '公账进账', value: bankIn }, { name: '承兑收入', value: billsIn },
          { name: '现金支出', value: cashExpense }, { name: '公账付出', value: bankOut }, { name: '承兑付出', value: billsOut },
        ].filter(i => i.value > 0) }],
      })
      init(2, { color: palette, tooltip: { trigger: 'axis', ...tooltip }, grid: { left: 12, right: 14, top: 24, bottom: 8, containLabel: true }, xAxis: { type: 'category', data: months, axisLabel: axisText }, yAxis: { type: 'value', axisLabel: { ...axisText, formatter: formatWan } }, series: [{ name: '月度净流', type: 'line', smooth: true, data: monthNet, symbol: 'diamond', areaStyle: { opacity: .22 } }] })
      init(3, { series: [{ type: 'gauge', startAngle: 210, endAngle: -30, min: 0, max: 100, radius: '92%', progress: { show: true, roundCap: true, width: 16, itemStyle: { color: netFlow >= 0 ? '#91cc75' : '#ee6666' } }, axisLine: { roundCap: true, lineStyle: { width: 16, color: [[1, 'rgba(115,192,222,.12)']] } }, pointer: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, title: { color: '#7f8ea3' }, detail: { color: netFlow >= 0 ? '#91cc75' : '#ee6666', formatter: () => formatWan(netFlow), fontSize: 26 }, data: [{ value: 68, name: netFlow >= 0 ? '资金净流入' : '资金净流出' }] }] })
      init(4, { color: palette, tooltip, radar: { radius: '66%', axisName: { color: '#9fb3c8' }, indicator: ['现金收入', '现金支出', '公账进账', '公账付出', '承兑收入', '承兑付出'].map(name => ({ name, max: Math.max(cashIncome, cashExpense, bankIn, bankOut, billsIn, billsOut, 1) })) }, series: [{ type: 'radar', data: [{ value: [cashIncome, cashExpense, bankIn, bankOut, billsIn, billsOut], name: '总账规模' }], areaStyle: { opacity: .24 } }] })
      init(5, { color: palette, tooltip: { trigger: 'axis', ...tooltip }, legend: { top: 0, textStyle: axisText }, grid: { left: 12, right: 12, top: 42, bottom: 8, containLabel: true }, xAxis: { type: 'category', data: months, axisLabel: axisText }, yAxis: { type: 'value', axisLabel: { ...axisText, formatter: formatWan } }, series: [{ name: '总收入', type: 'bar', data: monthTotalIn }, { name: '总支出', type: 'bar', data: monthTotalOut.map(v => -v) }, { name: '净额', type: 'line', smooth: true, data: monthNet }] })
    }

    onMounted(load)
    return () => h('div', { class: 'page-wrap' }, loading.value ? h('div', { class: 'center page-loading' }, [h('div', '加载中...')]) : [
      h(PageHeader, { title: props.t('dashboard'), subtitle: '温州东昊汽车配件有限公司' }),
      h('div', { class: 'stat-grid' }, [
        h(StatCard, { title: '现金结余', value: summary.value?.cash?.balance || 0, color: 'success' }),
        h(StatCard, { title: '现金总收入', value: summary.value?.cash?.totalIncome || 0, color: 'primary' }),
        h(StatCard, { title: '现金总支出', value: summary.value?.cash?.totalExpense || 0, color: 'error' }),
        h(StatCard, { title: '公账净收入', value: (summary.value?.bank?.totalIn || 0) - (summary.value?.bank?.totalOut || 0), color: 'secondary' }),
        h(StatCard, { title: '承兑票净额', value: (summary.value?.bills?.totalIn || 0) - (summary.value?.bills?.totalOut || 0), color: 'warning' }),
      ]),
      h(ChartCard, { title: '月度收支趋势' }, () => h('div', { ref: chartRefs[0], class: 'chart tall' })),
      h('div', { class: 'chart-grid' }, ['资金结构玫瑰图', '月度净流动能曲线', '资金净流健康仪表盘', '账务规模雷达图'].map((title, i) => h(ChartCard, { title }, () => h('div', { ref: chartRefs[i + 1], class: 'chart' })))),
      h(ChartCard, { title: '月度资金瀑布' }, () => h('div', { ref: chartRefs[5], class: 'chart tall' })),
    ])
  },
})

const PageHeader = defineComponent({
  props: { title: String, subtitle: String },
  setup(props, { slots }) {
    return () => h('div', { class: 'page-header' }, [
      h('div', { class: 'page-header__main' }, [
        h('div', { class: 'page-header__title' }, [h('h1', props.title), props.subtitle ? h('p', props.subtitle) : null]),
      ]),
      slots.actions ? h('div', { class: 'page-header__actions' }, slots.actions()) : null,
    ])
  },
})

const StatCard = defineComponent({
  props: { title: String, value: [Number, String], color: String },
  setup(props) {
    return () => h(VCard, { class: 'stat-card' }, [
      h('div', { class: 'stat-title' }, props.title),
      h('div', { class: `stat-value text-${props.color || 'primary'}` }, typeof props.value === 'number' ? money(props.value) : props.value),
    ])
  },
})

const ChartCard = defineComponent({
  props: { title: String },
  setup(props, { slots }) {
    return () => h(VCard, { class: 'chart-card' }, [h('div', { class: 'chart-title' }, props.title), slots.default?.()])
  },
})

const ledgerConfigs: any = {
  cash: { title: 'cash', api: cashAPI, pageSize: 20, search: 'searchCash', columns: ['date', 'description', 'income', 'expense', 'balance', 'operator', 'note'], fields: ['date', 'description', 'income', 'expense', 'balance', 'operator', 'note'], summary: ['totalIncome', 'totalExpense', 'currentSurplus'], table: 'cash', relatedTable: 'cash_ledger' },
  bank: { title: 'bank', api: bankAPI, pageSize: 20, search: 'search', columns: ['date', 'description', 'amount_in', 'amount_out', 'balance', 'note'], fields: ['date', 'description', 'amount_in', 'amount_out', 'balance', 'note'], summary: ['totalIn', 'totalOut', 'netAmount'], table: 'bank', relatedTable: 'bank_ledger' },
  bills: { title: 'bills', api: billsAPI, pageSize: 20, search: 'search', columns: ['date', 'description', 'amount_in', 'amount_out', 'balance', 'note'], fields: ['date', 'description', 'amount_in', 'amount_out', 'balance', 'note'], summary: ['totalIn', 'totalOut', 'netAmount'], table: 'bills', relatedTable: 'acceptance_bills' },
  customer: { title: 'customer', api: customerAPI, pageSize: 20, search: 'search', filterField: 'customerName', filterKey: 'customer_name', filterLabel: 'filterCustomer', columns: ['customer_name', 'date', 'description', 'amount_in', 'amount_out', 'balance', 'note'], fields: ['customer_name', 'date', 'description', 'amount_in', 'amount_out', 'balance', 'note', 'month_label'], summary: [], table: 'customer', relatedTable: 'customer_ledger' },
  stockIn: { title: 'stockIn', api: stockInAPI, pageSize: 20, search: 'searchStock', filterField: 'supplierName', filterKey: 'supplier_name', filterLabel: 'filterSupplier', columns: ['supplier_name', 'category', 'date', 'contract_no', 'product_name', 'spec', 'unit', 'quantity', 'unit_price', 'amount', 'note'], fields: ['supplier_name', 'category', 'date', 'contract_no', 'product_name', 'spec', 'unit', 'quantity', 'unit_price', 'amount', 'tax_rate', 'tax_amount', 'invoice_amount', 'note'], summary: ['totalRecords', 'totalQuantity', 'totalAmount'], table: 'stockIn', relatedTable: 'stock_in_ledger' },
  stockOut: { title: 'stockOut', api: stockOutAPI, pageSize: 20, search: 'searchStock', filterField: 'customerName', filterKey: 'customer_name', filterLabel: 'filterCustomer', columns: ['customer_name', 'category', 'date', 'contract_no', 'product_name', 'spec', 'unit', 'quantity', 'unit_price', 'amount', 'note'], fields: ['customer_name', 'category', 'date', 'contract_no', 'product_name', 'spec', 'unit', 'quantity', 'unit_price', 'amount', 'note'], summary: ['totalRecords', 'totalQuantity', 'totalAmount'], table: 'stockOut', relatedTable: 'stock_out_ledger' },
}

type FormFieldSpec = string | { key: string; span?: 'full' | 'half' }
type FormSectionSpec = { titleKey: string; fields: FormFieldSpec[] }

const formSections: Record<string, FormSectionSpec[]> = {
  cash: [
    { titleKey: 'formSectionBasic', fields: [{ key: 'date', span: 'half' }, { key: 'operator', span: 'half' }, { key: 'description', span: 'full' }] },
    { titleKey: 'formSectionAmount', fields: [{ key: 'income', span: 'half' }, { key: 'expense', span: 'half' }, { key: 'balance', span: 'half' }] },
    { titleKey: 'formSectionOther', fields: [{ key: 'note', span: 'full' }] },
  ],
  bank: [
    { titleKey: 'formSectionBasic', fields: [{ key: 'date', span: 'half' }, { key: 'description', span: 'full' }] },
    { titleKey: 'formSectionAmount', fields: [{ key: 'amount_in', span: 'half' }, { key: 'amount_out', span: 'half' }, { key: 'balance', span: 'half' }] },
    { titleKey: 'formSectionOther', fields: [{ key: 'note', span: 'full' }] },
  ],
  bills: [
    { titleKey: 'formSectionBasic', fields: [{ key: 'date', span: 'half' }, { key: 'description', span: 'full' }] },
    { titleKey: 'formSectionAmount', fields: [{ key: 'amount_in', span: 'half' }, { key: 'amount_out', span: 'half' }, { key: 'balance', span: 'half' }] },
    { titleKey: 'formSectionOther', fields: [{ key: 'note', span: 'full' }] },
  ],
  customer: [
    { titleKey: 'formSectionParty', fields: [{ key: 'customer_name', span: 'half' }, { key: 'date', span: 'half' }, { key: 'month_label', span: 'half' }] },
    { titleKey: 'formSectionBasic', fields: [{ key: 'description', span: 'full' }] },
    { titleKey: 'formSectionAmount', fields: [{ key: 'amount_in', span: 'half' }, { key: 'amount_out', span: 'half' }, { key: 'balance', span: 'half' }] },
    { titleKey: 'formSectionOther', fields: [{ key: 'note', span: 'full' }] },
  ],
  stockIn: [
    { titleKey: 'formSectionParty', fields: [{ key: 'supplier_name', span: 'half' }, { key: 'category', span: 'half' }, { key: 'date', span: 'half' }, { key: 'contract_no', span: 'half' }] },
    { titleKey: 'formSectionProduct', fields: [{ key: 'product_name', span: 'half' }, { key: 'spec', span: 'half' }, { key: 'unit', span: 'half' }] },
    { titleKey: 'formSectionAmount', fields: [{ key: 'quantity', span: 'half' }, { key: 'unit_price', span: 'half' }, { key: 'amount', span: 'half' }] },
    { titleKey: 'formSectionTax', fields: [{ key: 'tax_rate', span: 'half' }, { key: 'tax_amount', span: 'half' }, { key: 'invoice_amount', span: 'half' }] },
    { titleKey: 'formSectionOther', fields: [{ key: 'note', span: 'full' }] },
  ],
  stockOut: [
    { titleKey: 'formSectionParty', fields: [{ key: 'customer_name', span: 'half' }, { key: 'category', span: 'half' }, { key: 'date', span: 'half' }, { key: 'contract_no', span: 'half' }] },
    { titleKey: 'formSectionProduct', fields: [{ key: 'product_name', span: 'half' }, { key: 'spec', span: 'half' }, { key: 'unit', span: 'half' }] },
    { titleKey: 'formSectionAmount', fields: [{ key: 'quantity', span: 'half' }, { key: 'unit_price', span: 'half' }, { key: 'amount', span: 'half' }] },
    { titleKey: 'formSectionOther', fields: [{ key: 'note', span: 'full' }] },
  ],
}

const ledgerDialogWidths: Record<string, number> = {
  cash: 680,
  bank: 680,
  bills: 680,
  customer: 760,
  stockIn: 880,
  stockOut: 880,
}

const LedgerPage = defineComponent({
  props: { page: { type: String, required: true }, t: { type: Function, required: true } },
  emits: ['notify'],
  setup(props, { emit }) {
    const config = computed(() => ledgerConfigs[props.page])
    const rows = ref<any[]>([])
    const total = ref(0)
    const currentPage = ref(1)
    const keyword = ref('')
    const loading = ref(false)
    const exporting = ref(false)
    const summary = ref<any>({})
    const selected = ref<number[]>([])
    const dialog = ref(false)
    const editing = ref<any>(null)
    const form = reactive<any>({})
    const filterValue = ref('')
    const filterOptions = ref<string[]>([])
    const attachmentDialog = ref(false)
    const attachmentRow = ref<any>(null)
    const attachments = ref<any[]>([])
    const pendingAttachments = ref<any[]>([])
    const attachmentLoading = ref(false)
    const printDialog = ref(false)
    const printSettingsDialog = ref(false)
    const printLoading = ref(false)
    const printHtml = ref('')
    const printTemplate = ref<'sales' | 'metal'>('sales')
    const lodopAvailable = ref<boolean | null>(null)
    const printSettings = reactive<any>({
      template: 'sales',
      sales: {
        companyName: '',
        slipTitle: '',
        address: '',
        phones: '',
        footerNote: '',
        copyLabels: ['第一联：存根', '第二联：客户', '第三联：记账'],
      },
      metal: {
        companyName: '',
        slipTitle: '',
        address: '',
        phones: '',
        footerNote: '',
        auditor: '',
        pickNote: '提货前请核对重量',
      },
      lodop: {
        servicePort: 8000,
        pageWidthMm: 241,
        pageHeightMm: 140,
        landscape: true,
        offsetXMm: 1,
        offsetYMm: 0.5,
        usePreview: true,
        overlayMode: true,
      },
    })
    const printForm = reactive({ customerPhone: '', customerAddress: '', paymentReceived: '' })
    const displayColumns = computed(() => [...config.value.columns, 'attachments'])

    const load = async () => {
      loading.value = true
      const params: any = { page: currentPage.value, pageSize: config.value.pageSize, keyword: keyword.value }
      if (config.value.filterField) params[config.value.filterField] = filterValue.value
      const res = await config.value.api.list(params)
      rows.value = res.rows
      total.value = res.total
      if (config.value.filterField) {
        const names = await config.value.api.names()
        filterOptions.value = names.map((x: any) => x[config.value.filterKey])
        summary.value = await config.value.api.summary(filterValue.value || undefined)
      } else {
        summary.value = await config.value.api.summary()
      }
      loading.value = false
    }

    const resetSelection = () => { selected.value = []; currentPage.value = 1 }
    const openAdd = () => { editing.value = null; Object.keys(form).forEach(k => delete form[k]); attachments.value = []; pendingAttachments.value = []; if (filterValue.value && config.value.filterKey) form[config.value.filterKey] = filterValue.value; dialog.value = true }
    const openEdit = async (row: any) => { editing.value = row; Object.assign(form, row); pendingAttachments.value = []; dialog.value = true; await loadAttachments(row) }
    const save = async () => {
      const saved = editing.value ? await config.value.api.update({ ...form, id: editing.value.id }) : await config.value.api.add({ ...form })
      if (pendingAttachments.value.length && saved?.id) {
        await attachmentAPI.add(config.value.relatedTable, saved.id, pendingAttachments.value.map((item: any) => item.filePath))
      }
      dialog.value = false
      emit('notify', editing.value ? '已更新' : '已添加')
      load()
    }
    const remove = async (id: number) => { await config.value.api.delete(id); emit('notify', '已移入回收站'); load() }
    const loadAttachments = async (row: any) => {
      if (!row?.id) return
      attachmentLoading.value = true
      attachments.value = await attachmentAPI.list(config.value.relatedTable, row.id)
      attachmentLoading.value = false
    }
    const openAttachments = async (row: any) => {
      attachmentRow.value = row
      attachments.value = []
      attachmentDialog.value = true
      await loadAttachments(row)
    }
    const addAttachment = async () => {
      if (!attachmentRow.value?.id) return
      attachmentLoading.value = true
      const result = await attachmentAPI.add(config.value.relatedTable, attachmentRow.value.id)
      attachmentLoading.value = false
      if (result?.ok) {
        emit('notify', `已添加 ${result.count || 0} 张图片`)
        await loadAttachments(attachmentRow.value)
        load()
      }
    }
    const choosePendingAttachments = async () => {
      const picked = await attachmentAPI.pick()
      if (picked?.length) pendingAttachments.value = [...pendingAttachments.value, ...picked]
    }
    const exportRows = async () => {
      exporting.value = true
      try {
        const selectedCount = selected.value.length
        const exportParams: any = { table: config.value.table, keyword: keyword.value }
        if (selectedCount) exportParams.ids = [...selected.value]
        if (config.value.filterField) exportParams[config.value.filterField] = filterValue.value
        const result = await systemAPI.exportExcel(exportParams)
        notifyExportResult(emit, props.t, result, selectedCount)
      } catch (error: any) {
        emit('notify', error?.message || props.t('exportFailed'), 'error')
      } finally {
        exporting.value = false
      }
    }
    const loadSlipSettings = async () => {
      const settings = await printAPI.getSettings()
      Object.assign(printSettings, settings)
      printTemplate.value = settings.template === 'metal' ? 'metal' : 'sales'
      if (!Array.isArray(printSettings.sales?.copyLabels) || !printSettings.sales.copyLabels.length) {
        printSettings.sales.copyLabels = ['第一联：存根', '第二联：客户', '第三联：记账']
      }
      lodopAvailable.value = await checkLodopAvailable(Number(printSettings.lodop?.servicePort) || 8000)
    }
    const buildPreviewParams = () => ({
      ids: selected.value,
      template: printTemplate.value,
      customerPhone: printForm.customerPhone,
      customerAddress: printForm.customerAddress,
      paymentReceived: Number(printForm.paymentReceived) || 0,
      overlay: Boolean(printSettings.lodop?.overlayMode),
    })
    const openPrintPreview = async () => {
      if (props.page !== 'stockOut') return
      if (!selected.value.length) {
        emit('notify', props.t('selectRowsToPrint'), 'error')
        return
      }
      await loadSlipSettings()
      printLoading.value = true
      const result = await printAPI.preview(buildPreviewParams())
      printLoading.value = false
      if (!result.ok) {
        emit('notify', result.error || props.t('printFailed'), 'error')
        return
      }
      printHtml.value = result.html
      printDialog.value = true
    }
    const refreshPrintPreview = async () => {
      if (!selected.value.length) return
      printLoading.value = true
      const result = await printAPI.preview(buildPreviewParams())
      printLoading.value = false
      if (result.ok) printHtml.value = result.html
    }
    const doPrint = async () => {
      if (!printHtml.value) return
      printLoading.value = true
      const result = await printAPI.execute(printHtml.value)
      printLoading.value = false
      emit('notify', result.ok ? props.t('printDone') : (result.error || props.t('printFailed')), result.ok ? undefined : 'error')
    }
    const savePdf = async () => {
      if (!printHtml.value) return
      printLoading.value = true
      const result = await printAPI.savePdf({
        html: printHtml.value,
        landscape: printTemplate.value === 'metal',
      })
      printLoading.value = false
      if (result.canceled) return
      emit('notify', result.ok ? props.t('pdfSaved') : (result.error || props.t('printFailed')), result.ok ? undefined : 'error')
    }
    const doLodopPrint = async () => {
      printLoading.value = true
      const result = await printAPI.lodopScript(buildPreviewParams())
      printLoading.value = false
      if (!result.ok) {
        emit('notify', result.error || props.t('printFailed'), 'error')
        return
      }
      const port = Number(printSettings.lodop?.servicePort) || 8000
      const run = await runLodopScript(result.lodopScript, port)
      emit('notify', run.ok ? props.t('lodopDone') : (run.error || props.t('lodopUnavailable')), run.ok ? undefined : 'error')
      if (run.ok) lodopAvailable.value = true
    }
    const openSlipSettings = async () => {
      await loadSlipSettings()
      printSettingsDialog.value = true
    }
    const saveSlipSettings = async () => {
      printSettings.template = printTemplate.value
      printSettings.sales.copyLabels = String(printSettings.sales.copyLabelsText || printSettings.sales.copyLabels.join('；'))
        .split(/[；;]/)
        .map((x: string) => x.trim())
        .filter(Boolean)
      await printAPI.saveSettings({ ...printSettings })
      printSettingsDialog.value = false
      emit('notify', props.t('settingsSaved'))
      if (printDialog.value) await refreshPrintPreview()
    }

    const toggleAll = (value: boolean) => selected.value = value ? Array.from(new Set([...selected.value, ...rows.value.map(r => r.id)])) : selected.value.filter(id => !rows.value.some(r => r.id === id))
    const isPageAllSelected = computed(() => rows.value.length > 0 && rows.value.every(r => selected.value.includes(r.id)))

    watch(() => props.page, () => { keyword.value = ''; selected.value = []; currentPage.value = 1; load() }, { immediate: true })
    watch(keyword, () => {
      selected.value = []
      if (currentPage.value !== 1) currentPage.value = 1
      else load()
    })
    watch([currentPage, filterValue], () => { selected.value = []; load() })

    return () => h('div', { class: 'page-wrap ledger-page' }, [
      h(PageHeader, { title: props.t(config.value.title), subtitle: props.t(`${config.value.title}Sub`) }, {
        actions: () => h('div', { class: 'header-toolbar' }, [
          config.value.filterField ? h(VSelect, { modelValue: filterValue.value, 'onUpdate:modelValue': (v: string) => { filterValue.value = v || ''; resetSelection() }, items: filterOptions.value, label: props.t(config.value.filterLabel), clearable: true, density: 'compact', hideDetails: true, class: 'toolbar-input header-toolbar-input' }) : null,
          h(VTextField, { modelValue: keyword.value, 'onUpdate:modelValue': (v: string) => { keyword.value = v; resetSelection() }, label: props.t(config.value.search), density: 'compact', hideDetails: true, class: 'toolbar-input header-toolbar-input' }),
          h(VBtn, { variant: 'tonal', size: 'small', loading: exporting.value, onClick: exportRows }, () => props.t('export')),
          props.page === 'stockOut'
            ? h(VBtn, {
              variant: 'tonal',
              size: 'small',
              disabled: !selected.value.length,
              loading: printLoading.value,
              onClick: openPrintPreview,
            }, () => props.t('printSlip'))
            : null,
          h(VBtn, { color: 'primary', size: 'small', onClick: openAdd }, () => props.t(props.page === 'cash' ? 'addRecord' : 'add')),
        ]),
      }),
      (() => {
        const stats = renderLedgerStats(props.page, summary.value, props.t)
        return stats.length ? h('div', { class: 'stat-grid' }, stats) : null
      })(),
      h(VCard, { class: 'data-card table-card' }, () => [
        h('div', { class: 'table-scroll' }, [
          h(VTable, { class: 'ledger-table', hover: true }, () => [
            h('thead', [h('tr', [h('th', { class: 'select-col' }, [h(VCheckboxBtn, { modelValue: isPageAllSelected.value, 'onUpdate:modelValue': toggleAll })]), ...displayColumns.value.map((c: string) => h('th', props.t(columnLabel(c)))), h('th', { class: 'sticky-action-col' }, props.t('action'))])]),
            h('tbody', loading.value ? [h('tr', [h('td', { colspan: displayColumns.value.length + 2, class: 'empty-cell' }, '加载中...')])] : rows.value.map(row => h('tr', { key: row.id }, [
              h('td', [h(VCheckboxBtn, { modelValue: selected.value.includes(row.id), 'onUpdate:modelValue': (v: boolean) => v ? selected.value = Array.from(new Set([...selected.value, row.id])) : selected.value = selected.value.filter(id => id !== row.id) })]),
              ...displayColumns.value.map((c: string) => c === 'attachments'
                ? h('td', [
                  row.attachment_count
                    ? h('button', { type: 'button', class: 'table-image-thumb', onClick: () => openAttachments(row), title: props.t('viewImages') }, [
                      row.attachment_thumb ? h('img', { src: row.attachment_thumb, alt: props.t('images') }) : h('span', props.t('images')),
                      h('b', row.attachment_count),
                    ])
                    : h('span', { class: 'muted tiny' }, props.t('noImages'))
                ])
                : h('td', { class: amountClass(c) }, formatCell(c, row[c]))),
              h('td', { class: 'action-cell sticky-action-col' }, [
                h(VBtn, { size: 'small', variant: 'text', color: 'primary', onClick: () => openEdit(row) }, () => props.t('edit')),
                h(VBtn, { size: 'small', variant: 'text', color: 'error', onClick: () => remove(row.id) }, () => props.t('delete')),
              ]),
            ]))),
          ]),
        ]),
        h('div', { class: 'table-footer' }, [
          h('span', `${props.t('total', { count: total.value })} · 每页 ${config.value.pageSize} 条`),
          h(VPagination, { modelValue: currentPage.value, 'onUpdate:modelValue': (v: number) => currentPage.value = v, length: Math.max(1, Math.ceil(total.value / config.value.pageSize)), density: 'comfortable', size: 'small', totalVisible: 7 }),
        ]),
      ]),
      RecordDialogShell({
        show: dialog.value,
        maxWidth: ledgerDialogWidths[props.page] || 720,
        title: editing.value ? props.t('edit') : (props.page === 'cash' ? props.t('addRecord') : props.t('add')),
        subtitle: editing.value ? props.t('formEditHint') : props.t('formAddHint'),
        cancelLabel: props.t('cancel'),
        saveLabel: props.t('save'),
        onClose: () => { dialog.value = false },
        onSave: save,
        default: () => [
          ...getFormSections(props.page, config.value.fields).map(section => h('div', { class: 'record-dialog__section', key: section.titleKey }, [
            h('div', { class: 'record-dialog__section-title' }, props.t(section.titleKey)),
            h('div', { class: 'record-dialog__grid' }, section.fields.map(field => renderRecordFormField(field, {
              form,
              config: config.value,
              filterOptions: filterOptions.value,
              t: props.t,
            }))),
          ])),
          h('div', { class: 'record-dialog__section' }, [
            h('div', { class: 'record-dialog__section-title' }, props.t('formSectionAttachments')),
            h('div', { class: 'form-image-section' }, [
              h('div', { class: 'form-image-section__head' }, [
                h('div', [
                  h('div', { class: 'muted tiny' }, editing.value ? '详情图片可直接预览，也可以继续补充上传。' : '新增记录时可先选图片，保存后自动压缩关联。'),
                ]),
                h(VBtn, { variant: 'tonal', size: 'small', loading: attachmentLoading.value, onClick: choosePendingAttachments }, () => props.t('chooseImage')),
              ]),
              attachments.value.length || pendingAttachments.value.length
                ? h('div', { class: 'image-preview-grid compact' }, [
                  ...attachments.value.map((item: any) => h('a', { key: `old-${item.id}`, class: 'image-preview-card', href: item.dataUrl, target: '_blank' }, [
                    h('img', { src: item.dataUrl, alt: item.fileName }),
                    h('span', item.fileName),
                  ])),
                  ...pendingAttachments.value.map((item: any, index: number) => h('a', { key: `pending-${index}`, class: 'image-preview-card pending', href: item.dataUrl, target: '_blank' }, [
                    h('img', { src: item.dataUrl, alt: item.fileName }),
                    h('span', item.fileName),
                  ])),
                ])
                : h('div', { class: 'empty-image-state' }, props.t('noImages')),
            ]),
          ]),
        ],
      }),
      RecordDialogShell({
        show: attachmentDialog.value,
        maxWidth: 860,
        title: `${props.t('images')} · ${attachmentRow.value?.description || attachmentRow.value?.product_name || ''}`,
        subtitle: props.t('formEditHint'),
        cancelLabel: props.t('cancel'),
        onClose: () => { attachmentDialog.value = false },
        footerExtra: h(VBtn, { color: 'primary', loading: attachmentLoading.value, onClick: addAttachment }, () => props.t('addImage')),
        default: () => [
          attachmentLoading.value
            ? h('div', { class: 'empty-cell' }, '加载中...')
            : attachments.value.length
              ? h('div', { class: 'image-preview-grid' }, attachments.value.map((item: any) => h('a', { key: item.id, class: 'image-preview-card', href: item.dataUrl, target: '_blank' }, [
                h('img', { src: item.dataUrl, alt: item.fileName }),
                h('span', item.fileName),
              ])))
              : h('div', { class: 'empty-image-state' }, props.t('noImages')),
        ],
      }),
      props.page === 'stockOut' ? h(VDialog, { modelValue: printDialog.value, 'onUpdate:modelValue': (v: boolean) => printDialog.value = v, maxWidth: 980, scrollable: true }, () => h(VCard, { class: 'pa-5 print-dialog-card' }, [
        h(VCardTitle, props.t('printPreview')),
        h(VCardText, [
          h('div', { class: 'print-form-row mb-4' }, [
            h(VSelect, {
              modelValue: printTemplate.value,
              'onUpdate:modelValue': async (v: 'sales' | 'metal') => {
                printTemplate.value = v
                await refreshPrintPreview()
              },
              items: [
                { title: props.t('templateSales'), value: 'sales' },
                { title: props.t('templateMetal'), value: 'metal' },
              ],
              label: props.t('printTemplate'),
              density: 'compact',
              hideDetails: true,
              class: 'print-form-field',
            }),
            h(VTextField, {
              modelValue: printForm.customerPhone,
              'onUpdate:modelValue': (v: string) => { printForm.customerPhone = v },
              label: props.t('customerPhone'),
              density: 'compact',
              hideDetails: true,
              class: 'print-form-field',
              onBlur: refreshPrintPreview,
            }),
            h(VTextField, {
              modelValue: printForm.customerAddress,
              'onUpdate:modelValue': (v: string) => { printForm.customerAddress = v },
              label: props.t('customerAddress'),
              density: 'compact',
              hideDetails: true,
              class: 'print-form-field',
              onBlur: refreshPrintPreview,
            }),
            h(VTextField, {
              modelValue: printForm.paymentReceived,
              'onUpdate:modelValue': (v: string) => { printForm.paymentReceived = v },
              label: props.t('paymentReceived'),
              type: 'number',
              density: 'compact',
              hideDetails: true,
              class: 'print-form-field',
              onBlur: refreshPrintPreview,
            }),
          ]),
          lodopAvailable.value === false
            ? h(VAlert, { type: 'warning', variant: 'tonal', density: 'compact', class: 'mb-3' }, () => props.t('lodopUnavailable'))
            : null,
          h('div', { class: ['print-preview-shell', printTemplate.value === 'metal' ? 'landscape' : ''].filter(Boolean).join(' ') }, [
            printHtml.value
              ? h('iframe', { class: 'print-preview-frame', srcdoc: printHtml.value, title: props.t('printPreview') })
              : h('div', { class: 'empty-cell' }, '加载中...'),
          ]),
        ]),
        h(VCardActions, [
          h(VBtn, { variant: 'text', onClick: openSlipSettings }, () => props.t('slipSettings')),
          h(VSpacer),
          h(VBtn, { variant: 'text', onClick: () => printDialog.value = false }, () => props.t('cancel')),
          h(VBtn, { variant: 'tonal', loading: printLoading.value, onClick: savePdf }, () => props.t('savePdf')),
          h(VBtn, { variant: 'tonal', loading: printLoading.value, onClick: doLodopPrint }, () => props.t('lodopPrint')),
          h(VBtn, { color: 'primary', loading: printLoading.value, onClick: doPrint }, () => props.t('printNow')),
        ]),
      ])) : null,
      props.page === 'stockOut' ? RecordDialogShell({
        show: printSettingsDialog.value,
        maxWidth: 760,
        title: props.t('slipSettings'),
        subtitle: props.t('formEditHint'),
        cancelLabel: props.t('cancel'),
        saveLabel: props.t('save'),
        onClose: () => { printSettingsDialog.value = false },
        onSave: saveSlipSettings,
        default: () => [
          h('div', { class: 'record-dialog__section' }, [
            h('div', { class: 'record-dialog__section-title' }, props.t('templateSales')),
            h('div', { class: 'record-dialog__grid' }, [
              h('div', { class: 'record-dialog__field record-dialog__field--full' }, [h(VTextField, { ...commonFormFieldProps(), modelValue: printSettings.sales.companyName, 'onUpdate:modelValue': (v: string) => { printSettings.sales.companyName = v }, label: '公司名称' })]),
              h('div', { class: 'record-dialog__field record-dialog__field--half' }, [h(VTextField, { ...commonFormFieldProps(), modelValue: printSettings.sales.slipTitle, 'onUpdate:modelValue': (v: string) => { printSettings.sales.slipTitle = v }, label: '单据标题' })]),
              h('div', { class: 'record-dialog__field record-dialog__field--full' }, [h(VTextarea, { ...commonFormFieldProps(), modelValue: printSettings.sales.footerNote, 'onUpdate:modelValue': (v: string) => { printSettings.sales.footerNote = v }, label: '页脚说明', rows: 2, autoGrow: true })]),
              h('div', { class: 'record-dialog__field record-dialog__field--full' }, [h(VTextField, {
                ...commonFormFieldProps(),
                modelValue: (printSettings.sales.copyLabels || []).join('；'),
                'onUpdate:modelValue': (v: string) => { printSettings.sales.copyLabels = v.split(/[；;]/).map((x: string) => x.trim()).filter(Boolean) },
                label: '联次说明（用分号分隔）',
              })]),
            ]),
          ]),
          h('div', { class: 'record-dialog__section' }, [
            h('div', { class: 'record-dialog__section-title' }, props.t('templateMetal')),
            h('div', { class: 'record-dialog__grid' }, [
              h('div', { class: 'record-dialog__field record-dialog__field--full' }, [h(VTextField, { ...commonFormFieldProps(), modelValue: printSettings.metal.companyName, 'onUpdate:modelValue': (v: string) => { printSettings.metal.companyName = v }, label: '公司名称' })]),
              h('div', { class: 'record-dialog__field record-dialog__field--half' }, [h(VTextField, { ...commonFormFieldProps(), modelValue: printSettings.metal.slipTitle, 'onUpdate:modelValue': (v: string) => { printSettings.metal.slipTitle = v }, label: '副标题' })]),
              h('div', { class: 'record-dialog__field record-dialog__field--half' }, [h(VTextField, { ...commonFormFieldProps(), modelValue: printSettings.metal.auditor, 'onUpdate:modelValue': (v: string) => { printSettings.metal.auditor = v }, label: props.t('auditor') })]),
              h('div', { class: 'record-dialog__field record-dialog__field--full' }, [h(VTextField, { ...commonFormFieldProps(), modelValue: printSettings.metal.pickNote, 'onUpdate:modelValue': (v: string) => { printSettings.metal.pickNote = v }, label: props.t('pickNote') })]),
            ]),
          ]),
          h('div', { class: 'record-dialog__section' }, [
            h('div', { class: 'record-dialog__section-title' }, '公共信息'),
            h('div', { class: 'record-dialog__grid' }, [
              h('div', { class: 'record-dialog__field record-dialog__field--full' }, [h(VTextField, { ...commonFormFieldProps(), modelValue: printSettings.sales.address, 'onUpdate:modelValue': (v: string) => { printSettings.sales.address = v; printSettings.metal.address = v }, label: '联系地址' })]),
              h('div', { class: 'record-dialog__field record-dialog__field--full' }, [h(VTextField, { ...commonFormFieldProps(), modelValue: printSettings.sales.phones, 'onUpdate:modelValue': (v: string) => { printSettings.sales.phones = v; printSettings.metal.phones = v }, label: '联系电话' })]),
            ]),
          ]),
          h('div', { class: 'record-dialog__section' }, [
            h('div', { class: 'record-dialog__section-title' }, props.t('lodopSettings')),
            h('p', { class: 'muted tiny mb-3' }, '金属单默认 241×140mm 横版；竖版销售单 210×140mm。偏移可在试打后微调。'),
            h('div', { class: 'record-dialog__grid' }, [
              h('div', { class: 'record-dialog__field record-dialog__field--half' }, [h(VTextField, { ...commonFormFieldProps(), modelValue: printSettings.lodop.offsetXMm, 'onUpdate:modelValue': (v: string) => { printSettings.lodop.offsetXMm = Number(v) || 0 }, label: props.t('offsetX'), type: 'number' })]),
              h('div', { class: 'record-dialog__field record-dialog__field--half' }, [h(VTextField, { ...commonFormFieldProps(), modelValue: printSettings.lodop.offsetYMm, 'onUpdate:modelValue': (v: string) => { printSettings.lodop.offsetYMm = Number(v) || 0 }, label: props.t('offsetY'), type: 'number' })]),
              h('div', { class: 'record-dialog__field record-dialog__field--half' }, [h(VTextField, { ...commonFormFieldProps(), modelValue: printSettings.lodop.servicePort, 'onUpdate:modelValue': (v: string) => { printSettings.lodop.servicePort = Number(v) || 8000 }, label: 'C-Lodop 端口', type: 'number' })]),
              h('div', { class: 'record-dialog__field record-dialog__field--half' }, [h(VSelect, { ...commonFormFieldProps(), modelValue: printSettings.lodop.overlayMode, 'onUpdate:modelValue': (v: boolean) => { printSettings.lodop.overlayMode = v }, items: [{ title: '是', value: true }, { title: '否', value: false }], label: props.t('overlayMode') })]),
              h('div', { class: 'record-dialog__field record-dialog__field--half' }, [h(VSelect, { ...commonFormFieldProps(), modelValue: printSettings.lodop.usePreview, 'onUpdate:modelValue': (v: boolean) => { printSettings.lodop.usePreview = v }, items: [{ title: '是', value: true }, { title: '否', value: false }], label: props.t('lodopPreview') })]),
            ]),
          ]),
        ],
      }) : null,
    ])
  },
})

function renderLedgerStats(pageKey: string, summary: any, tFn: any) {
  if (pageKey === 'cash') return [h(StatCard, { title: tFn('totalIncome'), value: summary.totalIncome || 0, color: 'success' }), h(StatCard, { title: tFn('totalExpense'), value: summary.totalExpense || 0, color: 'error' }), h(StatCard, { title: tFn('currentSurplus'), value: summary.lastBalance || 0, color: 'primary' })]
  if (pageKey === 'customer') return []
  if (pageKey === 'stockIn' || pageKey === 'stockOut') return [
    h(StatCard, { title: tFn('totalRecords'), value: summary.totalRecords || 0, color: 'primary' }),
    h(StatCard, { title: tFn('totalQuantity'), value: summary.totalQuantity || 0, color: 'success' }),
    h(StatCard, { title: tFn('totalAmount'), value: summary.totalAmount || 0, color: 'warning' }),
  ]
  return [h(StatCard, { title: tFn('totalIn'), value: summary.totalIn || 0, color: 'success' }), h(StatCard, { title: tFn('totalOut'), value: summary.totalOut || 0, color: 'error' }), h(StatCard, { title: tFn('netAmount'), value: (summary.totalIn || 0) - (summary.totalOut || 0), color: 'primary' })]
}

function columnLabel(col: string) {
  return ({
    amount_in: 'amountIn', amount_out: 'amountOut', customer_name: 'customerName', supplier_name: 'supplierName',
    contract_no: 'contractNo', product_name: 'productName', unit_price: 'unitPrice',
    tax_rate: 'taxRate', tax_amount: 'taxAmount', invoice_amount: 'invoiceAmount',
    month_label: 'date', attachments: 'images',
  } as any)[col] || col
}
function numericField(field: string) { return ['income', 'expense', 'amount_in', 'amount_out', 'balance', 'quantity', 'unit_price', 'amount', 'tax_rate', 'tax_amount', 'invoice_amount'].includes(field) }
function amountClass(col: string) { return numericField(col) ? 'amount-cell' : '' }
function formatCell(col: string, value: any) { return numericField(col) ? (Number(value || 0) ? money(value) : '—') : (value || '') }

function commonFormFieldProps() {
  return { variant: 'outlined' as const, density: 'comfortable' as const, hideDetails: 'auto' as const, color: 'primary' as const }
}

function normalizeFormField(field: FormFieldSpec) {
  return typeof field === 'string' ? { key: field, span: (field === 'note' || field === 'description') ? 'full' as const : 'half' as const } : { key: field.key, span: field.span || ((field.key === 'note' || field.key === 'description') ? 'full' as const : 'half' as const) }
}

function getFormSections(pageKey: string, fields: string[]): FormSectionSpec[] {
  if (formSections[pageKey]) return formSections[pageKey]
  return [{ titleKey: 'formSectionBasic', fields: fields.map(key => ({ key, span: (key === 'note' || key === 'description') ? 'full' : 'half' })) }]
}

function renderRecordFormField(
  field: FormFieldSpec,
  ctx: { form: any; config: any; filterOptions: string[]; t: (key: string, params?: any) => string },
) {
  const { key, span } = normalizeFormField(field)
  const { form, config, filterOptions, t } = ctx
  const wrapClass = `record-dialog__field record-dialog__field--${span === 'full' ? 'full' : 'half'}`
  const base = commonFormFieldProps()

  if (config.filterKey && key === config.filterKey) {
    return h('div', { class: wrapClass, key }, [
      h(VCombobox, {
        ...base,
        modelValue: form[key],
        'onUpdate:modelValue': (v: any) => { form[key] = v },
        items: filterOptions,
        label: t(columnLabel(key)),
        placeholder: t(key === 'supplier_name' ? 'typeSupplierName' : 'typeCustomerName'),
        clearable: true,
        hideNoData: true,
      }),
    ])
  }

  if (key === 'note' || key === 'description') {
    return h('div', { class: 'record-dialog__field record-dialog__field--full', key }, [
      h(VTextarea, {
        ...base,
        modelValue: form[key],
        'onUpdate:modelValue': (v: any) => { form[key] = v },
        label: t(columnLabel(key)),
        rows: key === 'note' ? 3 : 2,
        autoGrow: true,
      }),
    ])
  }

  return h('div', { class: wrapClass, key }, [
    h(VTextField, {
      ...base,
      modelValue: form[key],
      'onUpdate:modelValue': (v: any) => { form[key] = v },
      label: t(columnLabel(key)),
      type: numericField(key) ? 'number' : 'text',
      placeholder: key === 'date' ? '2026.03.15' : undefined,
      ...(numericField(key) ? { step: 'any' } : {}),
    }),
  ])
}

function RecordDialogShell(props: {
  show: boolean
  maxWidth?: number
  title: string
  subtitle?: string
  onClose: () => void
  onSave?: () => void
  saveLabel?: string
  cancelLabel: string
  footerExtra?: any
  default?: () => any
}) {
  return h(VDialog, {
    modelValue: props.show,
    'onUpdate:modelValue': (v: boolean) => { if (!v) props.onClose() },
    maxWidth: props.maxWidth || 720,
    scrollable: true,
  }, () => h(VCard, { class: 'record-dialog' }, [
    h('div', { class: 'record-dialog__header' }, [
      h('div', [
        h('h2', { class: 'record-dialog__title' }, props.title),
        props.subtitle ? h('p', { class: 'record-dialog__subtitle' }, props.subtitle) : null,
      ]),
    ]),
    h(VCardText, { class: 'record-dialog__body' }, props.default?.()),
    h('div', { class: 'record-dialog__footer' }, [
      props.footerExtra || null,
      h(VSpacer),
      h(VBtn, { variant: 'text', onClick: props.onClose }, () => props.cancelLabel),
      props.onSave ? h(VBtn, { color: 'primary', onClick: props.onSave }, () => props.saveLabel || '') : null,
    ]),
  ]))
}

function formatBackupSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(size / 1024))} KB`
}

function formatBackupTime(name: string, time?: string) {
  const match = name.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})/)
  if (match) {
    const [, y, m, d, h, min] = match
    return `${y}年${Number(m)}月${Number(d)}日 ${h}:${min}`
  }
  if (time) {
    const dt = new Date(time)
    if (!Number.isNaN(dt.getTime())) {
      const y = dt.getFullYear()
      const m = dt.getMonth() + 1
      const d = dt.getDate()
      const h = String(dt.getHours()).padStart(2, '0')
      const min = String(dt.getMinutes()).padStart(2, '0')
      return `${y}年${m}月${d}日 ${h}:${min}`
    }
  }
  return name
}

const ImportPage = defineComponent({
  props: { t: { type: Function, required: true } },
  emits: ['notify'],
  setup(props, { emit }) {
    const loading = ref(false)
    const stockLoading = ref(false)
    const restoring = ref(false)
    const exporting = ref(false)
    const legacyOpen = ref(false)
    const result = ref<any>(null)
    const stockResult = ref<any>(null)
    const error = ref('')
    const stockError = ref('')
    const backups = ref<any[]>([])
    const loadInfo = async () => { backups.value = await systemAPI.backupsList() }
    const importExcel = async () => { const file = await importAPI.pickFile(); if (!file) return; loading.value = true; error.value = ''; result.value = null; const r = await importAPI.excel(file); loading.value = false; if (r.ok) { result.value = r.imported; emit('notify', props.t('importDone')) } else { error.value = r.error || props.t('importFailed'); emit('notify', props.t('importFailed'), 'error') } }
    const importStockIn = async () => { const file = await importAPI.pickFile(); if (!file) return; stockLoading.value = true; stockError.value = ''; stockResult.value = null; const r = await importAPI.stockIn(file); stockLoading.value = false; if (r.ok) { stockResult.value = r.imported; emit('notify', props.t('importStockInDone')) } else { stockError.value = r.error || props.t('importFailed'); emit('notify', props.t('importFailed'), 'error') } }
    const restoreFromFolder = async () => {
      const folder = await systemAPI.pickBackup()
      if (!folder) return
      restoring.value = true
      try {
        const r = await systemAPI.restoreBackup(folder)
        if (r?.ok) emit('notify', props.t('restoreDone'))
        else if (!r?.canceled) emit('notify', r?.error || props.t('restoreFailed'), 'error')
      } finally {
        restoring.value = false
      }
    }
    const restoreByName = async (name: string) => {
      restoring.value = true
      try {
        const r = await systemAPI.restoreBackupByName(name)
        if (r?.ok) emit('notify', props.t('restoreDone'))
        else if (!r?.canceled) emit('notify', r?.error || props.t('restoreFailed'), 'error')
      } finally {
        restoring.value = false
      }
    }
    const backup = async () => {
      const result = await systemAPI.backup()
      await loadInfo()
      if (result?.ok) emit('notify', props.t('backupDone'))
      else emit('notify', result?.error || props.t('backupFailed'), 'error')
    }
    const exportAll = async () => {
      exporting.value = true
      try {
        const result = await systemAPI.exportExcel({ table: 'all' })
        notifyExportResult(emit, props.t, result)
      } catch (error: any) {
        emit('notify', error?.message || props.t('exportFailed'), 'error')
      } finally {
        exporting.value = false
      }
    }
    const openBackupFolder = (event: Event) => {
      event.preventDefault()
      systemAPI.openBackupDir()
    }
    onMounted(loadInfo)
    return () => h('div', { class: 'page-wrap narrow data-mgmt-page' }, [
      h(PageHeader, { title: props.t('dataMgmtTitle'), subtitle: props.t('dataMgmtSub') }),

      h('section', { class: 'data-section' }, [
        h('h3', { class: 'data-section-title' }, props.t('restoreSection')),
        h(VCard, { class: 'content-card data-action-card data-action-card-wide' }, () => [
          h('div', { class: 'data-action-row' }, [
            h('div', { class: 'data-action-main' }, [
              h('div', { class: 'data-action-icon' }, '📥'),
              h('div', [
                h('h4', { class: 'data-action-title' }, props.t('restoreTitle')),
                h('p', { class: 'data-action-copy' }, props.t('restoreDesc')),
              ]),
            ]),
            h(VBtn, { color: 'primary', size: 'large', loading: restoring.value, onClick: restoreFromFolder }, () => props.t('pickBackupFolder')),
          ]),
          h('div', { class: 'backup-history' }, [
            h('div', { class: 'backup-history-title' }, props.t('recentBackups')),
            backups.value.length
              ? backups.value.slice(0, 5).map(b => h('div', { class: 'backup-history-item', key: b.name }, [
                h('span', { class: 'backup-history-time' }, formatBackupTime(b.name, b.time)),
                h('div', { class: 'backup-history-actions' }, [
                  h('span', { class: 'backup-history-meta' }, formatBackupSize(b.size)),
                  h(VBtn, { size: 'small', variant: 'text', color: 'primary', disabled: restoring.value, onClick: () => restoreByName(b.name) }, () => props.t('restoreThisBackup')),
                ]),
              ]))
              : h('div', { class: 'backup-history-empty' }, props.t('noBackupsYet')),
            h('a', { class: 'backup-folder-link', href: '#', onClick: openBackupFolder }, props.t('openBackupFolder')),
          ]),
        ]),
      ]),

      h('section', { class: 'data-section' }, [
        h('h3', { class: 'data-section-title' }, props.t('backupSection')),
        h(VCard, { class: 'content-card data-action-card data-action-card-wide' }, () => [
          h('div', { class: 'data-action-row' }, [
            h('div', { class: 'data-action-main' }, [
              h('div', { class: 'data-action-icon' }, '💾'),
              h('div', [
                h('h4', { class: 'data-action-title' }, props.t('backupTitle')),
                h('p', { class: 'data-action-copy' }, props.t('backupDesc')),
              ]),
            ]),
            h(VBtn, { color: 'primary', size: 'large', onClick: backup }, () => props.t('backupNow')),
          ]),
        ]),
      ]),

      h('section', { class: 'data-section' }, [
        h('h3', { class: 'data-section-title' }, props.t('exportSection')),
        h(VCard, { class: 'content-card data-action-card data-action-card-wide' }, () => [
          h('div', { class: 'data-action-row' }, [
            h('div', { class: 'data-action-main' }, [
              h('div', { class: 'data-action-icon' }, '📊'),
              h('div', [
                h('h4', { class: 'data-action-title' }, props.t('exportTitle')),
                h('p', { class: 'data-action-copy' }, props.t('exportDesc')),
              ]),
            ]),
            h(VBtn, { loading: exporting.value, onClick: exportAll }, () => props.t('exportAllExcel')),
          ]),
        ]),
      ]),

      h('section', { class: 'data-section data-section-legacy' }, [
        h('button', {
          type: 'button',
          class: 'legacy-toggle',
          onClick: () => { legacyOpen.value = !legacyOpen.value },
        }, [
          h('span', props.t('legacySection')),
          h('span', { class: 'legacy-toggle-icon' }, legacyOpen.value ? '▾' : '▸'),
        ]),
        legacyOpen.value ? h('div', { class: 'legacy-panel' }, [
          h('p', { class: 'legacy-hint' }, props.t('legacyHint')),
          h('div', { class: 'data-action-grid' }, [
            h(VCard, { class: 'content-card data-action-card data-action-card-compact' }, () => [
              h('h4', { class: 'data-action-title' }, props.t('importLedgerTitle')),
              h('p', { class: 'data-action-copy' }, props.t('importLedgerDesc')),
              h(VBtn, { variant: 'outlined', loading: loading.value, onClick: importExcel }, () => props.t('pickExcel')),
            ]),
            h(VCard, { class: 'content-card data-action-card data-action-card-compact' }, () => [
              h('h4', { class: 'data-action-title' }, props.t('importStockTitle')),
              h('p', { class: 'data-action-copy' }, props.t('importStockDesc')),
              h(VBtn, { variant: 'outlined', loading: stockLoading.value, onClick: importStockIn }, () => props.t('importStockIn')),
            ]),
          ]),
          error.value ? h(VAlert, { type: 'error', class: 'mt-4' }, () => error.value) : null,
          result.value ? h(VAlert, { type: 'success', class: 'mt-4' }, () => [
            h('div', { class: 'import-result-title' }, props.t('importDone')),
            h('div', props.t('importSummary', result.value)),
          ]) : null,
          stockError.value ? h(VAlert, { type: 'error', class: 'mt-4' }, () => stockError.value) : null,
          stockResult.value ? h(VAlert, { type: 'success', class: 'mt-4' }, () => [
            h('div', { class: 'import-result-title' }, props.t('importStockInDone')),
            h('div', props.t('importStockInSummary', stockResult.value)),
          ]) : null,
        ]) : null,
      ]),
    ])
  },
})

const TrashPage = defineComponent({
  props: { t: { type: Function, required: true } },
  emits: ['notify'],
  setup(props, { emit }) {
    const data = ref<any>({})
    const tab = ref('cash_ledger')
    const load = async () => data.value = await systemAPI.trashAll()
    const restore = async (table: string, id: number) => { const apis: any = { cash_ledger: cashAPI, bank_ledger: bankAPI, acceptance_bills: billsAPI, customer_ledger: customerAPI, stock_in_ledger: stockInAPI, stock_out_ledger: stockOutAPI }; await apis[table]?.restore(id); emit('notify', props.t('restored')); load() }
    onMounted(load)
    const tabs = [{ key: 'cash_ledger', label: 'cash' }, { key: 'bank_ledger', label: 'bank' }, { key: 'acceptance_bills', label: 'bills' }, { key: 'customer_ledger', label: 'customer' }, { key: 'stock_in_ledger', label: 'stockIn' }, { key: 'stock_out_ledger', label: 'stockOut' }]
    return () => h('div', { class: 'page-wrap' }, [
      h(PageHeader, { title: props.t('trash') }),
      h(VTabs, { modelValue: tab.value, 'onUpdate:modelValue': (v: string) => tab.value = v }, () => tabs.map(x => h(VTab, { value: x.key }, () => `${props.t(x.label)} (${(data.value[x.key] || []).length})`))),
      h(VCard, { class: 'data-card table-card utility-table-card' }, () => h('div', { class: 'table-scroll' }, [
        h(VTable, { class: 'ledger-table', hover: true }, () => [
          h('thead', [h('tr', [
            h('th', props.t('date')),
            h('th', props.t('description')),
            h('th', props.t('deletedAt')),
            h('th', { class: 'sticky-action-col' }, props.t('action')),
          ])]),
          h('tbody', (data.value[tab.value] || []).map((row: any) => h('tr', [h('td', row.date), h('td', row.description || row.customer_name || row.product_name || row.supplier_name), h('td', row.deleted_at), h('td', { class: 'action-cell sticky-action-col' }, [h(VBtn, { size: 'small', variant: 'text', color: 'primary', onClick: () => restore(tab.value, row.id) }, () => props.t('restore'))])]))),
        ]),
      ])),
    ])
  },
})

const LogsPage = defineComponent({
  props: { t: { type: Function, required: true } },
  setup(props) {
    const rows = ref<any[]>([])
    const total = ref(0)
    const currentPage = ref(1)
    const pageSize = 20
    const load = async () => { const r = await systemAPI.logs({ page: currentPage.value, pageSize }); rows.value = r.rows; total.value = r.total }
    watch(currentPage, load, { immediate: true })
    return () => h('div', { class: 'page-wrap' }, [
      h(PageHeader, { title: props.t('logsTitle'), subtitle: props.t('logsPageSub') }),
      h(VCard, { class: 'data-card table-card utility-table-card' }, () => [
        h('div', { class: 'table-scroll' }, [
          h(VTable, { class: 'ledger-table', hover: true }, () => [
            h('thead', [h('tr', [props.t('time'), props.t('actionType'), props.t('module'), 'ID', props.t('operator')].map(x => h('th', x)))]),
            h('tbody', rows.value.map(row => h('tr', [h('td', row.created_at), h('td', row.action), h('td', row.table_name), h('td', row.record_id), h('td', row.operator)]))),
          ]),
        ]),
        h('div', { class: 'table-footer' }, [h('span', `${props.t('total', { count: total.value })} · 每页 ${pageSize} 条`), h(VPagination, { modelValue: currentPage.value, 'onUpdate:modelValue': (v: number) => currentPage.value = v, length: Math.max(1, Math.ceil(total.value / pageSize)), density: 'comfortable', size: 'small', totalVisible: 7 })]),
      ]),
    ])
  },
})

const AiAssistant = defineComponent({
  props: { compact: Boolean },
  emits: ['notify'],
  setup(props, { emit }) {
    const configured = ref<boolean | null>(null)
    const keyTail = ref('')
    const model = ref('deepseek-ai/DeepSeek-R1')
    const input = ref('')
    const loading = ref(false)
    const modelOptions = [
      'deepseek-ai/DeepSeek-R1',
      'deepseek-ai/DeepSeek-V3',
      'Qwen/Qwen2.5-7B-Instruct',
      'Qwen/Qwen2.5-14B-Instruct',
      'Qwen/Qwen3-32B',
    ]
    const messages = ref<any[]>([{ role: 'assistant', content: '你好，我是 AI 助手。你可以问我账务分析、Excel 导入、对账思路或经营数据解读。' }])

    onMounted(async () => {
      try {
        const status = await aiAPI.status()
        configured.value = Boolean(status?.ok)
        keyTail.value = status?.keyTail || ''
        if (status?.model) model.value = status.model
      } catch {
        configured.value = false
      }
    })

    const send = async () => {
      const text = input.value.trim()
      if (!text || loading.value) return

      const next = [...messages.value, { role: 'user', content: text }]
      messages.value = next
      input.value = ''
      loading.value = true

      try {
        const result = await aiAPI.chat({
          model: model.value,
          messages: [
            { role: 'system', content: '你是东昊账务系统里的 AI 助手。请用简洁中文回答。' },
            ...next,
          ],
        })

        if (!result?.ok) {
          const errorText = result?.error || 'AI 请求失败'
          emit('notify', errorText, 'error')
          messages.value = [...next, { role: 'assistant', content: errorText }]
          return
        }

        messages.value = [...next, { role: 'assistant', content: result.content }]
      } catch (error: any) {
        const errorText = error?.message || 'AI 请求异常，请重启应用后再试。'
        emit('notify', errorText, 'error')
        messages.value = [...next, { role: 'assistant', content: errorText }]
      } finally {
        loading.value = false
      }
    }

    const handleEnter = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        send()
      }
    }

    return () => h('div', { class: props.compact ? 'ai-panel compact' : 'page-wrap ai-panel' }, [
      !props.compact ? h(PageHeader, { title: 'AI 助手', subtitle: 'SiliconFlow 账务问答和经营分析' }) : null,
      configured.value === false ? h(VAlert, { type: 'warning', class: 'mb-3' }, () => '还没有配置 SiliconFlow Key，请在 .env.local 中设置 SILICONFLOW_API_KEY') : null,
      h(VCard, { class: 'content-card ai-settings-card mb-3' }, () => [
        h('div', { class: 'section-eyebrow' }, 'Model'),
        h('div', { class: 'ai-model-meta' }, keyTail.value ? `Key 后 4 位：${keyTail.value}` : '按文档默认使用 DeepSeek-R1'),
        h(VSelect, {
          modelValue: model.value,
          'onUpdate:modelValue': (v: string) => model.value = v,
          items: modelOptions,
          label: '模型',
        }),
      ]),
      h(VCard, { class: 'chat-card' }, () => h('div', { class: 'chat-messages' }, [
        ...messages.value.map((m, i) => h('div', { key: i, class: ['chat-bubble', m.role] }, m.content)),
        loading.value ? h('div', { class: 'chat-loading' }, 'AI 正在思考...') : null,
      ])),
      h('div', { class: 'chat-input' }, [
        h(VTextarea, {
          modelValue: input.value,
          'onUpdate:modelValue': (v: string) => input.value = v,
          rows: 2,
          label: '输入问题',
          placeholder: '回车发送，Shift+回车换行',
          disabled: loading.value,
          onKeydown: handleEnter,
        }),
        h(VBtn, { color: 'primary', loading: loading.value, disabled: !input.value.trim(), onClick: send }, () => '发送'),
      ]),
    ])
  },
})
</script>
