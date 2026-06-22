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
            <div v-if="appVersion" class="app-version">v{{ appVersion }}</div>
          </div>
        </div>

        <v-alert v-if="loginError" type="error" variant="tonal" density="compact" :icon="false" class="login-alert mb-4">{{ loginError }}</v-alert>
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
            <div v-if="appVersion" class="app-version">v{{ appVersion }}</div>
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
        <div class="nav-drawer-footer" aria-hidden="true" />
      </aside>

      <main class="content-shell">
        <DashboardPage v-if="page === 'dashboard'" :t="t" />
        <ProductCatalogPage v-else-if="page === 'products'" :t="t" />
        <InventoryPage v-else-if="page === 'inventory'" :t="t" />
        <LedgerPage v-else-if="isLedgerPage" :page="page" :t="t" @notify="notify" />
        <template v-else-if="page === 'import'">
          <KeepAlive>
            <ImportPage :t="t" @notify="notify" />
          </KeepAlive>
        </template>
        <TrashPage v-else-if="page === 'trash'" :t="t" @notify="notify" />
        <LogsPage v-else-if="page === 'logs'" :t="t" />
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
          <v-btn icon size="small" variant="tonal" :title="t('helpTitle')" @click="helpDialog = true">?</v-btn>
          <v-btn icon size="small" variant="tonal" :title="t('changePassword')" @click="passwordDialog = true">🔒</v-btn>
        </div>
        <v-btn class="logout-compact" color="error" variant="tonal" size="small" :title="t('logout')" @click="handleLogout">
          <svg class="logout-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path fill="currentColor" d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.59L17 17l5-5-5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
          </svg>
        </v-btn>
      </v-card>
      <div class="ai-float" :class="{ open: aiFloatingOpen }">
        <v-btn class="ai-float-button" color="primary" :aria-expanded="aiFloatingOpen" @click="aiFloatingOpen = !aiFloatingOpen">
          <span class="ai-core">AI</span>
          <span>{{ aiFloatingOpen ? t('close') : t('ai') }}</span>
        </v-btn>
        <v-card v-show="aiFloatingOpen" class="ai-floating-card">
          <div class="ai-floating-header">
            <div>
              <div class="ai-floating-eyebrow">SiliconFlow</div>
              <div class="ai-floating-title">{{ t('ai') }}</div>
              <div class="ai-floating-subtitle">{{ t('aiSub') }}</div>
            </div>
            <v-btn icon size="small" variant="text" :title="t('close')" @click="aiFloatingOpen = false">×</v-btn>
          </div>
          <AiAssistant compact @notify="notify" />
        </v-card>
      </div>
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

    <v-dialog v-model="helpDialog" max-width="780" scrollable>
      <v-card class="record-dialog help-dialog">
        <div class="record-dialog__header">
          <div>
            <div class="record-dialog__eyebrow">Hello</div>
            <h2 class="record-dialog__title">{{ t('helpTitle') }}</h2>
            <p class="record-dialog__subtitle">{{ t('helpSubtitle') }}</p>
          </div>
        </div>
        <v-card-text class="record-dialog__body">
          <div class="help-grid">
            <section class="help-section">
              <h3>{{ t('helpProjectTitle') }}</h3>
              <p>{{ t('helpProjectDesc') }}</p>
            </section>
            <section class="help-section">
              <h3>{{ t('helpBusinessTitle') }}</h3>
              <ul>
                <li>{{ t('helpBusinessFinance') }}</li>
                <li>{{ t('helpBusinessStock') }}</li>
                <li>{{ t('helpBusinessData') }}</li>
              </ul>
            </section>
            <section class="help-section">
              <h3>{{ t('helpTutorialTitle') }}</h3>
              <ol>
                <li>{{ t('helpTutorialStep1') }}</li>
                <li>{{ t('helpTutorialStep2') }}</li>
                <li>{{ t('helpTutorialStep3') }}</li>
                <li>{{ t('helpTutorialStep4') }}</li>
              </ol>
            </section>
            <section class="help-section">
              <h3>{{ t('helpTipsTitle') }}</h3>
              <ul>
                <li>{{ t('helpTipBackup') }}</li>
                <li>{{ t('helpTipDate') }}</li>
                <li>{{ t('helpTipExport') }}</li>
              </ul>
            </section>
            <section class="help-section help-section--contact">
              <h3>{{ t('helpAuthorTitle') }}</h3>
              <p>{{ t('helpAuthorName') }}</p>
              <p>{{ t('helpAuthorEmail') }}</p>
            </section>
          </div>
        </v-card-text>
        <div class="record-dialog__footer">
          <v-btn variant="text" @click="runUpdateCheck">{{ t('checkUpdate') }}</v-btn>
          <v-spacer />
          <v-btn color="primary" @click="helpDialog = false">{{ t('close') }}</v-btn>
        </div>
      </v-card>
    </v-dialog>

    <v-dialog v-model="confirmDialog.show" max-width="480" persistent>
      <v-card class="record-dialog confirm-dialog">
        <div class="record-dialog__header">
          <div>
            <h2 class="record-dialog__title">{{ confirmDialog.title }}</h2>
            <p class="record-dialog__subtitle confirm-dialog__message">{{ confirmDialog.message }}</p>
          </div>
        </div>
        <div class="record-dialog__footer">
          <v-btn variant="text" @click="resolveConfirm(false)">{{ confirmDialog.cancelLabel }}</v-btn>
          <v-btn :color="confirmDialog.confirmColor" @click="resolveConfirm(true)">{{ confirmDialog.confirmLabel }}</v-btn>
        </div>
      </v-card>
    </v-dialog>

    <v-dialog v-model="updateDialog" max-width="520" persistent>
      <v-card class="record-dialog">
        <div class="record-dialog__header">
          <div>
            <h2 class="record-dialog__title">{{ t('updateTitle') }}</h2>
            <p class="record-dialog__subtitle">{{ updateDialogSubtitle }}</p>
          </div>
        </div>
        <v-card-text class="record-dialog__body">
          <v-alert v-if="updateState.status === 'error'" type="error" variant="tonal" density="compact">{{ updateState.error }}</v-alert>
          <v-alert v-else-if="updateState.status === 'not-available'" type="success" variant="tonal" density="compact">
            {{ t('updateLatest', { version: updateState.currentVersion || appVersion }) }}
          </v-alert>
          <div v-else-if="updateState.status === 'available' || updateState.status === 'downloaded'">
            <p>{{ t('updateFound', { current: updateState.currentVersion || appVersion, latest: updateState.version }) }}</p>
            <div v-if="updateState.releaseNotes" class="update-release-notes" v-html="updateState.releaseNotes" />
          </div>
          <div v-else-if="updateState.status === 'downloading'">
            <v-progress-linear :model-value="updateState.percent || 0" color="primary" height="8" rounded />
            <p class="muted tiny mt-2">{{ t('updateDownloading', { percent: Math.round(updateState.percent || 0) }) }}</p>
          </div>
          <p v-else-if="updateState.status === 'checking'" class="muted">{{ t('updateChecking') }}</p>
        </v-card-text>
        <div class="record-dialog__footer">
          <v-btn variant="text" @click="updateDialog = false">{{ t('cancel') }}</v-btn>
          <v-btn v-if="updateState.status === 'available'" color="primary" :loading="updateBusy" @click="downloadUpdatePackage">{{ t('updateDownload') }}</v-btn>
          <v-btn v-else-if="updateState.status === 'downloaded'" color="primary" @click="installUpdateNow">{{ t('updateInstall') }}</v-btn>
          <v-btn v-else-if="updateState.status === 'error' || updateState.status === 'not-available'" color="primary" :loading="updateBusy" @click="runUpdateCheck">{{ t('updateRetry') }}</v-btn>
        </div>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="2600">{{ snackbar.text }}</v-snackbar>
  </v-app>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, nextTick, onActivated, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { buildCustomerDescription, isCustomerPaymentDescription, parseCustomerDescription } from '../../common/customer-ledger'
import { parseLedgerDate } from '../../common/ledger-date'
import {
  VAlert,
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCardTitle,
  VDialog,
  VList,
  VListItem,
  VListItemSubtitle,
  VListItemTitle,
  VPagination,
  VCombobox,
  VProgressLinear,
  VSelect,
  VSpacer,
  VTab,
  VTable,
  VTabs,
  VTextarea,
  VTextField,
} from 'vuetify/components'
import { authAPI, bankAPI, billsAPI, cashAPI, customerAPI, stockInAPI, stockOutAPI, inventoryAPI, productAPI, importAPI, systemAPI, aiAPI, attachmentAPI, printAPI, updateAPI, cloudAPI } from './api'
import { runLodopScript, checkLodopAvailable } from './lodop-print'

type PageKey = 'dashboard' | 'cash' | 'bank' | 'bills' | 'customer' | 'stockIn' | 'stockOut' | 'products' | 'inventory' | 'trash' | 'logs' | 'import'
type ThemeMode = 'dark' | 'light'
type Lang = 'zh' | 'en'
type EChartsModule = typeof import('echarts')

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
    confirm: '确定',
    confirmTitle: '请确认',
    confirmDeleteTitle: '移入回收站',
    confirmDeleteMessage: '确定要将这条记录移入回收站吗？可在回收站中恢复。',
    confirmRestoreTitle: '恢复记录',
    confirmRestoreMessage: '确定要恢复这条记录吗？',
    confirmBackupRestoreTitle: '恢复备份',
    confirmBackupRestoreMessage: '将用备份覆盖当前全部账本数据，此操作不可撤销。建议先备份当前数据，是否继续？',
    confirmBackupRestoreByName: '确定要用备份「{name}」覆盖当前全部账本数据吗？此操作不可撤销。',
    confirmImportLedger: '导入历史账本会写入大量数据，重复导入可能产生重复记录。是否继续？',
    confirmImportStockIn: '确定要导入入库 Excel 吗？重复记录会自动跳过。',
    confirmClearAiSession: '确定清空当前 AI 会话内容吗？',
    confirmDeleteAiSession: '确定删除这条 AI 会话记录吗？',
    confirmLogout: '确定要退出登录吗？',
    checkUpdate: '检查更新',
    updateTitle: '软件更新',
    updateChecking: '正在检查更新…',
    updateFound: '发现新版本 v{latest}，当前版本 v{current}。',
    updateLatest: '当前已是最新版本 v{version}。',
    updateDownload: '下载更新',
    updateInstall: '立即重启安装',
    updateDownloading: '正在下载 {percent}%',
    updateRetry: '重新检查',
    updateSubtitleIdle: '启动后会自动检查 GitHub 发布的新版本。',
    updateSubtitleReady: '更新包已下载完成，重启后即可安装。',
    close: '关闭',
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
    stockIn: '产品入库',
    stockInSub: '产品入库记录',
    stockOut: '产品出库',
    stockOutSub: '产品出库记录',
    products: '产品档案',
    productsSub: '产品/规格/单位标准化',
    inventory: '库存汇总',
    inventorySub: '入库减出库结存',
    docNo: '单据号',
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
    totalInQuantity: '入库总量',
    totalOutQuantity: '出库总量',
    totalStockQuantity: '当前库存',
    stockQty: '库存数量',
    searchInventory: '搜索产品/规格/单位…',
    searchProduct: '搜索产品/规格/单位/分类…',
    defaultPrice: '默认单价',
    availableQty: '可用库存',
    selectInventoryProduct: '选择库存产品',
    supplierCount: '供应商数',
    customerCount: '客户数',
    searchStock: '搜索产品/规格/合同号…',
    typeProductName: '输入或选择产品',
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
    removeImage: '移除图片',
    noImages: '暂无图片',
    search: '搜索…',
    searchCash: '搜索摘要/经办人/日期…',
    filterYear: '年份',
    filterMonth: '月份',
    filterStartDate: '开始日期',
    filterEndDate: '结束日期',
    filterProductName: '产品名称',
    filterSpec: '规格',
    filterUnit: '单位',
    filterStockStatus: '库存状态',
    stockStatusAll: '全部库存',
    stockStatusInStock: '有库存',
    stockStatusOutOfStock: '无库存/负库存',
    filterModule: '模块',
    filterAction: '操作类型',
    filterDeletedStartDate: '删除开始',
    filterDeletedEndDate: '删除结束',
    resetFilters: '重置筛选',
    export: '导出',
    exportAllExcel: '导出总表',
    exportDone: '导出完成，共 {count} 条',
    exportDoneSelected: '已导出选中 {count} 条',
    exportFailed: '导出失败',
    printSlip: '打印出库单',
    printPreview: '出库单预览',
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
    templateSales: '普通销售单（半A4）',
    templateMetal: '金属材料单（横版）',
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
    migrateTitle: '换电脑怎么搬数据？',
    migrateStep1: '旧电脑：点「立即备份」',
    migrateStep2: '旧电脑：点「保存备份包」，存到 U 盘（一个 zip，账本+图片全在里面）',
    migrateStep3: '新电脑：安装软件后，点「选择备份包恢复」',
    restoreSection: '恢复数据',
    restoreTitle: '从备份包恢复',
    restoreDesc: '选择旧电脑保存的备份包（.zip 文件），一键还原全部账本和图片。不用管里面有什么，软件会自动处理。',
    pickBackupPackage: '选择备份包',
    pickBackupFolder: '高级：选择备份文件夹',
    saveBackupPackage: '保存备份包',
    saveBackupPackageDone: '备份包已保存，可以拷到 U 盘',
    saveBackupPackageFailed: '保存备份包失败',
    restoreThisBackup: '恢复',
    restoreDone: '恢复成功',
    restoreFailed: '恢复失败',
    legacySection: '旧版 Excel 迁移',
    legacyHint: '仅限首次从老 Excel 账本迁入，格式需与原账本一致。日常使用请用上面的备份恢复。',
    importLedgerTitle: '导入账本',
    importLedgerDesc: '从以前的 Excel 账本首次迁入历史数据。',
    importStockTitle: '导入入库单',
    importStockDesc: '从产品入库 Excel 按供应商导入记录。',
    importTitle: '导入数据',
    importPageSub: '从 Excel 账本导入历史数据',
    pickExcel: '选择账本文件',
    importDone: '导入完成',
    importSummary: '现金 {cash} 条，公账 {bank} 条，承兑 {bills} 条，客户往来 {customers} 条，图片 {images} 张，已关联 {attachments} 张',
    importFailed: '导入失败',
    backupSection: '备份数据',
    backupTitle: '一键备份',
    backupDesc: '先把数据备份到本机。要换电脑时，再点「保存备份包」存到 U 盘。',
    backupNow: '立即备份',
    backupDone: '备份成功',
    backupFailed: '备份失败',
    openBackupFolder: '查看备份文件夹',
    exportSection: '导出报表',
    exportTitle: '导出总表',
    exportDesc: '把所有账本导出为一个 Excel 文件，方便查看或发给会计。',
    recentBackups: '最近备份',
    noBackupsYet: '还没有备份，建议先点「立即备份」',
    cloudSection: '七牛云同步',
    cloudTitle: '差异化云端备份',
    cloudDesc: '只上传/下载有变化的账本和图片，不全量传 zip。适合多电脑同步。',
    cloudAccessKey: 'AccessKey',
    cloudSecretKey: 'SecretKey',
    cloudBucket: '空间名称',
    cloudDomain: '外链域名',
    cloudPrefix: '目录前缀',
    cloudSaveConfig: '保存云配置',
    cloudTest: '测试连接',
    cloudSyncUpload: '上传到云端',
    cloudSyncDownload: '从云端恢复',
    cloudConfigSaved: '七牛云配置已保存',
    cloudTestOk: '七牛云连接正常',
    cloudSyncUploadDone: '已上传 {uploaded} 个文件，跳过 {skipped} 个未变化文件',
    cloudSyncDownloadDone: '已下载 {downloaded} 个文件，跳过 {skipped} 个未变化文件',
    cloudSyncNoChange: '云端与本地一致，无需同步',
    cloudSyncProgressTitleUpload: '正在上传到云端',
    cloudSyncProgressTitleDownload: '正在从云端恢复',
    cloudStatusLine: '本地 {local} 个文件 · 云端 {remote} 个文件 · 云端更新 {time}',
    cloudStatusEmpty: '云端尚无同步数据',
    confirmCloudRestore: '确定从云端拉取差异并合并到本机吗？会先自动备份当前数据。',
    total: '共 {count} 条',
    totalIncome: '总收入',
    totalExpense: '总支出',
    currentSurplus: '当前结余',
    totalIn: '总进账',
    totalOut: '总付出',
    netAmount: '净额',
    amountIn: '进账',
    amountOut: '付出',
    customerReceivable: '应收金额',
    customerReceived: '收款',
    customerBalance: '欠款余额',
    customerOverpaid: '多收',
    customerDebtTag: '欠款',
    customerOverpaidTag: '多收',
    customerBalanceColumn: '欠款/多收',
    addCustomerSale: '登记应收',
    addCustomerPayment: '登记收款',
    customerPaymentFormHint: '客户每转来一笔钱，登记一条收款；不支持批量合并收款。',
    customerOverview: '客户欠款一览',
    customerOverviewSub: '点客户名或「台账」查看明细；在台账内登记应收与收款。',
    amountAutoCalc: '自动计算（数量 × 单价）',
    addCustomer: '新增客户',
    addCustomerSub: '新建客户档案（可设期初欠款），保存后自动打开该客户台账。',
    customerCreated: '客户已添加',
    deleteCustomer: '删除',
    confirmDeleteCustomerTitle: '删除客户',
    confirmDeleteCustomerMessage: '确定删除客户「{name}」吗？\n\n· 往来记录 {ledgerCount} 条将移入回收站\n· 客户档案（期初欠款）将一并删除\n\n可在「回收站」恢复往来记录。',
    confirmDeleteCustomerProfileOnly: '确定删除客户「{name}」吗？该客户暂无往来记录，将只删除客户档案。',
    customerRemoved: '客户已删除',
    customerRemoveBlockedStockOut: '该客户在产品出库中还有 {count} 条记录，无法删除。请先在「产品出库」中处理。',
    selectCustomerToAdd: '请选择客户',
    customerPickTitle: '登记客户往来',
    customerPickSub: '选择客户后将打开台账并进入登记表单。',
    openCustomerLedger: '打开台账',
    customerWorkspaceTitle: '客户台账',
    customerQuickSale: '应收',
    customerQuickPayment: '收款',
    customerSelectForDetail: '请从上方客户欠款一览打开客户台账。',
    customerSaleDetail: '应收明细',
    customerSaleDetailSub: '产品、数量、单价与应收金额；汇总见弹窗上方卡片。',
    customerPaymentDetail: '收款记录',
    customerPaymentDetailSub: '收款大于应收时显示「多收」，不是负数欠款。',
    customerWorkspaceSummaryHint: '收多了显示「多收」',
    customerAnomalyBanner: '发现 {count} 条数据异常（如收款金额错列），可一键修复。',
    customerPaymentMissingDateHint: '{count} 条收款未填日期，可在编辑中补充。',
    viewCustomerDetail: '查看明细',
    billIn: '收票',
    receipt: '收款',
    payment: '付款',
    customerName: '客户',
    filterCustomer: '筛选客户',
    openingBalance: '上期欠款',
    periodAmount: '本期金额',
    periodPaid: '已收金额',
    totalPayable: '累计应付',
    currentArrears: '当前欠款',
    customerProfile: '期初欠款',
    customerProfileSub: '对应 Excel 表头的「上期欠款」。保存后按「期初 + 应收 − 收款」重算余额。',
    customerProfileSaved: '期初欠款已保存，余额已重算',
    selectCustomerForProfile: '请先筛选一个客户，再设置期初欠款',
    customerDataCheck: '数据检查',
    customerAnomalyTitle: '客户数据异常',
    customerAnomalyEmpty: '未发现可识别的数据异常',
    customerAnomalyFix: '自动修复',
    customerAnomalyFixDone: '已修复 {fixed} 条，并重算 {count} 个客户余额',
    customerAnomalyNeedManual: '需手工处理',
    customerAnomalyAutoFix: '可自动修复',
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
    helpTitle: 'Hello，使用帮助',
    helpSubtitle: '项目介绍、业务说明、操作教程和作者联系方式',
    helpProjectTitle: '项目介绍',
    helpProjectDesc: '东昊账务是面向汽配业务的本地账务和库存管理系统，用于记录现金、公账、承兑票、客户往来、产品入库、产品出库、库存结存、图片附件、导入导出和备份恢复。',
    helpBusinessTitle: '业务范围',
    helpBusinessFinance: '财务账本：现金账、公账、承兑票、客户往来，支持新增、编辑、删除、筛选、导出和审计追踪。',
    helpBusinessStock: '库存业务：产品档案、产品入库、产品出库、库存汇总，出库会校验当前库存。',
    helpBusinessData: '数据管理：Excel 导入、总表导出、本机备份、备份包迁移和回收站恢复。',
    helpTutorialTitle: '快速教程',
    helpTutorialStep1: '先在左侧选择业务模块，例如现金账、产品入库或产品出库。',
    helpTutorialStep2: '点击“新增”录入数据；日期使用日期选择器，金额和数量按实际业务填写。',
    helpTutorialStep3: '用顶部筛选栏按客户、供应商、日期、关键词等条件查找数据；导出会按当前筛选结果导出。',
    helpTutorialStep4: '换电脑或重要操作前，进入“数据管理”先备份，也可以导出备份包带走。',
    helpTipsTitle: '使用细节',
    helpTipBackup: '建议每天收工前备份一次，重要导入或恢复前也先备份。',
    helpTipDate: '日期统一使用标准格式，便于月份、年份和区间筛选。',
    helpTipExport: '导出不受当前分页限制；勾选行时优先导出勾选内容。',
    helpAuthorTitle: '作者联系方式',
    helpAuthorName: '作者：chenyomi',
    helpAuthorEmail: '邮箱：408550179@qq.com',
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
    confirm: 'Confirm',
    confirmTitle: 'Please Confirm',
    confirmDeleteTitle: 'Move to Trash',
    confirmDeleteMessage: 'Move this record to trash? You can restore it later from Trash.',
    confirmRestoreTitle: 'Restore Record',
    confirmRestoreMessage: 'Restore this record from trash?',
    confirmBackupRestoreTitle: 'Restore Backup',
    confirmBackupRestoreMessage: 'This will overwrite all current ledger data and cannot be undone. Back up first if needed. Continue?',
    confirmBackupRestoreByName: 'Restore backup "{name}" and overwrite all current ledger data? This cannot be undone.',
    confirmImportLedger: 'Importing the legacy ledger writes a large amount of data. Duplicate imports may create duplicates. Continue?',
    confirmImportStockIn: 'Import stock-in records from Excel? Duplicate rows will be skipped.',
    confirmClearAiSession: 'Clear the current AI conversation?',
    confirmDeleteAiSession: 'Delete this AI conversation?',
    confirmLogout: 'Log out now?',
    checkUpdate: 'Check for Updates',
    updateTitle: 'Software Update',
    updateChecking: 'Checking for updates…',
    updateFound: 'Version v{latest} is available. Current version: v{current}.',
    updateLatest: 'You are on the latest version v{version}.',
    updateDownload: 'Download Update',
    updateInstall: 'Restart and Install',
    updateDownloading: 'Downloading {percent}%',
    updateRetry: 'Check Again',
    updateSubtitleIdle: 'The app checks GitHub Releases for new versions after startup.',
    updateSubtitleReady: 'The update package is ready. Restart to install.',
    close: 'Close',
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
    stockIn: 'Product Inbound',
    stockInSub: 'Product inbound records',
    stockOut: 'Stock Out',
    stockOutSub: 'Product outbound',
    products: 'Products',
    productsSub: 'Standard product catalog',
    inventory: 'Inventory',
    inventorySub: 'Inbound minus outbound stock',
    docNo: 'Doc No',
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
    totalInQuantity: 'Inbound Qty',
    totalOutQuantity: 'Outbound Qty',
    totalStockQuantity: 'Stock Qty',
    stockQty: 'Stock Qty',
    searchInventory: 'Search product/spec/unit…',
    searchProduct: 'Search product/spec/unit/category…',
    defaultPrice: 'Default Price',
    availableQty: 'Available Qty',
    selectInventoryProduct: 'Select inventory product',
    supplierCount: 'Suppliers',
    customerCount: 'Customers',
    searchStock: 'Search product/spec/contract…',
    typeProductName: 'Type or select product',
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
    removeImage: 'Remove Image',
    noImages: 'No images',
    search: 'Search…',
    searchCash: 'Search description/operator/date…',
    filterYear: 'Year',
    filterMonth: 'Month',
    filterStartDate: 'Start date',
    filterEndDate: 'End date',
    filterProductName: 'Product',
    filterSpec: 'Spec',
    filterUnit: 'Unit',
    filterStockStatus: 'Stock status',
    stockStatusAll: 'All stock',
    stockStatusInStock: 'In stock',
    stockStatusOutOfStock: 'No/negative stock',
    filterModule: 'Module',
    filterAction: 'Action',
    filterDeletedStartDate: 'Deleted from',
    filterDeletedEndDate: 'Deleted to',
    resetFilters: 'Reset',
    export: 'Export',
    exportAllExcel: 'Export All',
    exportDone: 'Export complete, {count} rows',
    exportDoneSelected: 'Exported {count} selected rows',
    exportFailed: 'Export failed',
    printSlip: 'Print Outbound Slip',
    printPreview: 'Outbound Slip Preview',
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
    templateSales: 'Standard Sales Slip',
    templateMetal: 'Metal Material Slip',
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
    migrateTitle: 'Moving to a new computer?',
    migrateStep1: 'Old PC: tap "Backup Now"',
    migrateStep2: 'Old PC: tap "Save Backup Package" to USB (one zip with ledger + images)',
    migrateStep3: 'New PC: install the app, then tap "Choose Backup Package"',
    restoreSection: 'Restore',
    restoreTitle: 'Restore from Backup Package',
    restoreDesc: 'Choose the .zip file saved from the old computer. The app restores everything automatically.',
    pickBackupPackage: 'Choose Backup Package',
    pickBackupFolder: 'Advanced: Choose Backup Folder',
    saveBackupPackage: 'Save Backup Package',
    saveBackupPackageDone: 'Backup package saved — copy it to a USB drive',
    saveBackupPackageFailed: 'Failed to save backup package',
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
    backupDesc: 'Back up to this computer first. To move computers, save a backup package to USB.',
    backupNow: 'Backup Now',
    backupDone: 'Backup complete',
    backupFailed: 'Backup failed',
    openBackupFolder: 'Open backup folder',
    exportSection: 'Export',
    exportTitle: 'Export Summary',
    exportDesc: 'Export all ledgers into one Excel file for review or sharing.',
    recentBackups: 'Recent Backups',
    noBackupsYet: 'No backups yet. Tap "Backup Now" to create one.',
    cloudSection: 'Qiniu Cloud Sync',
    cloudTitle: 'Incremental Cloud Backup',
    cloudDesc: 'Upload/download only changed ledger and image files — not full zip packages.',
    cloudAccessKey: 'AccessKey',
    cloudSecretKey: 'SecretKey',
    cloudBucket: 'Bucket',
    cloudDomain: 'CDN Domain',
    cloudPrefix: 'Path Prefix',
    cloudSaveConfig: 'Save Cloud Settings',
    cloudTest: 'Test Connection',
    cloudSyncUpload: 'Upload to Cloud',
    cloudSyncDownload: 'Restore from Cloud',
    cloudConfigSaved: 'Cloud settings saved',
    cloudTestOk: 'Cloud connection OK',
    cloudSyncUploadDone: 'Uploaded {uploaded} file(s), skipped {skipped} unchanged',
    cloudSyncDownloadDone: 'Downloaded {downloaded} file(s), skipped {skipped} unchanged',
    cloudSyncNoChange: 'Local and cloud are already in sync',
    cloudSyncProgressTitleUpload: 'Uploading to cloud',
    cloudSyncProgressTitleDownload: 'Restoring from cloud',
    cloudStatusLine: 'Local {local} files · Cloud {remote} files · Cloud updated {time}',
    cloudStatusEmpty: 'No cloud sync data yet',
    confirmCloudRestore: 'Pull cloud differences and merge into this computer? A local backup runs first.',
    total: '{count} items',
    totalIncome: 'Income',
    totalExpense: 'Expense',
    currentSurplus: 'Current Balance',
    totalIn: 'Total In',
    totalOut: 'Total Out',
    netAmount: 'Net',
    amountIn: 'In',
    amountOut: 'Out',
    customerReceivable: 'Receivable',
    customerReceived: 'Received',
    customerBalance: 'Balance Due',
    customerOverpaid: 'Overpaid',
    customerDebtTag: 'Due',
    customerOverpaidTag: 'Overpaid',
    customerBalanceColumn: 'Due / Overpaid',
    addCustomerSale: 'Add Receivable',
    addCustomerPayment: 'Record Payment',
    customerPaymentFormHint: 'Record one payment per transfer. Batch collection is not supported.',
    customerOverview: 'Customer Balances',
    customerOverviewSub: 'Click a customer or 台账 to view details. Register receivables and payments inside the ledger.',
    amountAutoCalc: 'Auto-calculated (qty × price)',
    addCustomer: 'Add Customer',
    addCustomerSub: 'Create a customer profile with optional opening balance.',
    customerCreated: 'Customer added',
    deleteCustomer: 'Delete',
    confirmDeleteCustomerTitle: 'Delete Customer',
    confirmDeleteCustomerMessage: 'Delete customer "{name}"?\n\n· {ledgerCount} ledger row(s) will move to Trash\n· Customer profile (opening balance) will be removed\n\nYou can restore ledger rows from Trash.',
    confirmDeleteCustomerProfileOnly: 'Delete customer "{name}"? This customer has no ledger rows; only the profile will be removed.',
    customerRemoved: 'Customer deleted',
    customerRemoveBlockedStockOut: 'This customer has {count} stock-out row(s). Handle them in Stock Out before deleting.',
    selectCustomerToAdd: 'Select a customer',
    customerPickTitle: 'Add Customer Entry',
    customerPickSub: 'Opens the ledger and the entry form for this customer.',
    customerSelectForDetail: 'Open a customer from the overview above.',
    customerSaleDetail: 'Receivables',
    customerSaleDetailSub: 'Products, qty, price and receivable amount. See summary cards above.',
    customerPaymentDetail: 'Payments',
    customerPaymentDetailSub: 'Balance = opening + receivable − received. Negative means overpaid.',
    customerWorkspaceSummaryHint: 'Balance = opening + receivable − received',
    customerAnomalyBanner: '{count} data issue(s) found (e.g. misaligned payment amounts). You can auto-fix.',
    customerPaymentMissingDateHint: '{count} payment(s) have no date. Edit to add if needed.',
    openCustomerLedger: 'Open Ledger',
    customerWorkspaceTitle: 'Customer Ledger',
    customerQuickSale: 'Receivable',
    customerQuickPayment: 'Receive',
    billIn: 'Received',
    receipt: 'Receipt',
    payment: 'Payment',
    customerName: 'Customer',
    filterCustomer: 'Customer',
    openingBalance: 'Opening Balance',
    periodAmount: 'Period Amount',
    periodPaid: 'Received',
    totalPayable: 'Total Payable',
    currentArrears: 'Current Balance',
    customerProfile: 'Opening Balance',
    customerProfileSub: 'Matches Excel opening arrears. Saving recalculates row balances from opening + credits - payments.',
    customerProfileSaved: 'Opening balance saved and balances recalculated',
    selectCustomerForProfile: 'Select a customer first to set opening balance',
    customerDataCheck: 'Data Check',
    customerAnomalyTitle: 'Customer Data Issues',
    customerAnomalyEmpty: 'No recognizable data issues found',
    customerAnomalyFix: 'Auto Fix',
    customerAnomalyFixDone: 'Fixed {fixed} rows and recalculated {count} customers',
    customerAnomalyNeedManual: 'Manual fix needed',
    customerAnomalyAutoFix: 'Auto-fixable',
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
    helpTitle: 'Hello, Help',
    helpSubtitle: 'Project intro, business details, tutorial, and author contact',
    helpProjectTitle: 'Project',
    helpProjectDesc: 'Donghao Ledger is a local finance and inventory system for auto parts operations, covering cash, bank, acceptance bills, customers, product inbound, product outbound, inventory, attachments, import/export, backup, and restore.',
    helpBusinessTitle: 'Business Scope',
    helpBusinessFinance: 'Finance: cash, bank, acceptance bills, and customer ledgers with create, edit, delete, filters, export, and audit logs.',
    helpBusinessStock: 'Inventory: product catalog, product inbound, product outbound, and stock summary with outbound stock validation.',
    helpBusinessData: 'Data: Excel import, workbook export, local backup, backup package migration, and trash restore.',
    helpTutorialTitle: 'Quick Tutorial',
    helpTutorialStep1: 'Choose a module from the left navigation, such as Cash, Product Inbound, or Stock Out.',
    helpTutorialStep2: 'Click Add to enter records. Use the date picker and fill amounts or quantities according to the business record.',
    helpTutorialStep3: 'Use the filter bar to search by customer, supplier, date, keyword, and more. Export follows the current filters.',
    helpTutorialStep4: 'Before moving computers or important operations, open Data Management and create a backup or backup package.',
    helpTipsTitle: 'Details',
    helpTipBackup: 'Back up at the end of each day, and before import or restore operations.',
    helpTipDate: 'Use standard dates so monthly, yearly, and range filters work reliably.',
    helpTipExport: 'Export is not limited by pagination. Selected rows take priority when checked.',
    helpAuthorTitle: 'Author Contact',
    helpAuthorName: 'Author: chenyomi',
    helpAuthorEmail: 'Email: 408550179@qq.com',
  },
} as const

const page = ref<PageKey>('dashboard')
const currentUser = ref<LoginUser | null>(null)
const checkingAuth = ref(true)
function getInitialThemeMode(): ThemeMode {
  const saved = localStorage.getItem('themeMode')
  if (saved === 'dark' || saved === 'light') return saved
  return 'light'
}

const themeMode = ref<ThemeMode>(getInitialThemeMode())
const languageMode = ref<Lang>((localStorage.getItem('languageMode') as Lang) || 'zh')
const loginLoading = ref(false)
const loginError = ref('')
const loginForm = reactive({ username: '', password: '' })
const passwordDialog = ref(false)
const helpDialog = ref(false)
const passwordLoading = ref(false)
const passwordForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })
const aiFloatingOpen = ref(false)
const snackbar = reactive({ show: false, text: '', color: 'success' })
const confirmDialog = reactive({
  show: false,
  title: '',
  message: '',
  confirmLabel: '确定',
  cancelLabel: '取消',
  confirmColor: 'primary',
})
let confirmResolver: ((value: boolean) => void) | null = null
const appVersion = ref('')
const updateDialog = ref(false)
const updateBusy = ref(false)
const updateState = ref<any>({ status: 'idle', currentVersion: '' })
let offUpdateState: (() => void) | undefined
let offUpdateOpenDialog: (() => void) | undefined
let echartsModule: EChartsModule | null = null

const themeName = computed(() => themeMode.value === 'dark' ? 'donghaoDark' : 'donghaoLight')
const isLedgerPage = computed(() => ['cash', 'bank', 'bills', 'customer', 'stockIn', 'stockOut'].includes(page.value))
const userInitial = computed(() => (currentUser.value?.displayName || currentUser.value?.username || '东').slice(0, 1).toUpperCase())
const updateDialogSubtitle = computed(() => {
  if (updateState.value.status === 'downloaded') return t('updateSubtitleReady')
  return t('updateSubtitleIdle')
})

function maybeOpenUpdateDialog(state: any) {
  if (!currentUser.value) return
  if (state?.status === 'available' || state?.status === 'downloaded') updateDialog.value = true
}

async function runUpdateCheck() {
  updateBusy.value = true
  updateDialog.value = true
  try {
    const state = await updateAPI.check()
    updateState.value = state
  } catch (error: any) {
    updateState.value = { ...updateState.value, status: 'error', error: error?.message || t('updateRetry') }
  } finally {
    updateBusy.value = false
  }
}

async function downloadUpdatePackage() {
  updateBusy.value = true
  try {
    updateState.value = await updateAPI.download()
  } catch (error: any) {
    updateState.value = { ...updateState.value, status: 'error', error: error?.message || t('updateRetry') }
  } finally {
    updateBusy.value = false
  }
}

async function installUpdateNow() {
  await updateAPI.install()
}

const navItems = [
  { key: 'dashboard' as PageKey, icon: '◼', label: 'dashboard', sub: 'dashboardSub' },
  { key: 'cash' as PageKey, icon: '💵', label: 'cash', sub: 'cashSub' },
  { key: 'bank' as PageKey, icon: '🏦', label: 'bank', sub: 'bankSub' },
  { key: 'bills' as PageKey, icon: '📄', label: 'bills', sub: 'billsSub' },
  { key: 'customer' as PageKey, icon: '🏭', label: 'customer', sub: 'customerSub' },
  { key: 'products' as PageKey, icon: '▣', label: 'products', sub: 'productsSub' },
  { key: 'stockIn' as PageKey, icon: '📦', label: 'stockIn', sub: 'stockInSub' },
  { key: 'stockOut' as PageKey, icon: '🚚', label: 'stockOut', sub: 'stockOutSub' },
  { key: 'inventory' as PageKey, icon: '▦', label: 'inventory', sub: 'inventorySub' },
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

type ConfirmOptions = {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  confirmColor?: string
}

function askConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    confirmResolver = resolve
    confirmDialog.title = options.title || t('confirmTitle')
    confirmDialog.message = options.message
    confirmDialog.confirmLabel = options.confirmLabel || t('confirm')
    confirmDialog.cancelLabel = options.cancelLabel || t('cancel')
    confirmDialog.confirmColor = options.confirmColor || 'primary'
    confirmDialog.show = true
  })
}

function resolveConfirm(confirmed: boolean) {
  confirmDialog.show = false
  confirmResolver?.(confirmed)
  confirmResolver = null
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
  const ok = await askConfirm({
    message: t('confirmLogout'),
    confirmColor: 'error',
    confirmLabel: t('logout'),
  })
  if (!ok) return
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
  offUpdateState = updateAPI.onState((state) => {
    updateState.value = state
    maybeOpenUpdateDialog(state)
  })
  offUpdateOpenDialog = updateAPI.onOpenDialog(() => {
    updateDialog.value = true
  })
  try {
    appVersion.value = await systemAPI.appVersion()
    currentUser.value = await authAPI.me()
    updateState.value = await updateAPI.getState()
    maybeOpenUpdateDialog(updateState.value)
  } finally {
    checkingAuth.value = false
  }
})

onBeforeUnmount(() => {
  offUpdateState?.()
  offUpdateOpenDialog?.()
})

function money(value: any) {
  return Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function normalizeDateValue(value: any) {
  const parsed = parseLedgerDate(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(parsed) ? parsed : String(value || '').trim()
}

function monthFromDate(value: any) {
  const normalized = normalizeDateValue(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized.slice(0, 7) : ''
}

function todayIsoDate() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function normalizeCustomerLedgerPayload(payload: any) {
  payload.customer_name = String(payload.customer_name || '').trim()
  payload.date = normalizeDateValue(payload.date || '')
  payload.month_label = monthFromDate(payload.date)
  payload.contract_no = String(payload.contract_no || '')
  payload.product_name = String(payload.product_name || '')
  payload.spec = String(payload.spec || '')
  payload.unit = String(payload.unit || '')
  payload.quantity = Number(payload.quantity || 0)
  payload.unit_price = Number(payload.unit_price || 0)
  payload.amount_in = Number(payload.amount_in || 0)
  payload.amount_out = Number(payload.amount_out || 0)
  payload.balance = 0
  payload.note = String(payload.note || '')
  return payload
}

function yearOptions() {
  const current = new Date().getFullYear()
  return Array.from({ length: 12 }, (_, index) => String(current + 1 - index))
}

function monthOptions() {
  return Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'))
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
      await renderCharts()
    }

    const renderCharts = async () => {
      const echarts = echartsModule || (echartsModule = await import('echarts'))
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
        color: palette,
        tooltip: { trigger: 'item', ...tooltip },
        legend: { bottom: 0, textStyle: axisText, itemWidth: 18, itemHeight: 12, itemGap: 12 },
        series: [{ type: 'pie', center: ['50%', '42%'], radius: ['42%', '68%'], avoidLabelOverlap: true, label: { show: false }, labelLine: { show: false }, itemStyle: { borderRadius: 8, borderColor: '#0b1020', borderWidth: 2 }, data: [
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
        h(StatCard, { title: '公账结余', value: summary.value?.bank?.balance || 0, color: 'secondary' }),
        h(StatCard, { title: '承兑票结余', value: summary.value?.bills?.balance || 0, color: 'warning' }),
      ]),
      h(ChartCard, { title: '月度收支趋势' }, () => h('div', { ref: chartRefs[0], class: 'chart tall' })),
      h('div', { class: 'chart-grid' }, ['资金结构环图', '月度净流动能曲线', '资金净流健康仪表盘', '账务规模雷达图'].map((title, i) => h(ChartCard, { title }, () => h('div', { ref: chartRefs[i + 1], class: 'chart' })))),
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
  props: { title: String, value: [Number, String], color: String, clickable: Boolean, compact: Boolean },
  emits: ['click'],
  setup(props, { emit }) {
    return () => h(VCard, {
      class: ['stat-card', props.compact ? 'stat-card--compact' : '', props.clickable ? 'stat-card--clickable' : ''],
      onClick: props.clickable ? () => emit('click') : undefined,
    }, [
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

const InventoryPage = defineComponent({
  props: { t: { type: Function, required: true } },
  setup(props) {
    const rows = ref<any[]>([])
    const total = ref(0)
    const currentPage = ref(1)
    const pageSize = 20
    const keyword = ref('')
    const productName = ref('')
    const specFilter = ref('')
    const unitFilter = ref('')
    const stockStatus = ref('')
    const loading = ref(false)
    const summary = ref<any>({})
    const columns = ['product_name', 'spec', 'unit', 'total_in', 'total_out', 'stock_qty']
    const stockStatusOptions = computed(() => [
      { title: props.t('stockStatusAll'), value: '' },
      { title: props.t('stockStatusInStock'), value: 'inStock' },
      { title: props.t('stockStatusOutOfStock'), value: 'outOfStock' },
    ])

    const buildFilters = () => ({
      keyword: keyword.value,
      productName: productName.value,
      spec: specFilter.value,
      unit: unitFilter.value,
      stockStatus: stockStatus.value,
    })

    const load = async () => {
      loading.value = true
      const res = await inventoryAPI.list({ page: currentPage.value, pageSize, ...buildFilters() })
      rows.value = res.rows || []
      total.value = res.total || 0
      summary.value = res.summary || {}
      loading.value = false
    }
    const resetFilters = () => {
      keyword.value = ''
      productName.value = ''
      specFilter.value = ''
      unitFilter.value = ''
      stockStatus.value = ''
      currentPage.value = 1
      load()
    }

    watch([keyword, productName, specFilter, unitFilter, stockStatus], () => {
      if (currentPage.value !== 1) currentPage.value = 1
      else load()
    })
    watch(currentPage, load)
    onMounted(load)

    return () => h('div', { class: 'page-wrap ledger-page' }, [
      h(PageHeader, { title: props.t('inventory'), subtitle: props.t('inventorySub') }, {
        actions: () => h('div', { class: 'header-toolbar' }, [
          h(VTextField, {
            modelValue: keyword.value,
            'onUpdate:modelValue': (v: string) => { keyword.value = v },
            label: props.t('searchInventory'),
            density: 'compact',
            hideDetails: true,
            class: 'toolbar-input header-toolbar-input',
          }),
          h(VTextField, { modelValue: productName.value, 'onUpdate:modelValue': (v: string) => { productName.value = v }, label: props.t('filterProductName'), density: 'compact', hideDetails: true, class: 'toolbar-input header-toolbar-input' }),
          h(VTextField, { modelValue: specFilter.value, 'onUpdate:modelValue': (v: string) => { specFilter.value = v }, label: props.t('filterSpec'), density: 'compact', hideDetails: true, class: 'toolbar-input header-toolbar-input' }),
          h(VTextField, { modelValue: unitFilter.value, 'onUpdate:modelValue': (v: string) => { unitFilter.value = v }, label: props.t('filterUnit'), density: 'compact', hideDetails: true, class: 'toolbar-input header-toolbar-input' }),
          h(VSelect, { modelValue: stockStatus.value, 'onUpdate:modelValue': (v: string) => { stockStatus.value = v || '' }, items: stockStatusOptions.value, label: props.t('filterStockStatus'), density: 'compact', hideDetails: true, class: 'toolbar-input header-toolbar-input' }),
          h(VBtn, { variant: 'text', size: 'small', onClick: resetFilters }, () => props.t('resetFilters')),
        ]),
      }),
      h('div', { class: 'stat-grid' }, [
        h(StatCard, { title: props.t('totalRecords'), value: summary.value.totalRecords || 0, color: 'primary' }),
        h(StatCard, { title: props.t('totalInQuantity'), value: summary.value.totalIn || 0, color: 'success' }),
        h(StatCard, { title: props.t('totalOutQuantity'), value: summary.value.totalOut || 0, color: 'error' }),
        h(StatCard, { title: props.t('totalStockQuantity'), value: summary.value.totalStock || 0, color: 'warning' }),
      ]),
      h(VCard, { class: 'data-card table-card' }, () => [
        h('div', { class: 'table-scroll' }, [
          h(VTable, { class: 'ledger-table', hover: true }, () => [
            h('thead', [h('tr', columns.map(c => h('th', props.t(columnLabel(c)))))]) ,
            h('tbody', loading.value
              ? [h('tr', [h('td', { colspan: columns.length, class: 'empty-cell' }, '加载中...')])]
              : rows.value.length
                ? rows.value.map(row => h('tr', { key: `${row.product_name}-${row.spec}-${row.unit}` }, columns.map(c => h('td', { class: amountClass(c) }, formatCell(c, row[c])))))
                : [h('tr', [h('td', { colspan: columns.length, class: 'empty-cell' }, '暂无库存记录')])]),
          ]),
        ]),
        h('div', { class: 'table-footer' }, [
          h('span', `${props.t('total', { count: total.value })} · 每页 ${pageSize} 条`),
          h(VPagination, { modelValue: currentPage.value, 'onUpdate:modelValue': (v: number) => currentPage.value = v, length: Math.max(1, Math.ceil(total.value / pageSize)), density: 'comfortable', size: 'small', totalVisible: 7 }),
        ]),
      ]),
    ])
  },
})

const ProductCatalogPage = defineComponent({
  props: { t: { type: Function, required: true } },
  setup(props) {
    const rows = ref<any[]>([])
    const total = ref(0)
    const currentPage = ref(1)
    const pageSize = 20
    const keyword = ref('')
    const loading = ref(false)
    const columns = ['product_name', 'spec', 'unit', 'category', 'default_price', 'stock_qty', 'available_qty']

    const load = async () => {
      loading.value = true
      const res = await productAPI.list({ page: currentPage.value, pageSize, keyword: keyword.value })
      rows.value = res.rows || []
      total.value = res.total || 0
      loading.value = false
    }

    watch(keyword, () => {
      if (currentPage.value !== 1) currentPage.value = 1
      else load()
    })
    watch(currentPage, load)
    onMounted(load)

    return () => h('div', { class: 'page-wrap ledger-page' }, [
      h(PageHeader, { title: props.t('products'), subtitle: props.t('productsSub') }, {
        actions: () => h('div', { class: 'header-toolbar' }, [
          h(VTextField, {
            modelValue: keyword.value,
            'onUpdate:modelValue': (v: string) => { keyword.value = v },
            label: props.t('searchProduct'),
            density: 'compact',
            hideDetails: true,
            class: 'toolbar-input header-toolbar-input',
          }),
        ]),
      }),
      h(VCard, { class: 'data-card table-card' }, () => [
        h('div', { class: 'table-scroll' }, [
          h(VTable, { class: 'ledger-table', hover: true }, () => [
            h('thead', [h('tr', columns.map(c => h('th', props.t(columnLabel(c)))))]) ,
            h('tbody', loading.value
              ? [h('tr', [h('td', { colspan: columns.length, class: 'empty-cell' }, '加载中...')])]
              : rows.value.length
                ? rows.value.map(row => h('tr', { key: row.id }, columns.map(c => h('td', { class: amountClass(c) }, formatCell(c, row[c])))))
                : [h('tr', [h('td', { colspan: columns.length, class: 'empty-cell' }, '暂无产品档案')])]),
          ]),
        ]),
        h('div', { class: 'table-footer' }, [
          h('span', `${props.t('total', { count: total.value })} · 每页 ${pageSize} 条`),
          h(VPagination, { modelValue: currentPage.value, 'onUpdate:modelValue': (v: number) => currentPage.value = v, length: Math.max(1, Math.ceil(total.value / pageSize)), density: 'comfortable', size: 'small', totalVisible: 7 }),
        ]),
      ]),
    ])
  },
})

const ledgerConfigs: any = {
  cash: { title: 'cash', api: cashAPI, pageSize: 20, search: 'searchCash', columns: ['date', 'description', 'income', 'expense', 'balance', 'operator', 'note'], fields: ['date', 'description', 'income', 'expense', 'balance', 'operator', 'note'], summary: ['totalIncome', 'totalExpense', 'currentSurplus'], table: 'cash', relatedTable: 'cash_ledger' },
  bank: { title: 'bank', api: bankAPI, pageSize: 20, search: 'search', columns: ['date', 'description', 'amount_in', 'amount_out', 'balance', 'note'], fields: ['date', 'description', 'amount_in', 'amount_out', 'balance', 'note'], summary: ['totalIn', 'totalOut', 'currentSurplus'], table: 'bank', relatedTable: 'bank_ledger' },
  bills: { title: 'bills', api: billsAPI, pageSize: 20, search: 'search', columns: ['date', 'description', 'amount_in', 'amount_out', 'balance', 'note'], fields: ['date', 'description', 'amount_in', 'amount_out', 'balance', 'note'], summary: ['totalIn', 'totalOut', 'currentSurplus'], table: 'bills', relatedTable: 'acceptance_bills' },
  customer: { title: 'customer', api: customerAPI, pageSize: 20, search: 'search', filterField: 'customerName', filterKey: 'customer_name', filterLabel: 'filterCustomer', columns: ['customer_name', 'date', 'contract_no', 'product_name', 'spec', 'unit', 'quantity', 'unit_price', 'amount_in', 'amount_out', 'balance', 'note'], fields: ['customer_name', 'date', 'contract_no', 'product_name', 'spec', 'unit', 'quantity', 'unit_price', 'amount_in', 'amount_out', 'balance', 'note', 'month_label'], summary: [], table: 'customer', relatedTable: 'customer_ledger' },
  stockIn: { title: 'stockIn', api: stockInAPI, pageSize: 20, search: 'searchStock', filterField: 'supplierName', filterKey: 'supplier_name', filterLabel: 'filterSupplier', columns: ['doc_no', 'supplier_name', 'category', 'date', 'contract_no', 'product_name', 'spec', 'unit', 'quantity', 'unit_price', 'amount', 'note'], fields: ['supplier_name', 'category', 'date', 'contract_no', 'product_name', 'spec', 'unit', 'quantity', 'unit_price', 'amount', 'tax_rate', 'tax_amount', 'invoice_amount', 'note'], summary: ['totalRecords', 'totalQuantity', 'totalAmount'], table: 'stockIn', relatedTable: 'stock_in_ledger' },
  stockOut: { title: 'stockOut', api: stockOutAPI, pageSize: 20, search: 'searchStock', filterField: 'customerName', filterKey: 'customer_name', filterLabel: 'filterCustomer', columns: ['doc_no', 'customer_name', 'category', 'date', 'contract_no', 'product_name', 'spec', 'unit', 'quantity', 'unit_price', 'amount', 'note'], fields: ['customer_name', 'category', 'date', 'contract_no', 'product_name', 'spec', 'unit', 'quantity', 'unit_price', 'amount', 'note'], summary: ['totalRecords', 'totalQuantity', 'totalAmount'], table: 'stockOut', relatedTable: 'stock_out_ledger' },
}

type FormFieldSpec = string | { key: string; span?: 'full' | 'half' }
type FormSectionSpec = { titleKey: string; fields: FormFieldSpec[] }

const formSections: Record<string, FormSectionSpec[]> = {
  cash: [
    { titleKey: 'formSectionBasic', fields: [{ key: 'date', span: 'half' }, { key: 'operator', span: 'half' }, { key: 'description', span: 'full' }] },
    { titleKey: 'formSectionAmount', fields: [{ key: 'income', span: 'half' }, { key: 'expense', span: 'half' }] },
    { titleKey: 'formSectionOther', fields: [{ key: 'note', span: 'full' }] },
  ],
  bank: [
    { titleKey: 'formSectionBasic', fields: [{ key: 'date', span: 'half' }, { key: 'description', span: 'full' }] },
    { titleKey: 'formSectionAmount', fields: [{ key: 'amount_in', span: 'half' }, { key: 'amount_out', span: 'half' }] },
    { titleKey: 'formSectionOther', fields: [{ key: 'note', span: 'full' }] },
  ],
  bills: [
    { titleKey: 'formSectionBasic', fields: [{ key: 'date', span: 'half' }, { key: 'description', span: 'full' }] },
    { titleKey: 'formSectionAmount', fields: [{ key: 'amount_in', span: 'half' }, { key: 'amount_out', span: 'half' }] },
    { titleKey: 'formSectionOther', fields: [{ key: 'note', span: 'full' }] },
  ],
  customer: [
    { titleKey: 'formSectionParty', fields: [{ key: 'customer_name', span: 'half' }, { key: 'date', span: 'half' }, { key: 'contract_no', span: 'half' }] },
    { titleKey: 'formSectionProduct', fields: [{ key: 'product_name', span: 'half' }, { key: 'spec', span: 'half' }, { key: 'unit', span: 'half' }] },
    { titleKey: 'formSectionAmount', fields: [{ key: 'quantity', span: 'half' }, { key: 'unit_price', span: 'half' }, { key: 'amount_in', span: 'half' }] },
    { titleKey: 'formSectionOther', fields: [{ key: 'note', span: 'full' }] },
  ],
  customerPayment: [
    { titleKey: 'formSectionParty', fields: [{ key: 'customer_name', span: 'half' }, { key: 'date', span: 'half' }] },
    { titleKey: 'formSectionAmount', fields: [{ key: 'amount_out', span: 'half' }] },
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
  customer: 880,
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
    const yearFilter = ref('')
    const monthFilter = ref('')
    const startDate = ref('')
    const endDate = ref('')
    const filterOptions = ref<string[]>([])
    const inventoryOptions = ref<any[]>([])
    const productOptions = ref<any[]>([])
    const attachmentDialog = ref(false)
    const attachmentRow = ref<any>(null)
    const attachments = ref<any[]>([])
    const pendingAttachments = ref<any[]>([])
    const pendingAttachmentDeletes = ref<number[]>([])
    const attachmentLoading = ref(false)
    const imagePreview = ref<any>(null)
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
        overlayMode: false,
      },
    })
    const printForm = reactive({ customerPhone: '', customerAddress: '', paymentReceived: '' })
    const customerProfileDialog = ref(false)
    const customerProfileForm = reactive({ opening_balance: 0, note: '' })
    const customerEntryMode = ref<'sale' | 'payment'>('sale')
    const customerPaymentRows = ref<any[]>([])
    const customerPaymentTotal = ref(0)
    const customerPaymentPage = ref(1)
    const customerPaymentPageSize = 10
    const customerDetailDialog = ref(false)
    const customerDetailName = ref('')
    const customerDetailTab = ref<'sale' | 'payment'>('sale')
    const customerDetailSummary = ref<any>({})
    const customerPickDialog = ref(false)
    const customerPickMode = ref<'sale' | 'payment'>('sale')
    const customerPickName = ref('')
    const customerCreateDialog = ref(false)
    const customerCreateForm = reactive({ customer_name: '', opening_balance: 0, note: '' })
    const customerSaleColumnKeys = ['date', 'contract_no', 'product_name', 'spec', 'unit', 'quantity', 'unit_price', 'amount_in', 'note']
    const customerPaymentColumnKeys = ['date', 'amount_out', 'note']
    const displayColumns = computed(() => {
      if (props.page === 'customer' && customerDetailDialog.value) {
        return [...customerSaleColumnKeys, 'attachments']
      }
      return [...config.value.columns, 'attachments']
    })
    const displayAttachments = computed(() => attachments.value.filter((item: any) => !pendingAttachmentDeletes.value.includes(item.id)))
    const years = yearOptions()
    const months = monthOptions()

    const buildLedgerFilters = (customerName = '') => {
      const params: any = { keyword: keyword.value }
      if (config.value.filterField) {
        params[config.value.filterField] = customerName
          || (props.page === 'customer' && customerDetailDialog.value ? customerDetailName.value : filterValue.value)
      }
      if (yearFilter.value) params.year = yearFilter.value
      if (monthFilter.value) params.month = monthFilter.value
      if (startDate.value) params.startDate = startDate.value
      if (endDate.value) params.endDate = endDate.value
      return params
    }

    const fetchCustomerDetailData = async () => {
      if (!customerDetailName.value) return
      const filters = buildLedgerFilters(customerDetailName.value)
      const saleParams = { ...filters, entryType: 'sale', page: currentPage.value, pageSize: config.value.pageSize }
      const payParams = { ...filters, entryType: 'payment', page: customerPaymentPage.value, pageSize: customerPaymentPageSize }
      const [res, payRes, sum] = await Promise.all([
        config.value.api.list(saleParams),
        config.value.api.list(payParams),
        config.value.api.summary(filters),
      ])
      rows.value = res.rows
      total.value = res.total
      customerPaymentRows.value = payRes.rows
      customerPaymentTotal.value = payRes.total
      customerDetailSummary.value = sum
    }

    const fetchCustomerOverview = async () => {
      rows.value = []
      total.value = 0
      selected.value = []
      const names = await config.value.api.names()
      filterOptions.value = names.map((x: any) => x[config.value.filterKey])
      summary.value = await config.value.api.summary(buildLedgerFilters())
    }

    const load = async () => {
      loading.value = true
      if (props.page === 'customer') {
        if (customerDetailDialog.value && customerDetailName.value) {
          await fetchCustomerDetailData()
        } else {
          await fetchCustomerOverview()
        }
        loading.value = false
        return
      }
      const params: any = { ...buildLedgerFilters(), page: currentPage.value, pageSize: config.value.pageSize }
      const res = await config.value.api.list(params)
      rows.value = res.rows
      total.value = res.total
      customerPaymentRows.value = []
      customerPaymentTotal.value = 0
      if (config.value.filterField) {
        const names = await config.value.api.names()
        filterOptions.value = names.map((x: any) => x[config.value.filterKey])
        summary.value = await config.value.api.summary(buildLedgerFilters())
      } else {
        summary.value = await config.value.api.summary(buildLedgerFilters())
      }
      loading.value = false
    }

    const resetSelection = () => { selected.value = []; currentPage.value = 1; customerPaymentPage.value = 1 }
    const resetFilters = () => {
      keyword.value = ''
      filterValue.value = ''
      yearFilter.value = ''
      monthFilter.value = ''
      startDate.value = ''
      endDate.value = ''
      resetSelection()
      load()
    }
    const loadInventoryOptions = async () => {
      if (props.page === 'stockOut') inventoryOptions.value = await inventoryAPI.options()
    }
    const loadProductOptions = async () => {
      if (props.page !== 'stockIn') return
      const res = await productAPI.list({ page: 1, pageSize: 500, keyword: '' })
      productOptions.value = res.rows || []
    }
    const loadRecordOptions = async () => {
      await Promise.all([loadInventoryOptions(), loadProductOptions()])
    }
    const openAdd = async (mode: 'sale' | 'payment' = 'sale') => {
      if (props.page === 'customer' && !customerDetailName.value && !filterValue.value) {
        openCustomerPickAndAdd(mode)
        return
      }
      editing.value = null
      Object.keys(form).forEach(k => delete form[k])
      attachments.value = []
      pendingAttachments.value = []
      pendingAttachmentDeletes.value = []
      if (props.page === 'customer') customerEntryMode.value = mode
      const activeName = customerDetailName.value || filterValue.value
      if (activeName && config.value.filterKey) form[config.value.filterKey] = activeName
      if (props.page === 'customer') form.date = todayIsoDate()
      if (props.page === 'customer' && mode === 'payment') {
        form.product_name = '付款'
        form.amount_in = 0
      }
      if (props.page === 'customer' && mode === 'sale') {
        form.amount_out = 0
        form.quantity = 1
        form.unit_price = 0
        autoFillAmountFields(form, 'quantity')
      }
      await loadRecordOptions()
      if (customerDetailDialog.value) await nextTick()
      dialog.value = true
    }
    const openCustomerWorkspace = async (customerName: string, tab: 'sale' | 'payment' = 'sale') => {
      customerDetailName.value = customerName
      filterValue.value = customerName
      customerDetailTab.value = tab
      customerDetailDialog.value = true
      resetSelection()
      await load()
    }
    const closeCustomerWorkspace = () => {
      customerDetailDialog.value = false
      customerDetailName.value = ''
      filterValue.value = ''
      customerDetailSummary.value = {}
      resetSelection()
      load()
    }
    const openCustomerAddDirect = async (customerName: string, mode: 'sale' | 'payment') => {
      customerDetailName.value = customerName
      filterValue.value = customerName
      customerEntryMode.value = mode
      await openAdd(mode)
    }
    const openCustomerPickAndAdd = (mode: 'sale' | 'payment') => {
      if (filterOptions.value.length === 1) {
        openCustomerAddDirect(String(filterOptions.value[0]), mode)
        return
      }
      customerPickMode.value = mode
      customerPickName.value = ''
      customerPickDialog.value = true
    }
    const confirmCustomerPick = async () => {
      if (!customerPickName.value) {
        emit('notify', props.t('selectCustomerToAdd'), 'warning')
        return
      }
      customerPickDialog.value = false
      await openCustomerAddDirect(customerPickName.value, customerPickMode.value)
    }
    const openCustomerCreate = () => {
      customerCreateForm.customer_name = ''
      customerCreateForm.opening_balance = 0
      customerCreateForm.note = ''
      customerCreateDialog.value = true
    }
    const saveCustomerCreate = async () => {
      const name = String(customerCreateForm.customer_name || '').trim()
      if (!name) {
        emit('notify', props.t('selectCustomerToAdd'), 'warning')
        return
      }
      try {
        await customerAPI.create({
          customer_name: name,
          opening_balance: Number(customerCreateForm.opening_balance || 0),
          note: customerCreateForm.note || '',
        })
        customerCreateDialog.value = false
        emit('notify', props.t('customerCreated'))
        await load()
      } catch (error: any) {
        emit('notify', error?.message || '添加失败', 'error')
      }
    }
    const removeCustomer = async (customerName: string) => {
      const name = String(customerName || '').trim()
      if (!name) return
      try {
        const preview = await customerAPI.removePreview(name)
        if (preview.stockOutCount > 0) {
          emit('notify', t('customerRemoveBlockedStockOut', { count: preview.stockOutCount }), 'error')
          return
        }
        const message = preview.ledgerCount > 0
          ? t('confirmDeleteCustomerMessage', { name, ledgerCount: preview.ledgerCount })
          : t('confirmDeleteCustomerProfileOnly', { name })
        const ok = await askConfirm({
          title: t('confirmDeleteCustomerTitle'),
          message,
          confirmColor: 'error',
          confirmLabel: t('deleteCustomer'),
        })
        if (!ok) return
        await customerAPI.remove(name)
        if (customerDetailName.value === name) closeCustomerWorkspace()
        if (filterValue.value === name) filterValue.value = ''
        emit('notify', props.t('customerRemoved'))
        load()
      } catch (error: any) {
        emit('notify', error?.message || '删除失败', 'error')
      }
    }
    const renderOverviewActionLink = (label: string, onClick: () => void, options: { danger?: boolean } = {}) => h('button', {
      type: 'button',
      class: ['overview-action-link', options.danger ? 'overview-action-link--danger' : ''],
      onClick: (event: MouseEvent) => {
        event.stopPropagation()
        onClick()
      },
    }, label)
    const openEdit = async (row: any) => {
      editing.value = row
      Object.assign(form, row)
      form.date = normalizeDateValue(form.date)
      if (props.page === 'customer' && isCustomerPaymentDescription(form.description)) {
        form.product_name = '付款'
        customerEntryMode.value = 'payment'
      } else if (props.page === 'customer' && !form.product_name && form.description) {
        Object.assign(form, parseCustomerDescription(form.description))
        customerEntryMode.value = 'sale'
      } else if (props.page === 'customer') {
        customerEntryMode.value = Number(form.amount_out) > 0 && !Number(form.amount_in) ? 'payment' : 'sale'
      }
      pendingAttachments.value = []
      pendingAttachmentDeletes.value = []
      await loadRecordOptions()
      dialog.value = true
      await loadAttachments(row)
    }
    const save = async () => {
      try {
        const payload = { ...form }
        if (payload.date) payload.date = normalizeDateValue(payload.date)
        if (props.page === 'customer') {
          if (!String(payload.customer_name || '').trim()) {
            emit('notify', props.t('selectCustomerToAdd'), 'warning')
            return
          }
          if (customerEntryMode.value === 'payment' || form.product_name === '付款' || (Number(payload.amount_out) > 0 && !payload.product_name && !payload.contract_no && !Number(payload.quantity))) {
            payload.description = '付款'
            payload.product_name = '付款'
            payload.contract_no = ''
            payload.spec = ''
            payload.unit = ''
            payload.quantity = 0
            payload.unit_price = 0
            payload.amount_in = 0
            if (Number(payload.amount_out || 0) <= 0) {
              emit('notify', '请填写收款金额', 'warning')
              return
            }
          } else {
            payload.description = buildCustomerDescription(payload)
            payload.amount_out = 0
            const amount = roundMoneyValue(Number(payload.quantity || 0) * Number(payload.unit_price || 0))
            if (amount <= 0) {
              emit('notify', '请填写数量与单价', 'warning')
              return
            }
            payload.amount_in = amount
          }
          normalizeCustomerLedgerPayload(payload)
          if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
            emit('notify', '请填写日期', 'warning')
            return
          }
        }
        if (props.page === 'stockIn' || props.page === 'stockOut') {
          payload.amount = roundMoneyValue(Number(payload.quantity || 0) * Number(payload.unit_price || 0))
        }
        const saved = editing.value ? await config.value.api.update({ ...payload, id: editing.value.id }) : await config.value.api.add(payload)
        if (pendingAttachmentDeletes.value.length) {
          await commitAttachmentDeletes()
        }
        if (pendingAttachments.value.length && saved?.id) {
          await attachmentAPI.add(config.value.relatedTable, saved.id, pendingAttachments.value.map((item: any) => item.filePath))
        }
        pendingAttachments.value = []
        dialog.value = false
        emit('notify', editing.value ? '已更新' : '已添加')
        if (customerDetailDialog.value) {
          load()
        } else {
          customerDetailName.value = ''
          filterValue.value = ''
          load()
        }
      } catch (error: any) {
        emit('notify', error?.message || '保存失败', 'error')
      }
    }
    const remove = async (id: number) => {
      const ok = await askConfirm({
        title: t('confirmDeleteTitle'),
        message: t('confirmDeleteMessage'),
        confirmColor: 'error',
        confirmLabel: t('delete'),
      })
      if (!ok) return
      await config.value.api.delete(id)
      emit('notify', '已移入回收站')
      load()
    }
    const loadAttachments = async (row: any) => {
      if (!row?.id) return
      attachmentLoading.value = true
      attachments.value = await attachmentAPI.list(config.value.relatedTable, row.id)
      attachmentLoading.value = false
    }
    const openAttachments = async (row: any) => {
      attachmentRow.value = row
      attachments.value = []
      pendingAttachmentDeletes.value = []
      attachmentDialog.value = true
      await loadAttachments(row)
    }
    const openImagePreview = (item: any) => {
      imagePreview.value = item
    }
    const closeImagePreview = () => {
      imagePreview.value = null
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
    const removePendingAttachment = (index: number) => {
      pendingAttachments.value = pendingAttachments.value.filter((_, itemIndex) => itemIndex !== index)
    }
    const stageAttachmentRemoval = (id: number) => {
      if (!pendingAttachmentDeletes.value.includes(id)) {
        pendingAttachmentDeletes.value = [...pendingAttachmentDeletes.value, id]
      }
      if (imagePreview.value?.id === id) closeImagePreview()
    }
    const commitAttachmentDeletes = async () => {
      const ids = [...pendingAttachmentDeletes.value]
      if (!ids.length) return
      for (const id of ids) {
        const result = await attachmentAPI.delete(id)
        if (!result?.ok) throw new Error('移除图片失败')
      }
      pendingAttachmentDeletes.value = []
    }
    const closeRecordDialog = () => {
      dialog.value = false
      pendingAttachmentDeletes.value = []
    }
    const closeAttachmentDialog = () => {
      attachmentDialog.value = false
      pendingAttachmentDeletes.value = []
      attachmentRow.value = null
    }
    const saveAttachmentChanges = async () => {
      if (!pendingAttachmentDeletes.value.length) {
        closeAttachmentDialog()
        return
      }
      attachmentLoading.value = true
      try {
        await commitAttachmentDeletes()
        emit('notify', '图片已更新')
        closeAttachmentDialog()
        load()
      } catch (error: any) {
        emit('notify', error?.message || '保存图片失败', 'error')
      } finally {
        attachmentLoading.value = false
      }
    }
    const renderAttachmentPreviewCard = (item: any, options: { key: string; pending?: boolean; onRemove?: () => void }) => h('div', { key: options.key, class: 'image-preview-card-wrap' }, [
      h('button', {
        type: 'button',
        class: ['image-preview-card', options.pending ? 'pending' : ''],
        onClick: () => openImagePreview(item),
      }, [
        h('img', { src: item.dataUrl, alt: item.fileName }),
        h('span', item.fileName),
      ]),
      options.onRemove
        ? h('button', {
          type: 'button',
          class: 'image-preview-remove',
          title: props.t('removeImage'),
          onClick: (event: MouseEvent) => {
            event.stopPropagation()
            options.onRemove?.()
          },
        }, '×')
        : null,
    ])
    const exportRows = async () => {
      exporting.value = true
      try {
        const selectedCount = selected.value.length
        const exportParams: any = { table: config.value.table, ...buildLedgerFilters() }
        if (selectedCount) exportParams.ids = [...selected.value]
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
      if (printTemplate.value === 'metal') printSettings.lodop.overlayMode = false
      if (!Array.isArray(printSettings.sales?.copyLabels) || !printSettings.sales.copyLabels.length) {
        printSettings.sales.copyLabels = ['第一联：存根', '第二联：客户', '第三联：记账']
      }
    }
    const checkLodopInBackground = () => {
      checkLodopAvailable(Number(printSettings.lodop?.servicePort) || 8000)
        .then((available) => { lodopAvailable.value = available })
        .catch(() => { lodopAvailable.value = false })
    }
    const buildPreviewParams = () => ({
      ids: [...selected.value],
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
      printLoading.value = true
      try {
        await loadSlipSettings()
        const result = await printAPI.preview(buildPreviewParams())
        if (!result.ok) {
          emit('notify', result.error || props.t('printFailed'), 'error')
          return
        }
        printHtml.value = result.html
        printDialog.value = true
        checkLodopInBackground()
      } catch (error: any) {
        emit('notify', error?.message || props.t('printFailed'), 'error')
      } finally {
        printLoading.value = false
      }
    }
    const refreshPrintPreview = async () => {
      if (!selected.value.length) return
      printLoading.value = true
      try {
        const result = await printAPI.preview(buildPreviewParams())
        if (result.ok) printHtml.value = result.html
        else emit('notify', result.error || props.t('printFailed'), 'error')
      } catch (error: any) {
        emit('notify', error?.message || props.t('printFailed'), 'error')
      } finally {
        printLoading.value = false
      }
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
      await printAPI.saveSettings(JSON.parse(JSON.stringify(printSettings)))
      printSettingsDialog.value = false
      emit('notify', props.t('settingsSaved'))
      if (printDialog.value) await refreshPrintPreview()
    }
    const activeCustomerName = () => customerDetailName.value || filterValue.value

    const openCustomerProfile = async () => {
      if (props.page !== 'customer') return
      const name = activeCustomerName()
      if (!name) {
        emit('notify', props.t('selectCustomerForProfile'), 'error')
        return
      }
      filterValue.value = name
      const profile = await customerAPI.profile(name)
      customerProfileForm.opening_balance = Number(profile.opening_balance || 0)
      customerProfileForm.note = profile.note || ''
      customerProfileDialog.value = true
    }
    const saveCustomerProfile = async () => {
      const name = activeCustomerName()
      if (!name) return
      await customerAPI.setProfile({
        customer_name: name,
        opening_balance: Number(customerProfileForm.opening_balance || 0),
        note: customerProfileForm.note || '',
      })
      customerProfileDialog.value = false
      emit('notify', props.t('customerProfileSaved'))
      load()
    }
    const toggleAll = (value: boolean) => selected.value = value ? Array.from(new Set([...selected.value, ...rows.value.map(r => r.id)])) : selected.value.filter(id => !rows.value.some(r => r.id === id))
    const toggleRowSelection = (id: number) => {
      selected.value = selected.value.includes(id)
        ? selected.value.filter(item => item !== id)
        : Array.from(new Set([...selected.value, id]))
    }
    const isPageAllSelected = computed(() => rows.value.length > 0 && rows.value.every(r => selected.value.includes(r.id)))

    watch(() => props.page, () => {
      keyword.value = ''
      filterValue.value = ''
      customerDetailDialog.value = false
      customerDetailName.value = ''
      yearFilter.value = ''
      monthFilter.value = ''
      startDate.value = ''
      endDate.value = ''
      selected.value = []
      currentPage.value = 1
      load()
    }, { immediate: true })
    watch(keyword, () => {
      selected.value = []
      if (currentPage.value !== 1) currentPage.value = 1
      else load()
    })
    watch([currentPage, customerPaymentPage, filterValue, yearFilter, monthFilter, startDate, endDate], () => { selected.value = []; load() })

    const formatLedgerCell = (col: string, value: any) => {
      if (props.page === 'customer') {
        if (col === 'amount_in') return formatCustomerReceivableDisplay(value)
        if (col === 'amount_out') return formatCustomerReceivedDisplay(value)
        if (col === 'balance') return formatCustomerBalanceDisplay(value).text
      }
      return formatCell(col, value)
    }

    const renderRowCells = (row: any, columnKeys: string[]) => columnKeys.map((c: string) => c === 'attachments'
      ? h('td', [
        row.attachment_count
          ? h('button', { type: 'button', class: 'table-image-thumb', onClick: (event: MouseEvent) => { event.stopPropagation(); openAttachments(row) }, title: props.t('viewImages') }, [
            row.attachment_thumb ? h('img', { src: row.attachment_thumb, alt: props.t('images') }) : h('span', props.t('images')),
            h('b', row.attachment_count),
          ])
          : h('span', { class: 'muted tiny' }, props.t('noImages'))
      ])
      : h('td', { class: amountClass(c) }, formatLedgerCell(c, row[c])))

    const renderActionCell = (row: any) => h('td', { class: 'action-cell sticky-action-col' }, [
      h(VBtn, { size: 'small', variant: 'text', color: 'primary', onClick: (event: MouseEvent) => { event.stopPropagation(); openEdit(row) } }, () => props.t('edit')),
      h(VBtn, { size: 'small', variant: 'text', color: 'error', onClick: (event: MouseEvent) => { event.stopPropagation(); remove(row.id) } }, () => props.t('delete')),
    ])

    const renderLedgerTableCard = (options: {
      title: string
      subtitle?: string
      headerAction?: any
      tableRows: any[]
      columnKeys: string[]
      totalCount: number
      page: number
      pageSize: number
      onPageChange: (v: number) => void
      withSelect?: boolean
      emptyAction?: () => any
    }) => h(VCard, { class: ['data-card', 'table-card', options.title ? '' : 'table-card--flat'], style: options.title ? 'margin-bottom: 12px' : 'margin-bottom: 0; box-shadow: none !important; border: 0 !important' }, () => [
      options.title || options.subtitle || options.headerAction
        ? h('div', { class: 'page-header page-header--compact', style: 'padding: 10px 12px 0; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px' }, [
          h('div', [
            options.title ? h('div', { class: 'drawer-title' }, options.title) : null,
            options.subtitle ? h('div', { class: 'muted tiny' }, options.subtitle) : null,
          ]),
          options.headerAction || null,
        ])
        : null,
      h('div', { class: 'table-scroll' }, [
        h(VTable, { class: 'ledger-table', hover: true }, () => [
          h('thead', [h('tr', [
            options.withSelect
              ? h('th', { class: 'select-col' }, [h('button', { type: 'button', class: ['table-check', { checked: isPageAllSelected.value }], title: '全选当前页', onClick: (event: MouseEvent) => { event.stopPropagation(); toggleAll(!isPageAllSelected.value) } }, isPageAllSelected.value ? h('svg', { viewBox: '0 0 24 24', class: 'table-check-icon', 'aria-hidden': 'true' }, [h('path', { d: 'M9.2 16.6 4.9 12.3l-1.4 1.4 5.7 5.7L20.8 7.8l-1.4-1.4z' })]) : null)])
              : null,
            ...options.columnKeys.map((c: string) => h('th', props.t(ledgerColumnLabel(c, config.value.table)))),
            h('th', { class: 'sticky-action-col' }, props.t('action')),
          ])]),
          h('tbody', loading.value
            ? [h('tr', [h('td', { colspan: options.columnKeys.length + (options.withSelect ? 2 : 1), class: 'empty-cell' }, '加载中...')])]
            : options.tableRows.length
              ? options.tableRows.map(row => h('tr', {
                key: row.id,
                class: options.withSelect ? ['selectable-row', { selected: selected.value.includes(row.id) }] : undefined,
                onClick: options.withSelect ? () => toggleRowSelection(row.id) : undefined,
              }, [
                options.withSelect
                  ? h('td', { class: 'select-cell' }, [h('button', {
                    type: 'button',
                    class: ['table-check', { checked: selected.value.includes(row.id) }],
                    title: '选择此行',
                    onClick: (event: MouseEvent) => {
                      event.stopPropagation()
                      toggleRowSelection(row.id)
                    },
                  }, selected.value.includes(row.id) ? h('svg', { viewBox: '0 0 24 24', class: 'table-check-icon', 'aria-hidden': 'true' }, [h('path', { d: 'M9.2 16.6 4.9 12.3l-1.4 1.4 5.7 5.7L20.8 7.8l-1.4-1.4z' })]) : null)])
                  : null,
                ...renderRowCells(row, options.columnKeys),
                renderActionCell(row),
              ]))
              : [h('tr', [h('td', { colspan: options.columnKeys.length + (options.withSelect ? 2 : 1), class: 'empty-cell ledger-empty-cell' }, [
                h('span', '暂无记录'),
                options.emptyAction ? h('div', { class: 'ledger-empty-cell__action' }, options.emptyAction()) : null,
              ])])]),
        ]),
      ]),
      h('div', { class: 'table-footer' }, [
        h('span', `${props.t('total', { count: options.totalCount })} · 每页 ${options.pageSize} 条`),
        h(VPagination, {
          modelValue: options.page,
          'onUpdate:modelValue': options.onPageChange,
          length: Math.max(1, Math.ceil(options.totalCount / options.pageSize)),
          density: 'comfortable',
          size: 'small',
          totalVisible: 7,
        }),
      ]),
    ])

    return () => h('div', { class: 'page-wrap ledger-page' }, [
      h(PageHeader, { title: props.t(config.value.title), subtitle: props.t(`${config.value.title}Sub`) }, {
        actions: () => h('div', { class: 'header-toolbar' }, [
          config.value.filterField ? h(VSelect, {
            modelValue: props.page === 'customer' ? (customerDetailDialog.value ? customerDetailName.value : null) : filterValue.value,
            'onUpdate:modelValue': (v: string) => {
              if (props.page === 'customer') {
                if (v) openCustomerWorkspace(v)
                else closeCustomerWorkspace()
                return
              }
              filterValue.value = v || ''
              resetSelection()
              load()
            },
            items: filterOptions.value,
            label: props.t(config.value.filterLabel),
            clearable: true,
            density: 'compact',
            hideDetails: true,
            class: 'toolbar-input header-toolbar-input',
          }) : null,
          h(VSelect, { modelValue: yearFilter.value, 'onUpdate:modelValue': (v: string) => { yearFilter.value = v || ''; resetSelection() }, items: years, label: props.t('filterYear'), clearable: true, density: 'compact', hideDetails: true, class: 'toolbar-input header-toolbar-input' }),
          h(VSelect, { modelValue: monthFilter.value, 'onUpdate:modelValue': (v: string) => { monthFilter.value = v || ''; resetSelection() }, items: months, label: props.t('filterMonth'), clearable: true, density: 'compact', hideDetails: true, class: 'toolbar-input header-toolbar-input' }),
          h(VTextField, { modelValue: startDate.value, 'onUpdate:modelValue': (v: string) => { startDate.value = v || ''; resetSelection() }, label: props.t('filterStartDate'), type: 'date', density: 'compact', hideDetails: true, class: 'toolbar-input header-toolbar-input' }),
          h(VTextField, { modelValue: endDate.value, 'onUpdate:modelValue': (v: string) => { endDate.value = v || ''; resetSelection() }, label: props.t('filterEndDate'), type: 'date', density: 'compact', hideDetails: true, class: 'toolbar-input header-toolbar-input' }),
          h(VTextField, { modelValue: keyword.value, 'onUpdate:modelValue': (v: string) => { keyword.value = v; resetSelection() }, label: props.t(config.value.search), density: 'compact', hideDetails: true, class: 'toolbar-input header-toolbar-input' }),
          h(VBtn, { variant: 'text', size: 'small', onClick: resetFilters }, () => props.t('resetFilters')),
          h(VBtn, { variant: 'tonal', size: 'small', loading: exporting.value, onClick: exportRows }, () => props.t('export')),
          props.page === 'stockOut'
            ? h(VBtn, {
              variant: 'tonal',
              size: 'small',
              title: selected.value.length ? props.t('printSlip') : props.t('selectRowsToPrint'),
              loading: printLoading.value,
              onClick: openPrintPreview,
            }, () => selected.value.length ? `${props.t('printSlip')}(${selected.value.length})` : props.t('printSlip'))
            : null,
          props.page === 'customer'
            ? h(VBtn, { variant: 'tonal', size: 'small', onClick: openCustomerCreate }, () => props.t('addCustomer'))
            : null,
          props.page === 'customer'
            ? null
            : props.page === 'cash'
              ? h(VBtn, { color: 'primary', size: 'small', onClick: () => openAdd() }, () => props.t('addRecord'))
              : h(VBtn, { color: 'primary', size: 'small', onClick: () => openAdd() }, () => props.t('add')),
        ]),
      }),
      (() => {
        const stats = renderLedgerStats(props.page, summary.value, props.t, {
          onOpeningBalanceClick: openCustomerProfile,
        })
        if (stats.length && props.page !== 'customer') {
          return h('div', { class: 'stat-grid' }, stats)
        }
        if (props.page === 'customer' && Array.isArray(summary.value) && summary.value.length) {
          return h(VCard, { class: 'data-card table-card', style: 'margin-bottom: 12px' }, () => [
            h('div', { class: 'page-header page-header--compact customer-overview-head', style: 'padding: 12px 16px 0' }, [
              h('div', [
                h('div', { class: 'drawer-title' }, props.t('customerOverview')),
                h('div', { class: 'muted tiny' }, props.t('customerOverviewSub')),
              ]),
              h('div', { class: 'customer-overview-head__actions' }, [
                h(VBtn, { size: 'x-small', variant: 'tonal', onClick: openCustomerCreate }, () => props.t('addCustomer')),
              ]),
            ]),
            h('div', { class: 'table-scroll' }, [
              h(VTable, { class: 'ledger-table customer-overview-table', hover: true }, () => [
                h('thead', [h('tr', [
                  h('th', props.t('customerName')),
                  h('th', props.t('openingBalance')),
                  h('th', props.t('customerReceivable')),
                  h('th', props.t('customerReceived')),
                  h('th', { class: 'customer-balance-col' }, [
                    h('div', { class: 'customer-balance-col-head' }, props.t('customerBalanceColumn')),
                    h('div', { class: 'customer-balance-col-legend' }, [
                      h('span', { class: 'customer-balance-tag customer-balance-tag--debt' }, props.t('customerDebtTag')),
                      h('span', { class: 'customer-balance-tag customer-balance-tag--credit' }, props.t('customerOverpaidTag')),
                    ]),
                  ]),
                  h('th', { class: 'sticky-action-col customer-overview-action-col' }, props.t('action')),
                ])]),
                h('tbody', summary.value.map((row: any) => h('tr', {
                  key: row.customer_name,
                  class: 'customer-overview-row',
                  onClick: () => openCustomerWorkspace(row.customer_name),
                }, [
                  h('td', { class: 'customer-name-cell customer-overview-name' }, row.customer_name),
                  h('td', { class: customerOverviewAmountClass('opening', row.openingBalance) }, formatCell('amount_in', row.openingBalance)),
                  h('td', { class: customerOverviewAmountClass('in', row.totalIn) }, formatCustomerReceivableDisplay(row.totalIn)),
                  h('td', { class: customerOverviewAmountClass('out', row.totalOut) }, formatCustomerReceivedDisplay(row.totalOut)),
                  h('td', { class: customerOverviewAmountClass('balance', row.currentBalance) }, renderCustomerBalanceCell(row.currentBalance, props.t)),
                  h('td', {
                    class: 'action-cell customer-overview-actions sticky-action-col customer-overview-action-col',
                    onClick: (event: MouseEvent) => event.stopPropagation(),
                  }, [
                    renderOverviewActionLink('台账', () => openCustomerWorkspace(row.customer_name)),
                    renderOverviewActionLink(props.t('deleteCustomer'), () => removeCustomer(row.customer_name), { danger: true }),
                  ]),
                ]))),
              ]),
            ]),
          ])
        }
        if (props.page === 'customer' && Array.isArray(summary.value) && !summary.value.length && !loading.value) {
          return h(VCard, { class: 'data-card table-card' }, () => [
            h('div', { class: 'empty-cell', style: 'padding: 48px 24px' }, '暂无客户往来数据'),
          ])
        }
        return null
      })(),
      props.page !== 'customer' ? h(VCard, { class: 'data-card table-card' }, () => [
        h('div', { class: 'table-scroll' }, [
          h(VTable, { class: 'ledger-table', hover: true }, () => [
            h('thead', [h('tr', [h('th', { class: 'select-col' }, [h('button', { type: 'button', class: ['table-check', { checked: isPageAllSelected.value }], title: '全选当前页', onClick: (event: MouseEvent) => { event.stopPropagation(); toggleAll(!isPageAllSelected.value) } }, isPageAllSelected.value ? h('svg', { viewBox: '0 0 24 24', class: 'table-check-icon', 'aria-hidden': 'true' }, [h('path', { d: 'M9.2 16.6 4.9 12.3l-1.4 1.4 5.7 5.7L20.8 7.8l-1.4-1.4z' })]) : null)]), ...displayColumns.value.map((c: string) => h('th', props.t(ledgerColumnLabel(c, config.value.table)))), h('th', { class: 'sticky-action-col' }, props.t('action'))])]),
            h('tbody', loading.value ? [h('tr', [h('td', { colspan: displayColumns.value.length + 2, class: 'empty-cell' }, '加载中...')])] : rows.value.map(row => h('tr', {
              key: row.id,
              class: ['selectable-row', { selected: selected.value.includes(row.id) }],
              onClick: () => toggleRowSelection(row.id),
            }, [
              h('td', { class: 'select-cell' }, [h('button', {
                type: 'button',
                class: ['table-check', { checked: selected.value.includes(row.id) }],
                title: '选择此行',
                onClick: (event: MouseEvent) => {
                  event.stopPropagation()
                  toggleRowSelection(row.id)
                },
              }, selected.value.includes(row.id) ? h('svg', { viewBox: '0 0 24 24', class: 'table-check-icon', 'aria-hidden': 'true' }, [h('path', { d: 'M9.2 16.6 4.9 12.3l-1.4 1.4 5.7 5.7L20.8 7.8l-1.4-1.4z' })]) : null)]),
              ...renderRowCells(row, displayColumns.value),
              renderActionCell(row),
            ]))),
          ]),
        ]),
        h('div', { class: 'table-footer' }, [
          h('span', `${props.t('total', { count: total.value })} · 每页 ${config.value.pageSize} 条`),
          h(VPagination, { modelValue: currentPage.value, 'onUpdate:modelValue': (v: number) => currentPage.value = v, length: Math.max(1, Math.ceil(total.value / config.value.pageSize)), density: 'comfortable', size: 'small', totalVisible: 7 }),
        ]),
      ]) : null,
      RecordDialogShell({
        show: customerCreateDialog.value,
        maxWidth: 480,
        title: props.t('addCustomer'),
        subtitle: props.t('addCustomerSub'),
        cancelLabel: props.t('cancel'),
        saveLabel: props.t('save'),
        onClose: () => { customerCreateDialog.value = false },
        onSave: saveCustomerCreate,
        default: () => [
          h('div', { class: 'record-dialog__section' }, [
            h('div', { class: 'record-dialog__grid' }, [
              h('div', { class: 'record-dialog__field record-dialog__field--full' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: customerCreateForm.customer_name,
                  'onUpdate:modelValue': (v: string) => { customerCreateForm.customer_name = v },
                  label: props.t('customerName'),
                  autofocus: true,
                }),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--full' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: customerCreateForm.opening_balance,
                  'onUpdate:modelValue': (v: any) => { customerCreateForm.opening_balance = Number(v || 0) },
                  label: props.t('openingBalance'),
                  type: 'number',
                  step: 'any',
                }),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--full' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: customerCreateForm.note,
                  'onUpdate:modelValue': (v: string) => { customerCreateForm.note = v },
                  label: props.t('note'),
                }),
              ]),
            ]),
          ]),
        ],
      }),
      RecordDialogShell({
        show: customerPickDialog.value,
        maxWidth: 420,
        title: props.t(customerPickMode.value === 'payment' ? 'addCustomerPayment' : 'addCustomerSale'),
        subtitle: props.t('customerPickSub'),
        cancelLabel: props.t('cancel'),
        saveLabel: props.t('save'),
        onClose: () => { customerPickDialog.value = false },
        onSave: confirmCustomerPick,
        default: () => [
          h('div', { class: 'record-dialog__section' }, [
            h('div', { class: 'record-dialog__grid' }, [
              h('div', { class: 'record-dialog__field record-dialog__field--full' }, [
                h(VSelect, {
                  ...commonFormFieldProps(),
                  modelValue: customerPickName.value,
                  'onUpdate:modelValue': (v: string) => { customerPickName.value = v || '' },
                  items: filterOptions.value,
                  label: props.t('filterCustomer'),
                }),
              ]),
            ]),
          ]),
        ],
      }),
      h(VDialog, {
        modelValue: customerDetailDialog.value,
        'onUpdate:modelValue': (v: boolean) => { if (!v) closeCustomerWorkspace() },
        maxWidth: 1180,
        class: 'customer-workspace-dialog-wrap',
      }, () => h(VCard, { class: 'customer-workspace-dialog' }, [
        h('div', { class: 'customer-workspace-dialog__head' }, [
          h('div', { class: 'drawer-title' }, `${props.t('customerWorkspaceTitle')} · ${customerDetailName.value}`),
          h('div', { class: 'customer-workspace-dialog__actions' }, [
            h(VBtn, { size: 'small', variant: 'tonal', color: 'error', onClick: () => removeCustomer(customerDetailName.value) }, () => props.t('deleteCustomer')),
            h(VBtn, { size: 'small', variant: 'text', onClick: closeCustomerWorkspace }, () => props.t('cancel')),
          ]),
        ]),
        h(VCardText, { class: 'customer-workspace-dialog__body' }, [
          renderCustomerWorkspaceSummary(customerDetailSummary.value, props.t, {
            onOpeningBalanceClick: openCustomerProfile,
          }),
          customerPaymentRows.value.some((row: any) => !String(row.date || '').trim())
            ? h(VAlert, { type: 'info', variant: 'tonal', density: 'compact' }, () => props.t('customerPaymentMissingDateHint', {
              count: customerPaymentRows.value.filter((row: any) => !String(row.date || '').trim()).length,
            }))
            : null,
          h('div', { class: 'customer-workspace-tabs', role: 'tablist' }, [
            h('button', {
              type: 'button',
              role: 'tab',
              class: ['customer-workspace-tab', { active: customerDetailTab.value === 'sale' }],
              'aria-selected': customerDetailTab.value === 'sale',
              onClick: () => { customerDetailTab.value = 'sale' },
            }, `${props.t('customerSaleDetail')} (${total.value})`),
            h('button', {
              type: 'button',
              role: 'tab',
              class: ['customer-workspace-tab', { active: customerDetailTab.value === 'payment' }],
              'aria-selected': customerDetailTab.value === 'payment',
              onClick: () => { customerDetailTab.value = 'payment' },
            }, `${props.t('customerPaymentDetail')} (${customerPaymentTotal.value})`),
          ]),
          customerDetailTab.value === 'sale'
            ? renderLedgerTableCard({
              title: '',
              tableRows: rows.value,
              columnKeys: [...customerSaleColumnKeys, 'attachments'],
              totalCount: total.value,
              page: currentPage.value,
              pageSize: config.value.pageSize,
              onPageChange: (v: number) => { currentPage.value = v },
              withSelect: true,
              emptyAction: () => h(VBtn, { size: 'small', variant: 'tonal', onClick: () => openAdd('sale') }, () => props.t('addCustomerSale')),
            })
            : renderLedgerTableCard({
              title: '',
              subtitle: props.t('customerPaymentDetailSub'),
              tableRows: customerPaymentRows.value,
              columnKeys: customerPaymentColumnKeys,
              totalCount: customerPaymentTotal.value,
              page: customerPaymentPage.value,
              pageSize: customerPaymentPageSize,
              onPageChange: (v: number) => { customerPaymentPage.value = v },
              emptyAction: () => h(VBtn, { size: 'small', color: 'primary', onClick: () => openAdd('payment') }, () => props.t('addCustomerPayment')),
            }),
        ]),
        h('div', { class: 'customer-workspace-dialog__footer' }, [
          h(VBtn, { size: 'small', variant: 'tonal', onClick: () => openAdd('sale') }, () => props.t('addCustomerSale')),
          h(VBtn, { size: 'small', color: 'primary', onClick: () => openAdd('payment') }, () => props.t('addCustomerPayment')),
        ]),
      ])),
      RecordDialogShell({
        show: dialog.value,
        maxWidth: ledgerDialogWidths[props.page] || 720,
        zIndex: customerDetailDialog.value ? 2800 : 2400,
        title: editing.value
          ? props.t('edit')
          : props.page === 'customer'
            ? props.t(customerEntryMode.value === 'payment' ? 'addCustomerPayment' : 'addCustomerSale')
            : (props.page === 'cash' ? props.t('addRecord') : props.t('add')),
        subtitle: editing.value
          ? props.t('formEditHint')
          : (props.page === 'customer' && customerEntryMode.value === 'payment'
            ? props.t('customerPaymentFormHint')
            : props.t('formAddHint')),
        cancelLabel: props.t('cancel'),
        saveLabel: props.t('save'),
        onClose: closeRecordDialog,
        onSave: save,
        default: () => [
          ...getFormSections(props.page, config.value.fields, customerEntryMode.value).map(section => h('div', { class: 'record-dialog__section', key: section.titleKey }, [
            h('div', { class: 'record-dialog__section-title' }, props.t(section.titleKey)),
            h('div', { class: 'record-dialog__grid' }, section.fields.map(field => renderRecordFormField(field, {
              form,
              config: config.value,
              filterOptions: filterOptions.value,
              inventoryOptions: inventoryOptions.value,
              productOptions: productOptions.value,
              lockedCustomerName: customerDetailName.value || filterValue.value,
              t: props.t,
            }))),
          ])),
          h('div', { class: 'record-dialog__section' }, [
            h('div', { class: 'record-dialog__section-title' }, props.t('formSectionAttachments')),
            h('div', { class: 'form-image-section' }, [
              h('div', { class: 'form-image-section__head' }, [
                h('div', [
                  h('div', { class: 'muted tiny' }, editing.value ? '移除图片后需点击保存才会真正删除；也可继续补充上传。' : '新增记录时可先选图片，保存后自动压缩关联。'),
                ]),
                h(VBtn, { variant: 'tonal', size: 'small', loading: attachmentLoading.value, onClick: choosePendingAttachments }, () => props.t('chooseImage')),
              ]),
              displayAttachments.value.length || pendingAttachments.value.length
                ? h('div', { class: 'image-preview-grid compact' }, [
                  ...displayAttachments.value.map((item: any) => renderAttachmentPreviewCard(item, {
                    key: `old-${item.id}`,
                    onRemove: () => stageAttachmentRemoval(item.id),
                  })),
                  ...pendingAttachments.value.map((item: any, index: number) => renderAttachmentPreviewCard(item, {
                    key: `pending-${index}-${item.filePath}`,
                    pending: true,
                    onRemove: () => removePendingAttachment(index),
                  })),
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
        saveLabel: props.t('save'),
        onClose: closeAttachmentDialog,
        onSave: saveAttachmentChanges,
        footerExtra: h(VBtn, { color: 'primary', variant: 'tonal', loading: attachmentLoading.value, onClick: addAttachment }, () => props.t('addImage')),
        default: () => [
          attachmentLoading.value
            ? h('div', { class: 'empty-cell' }, '加载中...')
            : displayAttachments.value.length
              ? h('div', { class: 'image-preview-grid' }, displayAttachments.value.map((item: any) => renderAttachmentPreviewCard(item, {
                key: String(item.id),
                onRemove: () => stageAttachmentRemoval(item.id),
              })))
              : h('div', { class: 'empty-image-state' }, props.t('noImages')),
        ],
      }),
      RecordDialogShell({
        show: customerProfileDialog.value,
        maxWidth: 520,
        title: `${props.t('customerProfile')} · ${activeCustomerName() || ''}`,
        subtitle: props.t('customerProfileSub'),
        cancelLabel: props.t('cancel'),
        saveLabel: props.t('save'),
        onClose: () => { customerProfileDialog.value = false },
        onSave: saveCustomerProfile,
        default: () => [
          h('div', { class: 'record-dialog__section' }, [
            h('div', { class: 'record-dialog__grid' }, [
              h('div', { class: 'record-dialog__field record-dialog__field--full' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: customerProfileForm.opening_balance,
                  'onUpdate:modelValue': (v: any) => { customerProfileForm.opening_balance = Number(v || 0) },
                  label: props.t('openingBalance'),
                  type: 'number',
                  step: 'any',
                }),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--full' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: customerProfileForm.note,
                  'onUpdate:modelValue': (v: string) => { customerProfileForm.note = v },
                  label: props.t('note'),
                }),
              ]),
            ]),
          ]),
        ],
      }),
      h(VDialog, { modelValue: Boolean(imagePreview.value), 'onUpdate:modelValue': (v: boolean) => { if (!v) closeImagePreview() }, maxWidth: 1180 }, () => h(VCard, { class: 'image-zoom-dialog' }, [
        h('div', { class: 'image-zoom-dialog__head' }, [
          h('div', { class: 'image-zoom-dialog__title' }, imagePreview.value?.fileName || props.t('images')),
          h(VBtn, { variant: 'text', onClick: closeImagePreview }, () => props.t('cancel')),
        ]),
        imagePreview.value?.dataUrl
          ? h('img', { class: 'image-zoom-dialog__img', src: imagePreview.value.dataUrl, alt: imagePreview.value.fileName || props.t('images') })
          : null,
      ])),
      props.page === 'stockOut' ? h(VDialog, { modelValue: printDialog.value, 'onUpdate:modelValue': (v: boolean) => printDialog.value = v, maxWidth: 980, scrollable: true }, () => h(VCard, { class: 'pa-5 print-dialog-card' }, [
        h(VCardTitle, props.t('printPreview')),
        h(VCardText, [
          h(VAlert, { type: 'info', variant: 'tonal', density: 'compact', class: 'mb-3' }, () => `已选择 ${selected.value.length} 条出库记录，将合并生成一张单据。金属材料建议使用「${props.t('templateMetal')}」。`),
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
            h('p', { class: 'muted tiny mb-3' }, '金属材料单默认 241×140mm 横版，适合材质/规格/重量类出库；普通销售单 210×140mm。偏移可在试打后微调。'),
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

function renderLedgerStats(pageKey: string, summary: any, tFn: any, hooks: { onOpeningBalanceClick?: () => void } = {}) {
  if (pageKey === 'cash') {
    return [
      h(StatCard, { title: tFn('totalIncome'), value: summary.totalIncome || 0, color: 'success' }),
      h(StatCard, { title: tFn('totalExpense'), value: summary.totalExpense || 0, color: 'error' }),
      h(StatCard, { title: tFn('currentSurplus'), value: summary.lastBalance || 0, color: 'primary' }),
    ]
  }
  if (pageKey === 'bank' || pageKey === 'bills') {
    return [
      h(StatCard, { title: tFn('totalIn'), value: summary.totalIn || 0, color: 'success' }),
      h(StatCard, { title: tFn('totalOut'), value: summary.totalOut || 0, color: 'error' }),
      h(StatCard, { title: tFn('currentSurplus'), value: summary.lastBalance || 0, color: 'primary' }),
    ]
  }
  if (pageKey === 'customer') {
    if (!summary?.customer_name) return []
    return [
      h(StatCard, {
        title: tFn('openingBalance'),
        value: summary.openingBalance || 0,
        color: 'secondary',
        compact: true,
        clickable: Boolean(hooks.onOpeningBalanceClick),
        onClick: hooks.onOpeningBalanceClick,
      }),
      h(StatCard, { title: tFn('customerReceivable'), value: Math.abs(Number(summary.totalIn || 0)), color: 'error', compact: true }),
      h(StatCard, { title: tFn('customerReceived'), value: summary.totalOut || 0, color: 'success', compact: true }),
      h(StatCard, {
        title: tFn(formatCustomerBalanceDisplay(summary.currentBalance || 0).labelKey),
        value: formatCustomerBalanceDisplay(summary.currentBalance || 0).text,
        color: formatCustomerBalanceDisplay(summary.currentBalance || 0).color,
        compact: true,
      }),
    ]
  }
  if (pageKey === 'stockIn' || pageKey === 'stockOut') return [
    h(StatCard, { title: tFn('totalRecords'), value: summary.totalRecords || 0, color: 'primary' }),
    h(StatCard, { title: tFn('totalQuantity'), value: summary.totalQuantity || 0, color: 'success' }),
    h(StatCard, { title: tFn('totalAmount'), value: summary.totalAmount || 0, color: 'warning' }),
  ]
  return [h(StatCard, { title: tFn('totalIn'), value: summary.totalIn || 0, color: 'success' }), h(StatCard, { title: tFn('totalOut'), value: summary.totalOut || 0, color: 'error' }), h(StatCard, { title: tFn('netAmount'), value: (summary.totalIn || 0) - (summary.totalOut || 0), color: 'primary' })]
}

function renderCustomerWorkspaceSummary(
  summary: any,
  tFn: (key: string, params?: any) => string,
  hooks: { onOpeningBalanceClick?: () => void } = {},
) {
  if (!summary?.customer_name) return null
  const balanceInfo = formatCustomerBalanceDisplay(summary.currentBalance || 0)
  const items = [
    { labelKey: 'openingBalance', text: formatCell('amount_in', summary.openingBalance || 0), color: 'secondary', clickable: Boolean(hooks.onOpeningBalanceClick), onClick: hooks.onOpeningBalanceClick },
    { labelKey: 'customerReceivable', text: formatCustomerReceivableDisplay(summary.totalIn || 0), color: 'error' },
    { labelKey: 'customerReceived', text: formatCustomerReceivedDisplay(summary.totalOut || 0), color: 'success' },
    { labelKey: balanceInfo.labelKey, text: balanceInfo.text, color: balanceInfo.color },
  ]
  const summaryEl = h('div', { class: 'customer-workspace-summary' }, items.map(item => {
    const inner = [
      h('span', { class: 'customer-workspace-summary__label' }, tFn(item.labelKey)),
      h('span', { class: `customer-workspace-summary__value text-${item.color}` }, item.text),
    ]
    if (item.clickable && item.onClick) {
      return h('button', {
        type: 'button',
        class: 'customer-workspace-summary__item customer-workspace-summary__item--clickable',
        key: item.labelKey,
        onClick: item.onClick,
      }, inner)
    }
    return h('div', { class: 'customer-workspace-summary__item', key: item.labelKey }, inner)
  }))
  return h('div', { class: 'customer-workspace-summary-wrap' }, [
    summaryEl,
    h('div', { class: 'customer-workspace-summary-hint muted tiny' }, tFn('customerWorkspaceSummaryHint')),
  ])
}

function columnLabel(col: string) {
  return ({
    amount_in: 'amountIn', amount_out: 'amountOut', customer_name: 'customerName', supplier_name: 'supplierName',
    doc_no: 'docNo', contract_no: 'contractNo', product_name: 'productName', unit_price: 'unitPrice',
    tax_rate: 'taxRate', tax_amount: 'taxAmount', invoice_amount: 'invoiceAmount',
    total_in: 'totalInQuantity', total_out: 'totalOutQuantity', stock_qty: 'stockQty',
    default_price: 'defaultPrice', available_qty: 'availableQty',
    month_label: 'date', attachments: 'images',
  } as any)[col] || col
}

function ledgerColumnLabel(col: string, table?: string) {
  if (table === 'customer') {
    if (col === 'amount_in') return 'customerReceivable'
    if (col === 'amount_out') return 'customerReceived'
    if (col === 'balance') return 'customerBalance'
  }
  return columnLabel(col)
}
function inventoryOptionTitle(item: any) {
  if (!item || typeof item !== 'object') return String(item || '')
  const spec = item.spec ? ` / ${item.spec}` : ''
  const unit = item.unit ? ` ${item.unit}` : ''
  return `${item.product_name}${spec} · 库存 ${money(item.stock_qty)}${unit}`
}
function productOptionTitle(item: any) {
  if (!item || typeof item !== 'object') return String(item || '')
  const spec = item.spec ? ` / ${item.spec}` : ''
  const unit = item.unit ? ` ${item.unit}` : ''
  const price = Number(item.default_price || 0) ? ` · 默认单价 ${money(item.default_price)}` : ''
  return `${item.product_name}${spec}${unit}${price}`
}
function productComboboxFilter(titleFn: (item: any) => string) {
  return (_value: string, query: string, item: any) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    const raw = item?.raw ?? item
    if (typeof raw === 'string') return raw.toLowerCase().includes(q)
    return titleFn(raw).toLowerCase().includes(q)
  }
}
function productComboboxSlots(form: any, titleFn: (item: any) => string) {
  return {
    selection: ({ item }: any) => {
      const raw = item?.raw ?? item
      if (raw && typeof raw === 'object') return String(raw.product_name || '')
      return String(form.product_name || raw || '')
    },
    item: ({ props: listItemProps, item }: any) => h(VListItem, {
      ...listItemProps,
      title: titleFn(item?.raw ?? item),
    }),
  }
}
function roundMoneyValue(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100
}
function autoFillAmountFields(form: any, changedKey: string) {
  if (['quantity', 'unit_price'].includes(changedKey)) {
    if ('amount' in form) form.amount = roundMoneyValue(Number(form.quantity || 0) * Number(form.unit_price || 0))
    if ('amount_in' in form && !('amount' in form)) {
      form.amount_in = roundMoneyValue(Number(form.quantity || 0) * Number(form.unit_price || 0))
    }
  }
  if (changedKey === 'amount' && Number(form.quantity || 0) > 0 && Number(form.unit_price || 0) === 0) {
    form.unit_price = roundMoneyValue(Number(form.amount || 0) / Number(form.quantity || 1))
  }
  if (changedKey === 'amount' && Number(form.unit_price || 0) > 0 && Number(form.quantity || 0) === 0) {
    form.quantity = roundMoneyValue(Number(form.amount || 0) / Number(form.unit_price || 1))
  }
  if (['quantity', 'unit_price', 'amount', 'tax_rate'].includes(changedKey) && 'tax_rate' in form) {
    const rateValue = Number(form.tax_rate || 0)
    const rate = rateValue > 1 ? rateValue / 100 : rateValue
    form.tax_amount = roundMoneyValue(Number(form.amount || 0) * rate)
    form.invoice_amount = roundMoneyValue(Number(form.amount || 0) + Number(form.tax_amount || 0))
  }
  if (changedKey === 'tax_amount' && 'invoice_amount' in form) {
    form.invoice_amount = roundMoneyValue(Number(form.amount || 0) + Number(form.tax_amount || 0))
  }
  if (changedKey === 'invoice_amount' && 'tax_amount' in form) {
    form.tax_amount = roundMoneyValue(Number(form.invoice_amount || 0) - Number(form.amount || 0))
  }
}
function numericField(field: string) { return ['income', 'expense', 'amount_in', 'amount_out', 'balance', 'quantity', 'unit_price', 'amount', 'tax_rate', 'tax_amount', 'invoice_amount', 'total_in', 'total_out', 'stock_qty', 'default_price', 'available_qty'].includes(field) }
function amountClass(col: string) { return numericField(col) ? 'amount-cell' : '' }
function formatCell(col: string, value: any) { return numericField(col) ? (Number(value || 0) ? money(value) : '—') : (value || '') }

function formatCustomerReceivableDisplay(value: any) {
  const amount = Number(value || 0)
  if (!amount) return '—'
  return money(Math.abs(amount))
}

function formatCustomerReceivedDisplay(value: any) {
  const amount = Number(value || 0)
  if (!amount) return '—'
  return money(Math.abs(amount))
}

function formatCustomerBalanceDisplay(value: any) {
  const balance = Number(value || 0)
  if (Math.abs(balance) < 0.005) {
    return { labelKey: 'customerBalance', text: money(0), color: 'secondary' }
  }
  if (balance > 0) {
    return { labelKey: 'customerBalance', text: money(balance), color: 'error' }
  }
  return { labelKey: 'customerOverpaid', text: money(Math.abs(balance)), color: 'success' }
}

function renderCustomerBalanceCell(balance: any, t: (key: string) => string) {
  const amount = Number(balance || 0)
  if (Math.abs(amount) < 0.005) {
    return h('span', { class: 'customer-balance-cell customer-balance-cell--zero' }, money(0))
  }
  const isDebt = amount > 0
  const info = formatCustomerBalanceDisplay(balance)
  return h('span', { class: 'customer-balance-cell' }, [
    h('span', {
      class: isDebt ? 'customer-balance-tag customer-balance-tag--debt' : 'customer-balance-tag customer-balance-tag--credit',
    }, t(isDebt ? 'customerDebtTag' : 'customerOverpaidTag')),
    h('span', {
      class: isDebt ? 'customer-balance-amount customer-balance-amount--debt' : 'customer-balance-amount customer-balance-amount--credit',
    }, info.text),
  ])
}

function customerOverviewAmountClass(kind: 'opening' | 'in' | 'out' | 'balance', value: any) {
  const amount = Number(value || 0)
  const base = 'amount-cell customer-overview-amount'
  if (kind === 'balance') {
    if (amount > 0) return `${base} customer-overview-amount--debt`
    if (amount < 0) return `${base} customer-overview-amount--credit`
    return `${base} customer-overview-amount--zero`
  }
  if (!amount) return `${base} customer-overview-amount--empty`
  if (kind === 'opening') return `${base} customer-overview-amount--opening`
  if (kind === 'in') return `${base} customer-overview-amount--receivable-signed`
  return `${base} customer-overview-amount--received-signed`
}

function commonFormFieldProps() {
  return { variant: 'outlined' as const, density: 'comfortable' as const, hideDetails: 'auto' as const, color: 'primary' as const }
}

function normalizeFormField(field: FormFieldSpec) {
  return typeof field === 'string' ? { key: field, span: (field === 'note' || field === 'description') ? 'full' as const : 'half' as const } : { key: field.key, span: field.span || ((field.key === 'note' || field.key === 'description') ? 'full' as const : 'half' as const) }
}

function getFormSections(pageKey: string, fields: string[], customerEntryMode: 'sale' | 'payment' = 'sale'): FormSectionSpec[] {
  if (pageKey === 'customer') return formSections[customerEntryMode === 'payment' ? 'customerPayment' : 'customer'] || formSections.customer
  if (formSections[pageKey]) return formSections[pageKey]
  return [{ titleKey: 'formSectionBasic', fields: fields.map(key => ({ key, span: (key === 'note' || key === 'description') ? 'full' : 'half' })) }]
}

function renderRecordFormField(
  field: FormFieldSpec,
  ctx: { form: any; config: any; filterOptions: string[]; inventoryOptions?: any[]; productOptions?: any[]; lockedCustomerName?: string; t: (key: string, params?: any) => string },
) {
  const { key, span } = normalizeFormField(field)
  const { form, config, filterOptions, inventoryOptions = [], productOptions = [], lockedCustomerName = '', t } = ctx
  const wrapClass = `record-dialog__field record-dialog__field--${span === 'full' ? 'full' : 'half'}`
  const base = commonFormFieldProps()

  if (config.filterKey && key === config.filterKey && lockedCustomerName) {
    return h('div', { class: wrapClass, key }, [
      h(VTextField, {
        ...base,
        modelValue: lockedCustomerName,
        label: t(ledgerColumnLabel(key, config.table)),
        readonly: true,
      }),
    ])
  }

  if (config.filterKey && key === config.filterKey) {
    return h('div', { class: wrapClass, key }, [
      h(VCombobox, {
        ...base,
        modelValue: form[key],
        'onUpdate:modelValue': (v: any) => { form[key] = v },
        items: filterOptions,
        label: t(ledgerColumnLabel(key, config.table)),
        placeholder: t(key === 'supplier_name' ? 'typeSupplierName' : 'typeCustomerName'),
        clearable: true,
        hideNoData: true,
      }),
    ])
  }

  if (config.table === 'stockIn' && key === 'product_name') {
    const selected = productOptions.find(item =>
      item.product_name === form.product_name &&
      (item.spec || '') === (form.spec || '') &&
      (item.unit || '') === (form.unit || '')
    ) || form.product_name || null
    return h('div', { class: wrapClass, key }, [
      h(VCombobox, {
        ...base,
        modelValue: selected,
        'onUpdate:modelValue': (v: any) => {
          if (v && typeof v === 'object') {
            form.product_name = v.product_name
            form.spec = v.spec || ''
            form.unit = v.unit || ''
            if (v.category) form.category = v.category
            if (Number(v.default_price || 0) > 0) {
              form.unit_price = Number(v.default_price || 0)
              autoFillAmountFields(form, 'unit_price')
            }
          } else {
            form.product_name = String(v || '')
          }
        },
        items: productOptions,
        itemTitle: 'product_name',
        customFilter: productComboboxFilter(productOptionTitle),
        label: t(ledgerColumnLabel(key, config.table)),
        placeholder: t('typeProductName'),
        returnObject: true,
        clearable: true,
        hideNoData: false,
      }, productComboboxSlots(form, productOptionTitle)),
    ])
  }

  if (config.table === 'stockOut' && key === 'product_name') {
    const selected = inventoryOptions.find(item =>
      item.product_name === form.product_name &&
      (item.spec || '') === (form.spec || '') &&
      (item.unit || '') === (form.unit || '')
    ) || form.product_name || null
    return h('div', { class: wrapClass, key }, [
      h(VCombobox, {
        ...base,
        modelValue: selected,
        'onUpdate:modelValue': (v: any) => {
          if (v && typeof v === 'object') {
            form.product_name = v.product_name
            form.spec = v.spec || ''
            form.unit = v.unit || ''
          } else {
            form.product_name = String(v || '')
          }
        },
        items: inventoryOptions,
        itemTitle: 'product_name',
        customFilter: productComboboxFilter(inventoryOptionTitle),
        label: t(ledgerColumnLabel(key, config.table)),
        placeholder: t('selectInventoryProduct'),
        returnObject: true,
        clearable: true,
        hideNoData: false,
      }, productComboboxSlots(form, inventoryOptionTitle)),
    ])
  }

  if (key === 'note' || key === 'description') {
    return h('div', { class: 'record-dialog__field record-dialog__field--full', key }, [
      h(VTextarea, {
        ...base,
        modelValue: form[key],
        'onUpdate:modelValue': (v: any) => { form[key] = v },
        label: t(ledgerColumnLabel(key, config.table)),
        rows: key === 'note' ? 3 : 2,
        autoGrow: true,
      }),
    ])
  }

  if (key === 'date') {
    return h('div', { class: wrapClass, key }, [
      h(VTextField, {
        ...base,
        modelValue: normalizeDateValue(form[key]),
        'onUpdate:modelValue': (v: any) => {
          form[key] = normalizeDateValue(v)
        },
        label: t(ledgerColumnLabel(key, config.table)),
        type: 'date',
      }),
    ])
  }

  const isAutoCalcAmount = (key === 'amount_in' && config.table === 'customer')
    || (key === 'amount' && (config.table === 'stockIn' || config.table === 'stockOut'))
  if (isAutoCalcAmount) {
    const calcValue = roundMoneyValue(Number(form.quantity || 0) * Number(form.unit_price || 0))
    return h('div', { class: wrapClass, key }, [
      h(VTextField, {
        ...base,
        modelValue: calcValue,
        label: t(ledgerColumnLabel(key, config.table)),
        type: 'number',
        readonly: true,
        hint: t('amountAutoCalc'),
        persistentHint: true,
      }),
    ])
  }

  return h('div', { class: wrapClass, key }, [
    h(VTextField, {
      ...base,
      modelValue: form[key],
      'onUpdate:modelValue': (v: any) => {
        form[key] = numericField(key) ? Number(v || 0) : v
        autoFillAmountFields(form, key)
      },
      label: t(ledgerColumnLabel(key, config.table)),
      type: numericField(key) ? 'number' : 'text',
      readonly: key === 'month_label',
      ...(numericField(key) ? { step: 'any' } : {}),
    }),
  ])
}

function RecordDialogShell(props: {
  show: boolean
  maxWidth?: number
  zIndex?: number
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
    zIndex: props.zIndex || 2400,
    class: props.zIndex && props.zIndex > 2500 ? 'record-dialog-overlay--elevated' : undefined,
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
  name: 'ImportPage',
  props: { t: { type: Function, required: true } },
  emits: ['notify'],
  setup(props, { emit }) {
    const loading = ref(false)
    const stockLoading = ref(false)
    const restoring = ref(false)
    const savingPackage = ref(false)
    const exporting = ref(false)
    const legacyOpen = ref(false)
    const result = ref<any>(null)
    const stockResult = ref<any>(null)
    const error = ref('')
    const stockError = ref('')
    const backups = ref<any[]>([])
    const cloudConfig = reactive({ accessKey: '', secretKey: '', bucket: '', domain: '', prefix: '' })
    const cloudStatus = ref<any>(null)
    const cloudSectionReady = ref(false)
    const cloudSaving = ref(false)
    const cloudTesting = ref(false)
    const cloudUploading = ref(false)
    const cloudDownloading = ref(false)
    const cloudProgressDialog = ref(false)
    const cloudProgress = reactive({
      mode: 'upload' as 'upload' | 'download',
      phase: 'preparing' as 'preparing' | 'transferring' | 'applying' | 'done',
      current: 0,
      total: 0,
      file: '',
      message: '',
    })
    let cloudProgressTimer: ReturnType<typeof setTimeout> | null = null
    let offCloudProgress: (() => void) | null = null
    const cloudProgressPercent = computed(() => {
      if (cloudProgress.phase === 'done') return 100
      if (!cloudProgress.total) return 0
      return Math.min(100, Math.round((cloudProgress.current / cloudProgress.total) * 100))
    })
    const beginCloudProgress = (mode: 'upload' | 'download') => {
      if (cloudProgressTimer) {
        clearTimeout(cloudProgressTimer)
        cloudProgressTimer = null
      }
      cloudProgress.mode = mode
      cloudProgress.phase = 'preparing'
      cloudProgress.current = 0
      cloudProgress.total = 0
      cloudProgress.file = ''
      cloudProgress.message = mode === 'upload' ? '正在准备上传…' : '正在准备恢复…'
      cloudProgressDialog.value = true
    }
    const handleCloudProgress = (progress: any) => {
      cloudProgress.mode = progress?.mode === 'download' ? 'download' : 'upload'
      cloudProgress.phase = progress?.phase || 'preparing'
      cloudProgress.current = Number(progress?.current || 0)
      cloudProgress.total = Number(progress?.total || 0)
      cloudProgress.file = String(progress?.file || '')
      cloudProgress.message = String(progress?.message || '')
      cloudProgressDialog.value = true
    }
    const finishCloudProgress = () => {
      if (cloudProgressTimer) clearTimeout(cloudProgressTimer)
      cloudProgressTimer = setTimeout(() => {
        cloudProgressDialog.value = false
        cloudProgressTimer = null
      }, 700)
    }
    const loadCloudConfig = async () => {
      try {
        const config = await cloudAPI.getConfig()
        cloudConfig.accessKey = config?.accessKey || ''
        cloudConfig.bucket = config?.bucket || ''
        cloudConfig.domain = config?.domain || ''
        cloudConfig.prefix = config?.prefix || ''
        cloudConfig.secretKey = ''
      } catch {
        cloudConfig.accessKey = ''
        cloudConfig.bucket = ''
        cloudConfig.domain = ''
        cloudConfig.prefix = ''
        cloudConfig.secretKey = ''
      } finally {
        cloudSectionReady.value = true
      }
    }
    const refreshCloudStatus = async () => {
      try {
        cloudStatus.value = await cloudAPI.status()
      } catch {
        cloudStatus.value = null
      }
    }
    const loadInfo = async () => {
      backups.value = await systemAPI.backupsList()
      await loadCloudConfig()
      void refreshCloudStatus()
    }
    const saveCloudConfig = async () => {
      cloudSaving.value = true
      try {
        const payload: any = {
          accessKey: cloudConfig.accessKey,
          bucket: cloudConfig.bucket,
          domain: cloudConfig.domain,
          prefix: cloudConfig.prefix,
        }
        if (cloudConfig.secretKey) payload.secretKey = cloudConfig.secretKey
        const result = await cloudAPI.saveConfig(payload)
        if (!result?.ok) {
          emit('notify', result?.error || props.t('cloudSaveConfig'), 'error')
          return
        }
        cloudConfig.secretKey = ''
        cloudStatus.value = await cloudAPI.status()
        emit('notify', props.t('cloudConfigSaved'))
      } finally {
        cloudSaving.value = false
      }
    }
    const testCloud = async () => {
      cloudTesting.value = true
      try {
        const result = await cloudAPI.test()
        if (result?.ok) {
          cloudStatus.value = await cloudAPI.status()
          emit('notify', props.t('cloudTestOk'))
        } else {
          emit('notify', result?.error || props.t('cloudTest'), 'error')
        }
      } finally {
        cloudTesting.value = false
      }
    }
    const notifyCloudSyncResult = (result: any, mode: 'upload' | 'download') => {
      if (!result?.ok) {
        if (!result?.canceled) emit('notify', result?.error || props.t('backupFailed'), 'error')
        return
      }
      const transferred = mode === 'upload' ? Number(result.uploaded || 0) : Number(result.downloaded || 0)
      const skipped = Number(result.skipped || 0)
      if (!transferred) {
        emit('notify', props.t('cloudSyncNoChange'))
      } else if (mode === 'upload') {
        emit('notify', props.t('cloudSyncUploadDone', { uploaded: transferred, skipped }))
      } else {
        emit('notify', props.t('cloudSyncDownloadDone', { downloaded: transferred, skipped }))
      }
    }
    const cloudSyncUpload = async () => {
      beginCloudProgress('upload')
      cloudUploading.value = true
      try {
        const result = await cloudAPI.syncUpload()
        notifyCloudSyncResult(result, 'upload')
        cloudStatus.value = await cloudAPI.status()
      } finally {
        cloudUploading.value = false
        finishCloudProgress()
      }
    }
    const cloudSyncDownload = async () => {
      cloudDownloading.value = true
      try {
        const result = await cloudAPI.syncDownload()
        if (result?.canceled) return
        notifyCloudSyncResult(result, 'download')
        if (result?.ok && (result.downloaded || 0) > 0) {
          await loadInfo()
        } else {
          cloudStatus.value = await cloudAPI.status()
        }
      } finally {
        cloudDownloading.value = false
        finishCloudProgress()
      }
    }
    const cloudStatusText = computed(() => {
      const status = cloudStatus.value
      if (!status?.configured) return props.t('cloudDesc')
      if (!status.remoteFileCount) return props.t('cloudStatusEmpty')
      const time = status.remoteUpdatedAt ? formatBackupTime('cloud', status.remoteUpdatedAt) : '—'
      return props.t('cloudStatusLine', {
        local: status.localFileCount || 0,
        remote: status.remoteFileCount || 0,
        time,
      })
    })
    const importExcel = async () => {
      const ok = await askConfirm({ message: t('confirmImportLedger'), confirmColor: 'warning' })
      if (!ok) return
      const file = await importAPI.pickFile()
      if (!file) return
      loading.value = true
      error.value = ''
      result.value = null
      const r = await importAPI.excel(file)
      loading.value = false
      if (r.ok) {
        result.value = r.imported
        emit('notify', props.t('importDone'))
      } else {
        error.value = r.error || props.t('importFailed')
        emit('notify', props.t('importFailed'), 'error')
      }
    }
    const importStockIn = async () => {
      const ok = await askConfirm({ message: t('confirmImportStockIn'), confirmColor: 'warning' })
      if (!ok) return
      const file = await importAPI.pickFile()
      if (!file) return
      stockLoading.value = true
      stockError.value = ''
      stockResult.value = null
      const r = await importAPI.stockIn(file)
      stockLoading.value = false
      if (r.ok) {
        stockResult.value = r.imported
        emit('notify', props.t('importStockInDone'))
      } else {
        stockError.value = r.error || props.t('importFailed')
        emit('notify', props.t('importFailed'), 'error')
      }
    }
    const restoreFromPackage = async () => {
      const ok = await askConfirm({
        title: t('confirmBackupRestoreTitle'),
        message: t('confirmBackupRestoreMessage'),
        confirmColor: 'error',
        confirmLabel: t('restoreThisBackup'),
      })
      if (!ok) return
      const file = await systemAPI.pickBackupPackage()
      if (!file) return
      restoring.value = true
      try {
        const r = await systemAPI.restoreBackup(file)
        if (r?.ok) emit('notify', props.t('restoreDone'))
        else if (!r?.canceled) emit('notify', r?.error || props.t('restoreFailed'), 'error')
      } finally {
        restoring.value = false
      }
    }
    const restoreFromFolder = async () => {
      const ok = await askConfirm({
        title: t('confirmBackupRestoreTitle'),
        message: t('confirmBackupRestoreMessage'),
        confirmColor: 'error',
        confirmLabel: t('restoreThisBackup'),
      })
      if (!ok) return
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
      const ok = await askConfirm({
        title: t('confirmBackupRestoreTitle'),
        message: t('confirmBackupRestoreByName', { name }),
        confirmColor: 'error',
        confirmLabel: t('restoreThisBackup'),
      })
      if (!ok) return
      restoring.value = true
      try {
        const r = await systemAPI.restoreBackupByName(name)
        if (r?.ok) emit('notify', props.t('restoreDone'))
        else if (!r?.canceled) emit('notify', r?.error || props.t('restoreFailed'), 'error')
      } finally {
        restoring.value = false
      }
    }
    const saveBackupPackage = async (name: string) => {
      savingPackage.value = true
      try {
        const r = await systemAPI.exportBackupPackage(name)
        if (r?.ok) emit('notify', props.t('saveBackupPackageDone'))
        else if (!r?.canceled) emit('notify', r?.error || props.t('saveBackupPackageFailed'), 'error')
      } finally {
        savingPackage.value = false
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
    onMounted(() => {
      void loadInfo()
      offCloudProgress = cloudAPI.onSyncProgress(handleCloudProgress)
    })
    onActivated(() => {
      if (!cloudSectionReady.value) return
      void systemAPI.backupsList().then(list => { backups.value = list })
      void refreshCloudStatus()
    })
    onBeforeUnmount(() => {
      offCloudProgress?.()
      if (cloudProgressTimer) clearTimeout(cloudProgressTimer)
    })
    return () => h('div', { class: 'page-wrap narrow data-mgmt-page' }, [
      h(PageHeader, { title: props.t('dataMgmtTitle'), subtitle: props.t('dataMgmtSub') }),

      h(VCard, { class: 'content-card migrate-card mb-4' }, () => [
        h('h4', { class: 'migrate-title' }, props.t('migrateTitle')),
        h('ol', { class: 'migrate-steps' }, [
          h('li', props.t('migrateStep1')),
          h('li', props.t('migrateStep2')),
          h('li', props.t('migrateStep3')),
        ]),
      ]),

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
            h('div', { class: 'data-action-buttons' }, [
              h(VBtn, { color: 'primary', size: 'large', loading: restoring.value, onClick: restoreFromPackage }, () => props.t('pickBackupPackage')),
              h(VBtn, { variant: 'text', disabled: restoring.value, onClick: restoreFromFolder }, () => props.t('pickBackupFolder')),
            ]),
          ]),
          h('div', { class: 'backup-history' }, [
            h('div', { class: 'backup-history-title' }, props.t('recentBackups')),
            backups.value.length
              ? backups.value.slice(0, 5).map(b => h('div', { class: 'backup-history-item', key: b.name }, [
                h('span', { class: 'backup-history-time' }, formatBackupTime(b.name, b.time)),
                h('div', { class: 'backup-history-actions' }, [
                  h('span', { class: 'backup-history-meta' }, formatBackupSize(b.size)),
                  h(VBtn, { size: 'small', variant: 'text', color: 'primary', disabled: restoring.value, onClick: () => restoreByName(b.name) }, () => props.t('restoreThisBackup')),
                  h(VBtn, { size: 'small', variant: 'text', disabled: savingPackage.value, onClick: () => saveBackupPackage(b.name) }, () => props.t('saveBackupPackage')),
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
            h('div', { class: 'data-action-buttons' }, [
              h(VBtn, { color: 'primary', size: 'large', onClick: backup }, () => props.t('backupNow')),
              backups.value[0]
                ? h(VBtn, { variant: 'outlined', loading: savingPackage.value, onClick: () => saveBackupPackage(backups.value[0].name) }, () => props.t('saveBackupPackage'))
                : null,
            ]),
          ]),
        ]),
      ]),

      h('section', { class: 'data-section' }, [
        h('h3', { class: 'data-section-title' }, props.t('cloudSection')),
        h(VCard, { class: 'content-card data-action-card data-action-card-wide' }, () => [
          h('div', { class: 'data-action-row data-action-row-stack' }, [
            h('div', { class: 'data-action-main' }, [
              h('div', { class: 'data-action-icon' }, '☁️'),
              h('div', [
                h('h4', { class: 'data-action-title' }, props.t('cloudTitle')),
                h('p', { class: 'data-action-copy' }, cloudStatusText.value),
              ]),
            ]),
            cloudSectionReady.value
              ? h('div', { class: 'cloud-config-grid' }, [
                h(VTextField, { modelValue: cloudConfig.accessKey, 'onUpdate:modelValue': (v: string) => { cloudConfig.accessKey = v }, label: props.t('cloudAccessKey'), density: 'compact', hideDetails: true }),
                h(VTextField, {
                  modelValue: cloudConfig.secretKey,
                  'onUpdate:modelValue': (v: string) => { cloudConfig.secretKey = v },
                  label: props.t('cloudSecretKey'),
                  type: 'password',
                  density: 'compact',
                  hideDetails: true,
                  placeholder: cloudStatus.value?.configured ? '已保存，留空则不修改' : '请填写 SecretKey',
                }),
                h(VTextField, { modelValue: cloudConfig.bucket, 'onUpdate:modelValue': (v: string) => { cloudConfig.bucket = v }, label: props.t('cloudBucket'), density: 'compact', hideDetails: true }),
                h(VTextField, { modelValue: cloudConfig.domain, 'onUpdate:modelValue': (v: string) => { cloudConfig.domain = v }, label: props.t('cloudDomain'), density: 'compact', hideDetails: true }),
                h(VTextField, { modelValue: cloudConfig.prefix, 'onUpdate:modelValue': (v: string) => { cloudConfig.prefix = v }, label: props.t('cloudPrefix'), density: 'compact', hideDetails: true }),
              ])
              : h('div', { class: 'cloud-config-loading muted tiny' }, '正在读取云配置…'),
            cloudSectionReady.value ? h('div', { class: 'data-action-buttons' }, [
              h(VBtn, { variant: 'outlined', loading: cloudSaving.value, onClick: saveCloudConfig }, () => props.t('cloudSaveConfig')),
              h(VBtn, { variant: 'tonal', loading: cloudTesting.value, onClick: testCloud }, () => props.t('cloudTest')),
              h(VBtn, { color: 'primary', loading: cloudUploading.value, onClick: cloudSyncUpload }, () => props.t('cloudSyncUpload')),
              h(VBtn, { color: 'error', variant: 'tonal', loading: cloudDownloading.value, onClick: cloudSyncDownload }, () => props.t('cloudSyncDownload')),
            ]) : null,
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

      h(VDialog, {
        modelValue: cloudProgressDialog.value,
        persistent: true,
        maxWidth: 480,
      }, () => h(VCard, { class: 'record-dialog' }, [
        h('div', { class: 'record-dialog__header' }, [
          h('div', [
            h('h2', { class: 'record-dialog__title' }, props.t(cloudProgress.mode === 'upload' ? 'cloudSyncProgressTitleUpload' : 'cloudSyncProgressTitleDownload')),
            h('p', { class: 'record-dialog__subtitle' }, cloudProgress.message || '…'),
          ]),
        ]),
        h(VCardText, { class: 'record-dialog__body' }, [
          cloudProgress.total > 0 && cloudProgress.phase !== 'preparing'
            ? h(VProgressLinear, {
              modelValue: cloudProgressPercent.value,
              color: 'primary',
              height: 8,
              rounded: true,
            })
            : h(VProgressLinear, {
              indeterminate: true,
              color: 'primary',
              height: 8,
              rounded: true,
            }),
          cloudProgress.file
            ? h('p', { class: 'muted tiny mt-2 cloud-progress-file' }, cloudProgress.file)
            : null,
          cloudProgress.total > 0
            ? h('p', { class: 'muted tiny mt-1' }, `${cloudProgress.current}/${cloudProgress.total}`)
            : null,
        ]),
      ])),
    ])
  },
})

const TrashPage = defineComponent({
  props: { t: { type: Function, required: true } },
  emits: ['notify'],
  setup(props, { emit }) {
    const data = ref<any>({})
    const tab = ref('cash_ledger')
    const keyword = ref('')
    const startDate = ref('')
    const endDate = ref('')
    const deletedStartDate = ref('')
    const deletedEndDate = ref('')
    const load = async () => data.value = await systemAPI.trashAll({
      keyword: keyword.value,
      startDate: startDate.value,
      endDate: endDate.value,
      deletedStartDate: deletedStartDate.value,
      deletedEndDate: deletedEndDate.value,
    })
    const resetFilters = () => {
      keyword.value = ''
      startDate.value = ''
      endDate.value = ''
      deletedStartDate.value = ''
      deletedEndDate.value = ''
      load()
    }
    const restore = async (table: string, id: number) => {
      const ok = await askConfirm({
        title: t('confirmRestoreTitle'),
        message: t('confirmRestoreMessage'),
        confirmLabel: t('restore'),
      })
      if (!ok) return
      const apis: any = { cash_ledger: cashAPI, bank_ledger: bankAPI, acceptance_bills: billsAPI, customer_ledger: customerAPI, stock_in_ledger: stockInAPI, stock_out_ledger: stockOutAPI }
      await apis[table]?.restore(id)
      emit('notify', props.t('restored'))
      load()
    }
    watch([keyword, startDate, endDate, deletedStartDate, deletedEndDate], load)
    onMounted(load)
    const tabs = [{ key: 'cash_ledger', label: 'cash' }, { key: 'bank_ledger', label: 'bank' }, { key: 'acceptance_bills', label: 'bills' }, { key: 'customer_ledger', label: 'customer' }, { key: 'stock_in_ledger', label: 'stockIn' }, { key: 'stock_out_ledger', label: 'stockOut' }]
    return () => h('div', { class: 'page-wrap ledger-page' }, [
      h(PageHeader, { title: props.t('trash') }, {
        actions: () => h('div', { class: 'header-toolbar' }, [
          h(VTextField, { modelValue: startDate.value, 'onUpdate:modelValue': (v: string) => { startDate.value = v || '' }, label: props.t('filterStartDate'), type: 'date', density: 'compact', hideDetails: true, class: 'toolbar-input header-toolbar-input' }),
          h(VTextField, { modelValue: endDate.value, 'onUpdate:modelValue': (v: string) => { endDate.value = v || '' }, label: props.t('filterEndDate'), type: 'date', density: 'compact', hideDetails: true, class: 'toolbar-input header-toolbar-input' }),
          h(VTextField, { modelValue: deletedStartDate.value, 'onUpdate:modelValue': (v: string) => { deletedStartDate.value = v || '' }, label: props.t('filterDeletedStartDate'), type: 'date', density: 'compact', hideDetails: true, class: 'toolbar-input header-toolbar-input' }),
          h(VTextField, { modelValue: deletedEndDate.value, 'onUpdate:modelValue': (v: string) => { deletedEndDate.value = v || '' }, label: props.t('filterDeletedEndDate'), type: 'date', density: 'compact', hideDetails: true, class: 'toolbar-input header-toolbar-input' }),
          h(VTextField, { modelValue: keyword.value, 'onUpdate:modelValue': (v: string) => { keyword.value = v }, label: props.t('search'), density: 'compact', hideDetails: true, class: 'toolbar-input header-toolbar-input' }),
          h(VBtn, { variant: 'text', size: 'small', onClick: resetFilters }, () => props.t('resetFilters')),
        ]),
      }),
      h(VTabs, { modelValue: tab.value, 'onUpdate:modelValue': (v: string) => tab.value = v }, () => tabs.map(x => h(VTab, { value: x.key }, () => `${props.t(x.label)} (${(data.value[x.key] || []).length})`))),
      h(VCard, { class: 'data-card table-card utility-table-card' }, () => h('div', { class: 'table-scroll' }, [
        h(VTable, { class: 'ledger-table', hover: true }, () => [
          h('thead', [h('tr', [
            h('th', props.t('date')),
            h('th', props.t('description')),
            h('th', props.t('deletedAt')),
            h('th', { class: 'sticky-action-col' }, props.t('action')),
          ])]),
          h('tbody', (data.value[tab.value] || []).length
            ? (data.value[tab.value] || []).map((row: any) => h('tr', [h('td', row.date), h('td', row.description || row.customer_name || row.product_name || row.supplier_name), h('td', row.deleted_at), h('td', { class: 'action-cell sticky-action-col' }, [h(VBtn, { size: 'small', variant: 'text', color: 'primary', onClick: () => restore(tab.value, row.id) }, () => props.t('restore'))])]))
            : [h('tr', [h('td', { colspan: 4, class: 'empty-cell' }, '暂无删除记录')])]),
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
    const keyword = ref('')
    const tableName = ref('')
    const action = ref('')
    const startDate = ref('')
    const endDate = ref('')
    const moduleOptions = [
      { title: props.t('cash'), value: 'cash_ledger' },
      { title: props.t('bank'), value: 'bank_ledger' },
      { title: props.t('bills'), value: 'acceptance_bills' },
      { title: props.t('customer'), value: 'customer_ledger' },
      { title: props.t('stockIn'), value: 'stock_in_ledger' },
      { title: props.t('stockOut'), value: 'stock_out_ledger' },
    ]
    const actionOptions = ['INSERT', 'UPDATE', 'DELETE', 'RESTORE']
    const load = async () => {
      const r = await systemAPI.logs({
        page: currentPage.value,
        pageSize,
        keyword: keyword.value,
        tableName: tableName.value,
        action: action.value,
        startDate: startDate.value,
        endDate: endDate.value,
      })
      rows.value = r.rows
      total.value = r.total
    }
    const resetFilters = () => {
      keyword.value = ''
      tableName.value = ''
      action.value = ''
      startDate.value = ''
      endDate.value = ''
      currentPage.value = 1
      load()
    }
    watch([keyword, tableName, action, startDate, endDate], () => {
      if (currentPage.value !== 1) currentPage.value = 1
      else load()
    })
    watch(currentPage, load, { immediate: true })
    return () => h('div', { class: 'page-wrap ledger-page' }, [
      h(PageHeader, { title: props.t('logsTitle'), subtitle: props.t('logsPageSub') }, {
        actions: () => h('div', { class: 'header-toolbar' }, [
          h(VSelect, { modelValue: tableName.value, 'onUpdate:modelValue': (v: string) => { tableName.value = v || '' }, items: moduleOptions, label: props.t('filterModule'), clearable: true, density: 'compact', hideDetails: true, class: 'toolbar-input header-toolbar-input' }),
          h(VSelect, { modelValue: action.value, 'onUpdate:modelValue': (v: string) => { action.value = v || '' }, items: actionOptions, label: props.t('filterAction'), clearable: true, density: 'compact', hideDetails: true, class: 'toolbar-input header-toolbar-input' }),
          h(VTextField, { modelValue: startDate.value, 'onUpdate:modelValue': (v: string) => { startDate.value = v || '' }, label: props.t('filterStartDate'), type: 'date', density: 'compact', hideDetails: true, class: 'toolbar-input header-toolbar-input' }),
          h(VTextField, { modelValue: endDate.value, 'onUpdate:modelValue': (v: string) => { endDate.value = v || '' }, label: props.t('filterEndDate'), type: 'date', density: 'compact', hideDetails: true, class: 'toolbar-input header-toolbar-input' }),
          h(VTextField, { modelValue: keyword.value, 'onUpdate:modelValue': (v: string) => { keyword.value = v }, label: props.t('search'), density: 'compact', hideDetails: true, class: 'toolbar-input header-toolbar-input' }),
          h(VBtn, { variant: 'text', size: 'small', onClick: resetFilters }, () => props.t('resetFilters')),
        ]),
      }),
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
    type AiRole = 'system' | 'user' | 'assistant'
    interface AiChatMessage {
      role: AiRole
      content: string
    }
    interface AiAttachment {
      filePath: string
      fileName: string
      size?: number
      dataUrl?: string
      mime?: string
      kind?: 'image' | 'file'
    }
    interface AiSession {
      id: string
      title: string
      createdAt: string
      updatedAt: string
      model: string
      messages: AiChatMessage[]
    }

    const AI_SESSIONS_KEY = 'donghao-ai-sessions-v1'
    const DEFAULT_AI_MODEL = 'deepseek-ai/DeepSeek-V3'
    const MAX_CONTEXT_MESSAGES = 12
    const welcomeMessage: AiChatMessage = { role: 'assistant', content: '你好，我是 AI 助手。你可以问我账务分析、Excel 导入、对账思路或经营数据解读。' }
    const configured = ref<boolean | null>(null)
    const keyTail = ref('')
    const model = ref(DEFAULT_AI_MODEL)
    const input = ref('')
    const pendingAttachments = ref<AiAttachment[]>([])
    const loading = ref(false)
    const typing = ref(false)
    const sessions = ref<AiSession[]>([])
    const activeSessionId = ref('')
    const chatScrollRef = ref<any>(null)
    let typingTimer: ReturnType<typeof setTimeout> | null = null
    const modelOptions = [
      'deepseek-ai/DeepSeek-V3',
      'deepseek-ai/DeepSeek-R1',
      'Qwen/Qwen2.5-7B-Instruct',
      'Qwen/Qwen2.5-14B-Instruct',
      'Qwen/Qwen3-32B',
    ]
    const messages = ref<AiChatMessage[]>([{ ...welcomeMessage }])
    const activeSession = computed(() => sessions.value.find((session) => session.id === activeSessionId.value) || null)
    const aiBusy = computed(() => loading.value || typing.value)
    const toPlainMessages = (items: any[]): AiChatMessage[] => items
      .filter((message) => message && typeof message.content === 'string' && message.content.trim())
      .map((message) => ({
        role: message.role === 'assistant' || message.role === 'system' ? message.role : 'user',
        content: message.content.trim(),
      }))
    const contextMessages = (items: AiChatMessage[]) => toPlainMessages(items)
      .filter((message) => message.role !== 'system')
      .slice(-MAX_CONTEXT_MESSAGES)

    const sessionTitle = (items: AiChatMessage[]) => {
      const firstUserMessage = items.find((message) => message.role === 'user' && message.content.trim())
      return firstUserMessage?.content.trim().slice(0, 24) || '新会话'
    }

    const formatSessionTime = (value: string) => {
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return ''
      return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    }

    const formatFileSize = (value?: number) => {
      if (!value || value <= 0) return ''
      if (value < 1024) return `${value} B`
      if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
      return `${(value / 1024 / 1024).toFixed(1)} MB`
    }

    const attachmentSummary = (items: AiAttachment[]) => items
      .map((item, index) => `${index + 1}. ${item.fileName}${formatFileSize(item.size) ? ` (${formatFileSize(item.size)})` : ''}${item.kind === 'image' ? ' [图片]' : ' [文件]'}`)
      .join('\n')

    const persistSessions = () => {
      localStorage.setItem(AI_SESSIONS_KEY, JSON.stringify(sessions.value.slice(0, 30)))
    }

    const scrollChatToBottom = () => nextTick(() => {
      const el = chatScrollRef.value?.$el || chatScrollRef.value
      if (el) el.scrollTop = el.scrollHeight
    })

    const stopTypingTimer = () => {
      if (!typingTimer) return
      clearTimeout(typingTimer)
      typingTimer = null
    }

    const typeAssistantMessage = (baseMessages: AiChatMessage[], content: string) => {
      stopTypingTimer()
      typing.value = true
      let index = 0
      const finalText = content || 'AI 没有返回内容。'
      messages.value = [...baseMessages, { role: 'assistant', content: '' }]

      const tick = () => {
        const step = finalText.length > 400 ? 5 : finalText.length > 180 ? 3 : 2
        index = Math.min(finalText.length, index + step)
        messages.value = [...baseMessages, { role: 'assistant', content: finalText.slice(0, index) }]
        scrollChatToBottom()

        if (index >= finalText.length) {
          typing.value = false
          stopTypingTimer()
          saveActiveSession()
          return
        }

        typingTimer = setTimeout(tick, 12)
      }

      tick()
    }

    const createSession = () => {
      const now = new Date().toISOString()
      const session: AiSession = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        title: '新会话',
        createdAt: now,
        updatedAt: now,
        model: model.value || DEFAULT_AI_MODEL,
        messages: [{ ...welcomeMessage }],
      }
      sessions.value = [session, ...sessions.value].slice(0, 30)
      activeSessionId.value = session.id
      messages.value = session.messages.map((message) => ({ ...message }))
      model.value = session.model
      persistSessions()
      scrollChatToBottom()
    }

    const saveActiveSession = () => {
      const id = activeSessionId.value
      if (!id) return
      const index = sessions.value.findIndex((session) => session.id === id)
      if (index === -1) return
      const now = new Date().toISOString()
      const nextSession: AiSession = {
        ...sessions.value[index],
        title: sessionTitle(messages.value),
        updatedAt: now,
        model: model.value || DEFAULT_AI_MODEL,
        messages: messages.value.map((message) => ({ ...message })),
      }
      const nextSessions = [...sessions.value]
      nextSessions.splice(index, 1)
      sessions.value = [nextSession, ...nextSessions].slice(0, 30)
      persistSessions()
    }

    const loadSessions = () => {
      try {
        const raw = localStorage.getItem(AI_SESSIONS_KEY)
        const parsed = raw ? JSON.parse(raw) : []
        if (Array.isArray(parsed)) {
          sessions.value = parsed
            .filter((session) => session?.id && Array.isArray(session.messages))
            .map((session) => ({
              id: String(session.id),
              title: String(session.title || '新会话'),
              createdAt: String(session.createdAt || new Date().toISOString()),
              updatedAt: String(session.updatedAt || session.createdAt || new Date().toISOString()),
              model: String(session.model || DEFAULT_AI_MODEL),
              messages: toPlainMessages(session.messages),
            }))
            .slice(0, 30)
        }
      } catch {
        sessions.value = []
      }

      if (!sessions.value.length) {
        createSession()
        return
      }

      activeSessionId.value = sessions.value[0].id
      model.value = sessions.value[0].model || DEFAULT_AI_MODEL
      messages.value = sessions.value[0].messages.map((message) => ({ ...message }))
      scrollChatToBottom()
    }

    const selectSession = (id: string) => {
      if (aiBusy.value || id === activeSessionId.value) return
      saveActiveSession()
      const session = sessions.value.find((item) => item.id === id)
      if (!session) return
      activeSessionId.value = session.id
      model.value = session.model || DEFAULT_AI_MODEL
      messages.value = session.messages.map((message) => ({ ...message }))
      scrollChatToBottom()
    }

    const clearCurrentSession = async () => {
      if (aiBusy.value) return
      const ok = await askConfirm({ message: t('confirmClearAiSession'), confirmColor: 'warning' })
      if (!ok) return
      messages.value = [{ ...welcomeMessage }]
      saveActiveSession()
      emit('notify', '当前 AI 会话已清空')
      scrollChatToBottom()
    }

    const deleteSession = async (id: string) => {
      if (aiBusy.value) return
      const ok = await askConfirm({
        message: t('confirmDeleteAiSession'),
        confirmColor: 'error',
        confirmLabel: t('delete'),
      })
      if (!ok) return
      sessions.value = sessions.value.filter((session) => session.id !== id)
      if (activeSessionId.value === id) {
        if (sessions.value[0]) {
          activeSessionId.value = sessions.value[0].id
          model.value = sessions.value[0].model || DEFAULT_AI_MODEL
          messages.value = sessions.value[0].messages.map((message) => ({ ...message }))
        } else {
          createSession()
          return
        }
      }
      persistSessions()
      emit('notify', 'AI 会话记录已删除')
      scrollChatToBottom()
    }

    const chooseChatAttachments = async () => {
      if (aiBusy.value) return
      try {
        const picked = await attachmentAPI.pickChat()
        if (picked?.length) pendingAttachments.value = [...pendingAttachments.value, ...picked]
      } catch (error: any) {
        emit('notify', error?.message || '选择附件失败', 'error')
      }
    }

    const removeChatAttachment = (index: number) => {
      pendingAttachments.value = pendingAttachments.value.filter((_, itemIndex) => itemIndex !== index)
    }

    onMounted(async () => {
      loadSessions()
      try {
        const status = await aiAPI.status()
        configured.value = Boolean(status?.ok)
        keyTail.value = status?.keyTail || ''
        if (status?.model && !activeSession.value?.model) model.value = status.model
      } catch {
        configured.value = false
      }
    })

    onBeforeUnmount(() => {
      stopTypingTimer()
    })

    const send = async () => {
      const text = input.value.trim()
      const attachments = pendingAttachments.value
      if ((!text && !attachments.length) || aiBusy.value) return

      const userContent = [
        text || '请帮我看一下这些附件。',
        attachments.length ? `\n附件：\n${attachmentSummary(attachments)}` : '',
      ].join('').trim()
      const next = toPlainMessages([...messages.value, { role: 'user', content: userContent }])
      messages.value = next
      saveActiveSession()
      scrollChatToBottom()
      input.value = ''
      pendingAttachments.value = []
      loading.value = true

      try {
        const result = await aiAPI.chat({
          model: model.value,
          messages: [
            { role: 'system', content: '你是东昊账务系统里的 AI 助手。请用简洁中文回答。' },
            ...contextMessages(next),
          ],
        })

        if (!result?.ok) {
          const errorText = result?.error || 'AI 请求失败'
          emit('notify', errorText, 'error')
          messages.value = [...next, { role: 'assistant', content: errorText }]
          saveActiveSession()
          scrollChatToBottom()
          return
        }

        typeAssistantMessage(next, result.content)
      } catch (error: any) {
        const errorText = error?.message || 'AI 请求异常，请重启应用后再试。'
        emit('notify', errorText, 'error')
        messages.value = [...next, { role: 'assistant', content: errorText }]
        saveActiveSession()
        scrollChatToBottom()
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

    const iconSvg = (path: string) => h('svg', {
      class: 'chat-svg-icon',
      viewBox: '0 0 24 24',
      'aria-hidden': 'true',
    }, [h('path', { d: path })])

    return () => h('div', { class: props.compact ? 'ai-panel compact' : 'page-wrap ai-panel' }, [
      !props.compact ? h(PageHeader, { title: 'AI 助手', subtitle: 'SiliconFlow 账务问答和经营分析' }) : null,
      configured.value === false ? h(VAlert, { type: 'warning', class: 'mb-3' }, () => '还没有配置 SiliconFlow Key，请在 src/main/config/siliconflow.ts 中设置') : null,
      h('div', { class: 'ai-workspace' }, [
        h('aside', { class: 'ai-sidebar' }, [
          h('div', { class: 'ai-session-toolbar' }, [
            h(VBtn, { size: 'small', color: 'primary', variant: 'tonal', disabled: aiBusy.value, onClick: createSession }, () => '新会话'),
            h(VBtn, { size: 'small', variant: 'text', disabled: aiBusy.value, onClick: clearCurrentSession }, () => '清空'),
          ]),
          h('div', { class: 'ai-session-list' }, sessions.value.map((session) => h('button', {
            key: session.id,
            type: 'button',
            class: ['ai-session-item', { active: session.id === activeSessionId.value }],
            disabled: aiBusy.value,
            onClick: () => selectSession(session.id),
          }, [
            h('span', { class: 'ai-session-main' }, [
              h('span', { class: 'ai-session-title' }, session.title),
              h('span', { class: 'ai-session-meta' }, `${formatSessionTime(session.updatedAt)} · ${session.messages.filter((message) => message.role === 'user').length}问`),
            ]),
            h('span', {
              class: 'ai-session-delete',
              title: '删除记录',
              onClick: (event: MouseEvent) => {
                event.stopPropagation()
                deleteSession(session.id)
              },
            }, '×'),
          ]))),
        ]),
        h('section', { class: 'ai-chat-main' }, [
          h(VCard, { class: 'chat-card', ref: chatScrollRef }, () => h('div', { class: 'chat-messages' }, [
            ...messages.value.map((m, i) => {
              const isTypingMessage = typing.value && m.role === 'assistant' && i === messages.value.length - 1
              return h('div', { key: i, class: ['chat-bubble', m.role, { typing: isTypingMessage }] }, m.content || (isTypingMessage ? ' ' : ''))
            }),
            loading.value ? h('div', { class: 'chat-loading' }, 'AI 正在思考...') : null,
          ])),
          h('div', { class: 'ai-composer-shell' }, [
            h('div', { class: 'ai-model-bar' }, [
              h('span', { class: 'ai-model-chip', title: '当前模型' }, `⚙ ${model.value.split('/').at(-1) || model.value}`),
              h(VSelect, {
                modelValue: model.value,
                'onUpdate:modelValue': (v: string) => {
                  model.value = v || DEFAULT_AI_MODEL
                  saveActiveSession()
                },
                items: modelOptions,
                label: '模型',
                density: 'compact',
                hideDetails: true,
                disabled: aiBusy.value,
                class: 'ai-model-select',
              }),
            ]),
            h('div', { class: 'chat-input' }, [
              h('div', { class: 'chat-compose' }, [
                pendingAttachments.value.length ? h('div', { class: 'chat-attachment-list' }, pendingAttachments.value.map((item, index) => h('button', {
                  key: `${item.filePath}-${index}`,
                  type: 'button',
                  class: ['chat-attachment-chip', { image: item.kind === 'image' }],
                  title: '点击移除附件',
                  disabled: aiBusy.value,
                  onClick: () => removeChatAttachment(index),
                }, [
                  item.dataUrl ? h('img', { src: item.dataUrl, alt: item.fileName }) : h('span', { class: 'chat-attachment-icon' }, '📎'),
                  h('span', { class: 'chat-attachment-name' }, item.fileName),
                  h('span', { class: 'chat-attachment-remove' }, '×'),
                ]))) : null,
                h(VTextarea, {
                  modelValue: input.value,
                  'onUpdate:modelValue': (v: string) => input.value = v,
                  rows: props.compact ? 3 : 5,
                  autoGrow: true,
                  label: '输入问题',
                  placeholder: '回车发送，Shift+回车换行，可附带文件或图片',
                  disabled: aiBusy.value,
                  onKeydown: handleEnter,
                }),
              ]),
              h('div', { class: 'chat-actions' }, [
                h(VBtn, { icon: true, variant: 'tonal', disabled: aiBusy.value, title: '附件/图片', class: 'chat-icon-btn', onClick: chooseChatAttachments }, () => iconSvg('M16.5 6v11.5q0 2.08-1.46 3.54T11.5 22q-2.08 0-3.54-1.46T6.5 17V5q0-1.25.88-2.13T9.5 2q1.25 0 2.13.87T12.5 5v10.5q0 .42-.29.71t-.71.29q-.43 0-.71-.29t-.29-.71V5q0-.43-.29-.71T9.5 4q-.43 0-.71.29T8.5 5v12q0 1.25.88 2.13T11.5 20q1.25 0 2.13-.87t.87-2.13V6h2Z')),
                h(VBtn, { icon: true, color: 'primary', loading: loading.value, disabled: aiBusy.value || (!input.value.trim() && !pendingAttachments.value.length), title: '发送', class: 'chat-icon-btn send', onClick: send }, () => iconSvg('M11 20V7.83l-5.6 5.6L4 12l8-8 8 8-1.4 1.43-5.6-5.6V20h-2Z')),
              ]),
            ]),
          ]),
        ]),
      ]),
    ])
  },
})
</script>
