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

    <div v-else-if="cloudBootstrapBusy" class="fill-screen center cloud-bootstrap-screen">
      <div class="cloud-bootstrap-card">
        <v-progress-circular indeterminate color="primary" size="44" class="mb-4" />
        <div class="cloud-bootstrap-title">{{ t('cloudBootstrapTitle') }}</div>
        <p class="muted tiny">{{ cloudBootstrapMessage || t('cloudBootstrapSubtitle') }}</p>
        <v-progress-linear
          v-if="headerCloudProgress.total > 0 && headerCloudProgress.phase !== 'preparing'"
          :model-value="headerCloudProgressIndeterminate ? undefined : headerCloudProgressPercent"
          :indeterminate="headerCloudProgressIndeterminate"
          color="primary"
          height="8"
          rounded
          class="mt-4"
        />
        <p v-if="headerCloudProgress.file" class="muted tiny mt-2 cloud-progress-file">{{ headerCloudProgress.file }}</p>
        <v-btn
          variant="tonal"
          class="mt-4"
          :loading="cloudBootstrapCanceling"
          @click="cancelCloudBootstrap"
        >
          {{ t('cloudBootstrapCancel') }}
        </v-btn>
        <p class="muted tiny mt-2 cloud-bootstrap-cancel-hint">{{ t('cloudBootstrapCancelHint') }}</p>
      </div>
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
        <v-alert
          v-if="updateBannerVisible"
          class="update-banner"
          type="info"
          variant="tonal"
          density="comfortable"
          closable
          border="start"
          @click:close="snoozeUpdate"
        >
          <div class="update-banner__body">
            <div>
              <div class="update-banner__title">{{ t('updateBannerTitle', { version: updateState.version || '' }) }}</div>
              <p v-if="updateState.status === 'downloading'" class="muted tiny mb-0">{{ updateDownloadProgressText }}</p>
              <p v-else class="muted tiny mb-0">{{ t('updateBannerHint') }}</p>
            </div>
            <div class="update-banner__actions">
              <v-btn v-if="updateState.status === 'available'" size="small" color="primary" :loading="updateBusy" @click="downloadUpdatePackage">{{ t('updateDownload') }}</v-btn>
              <v-btn v-else-if="updateState.status === 'downloaded'" size="small" color="primary" @click="openUpdateDialog">{{ t('updateInstall') }}</v-btn>
              <v-btn size="small" variant="text" @click="snoozeUpdate">{{ t('updateSnooze') }}</v-btn>
            </div>
          </div>
        </v-alert>
        <DashboardPage v-if="page === 'dashboard'" :t="t" />
        <InventoryPage v-else-if="page === 'inventory'" :t="t" />
        <LedgerPage v-else-if="isLedgerPage" :page="page" :t="t" @notify="notify" />
        <template v-else-if="page === 'import'">
          <KeepAlive>
            <ImportPage :t="t" @notify="notify" />
          </KeepAlive>
        </template>
        <TrashPage v-else-if="page === 'trash'" :t="t" @notify="notify" />
        <LogsPage v-else-if="page === 'logs'" :t="t" @notify="notify" />
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
          <v-chip
            v-if="updateReadyChipVisible"
            size="small"
            color="primary"
            variant="flat"
            class="update-ready-chip"
            @click="openUpdateDialog"
          >
            {{ t('updateReadyChip') }}
          </v-chip>
          <v-btn icon size="small" variant="tonal" :title="t('changePassword')" @click="passwordDialog = true">🔒</v-btn>
        </div>
        <v-btn class="logout-compact" color="error" variant="tonal" size="small" :title="t('logout')" @click="handleLogout">
          <svg class="logout-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path fill="currentColor" d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.59L17 17l5-5-5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
          </svg>
        </v-btn>
      </v-card>
      <div class="ai-float" :class="{ open: aiFloatingOpen }">
        <div class="ai-float-actions">
          <v-btn class="ai-float-button" color="primary" :aria-expanded="aiFloatingOpen" @click="aiFloatingOpen = !aiFloatingOpen">
            <span class="ai-core">AI</span>
            <span>{{ aiFloatingOpen ? t('close') : t('ai') }}</span>
          </v-btn>
        </div>
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

    <v-dialog v-model="cloudStartupFailureDialog.show" max-width="520" persistent>
      <v-card class="record-dialog confirm-dialog">
        <div class="record-dialog__header">
          <div>
            <h2 class="record-dialog__title">{{ cloudStartupFailureDialog.title }}</h2>
            <p class="record-dialog__subtitle confirm-dialog__message">{{ cloudStartupFailureDialog.message }}</p>
          </div>
        </div>
        <div class="record-dialog__footer">
          <v-btn variant="text" @click="resolveCloudStartupFailure('continue')">{{ cloudStartupFailureDialog.continueLabel }}</v-btn>
          <v-btn variant="tonal" color="error" @click="resolveCloudStartupFailure('quit')">{{ cloudStartupFailureDialog.quitLabel }}</v-btn>
          <v-btn color="primary" @click="resolveCloudStartupFailure('retry')">{{ cloudStartupFailureDialog.retryLabel }}</v-btn>
        </div>
      </v-card>
    </v-dialog>

    <v-dialog v-model="passwordConfirmDialog.show" max-width="480" persistent>
      <v-card class="record-dialog confirm-dialog">
        <div class="record-dialog__header">
          <div>
            <h2 class="record-dialog__title">{{ passwordConfirmDialog.title }}</h2>
            <p class="record-dialog__subtitle confirm-dialog__message">{{ passwordConfirmDialog.message }}</p>
          </div>
        </div>
        <v-card-text class="record-dialog__body">
          <v-text-field
            v-model="passwordConfirmDialog.password"
            :label="t('password')"
            :placeholder="t('passwordPlaceholder')"
            type="password"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            autofocus
            @keyup.enter="resolvePasswordConfirm(true)"
          />
        </v-card-text>
        <div class="record-dialog__footer">
          <v-btn variant="text" @click="resolvePasswordConfirm(false)">{{ passwordConfirmDialog.cancelLabel }}</v-btn>
          <v-btn :color="passwordConfirmDialog.confirmColor" :loading="passwordConfirmDialog.loading" @click="resolvePasswordConfirm(true)">{{ passwordConfirmDialog.confirmLabel }}</v-btn>
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
          <v-alert v-else-if="updateState.platformMessage" type="info" variant="tonal" density="compact">{{ updateState.platformMessage }}</v-alert>
          <v-alert v-else-if="updateState.status === 'not-available'" type="success" variant="tonal" density="compact">
            {{ t('updateLatest', { version: updateState.currentVersion || appVersion }) }}
          </v-alert>
          <div v-else-if="updateState.status === 'available' || updateState.status === 'downloaded'">
            <p>{{ t('updateFound', { current: updateState.currentVersion || appVersion, latest: updateState.version }) }}</p>
            <div v-if="updateState.releaseNotes" class="update-release-notes" v-html="updateState.releaseNotes" />
          </div>
          <div v-else-if="updateState.status === 'downloading'">
            <v-progress-linear :model-value="updateState.percent || 0" color="primary" height="8" rounded />
            <p class="muted tiny mt-2">{{ updateDownloadProgressText }}</p>
          </div>
          <p v-else-if="updateState.status === 'checking'" class="muted">{{ t('updateChecking') }}</p>
        </v-card-text>
        <div class="record-dialog__footer">
          <v-btn variant="text" @click="closeUpdateDialog">{{ t('cancel') }}</v-btn>
          <v-btn v-if="updateState.status === 'available'" variant="text" @click="snoozeUpdate">{{ t('updateSnooze') }}</v-btn>
          <v-btn v-if="updateState.status === 'available'" color="primary" :loading="updateBusy" @click="downloadUpdatePackage">{{ t('updateDownload') }}</v-btn>
          <v-btn v-else-if="updateState.status === 'downloaded'" color="primary" @click="installUpdateNow">{{ t('updateInstall') }}</v-btn>
          <v-btn v-else-if="updateState.status === 'error' || updateState.status === 'not-available'" color="primary" :loading="updateBusy" @click="runUpdateCheck">{{ t('updateRetry') }}</v-btn>
        </div>
      </v-card>
    </v-dialog>

    <v-dialog v-model="headerCloudProgressDialog" persistent max-width="480">
      <v-card class="record-dialog">
        <div class="record-dialog__header">
          <div>
            <h2 class="record-dialog__title">{{ t(headerCloudProgress.mode === 'download' ? 'cloudSyncProgressTitleDownload' : 'cloudSyncProgressTitleUpload') }}</h2>
            <p class="record-dialog__subtitle">{{ headerCloudProgress.message || '…' }}</p>
          </div>
        </div>
        <v-card-text class="record-dialog__body">
          <v-progress-linear
            v-if="headerCloudProgress.total > 0 && headerCloudProgress.phase !== 'preparing'"
            :model-value="headerCloudProgressIndeterminate ? undefined : headerCloudProgressPercent"
            :indeterminate="headerCloudProgressIndeterminate"
            color="primary"
            height="8"
            rounded
          />
          <v-progress-linear v-else indeterminate color="primary" height="8" rounded />
          <p v-if="headerCloudProgress.file" class="muted tiny mt-2 cloud-progress-file">{{ headerCloudProgress.file }}</p>
          <p v-if="headerCloudProgress.total > 0" class="muted tiny mt-1">{{ headerCloudProgress.current }}/{{ headerCloudProgress.total }}</p>
        </v-card-text>
        <div v-if="headerCloudProgress.mode === 'download' && headerCloudSyncBusy" class="record-dialog__footer">
          <v-spacer />
          <v-btn variant="text" :loading="cloudBootstrapCanceling" @click="cancelCloudSync">{{ t('cloudSyncCancel') }}</v-btn>
        </div>
      </v-card>
    </v-dialog>

    <v-snackbar
      v-model="snackbar.show"
      class="app-snackbar"
      :color="snackbar.color"
      timeout="2600"
      location="top"
      :z-index="4000"
    >{{ snackbar.text }}</v-snackbar>
  </v-app>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, nextTick, onActivated, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { buildCustomerDescription, calcCustomerReceivableRemaining, calcCustomerReceivableSettlement, customerLedgerFinancialFieldsLocked, getCustomerLedgerRowActions, isCustomerPaymentDescription, isCustomerPaymentRecord, isCustomerReceivableRecord, isCustomerReturnRecord, listCustomerLedgerLinkedToReceivable, parseCustomerDescription, sortCustomerLedgerGrouped } from '../../common/customer-ledger'
import { getStockInKind, getStockInProductDisplay, getStockInQuantityDisplay, getStockInSpecDisplay, getStockInSupplierDisplay, getStockInUnitDisplay, getStockInUnitPriceDisplay } from '../../common/stock-in-display'
import { buildSupplierDescription, calcSupplierPayableRemaining, getSupplierLedgerRowActions, isSupplierPayableRecord, isSupplierPaymentDescription, isSupplierPaymentRecord, isSupplierReturnRecord, isSupplierScrapRecord, listSupplierLedgerLinkedToPayable, sortSupplierLedgerGrouped } from '../../common/supplier-ledger'
import { DEFAULT_SCRAP_NAME_OPTIONS, scrapBizKindLabel, type ScrapSettlementMode } from '../../common/supplier-scrap'
import { isMaterialSupplierType, isOutsourcingSupplierType, normalizeSupplierType, supplierTypeLabelKey, type SupplierType } from '../../common/supplier-profile'
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
  VSwitch,
  VTab,
  VTable,
  VTabs,
  VTextarea,
  VTextField,
} from 'vuetify/components'
import { authAPI, bankAPI, billsAPI, cashAPI, customerAPI, supplierAPI, stockInAPI, stockOutAPI, inventoryAPI, productAPI, importAPI, systemAPI, aiAPI, attachmentAPI, printAPI, updateAPI, cloudAPI } from './api'
import { runLodopScript, checkLodopAvailable } from './lodop-print'

type PageKey = 'dashboard' | 'cash' | 'bank' | 'bills' | 'customer' | 'supplier' | 'stockIn' | 'stockOut' | 'inventory' | 'trash' | 'logs' | 'import'
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
    updateSubtitleIdle: '启动后会自动检查新版本（Windows 通过七牛云更新源）。',
    updateSubtitleReady: '更新包已下载完成，重启后即可安装。',
    updateBannerTitle: '新版本 v{version} 可用',
    updateBannerHint: '可立即下载，稍后提醒将 24 小时内不再提示。',
    updateSnooze: '稍后提醒',
    updateReadyChip: '更新已就绪',
    updateInstallConfirm: '安装更新将重启应用。退出前会自动备份数据，请确认未保存的录入已提交。',
    updateInstallConfirmAction: '重启安装',
    updateInstallBlockedSync: '云端同步进行中，请稍后再安装更新。',
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
    inventory: '库存汇总',
    inventorySub: '入库减出库结存',
    docNo: '单据号',
    supplierName: '供应商',
    filterSupplier: '筛选供应商',
    category: '类别',
    stockInKind: '入库类型',
    stockInKindFinished: '成品',
    stockInKindMaterial: '原材料',
    stockInSelfProcessed: '自加工',
    contractNo: '合同编号',
    contractNoOptional: '合同编号（选填）',
    productName: '产品名称',
    stockType: '库存类型',
    stockTypeProduct: '成品',
    stockTypeMaterial: '原材料',
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
    searchInventory: '搜索名称/规格/单位…',
    defaultPrice: '默认单价',
    availableQty: '可用库存',
    selectInventoryProduct: '选择库存产品',
    inventorySpecEmpty: '无规格',
    inventoryUnitEmpty: '无单位',
    inventoryFieldAutoHint: '随产品名称选择自动带出，须与入库一致',
    stockOutAvailableHint: '当前可出库 {qty}（按库存限制）',
    stockOutSelectProductFirst: '请先选择库存产品',
    stockOutSelectFromList: '请从下拉列表选择有库存的产品（品名/规格/单位须与入库一致）',
    stockInUnitRequired: '请填写单位（须与出库一致，用于库存匹配）',
    stockInUnitHint: '必填；出库时按品名+规格+单位匹配库存',
    stockInSpecRequired: '请填写规格（须与出库一致，用于库存匹配）',
    stockInSpecHint: '必填；出库时按品名+规格+单位匹配库存',
    supplierCount: '供应商数',
    customerCount: '客户数',
    searchStock: '搜索产品/规格/类别/合同号…',
    typeProductName: '输入或选择产品',
    typeSupplierName: '输入或选择供应商',
    selectSupplier: '请选择供应商',
    supplierOptionalHint: '可选；有供应商时只能从档案中选择',
    partySelectOnlyHint: '请先在档案中添加，此处只能从列表选择',
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
    batchDelete: '批量删除',
    batchDeleteTitle: '批量删除',
    batchDeleteMessage: '确定删除选中的 {count} 条记录吗？记录将移入回收站。',
    batchDeleteDone: '已删除 {count} 条记录',
    selectRowsToDelete: '请先勾选要删除的记录',
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
    filterProductName: '名称',
    filterSpec: '规格',
    filterUnit: '单位',
    filterStockStatus: '库存状态',
    filterStockType: '库存类型',
    stockTypeAll: '全部类型',
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
    printReturnSlip: '打印退货单',
    printPreview: '出库单预览',
    printReturnPreview: '退货单预览',
    selectReturnRowsToPrint: '请先勾选退货记录',
    printReturnHint: '已选择 {count} 条退货记录，将合并生成一张退货单。',
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
    confirmCloudUpload: '确定将本机账本差异上传到七牛云吗？只会传输有变化的文件。',
    confirmCloudUploadTitle: '上传到云端',
    confirmCloudUploadMessage: '上传会覆盖云端已有差异文件。请输入登录密码确认。',
    cloudExitAutoUpload: '退出软件时自动上传到云端',
    cloudStartupCheck: '启动时检查云端是否有更新',
    cloudStartupAutoDownload: '检测到云端更新时自动拉取（会先备份本机）',
    cloudBootstrapTitle: '正在从云端同步账本',
    cloudBootstrapSubtitle: '首次在本机使用或云端有更新，正在拉取最新数据…',
    cloudBootstrapDone: '云端数据已同步到本机',
    cloudBootstrapCancel: '跳过，先用本机账',
    cloudBootstrapCancelHint: '下载较慢时可跳过，稍后在数据管理手动恢复',
    cloudSyncCancel: '取消下载',
    cloudSyncDownloadCanceled: '已跳过云端同步，当前使用本机数据',
    cloudFirstDeviceHint: '云端尚无数据，可在本机录入；退出软件时会自动上传。',
    cloudLocalOnlyHint: '云端尚无同步数据，当前使用本机账本。',
    cloudOfflineHint: '无法连接云端，当前使用本机账本。',
    cloudOfflineEmptyHint: '无法连接云端，且本机尚无账本数据。请检查网络或七牛云配置。',
    cloudStartupUpdateTitle: '云端有更新',
    cloudStartupUpdateMessage: '检测到云端有 {count} 个文件与本地不一致（云端更新于 {time}）。是否从云端拉取合并？会先自动备份本机数据。',
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
    addCustomerReturn: '登记退货',
    customerReturnRow: '退货',
    customerReceiveRow: '收款',
    selectSaleRowToReturn: '请在台账顶部点击「退货」',
    selectSaleRowToReceive: '请在台账顶部点击「收款」',
    customerLinkedReceivable: '关联应收',
    customerLinkedPaymentFor: '针对应收',
    customerLedgerDetail: '往来明细',
    customerLedgerDetailSub: '出库自动生成应收；收款和退货在台账顶部统一登记。勾选退货行可打印退货单；按产品退货会加回库存。',
    customerRemainingColumn: '待收',
    customerSettledTag: '已结清',
    customerReturnBatchHint: '仅冲减本笔出库（{date} · {qty}{unit} · 待收 {remaining}），不影响其他批次；库存按退货数量加回。',
    customerLedgerEmptyHint: '产品出库后会自动生成应收。若仍为空，请重置筛选或到回收站恢复。',
    customerRefreshLedger: '刷新',
    customerPaymentLinkedHint: '登记本条应收的收款；可部分收，也可超过待收（多收部分在待收列显示）',
    customerRemainingToReceive: '待收',
    addCustomerPayment: '登记收款',
    customerBizKind: '类型',
    customerBizSale: '应收',
    customerBizReturn: '客户退货',
    customerBizPayment: '收款',
    customerReturnFormHint: '填写退货数量与单价即可，产品自动与关联应收一致；只冲减应收、加回库存，不生成出库单。',
    customerPaymentFormHint: '客户每转来一笔钱，登记一条收款；这笔收款记在客户台账下，不强制绑定某一笔应收。',
    customerOverview: '客户欠款一览',
    customerOverviewSub: '点右侧「台账」查看明细；出库自动生成应收，收款和退货在台账顶部登记。',
    amountAutoCalc: '自动计算（数量 × 单价）',
    materialAmountAutoCalc: '自动计算（公斤数 × 元/公斤）',
    finishedUnitPriceHint: '成品参考单价，与下方材料费无关',
    addCustomer: '新增客户',
    addCustomerSub: '填写客户基本信息，保存后可继续登记出库与收款。',
    contactPerson: '联系人',
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
    supplier: '供应商往来',
    supplierSub: '应付与付款',
    supplierOverview: '供应商应付一览',
    supplierOverviewSub: '入库自动生成应付；付款和退货在供应商台账顶部统一登记。',
    supplierPayable: '应付',
    supplierPaid: '付款',
    supplierBalance: '尚欠',
    supplierBalanceColumn: '尚欠/多付',
    supplierOpeningBalance: '期初应付',
    supplierBizKind: '类型',
    supplierBizPayable: '应付',
    supplierBizPayment: '付款',
    supplierLedgerDetail: '往来明细',
    supplierLedgerDetailSub: '入库自动生成应付；付款和退货在台账顶部统一登记。勾选退货行可打印退货单；退货数量受供货剩余和库存限制。',
    supplierWorkspaceTitle: '供应商台账',
    addSupplier: '新增供应商',
    addSupplierSub: '只建供应商档案；应付与付款请进台账登记。',
    addSupplierPayable: '登记应付',
    addSupplierPayment: '登记付款',
    supplierPaymentRow: '付款',
    supplierLinkedPayable: '关联应付',
    selectPayableRowToPay: '请在台账顶部点击「付款」',
    supplierPaymentLinkedHint: '登记本条应付的付款；可部分付，也可超过尚欠（多付部分在汇总中体现）',
    supplierPaymentFormHint: '每付一笔登记一条付款；这笔付款记在供应商台账下，不强制绑定某一笔应付。',
    supplierPayableFormHint: '应付由入库自动生成；此处仅可编辑已有明细。',
    supplierPayableAutoOnly: '应付由入库自动生成；付款和退货请在台账顶部登记。',
    supplierLedgerEmptyHint: '成品入库并选择该供应商后会自动生成应付。若仍为空，请重置筛选或到回收站恢复。',
    supplierWorkspaceSummaryHint: '尚欠 = 期初应付 + 应付 − 退货 − 废料 − 付款',
    supplierType: '供应商类别',
    supplierTypeMaterial: '原材料',
    supplierTypeOutsourcing: '外协加工',
    materialName: '材料名称',
    materialSpec: '规格/牌号',
    materialUnit: '单位',
    materialQuantity: '公斤数',
    materialUnitPrice: '元/公斤',
    materialUsedQuantity: '使用数量',
    stockInNoSupplierHint: '未选供应商：按自己加工处理；成品计入库存并登记单价金额。原材料为选填，填写后会扣减材料库存，不记入供应商台账。',
    stockInOutsourcingHint: '外协加工：选择供应商后，数量 × 加工单价记入应付，成品计入库存。',
    stockInMaterialHint: '原材料供应商：只登记材料入库和材料费用，进入原材料库存并生成应付；不进入成品库存。',
    formSectionMaterialCost: '材料费用',
    formSectionMaterialUse: '使用原材料（选填）',
    stockInMaterialUseHint: '补录历史成品可留空；新加工可从已入库材料中选择，保存后按使用数量扣减原材料库存。',
    materialAmount: '材料金额',
    finishedStockAmount: '成品金额',
    finishedStockAmountHint: '仅供参考（数量×单价），不入应付',
    addSupplierReturn: '登记退货',
    supplierReturnRow: '退货',
    supplierScrapRow: '废料回收',
    selectPayableRowToReturn: '请在台账顶部点击「退货」',
    supplierReturnFormHint: '填写退货数量与单价（正数）；冲减应付，并按退货数量直接减库存（不生成出库单）。',
    supplierBizReturn: '退供应商',
    supplierBizScrap: '废料',
    supplierDebtTag: '尚欠',
    supplierOverpaidTag: '多付',
    supplierLinkedPaymentFor: '针对应付',
    supplierProfile: '期初应付',
    supplierProfileSub: '对应期初欠供应商的款项。保存后按「期初 + 应付 − 付款」重算尚欠。',
    supplierCreated: '供应商已添加',
    supplierPhone: '供应商电话',
    supplierAddress: '供应商地址',
    deleteSupplier: '删除',
    confirmDeleteSupplierTitle: '删除供应商',
    confirmDeleteSupplierMessage: '确定删除供应商「{name}」吗？\n\n· 往来记录 {ledgerCount} 条将移入回收站\n· 供应商档案将一并删除',
    confirmDeleteSupplierProfileOnly: '确定删除供应商「{name}」吗？该供应商暂无往来记录，将只删除档案。',
    supplierRemoved: '供应商已删除',
    supplierRemoveBlockedStockIn: '该供应商在产品入库中还有 {count} 条记录，无法删除。请先在「产品入库」中处理。',
    selectSupplierToAdd: '请填写供应商名称',
    deletedAt: '删除时间',
    restored: '已恢复',
    clearTrash: '清空回收站',
    clearLogs: '清空日志',
    confirmClearTrashTitle: '清空回收站',
    confirmClearTrashMessage: '将永久删除回收站中的全部记录及关联图片，无法恢复。请输入登录密码确认。',
    confirmClearLogsTitle: '清空操作日志',
    confirmClearLogsMessage: '将永久删除全部操作日志，无法恢复。请输入登录密码确认。',
    clearTrashDone: '已永久删除回收站 {count} 条记录',
    clearLogsDone: '已清空 {count} 条操作日志',
    logsTitle: '操作日志',
    logsPageSub: '所有增删改记录，用于追溯和审计',
    logDescription: '操作说明',
    logClientIp: 'IP 地址',
    logDeviceInfo: '设备信息',
    logActionInsert: '新增',
    logActionUpdate: '修改',
    logActionDelete: '删除',
    logActionRestore: '恢复',
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
    helpBusinessStock: '库存业务：产品入库、产品出库、库存汇总；出库会校验当前库存并自动生成客户应收。',
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
    updateSubtitleIdle: 'The app checks for updates after startup (Windows uses the Qiniu update CDN).',
    updateSubtitleReady: 'The update package is ready. Restart to install.',
    updateBannerTitle: 'Version v{version} is available',
    updateBannerHint: 'Download now, or snooze reminders for 24 hours.',
    updateSnooze: 'Remind Later',
    updateReadyChip: 'Update Ready',
    updateInstallConfirm: 'Installing will restart the app. Your data will be auto-backed up on exit. Save any in-progress entries first.',
    updateInstallConfirmAction: 'Restart & Install',
    updateInstallBlockedSync: 'Cloud sync is in progress. Try again after it finishes.',
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
    inventory: 'Inventory',
    inventorySub: 'Inbound minus outbound stock',
    docNo: 'Doc No',
    supplierName: 'Supplier',
    filterSupplier: 'Supplier',
    category: 'Category',
    stockInKind: 'Inbound Type',
    stockInKindFinished: 'Finished',
    stockInKindMaterial: 'Material',
    stockInSelfProcessed: 'In-house',
    contractNo: 'Contract',
    contractNoOptional: 'Contract No. (optional)',
    productName: 'Product',
    stockType: 'Stock Type',
    stockTypeProduct: 'Finished',
    stockTypeMaterial: 'Material',
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
    searchInventory: 'Search name/spec/unit…',
    defaultPrice: 'Default Price',
    availableQty: 'Available Qty',
    selectInventoryProduct: 'Select inventory product',
    inventorySpecEmpty: 'No spec',
    inventoryUnitEmpty: 'No unit',
    inventoryFieldAutoHint: 'Filled from product selection; must match stock-in',
    stockOutAvailableHint: 'Available to ship: {qty} (limited by stock)',
    stockOutSelectProductFirst: 'Select an in-stock product first',
    stockOutSelectFromList: 'Select an in-stock product from the list (name/spec/unit must match stock-in)',
    stockInUnitRequired: 'Unit is required (must match stock-out for inventory matching)',
    stockInUnitHint: 'Required; stock-out matches by name + spec + unit',
    stockInSpecRequired: 'Spec is required (must match stock-out for inventory matching)',
    stockInSpecHint: 'Required; stock-out matches by name + spec + unit',
    supplierCount: 'Suppliers',
    customerCount: 'Customers',
    searchStock: 'Search product/spec/category/contract…',
    typeProductName: 'Type or select product',
    typeSupplierName: 'Type or select supplier',
    selectSupplier: 'Select supplier',
    supplierOptionalHint: 'Optional; pick from profiles when used',
    partySelectOnlyHint: 'Add the profile first; selection from list only',
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
    batchDelete: 'Batch Delete',
    batchDeleteTitle: 'Batch Delete',
    batchDeleteMessage: 'Delete {count} selected record(s)? They will be moved to trash.',
    batchDeleteDone: 'Deleted {count} record(s)',
    selectRowsToDelete: 'Select records to delete first',
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
    filterStockType: 'Stock type',
    stockTypeAll: 'All types',
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
    printReturnSlip: 'Print Return Slip',
    printPreview: 'Outbound Slip Preview',
    printReturnPreview: 'Return Slip Preview',
    selectReturnRowsToPrint: 'Select return rows first',
    printReturnHint: '{count} return row(s) selected; will merge into one return slip.',
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
    confirmCloudUpload: 'Upload local ledger changes to Qiniu Cloud? Only changed files will be transferred.',
    confirmCloudUploadTitle: 'Upload to Cloud',
    confirmCloudUploadMessage: 'Upload will apply local changes to the cloud. Enter your login password to confirm.',
    cloudExitAutoUpload: 'Auto-upload to cloud on exit',
    cloudStartupCheck: 'Check cloud updates on startup',
    cloudStartupAutoDownload: 'Auto-pull cloud updates on startup (backs up local first)',
    cloudBootstrapTitle: 'Syncing from cloud',
    cloudBootstrapSubtitle: 'Pulling the latest ledger data for this device…',
    cloudBootstrapDone: 'Cloud data synced to this device',
    cloudBootstrapCancel: 'Skip and use local data',
    cloudBootstrapCancelHint: 'If download is slow, skip and restore manually later in Data Management',
    cloudSyncCancel: 'Cancel download',
    cloudSyncDownloadCanceled: 'Cloud sync skipped; using local data',
    cloudFirstDeviceHint: 'Cloud is empty. Enter data locally; it uploads on exit.',
    cloudLocalOnlyHint: 'No cloud data yet. Using local ledger.',
    cloudOfflineHint: 'Cannot reach cloud. Using local ledger.',
    cloudOfflineEmptyHint: 'Cannot reach cloud and local ledger is empty. Check network or Qiniu config.',
    cloudStartupUpdateTitle: 'Cloud updates available',
    cloudStartupUpdateMessage: '{count} file(s) differ from local (cloud updated at {time}). Pull and merge from cloud? A local backup runs first.',
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
    addCustomerReturn: 'Add Return',
    customerReturnRow: 'Return',
    customerReceiveRow: 'Receive',
    selectSaleRowToReturn: 'Use Return at the top of the ledger',
    selectSaleRowToReceive: 'Use Receive at the top of the ledger',
    customerLinkedReceivable: 'Linked receivable',
    customerLinkedPaymentFor: 'For receivable',
    customerLedgerDetail: 'Ledger',
    customerLedgerDetailSub: 'Stock-out creates receivables. Record receipts and returns from the top; select return rows to print a return slip.',
    customerLedgerEmptyHint: 'Receivables are created automatically from stock-out. Reset filters or check Trash if empty.',
    customerRefreshLedger: 'Refresh',
    customerPaymentLinkedHint: 'Record payment for this receivable; partial or overpayment allowed (overpaid shown in remaining column)',
    customerRemainingToReceive: 'Due',
    addCustomerPayment: 'Record Payment',
    customerBizKind: 'Type',
    customerBizSale: 'Receivable',
    customerBizReturn: 'Customer Return',
    customerBizPayment: 'Payment',
    customerReturnFormHint: 'Enter qty and price only; product matches linked receivable. Reduces receivable and restores inventory—no stock-out record.',
    customerPaymentFormHint: 'Record one payment per transfer. It stays under this customer and does not have to be linked to one receivable.',
    customerOverview: 'Customer Balances',
    customerOverviewSub: 'Open a customer ledger to view details. Stock-out creates receivables; receipts and returns are recorded from the ledger top.',
    amountAutoCalc: 'Auto-calculated (qty × price)',
    materialAmountAutoCalc: 'Auto-calculated (kg × price per kg)',
    finishedUnitPriceHint: 'Finished-goods reference price; unrelated to material cost below',
    addCustomer: 'Add Customer',
    addCustomerSub: 'Enter basic customer info. You can record stock-out and payments after saving.',
    contactPerson: 'Contact',
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
    supplier: 'Suppliers',
    supplierSub: 'Payables & payments',
    supplierOverview: 'Supplier Payables',
    supplierOverviewSub: 'Stock-in auto-creates payables. Record payments and returns from the supplier ledger top.',
    supplierPayable: 'Payable',
    supplierPaid: 'Paid',
    supplierBalance: 'Balance Due',
    supplierBalanceColumn: 'Due / Overpaid',
    supplierOpeningBalance: 'Opening Payable',
    supplierBizKind: 'Type',
    supplierBizPayable: 'Payable',
    supplierBizPayment: 'Payment',
    supplierBizReturn: 'Return',
    supplierBizScrap: 'Scrap',
    supplierReturnRow: 'Return',
    supplierScrapRow: 'Scrap Recovery',
    supplierLedgerDetail: 'Ledger',
    supplierLedgerDetailSub: 'Stock-in creates payables. Record payments and returns from the top; select return rows to print a return slip.',
    supplierWorkspaceTitle: 'Supplier Ledger',
    addSupplier: 'Add Supplier',
    addSupplierSub: 'Profile only. Record payables and payments in the ledger.',
    addSupplierPayable: 'Record Payable',
    addSupplierPayment: 'Record Payment',
    supplierPaymentRow: 'Pay',
    supplierLinkedPayable: 'Linked payable',
    selectPayableRowToPay: 'Use Pay at the top of the ledger',
    supplierPaymentLinkedHint: 'Record payment for this payable; partial or overpayment allowed',
    supplierPaymentFormHint: 'Record one payment per transfer. It stays under this supplier and does not have to be linked to one payable.',
    supplierPayableFormHint: 'Payables are auto-created from stock-in; edit existing rows only.',
    supplierPayableAutoOnly: 'Payables are created from stock-in. Use Pay or Return at the top of the ledger.',
    stockInNoSupplierHint: 'No supplier: self-processing; finished goods enter inventory. Material is optional—fill it only when you want to deduct material stock.',
    stockInOutsourcingHint: 'Outsourcing: with supplier, qty × processing price → payable; goods → inventory.',
    stockInMaterialHint: 'Material supplier: record material inbound and material cost only; it enters material stock and creates payable.',
    materialName: 'Material Name',
    materialSpec: 'Material Spec',
    materialUnit: 'Unit',
    materialQuantity: 'Kg',
    materialUnitPrice: 'Price / kg',
    materialUsedQuantity: 'Used Qty',
    formSectionMaterialUse: 'Material Used (Optional)',
    stockInMaterialUseHint: 'Leave blank when backfilling legacy finished goods; select stocked material for new in-house production to deduct material inventory.',
    finishedStockAmount: 'Finished Amount',
    finishedStockAmountHint: 'Reference only (qty × price); not payable',
    supplierLedgerEmptyHint: 'Payables are created automatically from stock-in with this supplier. Reset filters or check Trash if empty.',
    supplierWorkspaceSummaryHint: 'Due = opening + payables − returns − scrap − payments',
    supplierDebtTag: 'Due',
    supplierOverpaidTag: 'Overpaid',
    supplierLinkedPaymentFor: 'For payable',
    supplierProfile: 'Opening Payable',
    supplierProfileSub: 'Opening amount owed to supplier. Saving recalculates balance.',
    supplierCreated: 'Supplier added',
    supplierPhone: 'Supplier Phone',
    supplierAddress: 'Supplier Address',
    deleteSupplier: 'Delete',
    confirmDeleteSupplierTitle: 'Delete Supplier',
    confirmDeleteSupplierMessage: 'Delete supplier "{name}"?\n\n· {ledgerCount} ledger row(s) will move to Trash\n· Supplier profile will be removed',
    confirmDeleteSupplierProfileOnly: 'Delete supplier "{name}"? No ledger rows; only profile will be removed.',
    supplierRemoved: 'Supplier deleted',
    supplierRemoveBlockedStockIn: 'This supplier has {count} stock-in row(s). Handle them in Stock In before deleting.',
    selectSupplierToAdd: 'Enter supplier name',
    deletedAt: 'Deleted At',
    restored: 'Restored',
    clearTrash: 'Empty Trash',
    clearLogs: 'Clear Logs',
    confirmClearTrashTitle: 'Empty Trash',
    confirmClearTrashMessage: 'Permanently delete all records in trash and their images. This cannot be undone. Enter your login password to confirm.',
    confirmClearLogsTitle: 'Clear Operation Logs',
    confirmClearLogsMessage: 'Permanently delete all operation logs. This cannot be undone. Enter your login password to confirm.',
    clearTrashDone: 'Permanently deleted {count} trash record(s)',
    clearLogsDone: 'Cleared {count} operation log(s)',
    logsTitle: 'Logs',
    logsPageSub: 'All create/update/delete records',
    logDescription: 'Description',
    logClientIp: 'IP Address',
    logDeviceInfo: 'Device',
    logActionInsert: 'Create',
    logActionUpdate: 'Update',
    logActionDelete: 'Delete',
    logActionRestore: 'Restore',
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
    helpBusinessStock: 'Inventory: product inbound, product outbound, and stock summary; outbound validates stock and auto-creates customer receivables.',
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
type CloudStartupFailureAction = 'retry' | 'continue' | 'quit'
const cloudStartupFailureDialog = reactive({
  show: false,
  title: '云端数据拉取失败',
  message: '',
  retryLabel: '重试拉取',
  continueLabel: '继续使用本机',
  quitLabel: '关闭软件',
})
let cloudStartupFailureResolver: ((value: CloudStartupFailureAction) => void) | null = null
const passwordConfirmDialog = reactive({
  show: false,
  title: '',
  message: '',
  password: '',
  confirmLabel: '确定',
  cancelLabel: '取消',
  confirmColor: 'error',
  loading: false,
})
let passwordConfirmResolver: ((value: string | null) => void) | null = null
const appVersion = ref('')
const updateDialog = ref(false)
const updateBannerVisible = ref(false)
const updateManualCheck = ref(false)
const updateBusy = ref(false)
const updateState = ref<any>({ status: 'idle', currentVersion: '' })
const UPDATE_SNOOZE_KEY = 'donghaoUpdateSnoozedUntil'
let offUpdateState: (() => void) | undefined
let offUpdateOpenDialog: (() => void) | undefined
let offHeaderCloudProgress: (() => void) | undefined
let headerCloudProgressTimer: ReturnType<typeof setTimeout> | null = null
let echartsModule: EChartsModule | null = null

const headerCloudSyncBusy = ref(false)
const cloudBootstrapBusy = ref(false)
const cloudBootstrapCanceling = ref(false)
const cloudBootstrapMessage = ref('')
const headerCloudProgressDialog = ref(false)
const headerCloudProgress = reactive({
  mode: 'upload' as 'upload' | 'download',
  phase: 'preparing' as 'preparing' | 'transferring' | 'applying' | 'done',
  current: 0,
  total: 0,
  file: '',
  message: '',
})
let cloudStartupChecked = false
let cloudStartupPending = false
let startupPromptsRan = false
const headerCloudProgressPercent = computed(() => {
  if (headerCloudProgress.phase === 'done') return 100
  if (headerCloudProgress.phase === 'applying') return 0
  if (!headerCloudProgress.total) return 0
  return Math.min(100, Math.round((headerCloudProgress.current / headerCloudProgress.total) * 100))
})
const headerCloudProgressIndeterminate = computed(() => {
  if (headerCloudProgress.phase === 'preparing' || headerCloudProgress.phase === 'applying') return true
  return headerCloudProgress.phase === 'transferring'
    && headerCloudProgress.total === 1
    && headerCloudProgress.current === 0
})

const themeName = computed(() => themeMode.value === 'dark' ? 'donghaoDark' : 'donghaoLight')
const isLedgerPage = computed(() => ['cash', 'bank', 'bills', 'customer', 'supplier', 'stockIn', 'stockOut'].includes(page.value))
const userInitial = computed(() => (currentUser.value?.displayName || currentUser.value?.username || '东').slice(0, 1).toUpperCase())
const updateDialogSubtitle = computed(() => {
  if (updateState.value.status === 'downloaded') return t('updateSubtitleReady')
  return t('updateSubtitleIdle')
})

const updateDownloadProgressText = computed(() => {
  const transferred = Number(updateState.value.transferred || 0)
  const total = Number(updateState.value.total || 0)
  const percent = Math.round(updateState.value.percent || 0)
  if (total > 0) {
    const mb = (value: number) => (value / 1024 / 1024).toFixed(1)
    return `${t('updateDownloading', { percent })}（${mb(transferred)} / ${mb(total)} MB）`
  }
  return t('updateDownloading', { percent })
})

const updateReadyChipVisible = computed(() =>
  updateState.value.status === 'downloaded' && !updateBannerVisible.value && !updateDialog.value,
)

function isUpdateSnoozed() {
  const until = Number(localStorage.getItem(UPDATE_SNOOZE_KEY) || 0)
  return until > Date.now()
}

function snoozeUpdate() {
  localStorage.setItem(UPDATE_SNOOZE_KEY, String(Date.now() + 24 * 60 * 60 * 1000))
  updateBannerVisible.value = false
  updateDialog.value = false
  cloudStartupPending = false
  tryRunPendingCloudStartupCheck()
}

function openUpdateDialog() {
  updateDialog.value = true
}

function closeUpdateDialog() {
  updateDialog.value = false
  if (updateState.value.status === 'available') snoozeUpdate()
  else tryRunPendingCloudStartupCheck()
}

function maybeShowUpdatePrompt(state: any) {
  if (!currentUser.value) return
  if (updateManualCheck.value) {
    updateDialog.value = true
    return
  }
  if (isUpdateSnoozed()) return
  if (state?.silent && (state?.status === 'not-available' || state?.status === 'error')) return
  if (state?.status === 'available' || state?.status === 'downloaded') {
    updateBannerVisible.value = true
    cloudStartupPending = true
  }
}

function formatCloudStartupTime(value?: string) {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return value
  const y = dt.getFullYear()
  const m = dt.getMonth() + 1
  const d = dt.getDate()
  const h = String(dt.getHours()).padStart(2, '0')
  const min = String(dt.getMinutes()).padStart(2, '0')
  return `${y}年${m}月${d}日 ${h}:${min}`
}

async function waitForInitialUpdateCheck(maxMs = 12000): Promise<void> {
  const start = Date.now()
  let sawChecking = false
  while (Date.now() - start < maxMs) {
    const status = updateState.value.status
    if (status === 'checking') sawChecking = true
    if (sawChecking && status !== 'checking' && status !== 'idle') return
    if (!sawChecking && Date.now() - start > 2500 && status === 'idle') return
    if (status === 'available' || status === 'downloaded' || status === 'not-available' || status === 'error') return
    await new Promise(resolve => setTimeout(resolve, 350))
  }
}

type CloudAutoDownloadOutcome = { status: 'ok' | 'failed' | 'canceled'; error?: string }

async function runCloudAutoDownload(plan?: {
  pendingFiles?: number
  remoteUpdatedAt?: string
  remoteFingerprint?: string
  localEmpty?: boolean
  downloadIncludeMedia?: boolean
}, options: { notifyFailure?: boolean } = {}): Promise<CloudAutoDownloadOutcome> {
  headerCloudSyncBusy.value = true
  beginHeaderCloudProgress('download')
  try {
    const notifyFailure = options.notifyFailure !== false
    const includeMedia = plan?.downloadIncludeMedia ?? Boolean(plan?.localEmpty)
    const result = await cloudAPI.syncDownload({ includeMedia })
    if (result?.canceled) {
      notify(t('cloudSyncDownloadCanceled'), 'info')
      return { status: 'canceled' }
    }
    if (!result?.ok) {
      const error = result?.error || t('restoreFailed')
      if (!result?.canceled && notifyFailure) notify(error, 'error')
      return { status: 'failed', error }
    }
    const downloaded = Number(result.downloaded || 0)
    const skipped = Number(result.skipped || 0)
    if (result.replacedLedger || downloaded > 0) {
      sessionStorage.removeItem(CLOUD_BOOTSTRAP_USER_SKIPPED_KEY)
      notify(t('cloudBootstrapDone'))
    }
    else if (!plan?.pendingFiles) notify(t('cloudSyncNoChange'))
    else if (!includeMedia && downloaded === 0) notify('账本已对齐，图片/附件保留本机设置', 'info')
    else notify(t('cloudSyncDownloadDone', { downloaded, skipped }))
    return { status: 'ok' }
  } finally {
    headerCloudSyncBusy.value = false
    finishHeaderCloudProgress()
  }
}

async function runCloudAutoDownloadWithFailureChoice(plan?: {
  pendingFiles?: number
  remoteUpdatedAt?: string
  remoteFingerprint?: string
  localEmpty?: boolean
  downloadIncludeMedia?: boolean
}) {
  while (true) {
    const outcome = await runCloudAutoDownload(plan, { notifyFailure: false })
    if (outcome.status === 'ok' || outcome.status === 'canceled') return outcome

    const action = await askCloudStartupFailure(outcome.error)
    if (action === 'retry') continue
    if (action === 'quit') {
      await systemAPI.quit()
      return outcome
    }
    notify('已继续使用本机数据', 'info')
    return outcome
  }
}

const CLOUD_BOOTSTRAP_GUARD_KEY = 'donghao-cloud-bootstrap-guard'
const CLOUD_BOOTSTRAP_USER_SKIPPED_KEY = 'donghao-cloud-bootstrap-user-skipped'

async function cancelCloudSync() {
  if (cloudBootstrapCanceling.value) return
  cloudBootstrapCanceling.value = true
  try {
    await cloudAPI.cancelSync()
  } finally {
    cloudBootstrapCanceling.value = false
  }
}

async function cancelCloudBootstrap() {
  sessionStorage.setItem(CLOUD_BOOTSTRAP_USER_SKIPPED_KEY, '1')
  await cancelCloudSync()
}

async function runCloudBootstrap() {
  if (!currentUser.value) return
  if (sessionStorage.getItem(CLOUD_BOOTSTRAP_USER_SKIPPED_KEY)) return
  const guardTs = Number(sessionStorage.getItem(CLOUD_BOOTSTRAP_GUARD_KEY) || 0)
  if (guardTs && Date.now() - guardTs < 45000) return
  try {
    const plan = await cloudAPI.evaluateStartup()
    if (plan?.action === 'first_device') notify(t('cloudFirstDeviceHint'), 'info')
    else if (plan?.offline && plan.localEmpty) notify(t('cloudOfflineEmptyHint'), 'warning')
    if (plan?.action !== 'auto_download') return

    cloudBootstrapBusy.value = true
    cloudBootstrapMessage.value = plan.localEmpty
      ? t('cloudBootstrapSubtitle')
      : plan.pendingLedgerFiles
        ? t('cloudStartupUpdateMessage', {
          count: plan.pendingLedgerFiles || plan.pendingFiles || 0,
          time: formatCloudStartupTime(plan.remoteUpdatedAt),
        })
        : '正在对齐云端账本（不拉回图片/附件）…'
    sessionStorage.setItem(CLOUD_BOOTSTRAP_GUARD_KEY, String(Date.now()))
    await runCloudAutoDownloadWithFailureChoice(plan)
  } catch {
    notify(t('cloudOfflineHint'), 'warning')
  } finally {
    cloudBootstrapBusy.value = false
    cloudBootstrapMessage.value = ''
  }
}

async function maybePromptCloudUpdates() {
  if (cloudStartupChecked || !currentUser.value) return
  if (updateDialog.value) {
    cloudStartupPending = true
    return
  }
  cloudStartupChecked = true
  try {
    const plan = await cloudAPI.evaluateStartup()
    if (plan?.action !== 'prompt_download') return
    const ok = await askConfirm({
      title: t('cloudStartupUpdateTitle'),
      message: t('cloudStartupUpdateMessage', {
        count: plan.pendingFiles,
        time: formatCloudStartupTime(plan.remoteUpdatedAt),
      }),
      confirmColor: 'warning',
      confirmLabel: t('cloudSyncDownload'),
    })
    if (!ok) {
      if (plan.remoteFingerprint) {
        await cloudAPI.acknowledgeRemoteSnapshot({
          updatedAt: plan.remoteUpdatedAt,
          fingerprint: plan.remoteFingerprint,
        })
      }
      return
    }
    await runCloudAutoDownload(plan)
  } catch {
    // ignore startup cloud check errors
  }
}

function tryRunPendingCloudStartupCheck() {
  if (!cloudStartupPending || cloudStartupChecked || updateDialog.value || updateBannerVisible.value) return
  cloudStartupPending = false
  void maybePromptCloudUpdates()
}

async function runStartupPromptSequence() {
  if (!currentUser.value || startupPromptsRan) return
  startupPromptsRan = true
  await waitForInitialUpdateCheck()
  const status = updateState.value.status
  if (status === 'available' || status === 'downloaded') {
    maybeShowUpdatePrompt(updateState.value)
    return
  }
  await maybePromptCloudUpdates()
}

async function runUpdateCheck() {
  updateManualCheck.value = true
  updateBusy.value = true
  updateDialog.value = true
  try {
    const state = await updateAPI.check({ silent: false })
    updateState.value = state
  } catch (error: any) {
    updateState.value = { ...updateState.value, status: 'error', error: error?.message || t('updateRetry') }
  } finally {
    updateBusy.value = false
    updateManualCheck.value = false
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
  if (headerCloudSyncBusy.value) {
    notify(t('updateInstallBlockedSync'), 'warning')
    return
  }
  const ok = await askConfirm({
    message: t('updateInstallConfirm'),
    confirmLabel: t('updateInstallConfirmAction'),
    confirmColor: 'primary',
  })
  if (!ok) return
  await updateAPI.install()
}

function beginHeaderCloudProgress(mode: 'upload' | 'download' = 'upload') {
  if (headerCloudProgressTimer) {
    clearTimeout(headerCloudProgressTimer)
    headerCloudProgressTimer = null
  }
  headerCloudProgress.mode = mode
  headerCloudProgress.phase = 'preparing'
  headerCloudProgress.current = 0
  headerCloudProgress.total = 0
  headerCloudProgress.file = ''
  headerCloudProgress.message = mode === 'upload' ? '正在准备上传…' : '正在准备恢复…'
  headerCloudProgressDialog.value = true
}

function handleHeaderCloudProgress(progress: any) {
  if (!headerCloudSyncBusy.value) return
  headerCloudProgress.mode = progress?.mode === 'download' ? 'download' : 'upload'
  headerCloudProgress.phase = progress?.phase || 'preparing'
  headerCloudProgress.current = Number(progress?.current || 0)
  headerCloudProgress.total = Number(progress?.total || 0)
  headerCloudProgress.file = String(progress?.file || '')
  headerCloudProgress.message = String(progress?.message || '')
  headerCloudProgressDialog.value = true
}

function finishHeaderCloudProgress() {
  if (headerCloudProgressTimer) clearTimeout(headerCloudProgressTimer)
  headerCloudProgressTimer = setTimeout(() => {
    headerCloudProgressDialog.value = false
    headerCloudProgressTimer = null
  }, 700)
}

const navItems = [
  { key: 'dashboard' as PageKey, icon: '◼', label: 'dashboard', sub: 'dashboardSub' },
  { key: 'cash' as PageKey, icon: '💵', label: 'cash', sub: 'cashSub' },
  { key: 'bank' as PageKey, icon: '🏦', label: 'bank', sub: 'bankSub' },
  { key: 'bills' as PageKey, icon: '📄', label: 'bills', sub: 'billsSub' },
  { key: 'customer' as PageKey, icon: '🏭', label: 'customer', sub: 'customerSub' },
  { key: 'supplier' as PageKey, icon: '🏪', label: 'supplier', sub: 'supplierSub' },
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

function askCloudStartupFailure(error?: string): Promise<CloudStartupFailureAction> {
  return new Promise((resolve) => {
    cloudStartupFailureResolver = resolve
    cloudStartupFailureDialog.title = '云端数据拉取失败'
    cloudStartupFailureDialog.message = `启动时自动拉取云端数据失败。\n\n当前会继续保留本机数据，云端可能有更新未同步。\n\n错误：${error || '未知错误'}`
    cloudStartupFailureDialog.retryLabel = '重试拉取'
    cloudStartupFailureDialog.continueLabel = '继续使用本机'
    cloudStartupFailureDialog.quitLabel = '关闭软件'
    cloudStartupFailureDialog.show = true
  })
}

function resolveCloudStartupFailure(action: CloudStartupFailureAction) {
  cloudStartupFailureDialog.show = false
  cloudStartupFailureResolver?.(action)
  cloudStartupFailureResolver = null
}

interface PasswordConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  confirmColor?: string
}

function askPasswordConfirm(options: PasswordConfirmOptions): Promise<string | null> {
  return new Promise((resolve) => {
    passwordConfirmResolver = resolve
    passwordConfirmDialog.title = options.title
    passwordConfirmDialog.message = options.message
    passwordConfirmDialog.confirmLabel = options.confirmLabel || t('confirm')
    passwordConfirmDialog.cancelLabel = options.cancelLabel || t('cancel')
    passwordConfirmDialog.confirmColor = options.confirmColor || 'error'
    passwordConfirmDialog.password = ''
    passwordConfirmDialog.loading = false
    passwordConfirmDialog.show = true
  })
}

function resolvePasswordConfirm(confirmed: boolean) {
  const password = passwordConfirmDialog.password.trim()
  passwordConfirmDialog.show = false
  passwordConfirmDialog.password = ''
  passwordConfirmResolver?.(confirmed && password ? password : null)
  passwordConfirmResolver = null
  passwordConfirmDialog.loading = false
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
    if (result.ok) {
      currentUser.value = result.user
      startupPromptsRan = false
      cloudStartupChecked = false
      cloudStartupPending = false
      await runCloudBootstrap()
      void runStartupPromptSequence()
    }
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
  startupPromptsRan = false
  cloudStartupChecked = false
  cloudStartupPending = false
  updateDialog.value = false
  updateBannerVisible.value = false
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

watch(updateDialog, (open) => {
  if (!open) tryRunPendingCloudStartupCheck()
})

watch(updateBannerVisible, (open) => {
  if (!open) tryRunPendingCloudStartupCheck()
})

onMounted(async () => {
  offUpdateState = updateAPI.onState((state) => {
    updateState.value = state
    if (state?.status === 'downloaded') updateBannerVisible.value = true
    maybeShowUpdatePrompt(state)
    if (state?.status === 'not-available' || state?.status === 'error') {
      tryRunPendingCloudStartupCheck()
    }
  })
  offUpdateOpenDialog = updateAPI.onOpenDialog(() => {
    void runUpdateCheck()
  })
  offHeaderCloudProgress = cloudAPI.onSyncProgress(handleHeaderCloudProgress)
  try {
    appVersion.value = await systemAPI.appVersion()
    currentUser.value = await authAPI.me()
    updateState.value = await updateAPI.getState()
    maybeShowUpdatePrompt(updateState.value)
    if (currentUser.value) {
      await runCloudBootstrap()
      void runStartupPromptSequence()
    }
  } finally {
    checkingAuth.value = false
  }
})

onBeforeUnmount(() => {
  offUpdateState?.()
  offUpdateOpenDialog?.()
  offHeaderCloudProgress?.()
  if (headerCloudProgressTimer) clearTimeout(headerCloudProgressTimer)
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
    const stockType = ref('')
    const stockStatus = ref('')
    const loading = ref(false)
    const summary = ref<any>({})
    const columns = ['stock_type', 'product_name', 'spec', 'unit', 'total_in', 'total_out', 'stock_qty']
    const stockTypeOptions = computed(() => [
      { title: props.t('stockTypeAll'), value: '' },
      { title: props.t('stockTypeProduct'), value: 'product' },
      { title: props.t('stockTypeMaterial'), value: 'material' },
    ])
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
      stockType: stockType.value,
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
      stockType.value = ''
      stockStatus.value = ''
      currentPage.value = 1
      load()
    }

    watch([keyword, productName, specFilter, unitFilter, stockType, stockStatus], () => {
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
          h(VSelect, { modelValue: stockType.value, 'onUpdate:modelValue': (v: string) => { stockType.value = v || '' }, items: stockTypeOptions.value, label: props.t('filterStockType'), density: 'compact', hideDetails: true, class: 'toolbar-input header-toolbar-input' }),
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
                ? rows.value.map(row => h('tr', { key: `${row.stock_type}-${row.product_name}-${row.spec}-${row.unit}` }, columns.map(c => h('td', { class: amountClass(c) }, c === 'stock_type'
                  ? props.t(row.stock_type === 'material' ? 'stockTypeMaterial' : 'stockTypeProduct')
                  : c === 'spec' && !row[c]
                  ? props.t('inventorySpecEmpty')
                  : c === 'unit' && !row[c]
                    ? props.t('inventoryUnitEmpty')
                    : formatCell(c, row[c])))))
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


const ledgerConfigs: any = {
  cash: { title: 'cash', api: cashAPI, pageSize: 20, search: 'searchCash', columns: ['date', 'description', 'income', 'expense', 'balance', 'operator', 'note'], fields: ['date', 'description', 'income', 'expense', 'balance', 'operator', 'note'], summary: ['totalIncome', 'totalExpense', 'currentSurplus'], table: 'cash', relatedTable: 'cash_ledger' },
  bank: { title: 'bank', api: bankAPI, pageSize: 20, search: 'search', columns: ['date', 'description', 'amount_in', 'amount_out', 'balance', 'note'], fields: ['date', 'description', 'amount_in', 'amount_out', 'balance', 'note'], summary: ['totalIn', 'totalOut', 'currentSurplus'], table: 'bank', relatedTable: 'bank_ledger' },
  bills: { title: 'bills', api: billsAPI, pageSize: 20, search: 'search', columns: ['date', 'description', 'amount_in', 'amount_out', 'balance', 'note'], fields: ['date', 'description', 'amount_in', 'amount_out', 'balance', 'note'], summary: ['totalIn', 'totalOut', 'currentSurplus'], table: 'bills', relatedTable: 'acceptance_bills' },
  customer: { title: 'customer', api: customerAPI, pageSize: 20, search: 'search', filterField: 'customerName', filterKey: 'customer_name', filterLabel: 'filterCustomer', columns: ['customer_name', 'date', 'contract_no', 'product_name', 'spec', 'unit', 'quantity', 'unit_price', 'amount_in', 'amount_out', 'balance', 'note'], fields: ['customer_name', 'date', 'contract_no', 'product_name', 'spec', 'unit', 'quantity', 'unit_price', 'amount_in', 'amount_out', 'balance', 'note', 'month_label'], summary: [], table: 'customer', relatedTable: 'customer_ledger' },
  supplier: { title: 'supplier', api: supplierAPI, pageSize: 20, search: 'search', filterField: 'supplierName', filterKey: 'supplier_name', filterLabel: 'filterSupplier', columns: [], fields: ['supplier_name', 'date', 'contract_no', 'product_name', 'spec', 'unit', 'quantity', 'unit_price', 'amount_in', 'amount_out', 'balance', 'note'], summary: [], table: 'supplier', relatedTable: 'supplier_ledger' },
  stockIn: { title: 'stockIn', api: stockInAPI, pageSize: 20, search: 'searchStock', filterField: 'supplierName', filterKey: 'supplier_name', filterLabel: 'filterSupplier', columns: ['doc_no', 'supplier_name', 'category', 'date', 'contract_no', 'product_name', 'spec', 'unit', 'quantity', 'unit_price', 'material_name', 'material_spec', 'material_unit', 'material_quantity', 'material_unit_price', 'amount', 'note'], fields: ['supplier_name', 'category', 'date', 'contract_no', 'product_name', 'spec', 'unit', 'quantity', 'unit_price', 'material_name', 'material_spec', 'material_unit', 'material_quantity', 'material_unit_price', 'material_used_quantity', 'amount', 'note'], summary: ['totalRecords', 'totalQuantity', 'totalAmount'], table: 'stockIn', relatedTable: 'stock_in_ledger' },
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
  customerReturn: [
    { titleKey: 'formSectionParty', fields: [{ key: 'customer_name', span: 'half' }, { key: 'date', span: 'half' }, { key: 'contract_no', span: 'half' }] },
    { titleKey: 'formSectionAmount', fields: [{ key: 'quantity', span: 'half' }, { key: 'unit_price', span: 'half' }] },
    { titleKey: 'formSectionOther', fields: [{ key: 'note', span: 'full' }] },
  ],
  supplierPayable: [
    { titleKey: 'formSectionParty', fields: [{ key: 'supplier_name', span: 'half' }, { key: 'date', span: 'half' }, { key: 'contract_no', span: 'half' }] },
    { titleKey: 'formSectionProduct', fields: [{ key: 'product_name', span: 'half' }, { key: 'spec', span: 'half' }, { key: 'unit', span: 'half' }] },
    { titleKey: 'formSectionAmount', fields: [{ key: 'quantity', span: 'half' }, { key: 'unit_price', span: 'half' }, { key: 'amount_in', span: 'half' }] },
    { titleKey: 'formSectionOther', fields: [{ key: 'note', span: 'full' }] },
  ],
  supplierPayment: [
    { titleKey: 'formSectionParty', fields: [{ key: 'supplier_name', span: 'half' }, { key: 'date', span: 'half' }] },
    { titleKey: 'formSectionAmount', fields: [{ key: 'amount_out', span: 'half' }] },
    { titleKey: 'formSectionOther', fields: [{ key: 'note', span: 'full' }] },
  ],
  supplierReturn: [
    { titleKey: 'formSectionParty', fields: [{ key: 'supplier_name', span: 'half' }, { key: 'date', span: 'half' }, { key: 'contract_no', span: 'half' }] },
    { titleKey: 'formSectionAmount', fields: [{ key: 'quantity', span: 'half' }, { key: 'unit_price', span: 'half' }] },
    { titleKey: 'formSectionOther', fields: [{ key: 'note', span: 'full' }] },
  ],
  stockInNoSupplier: [
    { titleKey: 'formSectionParty', fields: [{ key: 'supplier_name', span: 'half' }, { key: 'date', span: 'half' }, { key: 'contract_no', span: 'half' }] },
    { titleKey: 'formSectionProduct', fields: [{ key: 'product_name', span: 'half' }, { key: 'spec', span: 'half' }, { key: 'unit', span: 'half' }] },
    { titleKey: 'formSectionAmount', fields: [{ key: 'quantity', span: 'half' }, { key: 'unit_price', span: 'half' }, { key: 'amount', span: 'half' }] },
    { titleKey: 'formSectionMaterialCost', fields: [{ key: 'material_name', span: 'half' }, { key: 'material_spec', span: 'half' }, { key: 'material_used_quantity', span: 'half' }] },
    { titleKey: 'formSectionOther', fields: [{ key: 'note', span: 'full' }] },
  ],
  stockInMaterial: [
    { titleKey: 'formSectionParty', fields: [{ key: 'supplier_name', span: 'half' }, { key: 'date', span: 'half' }, { key: 'contract_no', span: 'half' }] },
    { titleKey: 'formSectionMaterialCost', fields: [{ key: 'material_name', span: 'half' }, { key: 'material_spec', span: 'half' }, { key: 'material_quantity', span: 'half' }, { key: 'material_unit_price', span: 'half' }, { key: 'amount', span: 'half' }] },
    { titleKey: 'formSectionOther', fields: [{ key: 'note', span: 'full' }] },
  ],
  stockInOutsourcing: [
    { titleKey: 'formSectionParty', fields: [{ key: 'supplier_name', span: 'half' }, { key: 'date', span: 'half' }, { key: 'contract_no', span: 'half' }] },
    { titleKey: 'formSectionProduct', fields: [{ key: 'product_name', span: 'half' }, { key: 'spec', span: 'half' }, { key: 'unit', span: 'half' }] },
    { titleKey: 'formSectionAmount', fields: [{ key: 'quantity', span: 'half' }, { key: 'unit_price', span: 'half' }, { key: 'amount', span: 'half' }] },
    { titleKey: 'formSectionOther', fields: [{ key: 'note', span: 'full' }] },
  ],
  stockIn: [
    { titleKey: 'formSectionParty', fields: [{ key: 'supplier_name', span: 'half' }, { key: 'date', span: 'half' }, { key: 'contract_no', span: 'half' }] },
    { titleKey: 'formSectionProduct', fields: [{ key: 'product_name', span: 'half' }, { key: 'spec', span: 'half' }, { key: 'unit', span: 'half' }] },
    { titleKey: 'formSectionAmount', fields: [{ key: 'quantity', span: 'half' }, { key: 'unit_price', span: 'half' }, { key: 'amount', span: 'half' }] },
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
  supplier: 880,
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
    const batchDeleting = ref(false)
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
    const profileOptions = ref<string[]>([])
    const inventoryOptions = ref<any[]>([])
    const productOptions = ref<any[]>([])
    const materialOptions = ref<any[]>([])
    const attachmentDialog = ref(false)
    const attachmentRow = ref<any>(null)
    const attachments = ref<any[]>([])
    const pendingAttachments = ref<any[]>([])
    const pendingAttachmentDeletes = ref<number[]>([])
    const attachmentLoading = ref(false)
    const imagePreview = ref<any>(null)
    const printDialog = ref(false)
    const printSettingsDialog = ref(false)
    const printKind = ref<'stockOut' | 'customerReturn' | 'supplierReturn'>('stockOut')
    const printIds = ref<number[]>([])
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
    const customerProfileForm = reactive({ contact_person: '', phone: '', address: '', opening_balance: 0, note: '' })
    const customerEntryMode = ref<'sale' | 'return' | 'payment'>('sale')
    const linkedReceivableRow = ref<any>(null)
    const customerLedgerFinancialLocked = ref(false)
    const customerDetailDialog = ref(false)
    const customerDetailName = ref('')
    const customerDetailSummary = ref<any>({})
    const customerPickDialog = ref(false)
    const customerPickMode = ref<'sale' | 'return' | 'payment'>('sale')
    const customerPickName = ref('')
    const customerCreateDialog = ref(false)
    const customerCreateForm = reactive({
      customer_name: '',
      contact_person: '',
      phone: '',
      address: '',
      opening_balance: 0,
      opening_reason: '',
      note: '',
    })
    const supplierDetailDialog = ref(false)
    const supplierDetailName = ref('')
    const supplierDetailSummary = ref<any>({})
    const supplierEntryMode = ref<'payable' | 'payment' | 'return'>('payable')
    const linkedPayableRow = ref<any>(null)
    const supplierDetailType = ref<SupplierType>('outsourcing')
    const stockInSupplierType = ref<SupplierType>('outsourcing')
    const supplierCreateDialog = ref(false)
    const supplierProfileDialog = ref(false)
    const supplierProfileForm = reactive({ supplier_type: 'outsourcing' as SupplierType, contact_person: '', phone: '', address: '', opening_balance: 0, opening_reason: '', note: '' })
    const supplierCreateForm = reactive({
      supplier_name: '',
      supplier_type: 'outsourcing' as SupplierType,
      contact_person: '',
      phone: '',
      address: '',
      opening_balance: 0,
      opening_reason: '',
      note: '',
    })
    const productReturnDialog = ref(false)
    const productReturnKind = ref<'customer' | 'supplier' | 'supplierMaterial'>('customer')
    const productReturnLoading = ref(false)
    const productReturnDate = ref(todayIsoDate())
    const productReturnNote = ref('退货')
    const productReturnRows = ref<any[]>([])
    const materialReturnDialog = ref(false)
    const materialReturnLoading = ref(false)
    const materialReturnDate = ref(todayIsoDate())
    const materialReturnQuantity = ref<any>('')
    const materialReturnUnitPrice = ref<any>(0)
    const materialReturnMaxQty = ref(0)
    const materialReturnNote = ref('原材料退货')
    const scrapRecoverDialog = ref(false)
    const scrapRecoverLoading = ref(false)
    const scrapRecoverDate = ref(todayIsoDate())
    const scrapRecoverSettlement = ref<ScrapSettlementMode>('offset')
    const scrapRecoverName = ref('铜屑')
    const scrapRecoverQuantity = ref<any>('')
    const scrapRecoverUnitPrice = ref<any>('')
    const scrapRecoverNote = ref('')
    const scrapExchangeRows = ref<Array<{
      material_name: string
      material_spec: string
      material_unit: string
      material_quantity: any
      material_unit_price: any
    }>>([])
    const customerLedgerColumnKeys = ['biz_kind', 'date', 'doc_no', 'contract_no', 'product_name', 'spec', 'unit', 'quantity', 'unit_price', 'amount_in', 'remaining_receivable', 'amount_out', 'note']
    const supplierLedgerColumnKeys = ['biz_kind', 'date', 'doc_no', 'contract_no', 'product_name', 'spec', 'unit', 'quantity', 'unit_price', 'amount_in', 'amount_out', 'note']
    let loadGeneration = 0
    const displayColumns = computed(() => {
      if (props.page === 'customer' && customerDetailDialog.value) {
        return [...customerLedgerColumnKeys, 'attachments']
      }
      if (props.page === 'supplier' && supplierDetailDialog.value) {
        return [...supplierLedgerColumnKeys, 'attachments']
      }
      return [...config.value.columns, 'attachments']
    })
    const displayAttachments = computed(() => attachments.value.filter((item: any) => !pendingAttachmentDeletes.value.includes(item.id)))
    const years = yearOptions()
    const months = monthOptions()

    const buildLedgerFilters = (partyName = '') => {
      const params: any = { keyword: keyword.value }
      if (config.value.filterField) {
        params[config.value.filterField] = partyName
          || (props.page === 'customer' && customerDetailDialog.value ? customerDetailName.value : '')
          || (props.page === 'supplier' && supplierDetailDialog.value ? supplierDetailName.value : '')
          || filterValue.value
      }
      if (yearFilter.value) params.year = yearFilter.value
      if (monthFilter.value) params.month = monthFilter.value
      if (startDate.value) params.startDate = startDate.value
      if (endDate.value) params.endDate = endDate.value
      return params
    }

    const fetchCustomerDetailData = async (gen: number) => {
      if (!customerDetailName.value) return
      const name = customerDetailName.value
      const listParams = {
        customerName: name,
        entryType: 'all',
        page: 1,
        pageSize: 10000,
      }
      const [res, sum] = await Promise.all([
        config.value.api.list(listParams),
        config.value.api.summary({ customerName: name }),
      ])
      if (gen !== loadGeneration) return
      rows.value = sortCustomerLedgerGrouped(res.rows || [])
      total.value = res.total
      customerDetailSummary.value = sum
    }

    const fetchCustomerOverview = async (gen: number) => {
      const names = await config.value.api.names()
      if (gen !== loadGeneration) return
      filterOptions.value = names.map((x: any) => x[config.value.filterKey])
      const overview = await config.value.api.summary(buildLedgerFilters())
      if (gen !== loadGeneration) return
      rows.value = []
      total.value = 0
      selected.value = []
      summary.value = overview
    }

    const fetchSupplierDetailData = async (gen: number) => {
      if (!supplierDetailName.value) return
      const name = supplierDetailName.value
      const listParams = { supplierName: name, entryType: 'all', page: 1, pageSize: 10000 }
      const [res, sum] = await Promise.all([
        config.value.api.list(listParams),
        config.value.api.summary({ supplierName: name }),
      ])
      if (gen !== loadGeneration) return
      rows.value = sortSupplierLedgerGrouped(res.rows || [])
      total.value = res.total
      supplierDetailSummary.value = sum
      supplierDetailType.value = normalizeSupplierType(sum?.supplier_type)
    }

    const fetchSupplierOverview = async (gen: number) => {
      const names = await config.value.api.names()
      if (gen !== loadGeneration) return
      filterOptions.value = names.map((x: any) => x[config.value.filterKey])
      const overview = await config.value.api.summary(buildLedgerFilters())
      if (gen !== loadGeneration) return
      rows.value = []
      total.value = 0
      selected.value = []
      summary.value = overview
    }

    const load = async () => {
      const gen = ++loadGeneration
      loading.value = true
      try {
        if (props.page === 'customer') {
          if (customerDetailDialog.value && customerDetailName.value) {
            await fetchCustomerDetailData(gen)
          } else {
            await fetchCustomerOverview(gen)
          }
          return
        }
        if (props.page === 'supplier') {
          if (supplierDetailDialog.value && supplierDetailName.value) {
            await fetchSupplierDetailData(gen)
          } else {
            await fetchSupplierOverview(gen)
          }
          return
        }
        const params: any = { ...buildLedgerFilters(), page: currentPage.value, pageSize: config.value.pageSize }
        const res = await config.value.api.list(params)
        if (gen !== loadGeneration) return
        rows.value = res.rows
        total.value = res.total
        if (props.page !== 'stockIn' && props.page !== 'stockOut') {
          if (config.value.filterField) {
            const names = await config.value.api.names()
            if (gen !== loadGeneration) return
            filterOptions.value = names.map((x: any) => x[config.value.filterKey])
            summary.value = await config.value.api.summary(buildLedgerFilters())
          } else {
            summary.value = await config.value.api.summary(buildLedgerFilters())
          }
        } else {
          summary.value = {}
          if (config.value.filterField) {
            const names = await config.value.api.names()
            if (gen !== loadGeneration) return
            filterOptions.value = names.map((x: any) => x[config.value.filterKey])
          }
        }
      } finally {
        if (gen === loadGeneration) loading.value = false
      }
    }

    const resetSelection = () => { selected.value = []; currentPage.value = 1 }
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
      if (props.page !== 'stockIn' && props.page !== 'customer' && props.page !== 'supplier') return
      const res = await productAPI.list({ page: 1, pageSize: 500, keyword: '' })
      productOptions.value = res.rows || []
    }
    const loadMaterialOptions = async () => {
      if (props.page !== 'stockIn') return
      materialOptions.value = await stockInAPI.materialOptions().catch(() => [])
    }
    const loadProfileOptions = async () => {
      if (props.page === 'stockOut') {
        const names = await customerAPI.profileNames()
        profileOptions.value = names.map((x: any) => x.customer_name).filter(Boolean)
        return
      }
      if (props.page === 'stockIn') {
        const names = await supplierAPI.profileNames()
        profileOptions.value = names.map((x: any) => x.supplier_name).filter(Boolean)
        return
      }
      profileOptions.value = []
    }
    const loadRecordOptions = async () => {
      await Promise.all([loadInventoryOptions(), loadProductOptions(), loadProfileOptions(), loadMaterialOptions()])
    }
    const loadStockInSupplierType = async (supplierName: string) => {
      const name = String(supplierName || '').trim()
      if (!name) {
        stockInSupplierType.value = 'outsourcing'
        return
      }
      try {
        const profile = await supplierAPI.profile(name)
        stockInSupplierType.value = normalizeSupplierType(profile?.supplier_type)
      } catch {
        stockInSupplierType.value = 'outsourcing'
      }
    }
    const openAdd = async (mode: 'sale' | 'return' | 'payment' | 'payable' = 'sale') => {
      if (props.page === 'customer' && !customerDetailName.value && !filterValue.value) {
        openCustomerPickAndAdd(mode as 'sale' | 'return' | 'payment')
        return
      }
      if (props.page === 'supplier' && !supplierDetailDialog.value) {
        emit('notify', props.t('selectSupplierToAdd'), 'warning')
        return
      }
      if (props.page === 'supplier' && mode !== 'payment' && mode !== 'return') {
        emit('notify', props.t('supplierPayableAutoOnly'), 'warning')
        return
      }
      editing.value = null
      Object.keys(form).forEach(k => delete form[k])
      attachments.value = []
      pendingAttachments.value = []
      pendingAttachmentDeletes.value = []
      if (props.page === 'customer') customerEntryMode.value = mode as 'sale' | 'return' | 'payment'
      if (props.page === 'supplier') supplierEntryMode.value = mode === 'payment' ? 'payment' : mode === 'return' ? 'return' : 'payable'
      const activeName = props.page === 'supplier'
        ? (supplierDetailName.value || filterValue.value)
        : (customerDetailName.value || filterValue.value)
      if (activeName && config.value.filterKey) form[config.value.filterKey] = activeName
      if (props.page === 'customer' || props.page === 'supplier') form.date = todayIsoDate()
      if (props.page === 'customer' && mode === 'payment') {
        form.product_name = '付款'
        form.amount_in = 0
      }
      if (props.page === 'supplier' && mode === 'payment') {
        form.product_name = '付款'
        form.amount_in = 0
      }
      if (props.page === 'customer' && (mode === 'sale' || mode === 'return')) {
        form.amount_out = 0
        form.quantity = 1
        form.unit_price = 0
        if (mode === 'return') form.note = '退货'
        autoFillAmountFields(form, 'quantity')
      }
      if (props.page === 'supplier' && mode === 'return') {
        form.note = '退货'
      }
      if (props.page === 'supplier' && mode !== 'payment' && mode !== 'return') {
        form.amount_out = 0
        form.quantity = 1
        form.unit_price = 0
        autoFillAmountFields(form, 'quantity')
      }
      if (props.page === 'stockIn') {
        await loadStockInSupplierType(String(form.supplier_name || ''))
        if (isMaterialSupplierType(stockInSupplierType.value)) {
          form.material_quantity = Number(form.material_quantity || 0)
          form.material_unit_price = Number(form.material_unit_price || 0)
        }
      }
      await loadRecordOptions()
      if (customerDetailDialog.value) await nextTick()
      if (supplierDetailDialog.value) await nextTick()
      dialog.value = true
    }
    const refreshCustomerWorkspace = async () => {
      if (!customerDetailName.value) return
      keyword.value = ''
      yearFilter.value = ''
      monthFilter.value = ''
      startDate.value = ''
      endDate.value = ''
      currentPage.value = 1
      await customerAPI.backfillFromStockOut(customerDetailName.value).catch(() => null)
      await load()
    }
    const refreshSupplierWorkspace = async () => {
      if (!supplierDetailName.value) return
      keyword.value = ''
      yearFilter.value = ''
      monthFilter.value = ''
      startDate.value = ''
      endDate.value = ''
      currentPage.value = 1
      await supplierAPI.backfillFromStockIn(supplierDetailName.value).catch(() => null)
      await load()
    }
    const openCustomerWorkspace = async (customerName: string) => {
      customerDetailName.value = customerName
      customerDetailDialog.value = true
      filterValue.value = customerName
      keyword.value = ''
      resetSelection()
      await customerAPI.backfillFromStockOut(customerName).catch(() => null)
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
    const openCustomerAddDirect = async (customerName: string, mode: 'sale' | 'return' | 'payment') => {
      customerDetailName.value = customerName
      filterValue.value = customerName
      customerEntryMode.value = mode
      await openAdd(mode)
    }
    const openCustomerPickAndAdd = (mode: 'sale' | 'return' | 'payment') => {
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
      customerCreateForm.contact_person = ''
      customerCreateForm.phone = ''
      customerCreateForm.address = ''
      customerCreateForm.opening_balance = 0
      customerCreateForm.opening_reason = ''
      customerCreateForm.note = ''
      customerCreateDialog.value = true
    }
    const saveCustomerCreate = async () => {
      const name = String(customerCreateForm.customer_name || '').trim()
      if (!name) {
        emit('notify', props.t('selectCustomerToAdd'), 'warning')
        return
      }
      if (Math.abs(Number(customerCreateForm.opening_balance || 0)) > 0.005 && !String(customerCreateForm.opening_reason || '').trim()) {
        emit('notify', '请填写上期欠款原因', 'warning')
        return
      }
      try {
        await customerAPI.create({
          customer_name: name,
          contact_person: customerCreateForm.contact_person || '',
          phone: customerCreateForm.phone || '',
          address: customerCreateForm.address || '',
          opening_balance: Number(customerCreateForm.opening_balance || 0),
          opening_reason: customerCreateForm.opening_reason || '',
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
    const openSupplierCreate = () => {
      supplierCreateForm.supplier_name = ''
      supplierCreateForm.supplier_type = 'outsourcing'
      supplierCreateForm.contact_person = ''
      supplierCreateForm.phone = ''
      supplierCreateForm.address = ''
      supplierCreateForm.opening_balance = 0
      supplierCreateForm.opening_reason = ''
      supplierCreateForm.note = ''
      supplierCreateDialog.value = true
    }
    const saveSupplierCreate = async () => {
      const name = String(supplierCreateForm.supplier_name || '').trim()
      if (!name) {
        emit('notify', props.t('selectSupplierToAdd'), 'warning')
        return
      }
      if (Math.abs(Number(supplierCreateForm.opening_balance || 0)) > 0.005 && !String(supplierCreateForm.opening_reason || '').trim()) {
        emit('notify', '请填写期初应付原因', 'warning')
        return
      }
      try {
        await supplierAPI.create({
          supplier_name: name,
          supplier_type: supplierCreateForm.supplier_type,
          contact_person: supplierCreateForm.contact_person || '',
          phone: supplierCreateForm.phone || '',
          address: supplierCreateForm.address || '',
          opening_balance: Number(supplierCreateForm.opening_balance || 0),
          opening_reason: supplierCreateForm.opening_reason || '',
          note: supplierCreateForm.note || '',
        })
        supplierCreateDialog.value = false
        emit('notify', props.t('supplierCreated'))
      } catch (error: any) {
        emit('notify', error?.message || '添加失败', 'error')
        return
      }
      try {
        await load()
      } catch {
        // 档案已保存，刷新失败不影响创建结果
      }
    }
    const openSupplierWorkspace = async (supplierName: string) => {
      supplierDetailName.value = supplierName
      supplierDetailDialog.value = true
      filterValue.value = supplierName
      keyword.value = ''
      resetSelection()
      await supplierAPI.backfillFromStockIn(supplierName).catch(() => null)
      await load()
    }
    const closeSupplierWorkspace = () => {
      supplierDetailDialog.value = false
      supplierDetailName.value = ''
      filterValue.value = ''
      supplierDetailSummary.value = {}
      resetSelection()
      load()
    }
    const activeSupplierName = () => supplierDetailName.value || filterValue.value
    const openSupplierProfile = async () => {
      if (props.page !== 'supplier') return
      const name = activeSupplierName()
      if (!name) return
      const profile = await supplierAPI.profile(name)
      supplierProfileForm.supplier_type = normalizeSupplierType(profile.supplier_type)
      supplierProfileForm.contact_person = profile.contact_person || ''
      supplierProfileForm.phone = profile.phone || ''
      supplierProfileForm.address = profile.address || ''
      supplierProfileForm.opening_balance = Number(profile.opening_balance || 0)
      supplierProfileForm.opening_reason = profile.opening_reason || ''
      supplierProfileForm.note = profile.note || ''
      supplierProfileDialog.value = true
    }
    const saveSupplierProfile = async () => {
      const name = activeSupplierName()
      if (!name) return
      if (Math.abs(Number(supplierProfileForm.opening_balance || 0)) > 0.005 && !String(supplierProfileForm.opening_reason || '').trim()) {
        emit('notify', '请填写期初应付原因', 'warning')
        return
      }
      await supplierAPI.setProfile({
        supplier_name: name,
        supplier_type: supplierProfileForm.supplier_type,
        contact_person: supplierProfileForm.contact_person || '',
        phone: supplierProfileForm.phone || '',
        address: supplierProfileForm.address || '',
        opening_balance: Number(supplierProfileForm.opening_balance || 0),
        opening_reason: supplierProfileForm.opening_reason || '',
        note: supplierProfileForm.note || '',
      })
      supplierProfileDialog.value = false
      emit('notify', props.t('customerProfileSaved'))
      load()
    }
    const removeSupplier = async (supplierName: string) => {
      const name = String(supplierName || '').trim()
      if (!name) return
      try {
        const preview = await supplierAPI.removePreview(name)
        if (preview.stockInCount > 0) {
          emit('notify', t('supplierRemoveBlockedStockIn', { count: preview.stockInCount }), 'error')
          return
        }
        const message = preview.ledgerCount > 0
          ? t('confirmDeleteSupplierMessage', { name, ledgerCount: preview.ledgerCount })
          : t('confirmDeleteSupplierProfileOnly', { name })
        const ok = await askConfirm({
          title: t('confirmDeleteSupplierTitle'),
          message,
          confirmColor: 'error',
          confirmLabel: t('deleteSupplier'),
        })
        if (!ok) return
        await supplierAPI.remove(name)
        if (supplierDetailName.value === name) closeSupplierWorkspace()
        if (filterValue.value === name) filterValue.value = ''
        emit('notify', props.t('supplierRemoved'))
        load()
      } catch (error: any) {
        emit('notify', error?.message || '删除失败', 'error')
      }
    }
    const openPaymentForPayableRow = async (row: any) => {
      editing.value = null
      Object.keys(form).forEach(k => delete form[k])
      linkedPayableRow.value = row
      supplierEntryMode.value = 'payment'
      form.supplier_name = supplierDetailName.value || row.supplier_name
      form.ref_ledger_id = row.id
      form.date = todayIsoDate()
      const linked = listSupplierLedgerLinkedToPayable(Number(row.id || 0), rows.value)
      form.amount_out = calcSupplierPayableRemaining(row.amount_in, linked)
      form.product_name = '付款'
      form.note = `付 ${row.product_name || '应付'}`.trim()
      await loadRecordOptions()
      dialog.value = true
    }
    const openReturnForPayableRow = async (row: any) => {
      const linked = listSupplierLedgerLinkedToPayable(Number(row.id || 0), rows.value)
      const remaining = calcSupplierPayableRemaining(row.amount_in, linked)
      if (remaining <= 0.005) {
        emit('notify', '该笔已结清，不能退货。', 'warning')
        return
      }
      editing.value = null
      Object.keys(form).forEach(k => delete form[k])
      linkedPayableRow.value = row
      supplierEntryMode.value = 'return'
      form.supplier_name = supplierDetailName.value || row.supplier_name
      form.ref_ledger_id = row.id
      form.date = todayIsoDate()
      form.contract_no = row.contract_no || ''
      form.quantity = Math.abs(Number(row.quantity || 0))
      form.unit_price = Math.abs(Number(row.unit_price || 0))
      form.note = '退货'
      await loadRecordOptions()
      dialog.value = true
    }
    const openSupplierPaymentFromLedger = async () => {
      await openAdd('payment')
      linkedPayableRow.value = null
      form.ref_ledger_id = null
      form.note = '付款'
    }
    const openSupplierProductReturn = async () => {
      const supplierName = supplierDetailName.value || filterValue.value
      if (!supplierName) return
      if (isMaterialSupplierType(supplierDetailType.value)) {
        productReturnKind.value = 'supplierMaterial'
        productReturnDate.value = todayIsoDate()
        productReturnNote.value = '原材料退货'
        productReturnLoading.value = true
        productReturnDialog.value = true
        try {
          const options = await supplierAPI.materialReturnOptions(supplierName)
          productReturnRows.value = (options || []).map((item: any) => ({
            ...item,
            selected: false,
            quantity: '',
            unit_price: Number(item.unit_price || 0),
            note: '',
          }))
        } finally {
          productReturnLoading.value = false
        }
        return
      }
      productReturnKind.value = 'supplier'
      productReturnDate.value = todayIsoDate()
      productReturnNote.value = '退货'
      productReturnLoading.value = true
      productReturnDialog.value = true
      try {
        const options = await supplierAPI.returnProductOptions(supplierName)
        productReturnRows.value = (options || []).map((item: any) => ({
          ...item,
          selected: false,
          quantity: '',
          unit_price: Number(item.unit_price || 0),
          note: '',
        }))
      } finally {
        productReturnLoading.value = false
      }
    }
    const openSupplierMaterialReturn = async () => {
      const supplierName = supplierDetailName.value || filterValue.value
      if (!supplierName) return
      materialReturnDate.value = todayIsoDate()
      materialReturnQuantity.value = ''
      materialReturnUnitPrice.value = 0
      materialReturnMaxQty.value = 0
      materialReturnNote.value = '原材料退货'
      materialReturnLoading.value = true
      materialReturnDialog.value = true
      try {
        const option = await supplierAPI.materialReturnOption(supplierName)
        materialReturnMaxQty.value = Number(option?.max_qty || 0)
        materialReturnUnitPrice.value = Number(option?.unit_price || 0)
      } catch (error: any) {
        emit('notify', error?.message || '读取可退公斤数失败', 'error')
        materialReturnDialog.value = false
      } finally {
        materialReturnLoading.value = false
      }
    }
    const saveSupplierMaterialReturn = async () => {
      const supplierName = supplierDetailName.value || filterValue.value
      const qty = Math.abs(Number(materialReturnQuantity.value || 0))
      const price = Math.abs(Number(materialReturnUnitPrice.value || 0))
      if (!supplierName) return
      if (qty <= 0) {
        emit('notify', '请填写退货公斤数', 'warning')
        return
      }
      if (qty - materialReturnMaxQty.value > 0.005) {
        emit('notify', `最多可退 ${materialReturnMaxQty.value} 公斤`, 'warning')
        return
      }
      if (price <= 0) {
        emit('notify', '请填写材料单价', 'warning')
        return
      }
      materialReturnLoading.value = true
      try {
        const result = await supplierAPI.returnMaterial({
          supplier_name: supplierName,
          date: materialReturnDate.value,
          quantity: qty,
          unit_price: price,
          note: materialReturnNote.value,
        })
        if (!result?.ok) throw new Error(result?.error || '退货失败')
        emit('notify', '已登记原材料退货')
        materialReturnDialog.value = false
        await load()
        const newId = Number(result?.row?.id || 0)
        if (newId > 0) selected.value = [newId]
      } catch (error: any) {
        emit('notify', error?.message || '退货失败', 'error')
      } finally {
        materialReturnLoading.value = false
      }
    }
    const openSupplierScrapRecover = () => {
      const supplierName = supplierDetailName.value || filterValue.value
      if (!supplierName) return
      scrapRecoverDate.value = todayIsoDate()
      scrapRecoverSettlement.value = 'offset'
      scrapRecoverName.value = '铜屑'
      scrapRecoverQuantity.value = ''
      scrapRecoverUnitPrice.value = ''
      scrapRecoverNote.value = ''
      scrapExchangeRows.value = [{
        material_name: '',
        material_spec: '',
        material_unit: '公斤',
        material_quantity: '',
        material_unit_price: '',
      }]
      scrapRecoverDialog.value = true
    }
    const scrapRecoverAmount = () => roundMoneyValue(
      Math.abs(Number(scrapRecoverQuantity.value || 0)) * Math.abs(Number(scrapRecoverUnitPrice.value || 0)),
    )
    const saveSupplierScrapRecover = async () => {
      const supplierName = supplierDetailName.value || filterValue.value
      const qty = Math.abs(Number(scrapRecoverQuantity.value || 0))
      const price = Math.abs(Number(scrapRecoverUnitPrice.value || 0))
      if (!supplierName) return
      if (!String(scrapRecoverName.value || '').trim()) {
        emit('notify', '请填写废料名称', 'warning')
        return
      }
      if (qty <= 0) {
        emit('notify', '请填写废料公斤数', 'warning')
        return
      }
      if (price <= 0) {
        emit('notify', '请填写废料回收单价', 'warning')
        return
      }
      const exchangeItems = scrapRecoverSettlement.value === 'exchange'
        ? scrapExchangeRows.value
          .map(item => ({
            material_name: String(item.material_name || '').trim(),
            material_spec: String(item.material_spec || '').trim(),
            material_unit: String(item.material_unit || '公斤').trim() || '公斤',
            material_quantity: Math.abs(Number(item.material_quantity || 0)),
            material_unit_price: Math.abs(Number(item.material_unit_price || 0)),
          }))
          .filter(item => item.material_quantity > 0)
        : []
      if (scrapRecoverSettlement.value === 'exchange') {
        if (!exchangeItems.length) {
          emit('notify', '换新料请填写置换材料', 'warning')
          return
        }
        for (const item of exchangeItems) {
          if (!item.material_name) {
            emit('notify', '请填写置换材料名称', 'warning')
            return
          }
          if (item.material_unit_price <= 0) {
            emit('notify', `请填写「${item.material_name}」单价`, 'warning')
            return
          }
        }
      }
      scrapRecoverLoading.value = true
      try {
        const result = await supplierAPI.scrapRecover({
          supplier_name: supplierName,
          date: scrapRecoverDate.value,
          settlement: scrapRecoverSettlement.value,
          scrap_name: String(scrapRecoverName.value || '').trim(),
          quantity: qty,
          unit_price: price,
          note: scrapRecoverNote.value,
          exchange_items: exchangeItems,
        })
        if (!result?.ok) throw new Error(result?.error || '废料回收失败')
        const modeLabel = scrapRecoverSettlement.value === 'exchange'
          ? '废料换料'
          : scrapRecoverSettlement.value === 'cash'
            ? '废料兑现'
            : '废料回收'
        emit('notify', `已登记${modeLabel}`)
        scrapRecoverDialog.value = false
        await load()
        const newId = Number(result?.row?.id || 0)
        if (newId > 0) selected.value = [newId]
      } catch (error: any) {
        emit('notify', error?.message || '废料回收失败', 'error')
      } finally {
        scrapRecoverLoading.value = false
      }
    }
    const supplierLinkedToPayable = (row: any) => {
      if (isSupplierPayableRecord(row)) {
        return listSupplierLedgerLinkedToPayable(Number(row.id || 0), rows.value)
      }
      const refId = Number(row.ref_ledger_id || 0)
      return refId ? listSupplierLedgerLinkedToPayable(refId, rows.value) : []
    }
    const supplierPayableRemaining = (row: any) => calcSupplierPayableRemaining(row.amount_in, supplierLinkedToPayable(row))
    const supplierRowActions = (row: any) => {
      if (props.page !== 'supplier' || !supplierDetailDialog.value) {
        return { showPay: false, showReturn: false, showEdit: true, showDelete: true }
      }
      const linked = supplierLinkedToPayable(row)
      const remaining = isSupplierPayableRecord(row) ? supplierPayableRemaining(row) : undefined
      const allowReturn = isOutsourcingSupplierType(supplierDetailType.value)
      return getSupplierLedgerRowActions(row, linked, remaining, allowReturn)
    }
    const canPaySupplierRow = (row: any) => supplierRowActions(row).showPay
    const canReturnSupplierRow = (row: any) => supplierRowActions(row).showReturn
    const renderOverviewActionLink = (label: string, onClick: () => void, options: { danger?: boolean } = {}) => h('button', {
      type: 'button',
      class: ['overview-action-link', options.danger ? 'overview-action-link--danger' : ''],
      onClick: (event: MouseEvent) => {
        event.stopPropagation()
        onClick()
      },
    }, label)
    const formatCustomerRemainingCell = (row: any) => {
      if (!isCustomerReceivableRecord(row)) return '—'
      const linked = customerLinkedToReceivable(row)
      const { remaining, overpaid } = calcCustomerReceivableSettlement(row.amount_in, linked)
      if (remaining > 0.005) return formatCustomerReceivableDisplay(remaining)
      if (overpaid > 0.005) return `${props.t('customerOverpaid')} ${formatCustomerReceivableDisplay(overpaid)}`
      return props.t('customerSettledTag')
    }
    const openReturnForRow = async (row: any) => {
      const remaining = customerReceivableRemaining(row)
      if (remaining <= 0.005) {
        emit('notify', '该笔已结清，不能退货。若退的是后面一批货，请点对应那笔应收的「退货」。', 'warning')
        return
      }
      editing.value = null
      Object.keys(form).forEach(k => delete form[k])
      attachments.value = []
      pendingAttachments.value = []
      pendingAttachmentDeletes.value = []
      linkedReceivableRow.value = row
      customerEntryMode.value = 'return'
      form.customer_name = customerDetailName.value || row.customer_name
      form.ref_ledger_id = row.id
      form.date = todayIsoDate()
      form.contract_no = row.contract_no || ''
      form.quantity = Math.abs(Number(row.quantity || 0))
      form.unit_price = Math.abs(Number(row.unit_price || 0))
      form.note = '退货'
      await loadRecordOptions()
      dialog.value = true
    }
    const applyLinkedReturnProductFields = (payload: Record<string, any>, refRow: any) => {
      if (!refRow) return
      payload.product_name = refRow.product_name || ''
      payload.spec = refRow.spec || ''
      payload.unit = refRow.unit || ''
    }
    const customerReceivableRemaining = (row: any) => {
      if (Number(row?.remaining_receivable ?? NaN) >= 0) {
        return Number(row.remaining_receivable)
      }
      const linked = rows.value.filter((item: any) => Number(item.ref_ledger_id || 0) === Number(row.id || 0))
      return calcCustomerReceivableRemaining(row.amount_in, linked)
    }
    const customerLinkedToReceivable = (row: any) => {
      if (isCustomerReceivableRecord(row)) {
        return listCustomerLedgerLinkedToReceivable(Number(row.id || 0), rows.value)
      }
      const refId = Number(row.ref_ledger_id || 0)
      return refId ? listCustomerLedgerLinkedToReceivable(refId, rows.value) : []
    }
    const customerRowActions = (row: any) => {
      if (props.page !== 'customer' || !customerDetailDialog.value) {
        return { showReceive: false, showReturn: false, showEdit: true, showDelete: true }
      }
      const linked = customerLinkedToReceivable(row)
      const remaining = isCustomerReceivableRecord(row) ? customerReceivableRemaining(row) : undefined
      return getCustomerLedgerRowActions(row, linked, remaining)
    }
    const formatLinkedReceivablePaymentHint = (row: any) => {
      const original = Number(row.amount_in || 0)
      const remaining = customerReceivableRemaining(row)
      if (remaining < original - 0.005) {
        return `${props.t('customerRemainingToReceive')} ${formatCustomerReceivableDisplay(remaining)}（${props.t('customerReceivable')} ${formatCustomerReceivableDisplay(original)}）`
      }
      return `${props.t('customerReceivable')} ${formatCustomerReceivableDisplay(original)}`
    }
    const openPaymentForRow = async (row: any) => {
      editing.value = null
      Object.keys(form).forEach(k => delete form[k])
      attachments.value = []
      pendingAttachments.value = []
      pendingAttachmentDeletes.value = []
      linkedReceivableRow.value = row
      customerEntryMode.value = 'payment'
      form.customer_name = customerDetailName.value || row.customer_name
      form.ref_ledger_id = row.id
      form.date = todayIsoDate()
      form.amount_out = customerReceivableRemaining(row)
      form.product_name = '付款'
      form.note = `收 ${row.product_name || '应收'}`.trim()
      await loadRecordOptions()
      dialog.value = true
    }
    const openCustomerPaymentFromLedger = async () => {
      await openAdd('payment')
      linkedReceivableRow.value = null
      form.ref_ledger_id = null
      form.note = '收款'
    }
    const openCustomerProductReturn = async () => {
      const customerName = customerDetailName.value || filterValue.value
      if (!customerName) return
      productReturnKind.value = 'customer'
      productReturnDate.value = todayIsoDate()
      productReturnNote.value = '退货'
      productReturnLoading.value = true
      productReturnDialog.value = true
      try {
        const options = await customerAPI.returnProductOptions(customerName)
        productReturnRows.value = (options || []).map((item: any) => ({
          ...item,
          selected: false,
          quantity: '',
          unit_price: Number(item.unit_price || 0),
          note: '',
        }))
      } finally {
        productReturnLoading.value = false
      }
    }
    const saveProductReturn = async () => {
      const partyName = productReturnKind.value === 'customer'
        ? (customerDetailName.value || filterValue.value)
        : (supplierDetailName.value || filterValue.value)
      const items = productReturnRows.value
        .filter((item: any) => item.selected && Number(item.quantity || 0) > 0)
        .map((item: any) => ({
          product_name: item.product_name,
          spec: item.spec || '',
          unit: item.unit || '',
          quantity: Number(item.quantity || 0),
          unit_price: Number(item.unit_price || 0),
          note: item.note || '',
        }))
      if (!items.length) {
        emit('notify', '请选择退货产品并填写数量', 'warning')
        return
      }
      for (const item of items) {
        const option = productReturnRows.value.find((row: any) =>
          row.product_name === item.product_name && (row.spec || '') === (item.spec || '') && (row.unit || '') === (item.unit || '')
        )
        if (Number(item.quantity || 0) - Number(option?.max_qty || 0) > 0.005) {
          emit('notify', `「${item.product_name}」最多可退 ${option?.max_qty || 0}`, 'warning')
          return
        }
      }
      productReturnLoading.value = true
      try {
        const payload = {
          date: productReturnDate.value,
          note: productReturnNote.value,
          items,
          ...(productReturnKind.value === 'customer'
            ? { customer_name: partyName }
            : { supplier_name: partyName }),
        }
        const result = productReturnKind.value === 'customer'
          ? await customerAPI.returnProducts(payload)
          : productReturnKind.value === 'supplierMaterial'
            ? await supplierAPI.returnMaterials(payload)
            : await supplierAPI.returnProducts(payload)
        if (!result?.ok) throw new Error(result?.error || '退货失败')
        emit('notify', `已登记 ${result.count || items.length} 条退货`)
        productReturnDialog.value = false
        await load()
        const newIds = (result.rows || []).map((row: any) => Number(row.id || 0)).filter((id: number) => id > 0)
        if (newIds.length) selected.value = newIds
      } catch (error: any) {
        emit('notify', error?.message || '退货失败', 'error')
      } finally {
        productReturnLoading.value = false
      }
    }
    const canReturnRow = (row: any) => customerRowActions(row).showReturn
    const canReceiveRow = (row: any) => customerRowActions(row).showReceive
    const openEdit = async (row: any) => {
      const actions = customerRowActions(row)
      if (!actions.showEdit) {
        emit('notify', actions.editTip || '不能编辑', 'warning')
        return
      }
      editing.value = row
      Object.assign(form, row)
      form.date = normalizeDateValue(form.date)
      linkedReceivableRow.value = null
      linkedPayableRow.value = null
      customerLedgerFinancialLocked.value = false
      if (props.page === 'customer' && (isCustomerPaymentDescription(form.description) || isCustomerPaymentRecord(row))) {
        form.product_name = '付款'
        customerEntryMode.value = 'payment'
        if (Number(row.ref_ledger_id || 0) > 0) {
          linkedReceivableRow.value = rows.value.find((item: any) => item.id === Number(row.ref_ledger_id)) || null
        }
      } else if (props.page === 'customer' && isCustomerReturnRecord(row)) {
        customerEntryMode.value = 'return'
        if (Number(form.quantity) < 0) form.quantity = Math.abs(Number(form.quantity))
        if (Number(row.ref_ledger_id || 0) > 0) {
          linkedReceivableRow.value = rows.value.find((item: any) => item.id === Number(row.ref_ledger_id)) || null
        }
      } else if (props.page === 'customer' && !form.product_name && form.description) {
        Object.assign(form, parseCustomerDescription(form.description))
        customerEntryMode.value = 'sale'
      } else if (props.page === 'customer') {
        customerEntryMode.value = Number(form.amount_out) > 0 && !Number(form.amount_in) ? 'payment' : 'sale'
      }
      if (props.page === 'customer') {
        customerLedgerFinancialLocked.value = customerLedgerFinancialFieldsLocked(row, customerLinkedToReceivable(row))
      } else if (props.page === 'supplier' && isSupplierReturnRecord(row)) {
        supplierEntryMode.value = 'return'
        if (Number(form.quantity) < 0) form.quantity = Math.abs(Number(form.quantity))
        if (Number(row.ref_ledger_id || 0) > 0) {
          linkedPayableRow.value = rows.value.find((item: any) => item.id === Number(row.ref_ledger_id)) || null
        }
      } else if (props.page === 'supplier' && (isSupplierPaymentDescription(form.description) || isSupplierPaymentRecord(row))) {
        form.product_name = '付款'
        supplierEntryMode.value = 'payment'
        if (Number(row.ref_ledger_id || 0) > 0) {
          linkedPayableRow.value = rows.value.find((item: any) => item.id === Number(row.ref_ledger_id)) || null
        }
      } else if (props.page === 'supplier') {
        supplierEntryMode.value = Number(form.amount_out) > 0 && !Number(form.amount_in) ? 'payment' : 'payable'
      }
      if (props.page === 'stockIn') {
        await loadStockInSupplierType(String(form.supplier_name || ''))
      }
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
            let qty = Number(payload.quantity || 0)
            const price = Number(payload.unit_price || 0)
            if (customerEntryMode.value === 'return') {
              if (!Number(payload.ref_ledger_id || 0) && !editing.value) {
                emit('notify', props.t('selectSaleRowToReturn'), 'warning')
                return
              }
              if (Number(payload.ref_ledger_id || 0)) {
                applyLinkedReturnProductFields(
                  payload,
                  linkedReceivableRow.value
                    || rows.value.find((item: any) => item.id === Number(payload.ref_ledger_id || 0)),
                )
              }
              if (!String(payload.product_name || '').trim()) {
                emit('notify', '请选择退货产品', 'warning')
                return
              }
              if (qty <= 0 || price <= 0) {
                emit('notify', '请填写退货数量与单价（正数）', 'warning')
                return
              }
              payload.quantity = Math.abs(qty)
              payload.unit_price = Math.abs(price)
              if (!String(payload.note || '').includes('退货')) {
                payload.note = payload.note ? `${payload.note} 退货` : '退货'
              }
              payload.description = buildCustomerDescription(payload)
              payload.amount_out = 0
              payload.amount_in = 0
            } else {
              if (!String(payload.product_name || '').trim()) {
                emit('notify', '请选择或填写产品', 'warning')
                return
              }
              if (qty <= 0 || price <= 0) {
                emit('notify', '请填写数量与单价', 'warning')
                return
              }
              payload.description = buildCustomerDescription(payload)
              payload.amount_out = 0
              payload.amount_in = roundMoneyValue(qty * Math.abs(price))
            }
          }
          normalizeCustomerLedgerPayload(payload)
          if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
            emit('notify', '请填写日期', 'warning')
            return
          }
        }
        if (props.page === 'supplier') {
          if (!String(payload.supplier_name || '').trim()) {
            emit('notify', props.t('selectSupplierToAdd'), 'warning')
            return
          }
          if (supplierEntryMode.value === 'payment' || isSupplierPaymentRecord(payload)) {
            payload.description = '付款'
            payload.product_name = '付款'
            payload.contract_no = ''
            payload.spec = ''
            payload.unit = ''
            payload.quantity = 0
            payload.unit_price = 0
            payload.amount_in = 0
            if (Number(payload.amount_out || 0) <= 0) {
              emit('notify', '请填写付款金额', 'warning')
              return
            }
          } else if (supplierEntryMode.value === 'return' || isSupplierReturnRecord(payload)) {
            if (!Number(payload.ref_ledger_id || 0) && !editing.value) {
              emit('notify', props.t('selectPayableRowToReturn'), 'warning')
              return
            }
            const qty = Math.abs(Number(payload.quantity || 0))
            const price = Math.abs(Number(payload.unit_price || 0))
            if (qty <= 0 || price <= 0) {
              emit('notify', '请填写退货数量与单价（正数）', 'warning')
              return
            }
            payload.quantity = qty
            payload.unit_price = price
            payload.amount_in = 0
            payload.amount_out = 0
            applyLinkedReturnProductFields(
              payload,
              linkedPayableRow.value
                || rows.value.find((item: any) => item.id === Number(payload.ref_ledger_id || 0)),
            )
            if (!String(payload.note || '').includes('退货')) {
              payload.note = payload.note ? `${payload.note} 退货` : '退货'
            }
          } else {
            if (!editing.value) {
              emit('notify', props.t('supplierPayableAutoOnly'), 'warning')
              return
            }
            const qty = Number(payload.quantity || 0)
            const price = Number(payload.unit_price || 0)
            if (qty > 0 && price > 0) {
              payload.amount_in = roundMoneyValue(qty * Math.abs(price))
            }
            if (Number(payload.amount_in || 0) <= 0) {
              emit('notify', '请填写应付金额，或填写数量与单价', 'warning')
              return
            }
            payload.amount_out = 0
            payload.description = buildSupplierDescription(payload)
          }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
            emit('notify', '请填写日期', 'warning')
            return
          }
        }
        if (props.page === 'stockIn') {
          const hasSupplier = Boolean(String(payload.supplier_name || '').trim())
          if (hasSupplier && isMaterialSupplierType(stockInSupplierType.value)) {
            if (!String(payload.material_name || '').trim()) {
              emit('notify', '请选择或填写材料名称', 'warning')
              return
            }
            payload.material_unit = '公斤'
            if (Number(payload.material_quantity || 0) <= 0 || Number(payload.material_unit_price || 0) <= 0) {
              emit('notify', '请填写材料公斤数与单价', 'warning')
              return
            }
            payload.product_name = ''
            payload.spec = ''
            payload.unit = ''
            payload.quantity = 0
            payload.unit_price = 0
            payload.material_used_quantity = 0
            payload.amount = roundMoneyValue(Number(payload.material_quantity || 0) * Number(payload.material_unit_price || 0))
          } else {
            if (!String(payload.product_name || '').trim()) {
              emit('notify', '请选择或填写产品', 'warning')
              return
            }
            if (!String(payload.spec || '').trim()) {
              emit('notify', props.t('stockInSpecRequired'), 'warning')
              return
            }
            if (!String(payload.unit || '').trim()) {
              emit('notify', props.t('stockInUnitRequired'), 'warning')
              return
            }
            payload.amount = roundMoneyValue(Number(payload.quantity || 0) * Number(payload.unit_price || 0))
            if (Number(payload.quantity || 0) <= 0 || Number(payload.unit_price || 0) <= 0) {
              emit('notify', '请填写数量与单价', 'warning')
              return
            }
            if (Number(payload.amount || 0) <= 0) {
              emit('notify', '请填写金额，或填写数量与单价', 'warning')
              return
            }
            payload.material_quantity = 0
            payload.material_unit_price = 0
            if (!hasSupplier) {
              if (!String(payload.material_name || '').trim()) {
                emit('notify', '请选择使用的原材料', 'warning')
                return
              }
              const matchedMaterial = materialOptions.value.find((item: any) =>
                item.material_name === payload.material_name &&
                (item.material_spec || '') === (payload.material_spec || '') &&
                (item.material_unit || '公斤') === (payload.material_unit || '公斤')
              )
              if (!matchedMaterial) {
                emit('notify', '请从库存材料中选择原材料', 'warning')
                return
              }
              payload.material_unit = payload.material_unit || '公斤'
              if (Number(payload.material_used_quantity || 0) <= 0) {
                emit('notify', '请填写原材料使用数量', 'warning')
                return
              }
            } else {
              payload.material_name = ''
              payload.material_spec = ''
              payload.material_unit = ''
              payload.material_used_quantity = 0
            }
          }
        }
        if (props.page === 'stockIn' || props.page === 'stockOut') {
          if (props.page === 'stockOut') {
            payload.amount = roundMoneyValue(Number(payload.quantity || 0) * Number(payload.unit_price || 0))
          }
        }
        if (props.page === 'stockOut') {
          const matched = inventoryOptions.value.find(item => sameProductKey(item, payload))
          const available = stockOutAvailableQty(payload, inventoryOptions.value, editing.value)
          if (!editing.value && !matched) {
            emit('notify', props.t('stockOutSelectFromList'), 'warning')
            return
          }
          if (Number(payload.quantity || 0) <= 0) {
            emit('notify', '出库数量必须大于 0', 'warning')
            return
          }
          if (available <= 0 || Number(payload.quantity || 0) > available) {
            emit('notify', `库存不足，当前可出库 ${available}`, 'warning')
            return
          }
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
        if (customerDetailDialog.value || supplierDetailDialog.value) {
          load()
        } else {
          customerDetailName.value = ''
          supplierDetailName.value = ''
          filterValue.value = ''
          load()
        }
      } catch (error: any) {
        emit('notify', error?.message || '保存失败', 'error')
      }
    }
    const assertDeleteResult = (result: any, fallback = '删除失败') => {
      if (result?.ok === false) throw new Error(result.error || fallback)
      if (Number(result?.total) > 0 && Number(result?.count) < Number(result?.total)) {
        throw new Error(result.error || `仅删除 ${result.count}/${result.total} 条`)
      }
    }
    const remove = async (id: number) => {
      const row = rows.value.find((item: any) => item.id === id)
      if (row && props.page === 'customer' && customerDetailDialog.value) {
        const actions = customerRowActions(row)
        if (!actions.showDelete) {
          emit('notify', actions.deleteTip || '不能删除', 'warning')
          return
        }
      }
      const ok = await askConfirm({
        title: t('confirmDeleteTitle'),
        message: t('confirmDeleteMessage'),
        confirmColor: 'error',
        confirmLabel: t('delete'),
      })
      if (!ok) return
      try {
        const result = await config.value.api.delete(id)
        assertDeleteResult(result)
        emit('notify', '已移入回收站')
        load()
      } catch (error: any) {
        emit('notify', error?.message || '删除失败', 'error')
      }
    }
    const removeSelected = async () => {
      if (!selected.value.length) {
        emit('notify', props.t('selectRowsToDelete'), 'warning')
        return
      }
      const count = selected.value.length
      const ok = await askConfirm({
        title: props.t('batchDeleteTitle'),
        message: props.t('batchDeleteMessage', { count }),
        confirmColor: 'error',
        confirmLabel: props.t('batchDelete'),
      })
      if (!ok) return
      batchDeleting.value = true
      try {
        const ids = [...selected.value]
        let result: any
        if (typeof config.value.api.deleteMany === 'function') {
          result = await config.value.api.deleteMany(ids)
        } else {
          for (const id of ids) {
            result = await config.value.api.delete(id)
            assertDeleteResult(result)
          }
        }
        assertDeleteResult(result)
        selected.value = []
        emit('notify', props.t('batchDeleteDone', { count }))
        load()
      } catch (error: any) {
        emit('notify', error?.message || '删除失败', 'error')
      } finally {
        batchDeleting.value = false
      }
    }
    const showBatchDelete = computed(() => props.page === 'stockIn' || props.page === 'stockOut')
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
      linkedReceivableRow.value = null
      linkedPayableRow.value = null
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
      ids: [...printIds.value],
      kind: printKind.value,
      template: printTemplate.value,
      customerPhone: printForm.customerPhone,
      customerAddress: printForm.customerAddress,
      paymentReceived: printKind.value === 'stockOut' ? (Number(printForm.paymentReceived) || 0) : 0,
      overlay: Boolean(printSettings.lodop?.overlayMode),
    })
    const openPrintPreviewFor = async (
      kind: 'stockOut' | 'customerReturn' | 'supplierReturn',
      ids: number[],
      partyName = '',
    ) => {
      if (!ids.length) {
        emit('notify', props.t(kind === 'stockOut' ? 'selectRowsToPrint' : 'selectReturnRowsToPrint'), 'error')
        return
      }
      printKind.value = kind
      printIds.value = ids
      printLoading.value = true
      try {
        const name = partyName
          || rows.value.find((row: any) => ids.includes(row.id))?.[kind === 'supplierReturn' ? 'supplier_name' : 'customer_name']
          || filterValue.value
          || ''
        if (name) {
          const profile = kind === 'supplierReturn'
            ? await supplierAPI.profile(name)
            : await customerAPI.profile(name)
          printForm.customerPhone = profile.phone || ''
          printForm.customerAddress = profile.address || ''
        } else {
          printForm.customerPhone = ''
          printForm.customerAddress = ''
        }
        if (kind !== 'stockOut') printForm.paymentReceived = ''
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
    const openPrintPreview = async () => {
      if (props.page !== 'stockOut') return
      await openPrintPreviewFor('stockOut', [...selected.value], filterValue.value)
    }
    const collectReturnPrintIds = (isReturnRow: (row: any) => boolean) => {
      const returnIds = selected.value.filter((id) => {
        const row = rows.value.find((item: any) => item.id === id)
        return row && isReturnRow(row)
      })
      if (!returnIds.length) return []
      const selectedRows = rows.value.filter((row: any) => returnIds.includes(row.id))
      const docNos = Array.from(new Set(selectedRows.map((row: any) => String(row.doc_no || '').trim()).filter(Boolean)))
      if (!docNos.length) return returnIds
      return Array.from(new Set(
        rows.value
          .filter((row: any) => isReturnRow(row) && docNos.includes(String(row.doc_no || '').trim()))
          .map((row: any) => row.id),
      ))
    }
    const openCustomerReturnPrintPreview = async () => {
      if (props.page !== 'customer' || !customerDetailDialog.value) return
      const ids = collectReturnPrintIds(isCustomerReturnRecord)
      if (!ids.length) {
        emit('notify', props.t('selectReturnRowsToPrint'), 'warning')
        return
      }
      await openPrintPreviewFor('customerReturn', ids, customerDetailName.value || filterValue.value)
    }
    const openSupplierReturnPrintPreview = async () => {
      if (props.page !== 'supplier' || !supplierDetailDialog.value) return
      const ids = collectReturnPrintIds(isSupplierReturnRecord)
      if (!ids.length) {
        emit('notify', props.t('selectReturnRowsToPrint'), 'warning')
        return
      }
      await openPrintPreviewFor('supplierReturn', ids, supplierDetailName.value || filterValue.value)
    }
    const refreshPrintPreview = async () => {
      if (!printIds.value.length) return
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
      customerProfileForm.contact_person = profile.contact_person || ''
      customerProfileForm.phone = profile.phone || ''
      customerProfileForm.address = profile.address || ''
      customerProfileForm.opening_balance = Number(profile.opening_balance || 0)
      customerProfileForm.note = profile.note || ''
      customerProfileDialog.value = true
    }
    const saveCustomerProfile = async () => {
      const name = activeCustomerName()
      if (!name) return
      await customerAPI.setProfile({
        customer_name: name,
        contact_person: customerProfileForm.contact_person || '',
        phone: customerProfileForm.phone || '',
        address: customerProfileForm.address || '',
        opening_balance: Number(customerProfileForm.opening_balance || 0),
        note: customerProfileForm.note || '',
      })
      customerProfileDialog.value = false
      emit('notify', props.t('customerProfileSaved'))
      load()
    }
    const toggleAll = (value: boolean, pageRows = rows.value) => {
      selected.value = value
        ? Array.from(new Set([...selected.value, ...pageRows.map(r => r.id)]))
        : selected.value.filter(id => !pageRows.some(r => r.id === id))
    }
    const toggleRowSelection = (id: number) => {
      selected.value = selected.value.includes(id)
        ? selected.value.filter(item => item !== id)
        : Array.from(new Set([...selected.value, id]))
    }
    const isPageAllSelected = (pageRows = rows.value) => pageRows.length > 0 && pageRows.every(r => selected.value.includes(r.id))

    watch(() => props.page, () => {
      keyword.value = ''
      filterValue.value = ''
      customerDetailDialog.value = false
      customerDetailName.value = ''
      supplierDetailDialog.value = false
      supplierDetailName.value = ''
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
    watch([currentPage, filterValue, yearFilter, monthFilter, startDate, endDate], () => {
      selected.value = []
      if (props.page === 'customer' && customerDetailDialog.value) {
        if (filterValue.value && filterValue.value !== customerDetailName.value) {
          openCustomerWorkspace(String(filterValue.value))
        } else {
          load()
        }
        return
      }
      if (props.page === 'supplier' && supplierDetailDialog.value) {
        if (filterValue.value && filterValue.value !== supplierDetailName.value) {
          openSupplierWorkspace(String(filterValue.value))
        } else {
          load()
        }
        return
      }
      load()
    })

    const ledgerHeaderLabel = (columnKey: string) => {
      if (props.page === 'stockIn' && columnKey === 'category') return props.t('stockInKind')
      if (props.page === 'supplier' && supplierDetailDialog.value && isMaterialSupplierType(supplierDetailType.value)) {
        if (columnKey === 'product_name') return '材料'
        if (columnKey === 'spec') return '材料规格'
      }
      return props.t(ledgerColumnLabel(columnKey, config.value.table))
    }

    const formatLedgerCell = (col: string, value: any, row?: any) => {
      if (props.page === 'customer') {
        if (col === 'biz_kind' && row) return renderCustomerBizKindLabel(row, props.t)
        if (col === 'doc_no') return String(value || '').trim() || '—'
        if (col === 'amount_in') {
          if (row && isCustomerPaymentRecord(row)) return '—'
          return formatCustomerReceivableDisplay(value)
        }
        if (col === 'amount_out') return formatCustomerReceivedDisplay(value)
        if (col === 'remaining_receivable' && row) return formatCustomerRemainingCell(row)
        if (col === 'quantity' && row && isCustomerPaymentRecord(row)) return '—'
        if (col === 'balance') return formatCustomerBalanceDisplay(value).text
        if (col === 'note' && row) {
          const parts = [String(value || '').trim()]
          if (row.payment_for) parts.push(`${props.t('customerLinkedPaymentFor')}：${row.payment_for}`)
          if (row.return_for) parts.push(`${props.t('customerLinkedReceivable')}：${row.return_for}`)
          return parts.filter(Boolean).join(' · ')
        }
      }
      if (props.page === 'supplier') {
        if (col === 'biz_kind' && row) return renderSupplierBizKindLabel(row, props.t)
        if (col === 'doc_no') return String(value || '').trim() || '—'
        if (col === 'product_name' && row && supplierDetailDialog.value && isMaterialSupplierType(supplierDetailType.value) && !isSupplierPaymentRecord(row)) {
          if (isSupplierScrapRecord(row)) return String(row.product_name || '').trim() || '废料'
          return String(row.product_name || '').includes('原材料退货') ? '原材料退货' : (String(row.product_name || '').trim() || '原材料')
        }
        if (col === 'amount_in') return formatCustomerReceivableDisplay(value)
        if (col === 'amount_out') return formatCustomerReceivedDisplay(value)
        if (col === 'balance') return formatSupplierBalanceDisplay(value).text
        if (col === 'note' && row) {
          const parts = [String(value || '').trim()]
          if (row.payment_for) parts.push(`${props.t('supplierLinkedPaymentFor')}：${row.payment_for}`)
          return parts.filter(Boolean).join(' · ')
        }
      }
      if (props.page === 'stockIn' && row) {
        if (col === 'category') {
          return props.t(getStockInKind(row) === 'material' ? 'stockInKindMaterial' : 'stockInKindFinished')
        }
        if (col === 'supplier_name') {
          const label = getStockInSupplierDisplay(row, props.t('stockInSelfProcessed'))
          return label || '—'
        }
        if (col === 'product_name') {
          const label = getStockInProductDisplay(row)
          return label || '—'
        }
        if (col === 'spec') {
          const label = getStockInSpecDisplay(row)
          return label || '—'
        }
        if (col === 'unit') {
          const label = getStockInUnitDisplay(row)
          return label || '—'
        }
        if (col === 'quantity') return formatCell(col, getStockInQuantityDisplay(row))
        if (col === 'unit_price') return formatCell(col, getStockInUnitPriceDisplay(row))
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
      : c === 'biz_kind'
        ? h('td', formatLedgerCell(c, row[c], row))
        : h('td', { class: amountClass(c) }, formatLedgerCell(c, row[c], row)))

    const renderActionCell = (row: any) => {
      const actions = props.page === 'customer' && customerDetailDialog.value
        ? customerRowActions(row)
        : props.page === 'supplier' && supplierDetailDialog.value
          ? supplierRowActions(row)
          : { showReceive: canReceiveRow(row), showReturn: canReturnRow(row), showEdit: true, showDelete: true }
      return h('td', { class: 'action-cell sticky-action-col' }, [
        ...(actions.showEdit
          ? [h(VBtn, { size: 'small', variant: 'text', color: 'primary', onClick: (event: MouseEvent) => { event.stopPropagation(); openEdit(row) } }, () => props.t('edit'))]
          : []),
        ...(actions.showDelete
          ? [h(VBtn, { size: 'small', variant: 'text', color: 'error', onClick: (event: MouseEvent) => { event.stopPropagation(); remove(row.id) } }, () => props.t('delete'))]
          : []),
      ])
    }

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
      emptyHint?: string
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
              ? h('th', { class: 'select-col' }, [h('button', { type: 'button', class: ['table-check', { checked: isPageAllSelected(options.tableRows) }], title: '全选当前页', onClick: (event: MouseEvent) => { event.stopPropagation(); toggleAll(!isPageAllSelected(options.tableRows), options.tableRows) } }, isPageAllSelected(options.tableRows) ? h('svg', { viewBox: '0 0 24 24', class: 'table-check-icon', 'aria-hidden': 'true' }, [h('path', { d: 'M9.2 16.6 4.9 12.3l-1.4 1.4 5.7 5.7L20.8 7.8l-1.4-1.4z' })]) : null)])
              : null,
            ...options.columnKeys.map((c: string) => h('th', ledgerHeaderLabel(c))),
            h('th', { class: 'sticky-action-col' }, props.t('action')),
          ])]),
          h('tbody', loading.value
            ? [h('tr', [h('td', { colspan: options.columnKeys.length + (options.withSelect ? 2 : 1), class: 'empty-cell' }, '加载中...')])]
            : options.tableRows.length
              ? options.tableRows.map(row => h('tr', {
                key: row.id,
                class: [
                  options.withSelect ? ['selectable-row', { selected: selected.value.includes(row.id) }] : undefined,
                  props.page === 'customer' && customerDetailDialog.value && Number(row.ref_ledger_id || 0) > 0
                    ? 'ledger-row--linked'
                    : undefined,
                ],
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
                h('span', options.emptyHint || '暂无记录'),
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
            modelValue: props.page === 'customer'
              ? (customerDetailDialog.value ? customerDetailName.value : null)
              : props.page === 'supplier'
                ? (supplierDetailDialog.value ? supplierDetailName.value : null)
                : filterValue.value,
            'onUpdate:modelValue': (v: string) => {
              if (props.page === 'customer') {
                if (v) openCustomerWorkspace(v)
                else closeCustomerWorkspace()
                return
              }
              if (props.page === 'supplier') {
                if (v) openSupplierWorkspace(v)
                else closeSupplierWorkspace()
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
          showBatchDelete.value
            ? h(VBtn, {
              variant: 'tonal',
              size: 'small',
              color: 'error',
              loading: batchDeleting.value,
              disabled: !selected.value.length,
              onClick: removeSelected,
            }, () => selected.value.length ? `${props.t('batchDelete')}(${selected.value.length})` : props.t('batchDelete'))
            : null,
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
            ? h(VBtn, { color: 'primary', size: 'small', onClick: openCustomerCreate }, () => props.t('addCustomer'))
            : props.page === 'supplier'
              ? h(VBtn, { color: 'primary', size: 'small', onClick: openSupplierCreate }, () => props.t('addSupplier'))
              : null,
          props.page === 'customer' || props.page === 'supplier'
            ? null
            : ['cash', 'bank', 'bills'].includes(props.page)
              ? h(VBtn, { color: 'primary', size: 'small', onClick: () => openAdd() }, () => props.t('addRecord'))
              : h(VBtn, { color: 'primary', size: 'small', onClick: () => openAdd() }, () => props.t('add')),
        ]),
      }),
      (() => {
        const stats = renderLedgerStats(props.page, summary.value, props.t, {
          onOpeningBalanceClick: openCustomerProfile,
        })
        if (stats.length && props.page !== 'customer' && props.page !== 'supplier') {
          return h('div', { class: 'stat-grid' }, stats)
        }
        if (props.page === 'customer' && Array.isArray(summary.value)) {
          return h(VCard, { class: 'data-card table-card', style: 'margin-bottom: 12px' }, () => [
            h('div', { class: 'page-header page-header--compact customer-overview-head', style: 'padding: 12px 16px 0' }, [
              h('div', [
                h('div', { class: 'drawer-title' }, props.t('customerOverview')),
                h('div', { class: 'muted tiny' }, props.t('customerOverviewSub')),
              ]),
            ]),
            h('div', { class: 'table-scroll' }, [
              h(VTable, { class: 'ledger-table customer-overview-table', hover: true }, () => [
                h('thead', [h('tr', [
                  h('th', props.t('customerName')),
                  h('th', props.t('openingBalance')),
                  h('th', props.t('customerReceivable')),
                  h('th', props.t('customerReceived')),
                  h('th', props.t('customerBalanceColumn')),
                  h('th', { class: 'sticky-action-col customer-overview-action-col' }, props.t('action')),
                ])]),
                h('tbody', loading.value
                  ? [h('tr', [h('td', { colspan: 6, class: 'empty-cell' }, '加载中...')])]
                  : summary.value.length
                    ? summary.value.map((row: any) => h('tr', {
                      key: row.customer_name,
                      class: 'customer-overview-row',
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
                    ]))
                    : [h('tr', [h('td', { colspan: 6, class: 'empty-cell ledger-empty-cell' }, [
                      h('span', '暂无客户，点击右上角「新增客户」开始'),
                    ])])]),
              ]),
            ]),
          ])
        }
        if (props.page === 'supplier' && Array.isArray(summary.value)) {
          return h(VCard, { class: 'data-card table-card', style: 'margin-bottom: 12px' }, () => [
            h('div', { class: 'page-header page-header--compact customer-overview-head', style: 'padding: 12px 16px 0' }, [
              h('div', [
                h('div', { class: 'drawer-title' }, props.t('supplierOverview')),
                h('div', { class: 'muted tiny' }, props.t('supplierOverviewSub')),
              ]),
            ]),
            h('div', { class: 'table-scroll' }, [
              h(VTable, { class: 'ledger-table customer-overview-table', hover: true }, () => [
                h('thead', [h('tr', [
                  h('th', props.t('supplierName')),
                  h('th', props.t('supplierType')),
                  h('th', props.t('supplierOpeningBalance')),
                  h('th', props.t('supplierPayable')),
                  h('th', props.t('supplierPaid')),
                  h('th', props.t('supplierBalanceColumn')),
                  h('th', { class: 'sticky-action-col customer-overview-action-col' }, props.t('action')),
                ])]),
                h('tbody', loading.value
                  ? [h('tr', [h('td', { colspan: 7, class: 'empty-cell' }, '加载中...')])]
                  : summary.value.length
                    ? summary.value.map((row: any) => h('tr', {
                      key: row.supplier_name,
                      class: 'customer-overview-row',
                    }, [
                      h('td', { class: 'customer-name-cell customer-overview-name' }, row.supplier_name),
                      h('td', props.t(supplierTypeLabelKey(normalizeSupplierType(row.supplier_type)))),
                      h('td', { class: customerOverviewAmountClass('opening', row.openingBalance) }, formatCell('amount_in', row.openingBalance)),
                      h('td', { class: customerOverviewAmountClass('in', row.totalIn) }, formatCustomerReceivableDisplay(row.totalIn)),
                      h('td', { class: customerOverviewAmountClass('out', row.totalOut) }, formatCustomerReceivedDisplay(row.totalOut)),
                      h('td', { class: customerOverviewAmountClass('balance', row.currentBalance) }, renderSupplierBalanceCell(row.currentBalance, props.t)),
                      h('td', {
                        class: 'action-cell customer-overview-actions sticky-action-col customer-overview-action-col',
                        onClick: (event: MouseEvent) => event.stopPropagation(),
                      }, [
                        renderOverviewActionLink('台账', () => openSupplierWorkspace(row.supplier_name)),
                        renderOverviewActionLink(props.t('deleteSupplier'), () => removeSupplier(row.supplier_name), { danger: true }),
                      ]),
                    ]))
                    : [h('tr', [h('td', { colspan: 7, class: 'empty-cell ledger-empty-cell' }, [
                      h('span', '暂无供应商，点击右上角「新增供应商」开始'),
                    ])])]),
              ]),
            ]),
          ])
        }
        return null
      })(),
      props.page !== 'customer' && props.page !== 'supplier' ? h(VCard, { class: 'data-card table-card' }, () => [
        h('div', { class: 'table-scroll' }, [
          h(VTable, { class: 'ledger-table', hover: true }, () => [
            h('thead', [h('tr', [h('th', { class: 'select-col' }, [h('button', { type: 'button', class: ['table-check', { checked: isPageAllSelected(rows.value) }], title: '全选当前页', onClick: (event: MouseEvent) => { event.stopPropagation(); toggleAll(!isPageAllSelected(rows.value), rows.value) } }, isPageAllSelected(rows.value) ? h('svg', { viewBox: '0 0 24 24', class: 'table-check-icon', 'aria-hidden': 'true' }, [h('path', { d: 'M9.2 16.6 4.9 12.3l-1.4 1.4 5.7 5.7L20.8 7.8l-1.4-1.4z' })]) : null)]), ...displayColumns.value.map((c: string) => h('th', ledgerHeaderLabel(c))), h('th', { class: 'sticky-action-col' }, props.t('action'))])]),
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
        maxWidth: 560,
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
              h('div', { class: 'record-dialog__field record-dialog__field--half' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: customerCreateForm.contact_person,
                  'onUpdate:modelValue': (v: string) => { customerCreateForm.contact_person = v },
                  label: props.t('contactPerson'),
                }),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--half' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: customerCreateForm.phone,
                  'onUpdate:modelValue': (v: string) => { customerCreateForm.phone = v },
                  label: props.t('customerPhone'),
                }),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--full' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: customerCreateForm.address,
                  'onUpdate:modelValue': (v: string) => { customerCreateForm.address = v },
                  label: props.t('customerAddress'),
                }),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--half' }, [
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
                  modelValue: customerCreateForm.opening_reason,
                  'onUpdate:modelValue': (v: string) => { customerCreateForm.opening_reason = v },
                  label: '上期欠款原因',
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
        show: supplierCreateDialog.value,
        maxWidth: 560,
        title: props.t('addSupplier'),
        subtitle: props.t('addSupplierSub'),
        cancelLabel: props.t('cancel'),
        saveLabel: props.t('save'),
        onClose: () => { supplierCreateDialog.value = false },
        onSave: saveSupplierCreate,
        default: () => [
          h('div', { class: 'record-dialog__section' }, [
            h('div', { class: 'record-dialog__grid' }, [
              h('div', { class: 'record-dialog__field record-dialog__field--full' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: supplierCreateForm.supplier_name,
                  'onUpdate:modelValue': (v: string) => { supplierCreateForm.supplier_name = v },
                  label: props.t('supplierName'),
                  autofocus: true,
                }),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--full' }, [
                h(VSelect, {
                  ...commonFormFieldProps(),
                  modelValue: supplierCreateForm.supplier_type,
                  'onUpdate:modelValue': (v: SupplierType) => { supplierCreateForm.supplier_type = normalizeSupplierType(v) },
                  items: [
                    { title: props.t('supplierTypeMaterial'), value: 'material' },
                    { title: props.t('supplierTypeOutsourcing'), value: 'outsourcing' },
                  ],
                  label: props.t('supplierType'),
                }),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--half' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: supplierCreateForm.contact_person,
                  'onUpdate:modelValue': (v: string) => { supplierCreateForm.contact_person = v },
                  label: props.t('contactPerson'),
                }),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--half' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: supplierCreateForm.phone,
                  'onUpdate:modelValue': (v: string) => { supplierCreateForm.phone = v },
                  label: props.t('supplierPhone'),
                }),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--full' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: supplierCreateForm.address,
                  'onUpdate:modelValue': (v: string) => { supplierCreateForm.address = v },
                  label: props.t('supplierAddress'),
                }),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--half' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: supplierCreateForm.opening_balance,
                  'onUpdate:modelValue': (v: any) => { supplierCreateForm.opening_balance = Number(v || 0) },
                  label: props.t('supplierOpeningBalance'),
                  type: 'number',
                  step: 'any',
                }),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--full' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: supplierCreateForm.opening_reason,
                  'onUpdate:modelValue': (v: string) => { supplierCreateForm.opening_reason = v },
                  label: '期初应付原因',
                }),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--full' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: supplierCreateForm.note,
                  'onUpdate:modelValue': (v: string) => { supplierCreateForm.note = v },
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
        title: props.t(customerPickMode.value === 'payment' ? 'addCustomerPayment' : customerPickMode.value === 'return' ? 'addCustomerReturn' : 'addCustomerSale'),
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
            h(VBtn, { size: 'small', color: 'success', variant: 'tonal', onClick: openCustomerPaymentFromLedger }, () => props.t('customerQuickPayment')),
            h(VBtn, { size: 'small', color: 'warning', variant: 'tonal', onClick: openCustomerProductReturn }, () => props.t('customerReturnRow')),
            h(VBtn, {
              size: 'small',
              variant: 'tonal',
              title: selected.value.some((id) => {
                const row = rows.value.find((item: any) => item.id === id)
                return row && isCustomerReturnRecord(row)
              }) ? props.t('printReturnSlip') : props.t('selectReturnRowsToPrint'),
              loading: printLoading.value,
              onClick: openCustomerReturnPrintPreview,
            }, () => {
              const count = selected.value.filter((id) => {
                const row = rows.value.find((item: any) => item.id === id)
                return row && isCustomerReturnRecord(row)
              }).length
              return count ? `${props.t('printReturnSlip')}(${count})` : props.t('printReturnSlip')
            }),
            h(VBtn, { size: 'small', variant: 'text', onClick: refreshCustomerWorkspace }, () => props.t('customerRefreshLedger')),
            h(VBtn, { size: 'small', variant: 'text', onClick: closeCustomerWorkspace }, () => props.t('cancel')),
          ]),
        ]),
        h(VCardText, { class: 'customer-workspace-dialog__body' }, [
          renderCustomerWorkspaceSummary(customerDetailSummary.value, props.t, {
            onOpeningBalanceClick: openCustomerProfile,
          }),
          h('div', { class: 'muted tiny', style: 'margin-bottom: 8px' }, props.t('customerLedgerDetailSub')),
          rows.value.some((row: any) => isCustomerPaymentRecord(row) && !String(row.date || '').trim())
            ? h(VAlert, { type: 'info', variant: 'tonal', density: 'compact', style: 'margin-bottom: 8px' }, () => props.t('customerPaymentMissingDateHint', {
              count: rows.value.filter((row: any) => isCustomerPaymentRecord(row) && !String(row.date || '').trim()).length,
            }))
            : null,
          renderLedgerTableCard({
            title: props.t('customerLedgerDetail'),
            tableRows: rows.value,
            columnKeys: [...customerLedgerColumnKeys, 'attachments'],
            totalCount: total.value,
            page: currentPage.value,
            pageSize: config.value.pageSize,
            onPageChange: (v: number) => { currentPage.value = v },
            withSelect: true,
            emptyAction: () => h(VBtn, {
              size: 'small',
              variant: 'tonal',
              color: 'primary',
              onClick: refreshCustomerWorkspace,
            }, () => props.t('customerRefreshLedger')),
            emptyHint: props.t('customerLedgerEmptyHint'),
          }),
        ]),
      ])),
      h(VDialog, {
        modelValue: supplierDetailDialog.value,
        'onUpdate:modelValue': (v: boolean) => { if (!v) closeSupplierWorkspace() },
        maxWidth: 1180,
        class: 'customer-workspace-dialog-wrap',
      }, () => h(VCard, { class: 'customer-workspace-dialog' }, [
        h('div', { class: 'customer-workspace-dialog__head' }, [
          h('div', { class: 'drawer-title' }, `${props.t('supplierWorkspaceTitle')} · ${supplierDetailName.value}`),
          h('div', { class: 'customer-workspace-dialog__actions' }, [
            h(VBtn, { size: 'small', color: 'success', variant: 'tonal', onClick: openSupplierPaymentFromLedger }, () => props.t('supplierPaymentRow')),
            h(VBtn, { size: 'small', color: 'warning', variant: 'tonal', onClick: openSupplierProductReturn }, () => props.t('supplierReturnRow')),
            isMaterialSupplierType(supplierDetailType.value)
              ? h(VBtn, { size: 'small', color: 'secondary', variant: 'tonal', onClick: openSupplierScrapRecover }, () => props.t('supplierScrapRow'))
              : null,
            h(VBtn, {
              size: 'small',
              variant: 'tonal',
              title: selected.value.some((id) => {
                const row = rows.value.find((item: any) => item.id === id)
                return row && isSupplierReturnRecord(row)
              }) ? props.t('printReturnSlip') : props.t('selectReturnRowsToPrint'),
              loading: printLoading.value,
              onClick: openSupplierReturnPrintPreview,
            }, () => {
              const count = selected.value.filter((id) => {
                const row = rows.value.find((item: any) => item.id === id)
                return row && isSupplierReturnRecord(row)
              }).length
              return count ? `${props.t('printReturnSlip')}(${count})` : props.t('printReturnSlip')
            }),
            h(VBtn, { size: 'small', variant: 'text', onClick: refreshSupplierWorkspace }, () => props.t('customerRefreshLedger')),
            h(VBtn, { size: 'small', variant: 'text', onClick: closeSupplierWorkspace }, () => props.t('cancel')),
          ]),
        ]),
        h(VCardText, { class: 'customer-workspace-dialog__body' }, [
          renderSupplierWorkspaceSummary(supplierDetailSummary.value, props.t, {
            onOpeningBalanceClick: openSupplierProfile,
          }),
          h('div', { class: 'muted tiny', style: 'margin-bottom: 8px' }, isMaterialSupplierType(supplierDetailType.value)
            ? '入库自动生成应付；付款在台账顶部登记。好料退货冲减应付并扣材料库存；废料回收按称重登记，可选抵应付、换新料或兑现金，不扣好料库存。'
            : props.t('supplierLedgerDetailSub')),
          renderLedgerTableCard({
            title: props.t('supplierLedgerDetail'),
            tableRows: rows.value,
            columnKeys: [...supplierLedgerColumnKeys, 'attachments'],
            totalCount: total.value,
            page: currentPage.value,
            pageSize: config.value.pageSize,
            onPageChange: (v: number) => { currentPage.value = v },
            withSelect: true,
            emptyAction: () => h(VBtn, {
              size: 'small',
              variant: 'tonal',
              color: 'primary',
              onClick: refreshSupplierWorkspace,
            }, () => props.t('customerRefreshLedger')),
            emptyHint: props.t('supplierLedgerEmptyHint'),
          }),
        ]),
      ])),
      RecordDialogShell({
        show: materialReturnDialog.value,
        maxWidth: 620,
        zIndex: 3000,
        title: '登记原材料退货',
        subtitle: `按公斤登记原材料退货；最多可退 ${money(materialReturnMaxQty.value)} 公斤，只冲减供应商应付，不影响成品库存。`,
        cancelLabel: props.t('cancel'),
        saveLabel: props.t('save'),
        onClose: () => { materialReturnDialog.value = false },
        onSave: saveSupplierMaterialReturn,
        default: () => [
          h('div', { class: 'record-dialog__section' }, [
            h('div', { class: 'record-dialog__grid' }, [
              h('div', { class: 'record-dialog__field record-dialog__field--half' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: materialReturnDate.value,
                  'onUpdate:modelValue': (v: string) => { materialReturnDate.value = normalizeDateValue(v) },
                  label: props.t('date'),
                  type: 'date',
                }),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--half' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: materialReturnQuantity.value,
                  'onUpdate:modelValue': (v: any) => {
                    const maxQty = Number(materialReturnMaxQty.value || 0)
                    let qty = Number(v || 0)
                    if (qty > maxQty) qty = maxQty
                    if (qty < 0) qty = 0
                    materialReturnQuantity.value = qty || ''
                  },
                  label: '退货公斤数',
                  type: 'number',
                  min: 0,
                  max: materialReturnMaxQty.value,
                  suffix: '公斤',
                }),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--half' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: materialReturnUnitPrice.value,
                  'onUpdate:modelValue': (v: any) => { materialReturnUnitPrice.value = Number(v || 0) },
                  label: '材料单价',
                  type: 'number',
                  min: 0,
                  suffix: '元/公斤',
                }),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--half' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: roundMoneyValue(Number(materialReturnQuantity.value || 0) * Number(materialReturnUnitPrice.value || 0)),
                  label: '退货金额',
                  readonly: true,
                }),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--full' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: materialReturnNote.value,
                  'onUpdate:modelValue': (v: string) => { materialReturnNote.value = v },
                  label: props.t('note'),
                }),
              ]),
            ]),
          ]),
        ],
      }),
      RecordDialogShell({
        show: scrapRecoverDialog.value,
        maxWidth: scrapRecoverSettlement.value === 'exchange' ? 860 : 640,
        zIndex: 3000,
        title: '登记废料回收',
        subtitle: scrapRecoverSettlement.value === 'exchange'
          ? '称重登记废料，并同时入库置换的新材料；废料金额冲减应付，新料按采购价增加应付。'
          : scrapRecoverSettlement.value === 'cash'
            ? '称重登记废料并记现金收入；不冲减供应商应付，也不扣好料库存。'
            : '称重登记废料（如铜屑），按回收价冲减供应商应付；不扣好料库存，无需领用。',
        cancelLabel: props.t('cancel'),
        saveLabel: props.t('save'),
        onClose: () => { scrapRecoverDialog.value = false },
        onSave: saveSupplierScrapRecover,
        default: () => [
          h('div', { class: 'record-dialog__section' }, [
            h('div', { class: 'record-dialog__grid' }, [
              h('div', { class: 'record-dialog__field record-dialog__field--half' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: scrapRecoverDate.value,
                  'onUpdate:modelValue': (v: string) => { scrapRecoverDate.value = normalizeDateValue(v) },
                  label: props.t('date'),
                  type: 'date',
                }),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--full' }, [
                h('div', { class: 'scrap-settlement-field' }, [
                  h('div', { class: 'scrap-settlement-field__label' }, '结算方式（3种，点选切换）'),
                  h('div', { class: 'scrap-settlement-field__options' }, [
                    { value: 'offset' as ScrapSettlementMode, title: '抵应付', hint: '冲减尚欠' },
                    { value: 'exchange' as ScrapSettlementMode, title: '换新料', hint: '抵账并入新料' },
                    { value: 'cash' as ScrapSettlementMode, title: '兑现金', hint: '记现金收入' },
                  ].map(option => h('button', {
                    type: 'button',
                    class: [
                      'scrap-settlement-option',
                      scrapRecoverSettlement.value === option.value ? 'scrap-settlement-option--active' : '',
                    ],
                    onClick: () => { scrapRecoverSettlement.value = option.value },
                  }, [
                    h('span', { class: 'scrap-settlement-option__title' }, option.title),
                    h('span', { class: 'scrap-settlement-option__hint' }, option.hint),
                  ]))),
                ]),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--half' }, [
                h(VCombobox, {
                  ...commonFormFieldProps(),
                  modelValue: scrapRecoverName.value,
                  'onUpdate:modelValue': (v: string) => { scrapRecoverName.value = String(v || '').trim() },
                  items: DEFAULT_SCRAP_NAME_OPTIONS,
                  label: '废料名称',
                  hint: '粉末/切屑按金属种类登记，不写直径',
                  persistentHint: true,
                }),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--half' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: scrapRecoverQuantity.value,
                  'onUpdate:modelValue': (v: any) => {
                    const qty = Math.max(0, Number(v || 0))
                    scrapRecoverQuantity.value = qty || ''
                  },
                  label: '废料公斤数',
                  type: 'number',
                  min: 0,
                  suffix: '公斤',
                }),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--half' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: scrapRecoverUnitPrice.value,
                  'onUpdate:modelValue': (v: any) => { scrapRecoverUnitPrice.value = Number(v || 0) || '' },
                  label: '回收单价',
                  type: 'number',
                  min: 0,
                  suffix: '元/公斤',
                }),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--half' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: scrapRecoverAmount(),
                  label: '废料金额',
                  readonly: true,
                }),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--full' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: scrapRecoverNote.value,
                  'onUpdate:modelValue': (v: string) => { scrapRecoverNote.value = v },
                  label: props.t('note'),
                }),
              ]),
            ]),
          ]),
          scrapRecoverSettlement.value === 'exchange'
            ? h('div', { class: 'record-dialog__section' }, [
              h('div', { class: 'record-dialog__section-title', style: 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px' }, [
                h('span', '置换新料'),
                h(VBtn, {
                  size: 'x-small',
                  variant: 'tonal',
                  onClick: () => {
                    scrapExchangeRows.value.push({
                      material_name: '',
                      material_spec: '',
                      material_unit: '公斤',
                      material_quantity: '',
                      material_unit_price: '',
                    })
                  },
                }, () => '添加材料'),
              ]),
              h('div', { class: 'table-scroll' }, [
                h(VTable, { class: 'ledger-table', hover: true }, () => [
                  h('thead', [h('tr', [
                    h('th', '材料名称'),
                    h('th', '规格'),
                    h('th', '公斤数'),
                    h('th', '元/公斤'),
                    h('th', '金额'),
                    h('th', { style: 'width: 64px' }, ''),
                  ])]),
                  h('tbody', scrapExchangeRows.value.map((item, index) => h('tr', { key: `scrap-ex-${index}` }, [
                    h('td', [
                      h(VTextField, {
                        modelValue: item.material_name,
                        'onUpdate:modelValue': (v: string) => { item.material_name = v },
                        density: 'compact',
                        hideDetails: true,
                        placeholder: '如铜管',
                      }),
                    ]),
                    h('td', [
                      h(VTextField, {
                        modelValue: item.material_spec,
                        'onUpdate:modelValue': (v: string) => { item.material_spec = v },
                        density: 'compact',
                        hideDetails: true,
                        placeholder: '直径等',
                      }),
                    ]),
                    h('td', [
                      h(VTextField, {
                        modelValue: item.material_quantity,
                        'onUpdate:modelValue': (v: any) => { item.material_quantity = Math.max(0, Number(v || 0)) || '' },
                        type: 'number',
                        density: 'compact',
                        hideDetails: true,
                        min: 0,
                      }),
                    ]),
                    h('td', [
                      h(VTextField, {
                        modelValue: item.material_unit_price,
                        'onUpdate:modelValue': (v: any) => { item.material_unit_price = Math.max(0, Number(v || 0)) || '' },
                        type: 'number',
                        density: 'compact',
                        hideDetails: true,
                        min: 0,
                      }),
                    ]),
                    h('td', money(roundMoneyValue(Number(item.material_quantity || 0) * Number(item.material_unit_price || 0)))),
                    h('td', [
                      h(VBtn, {
                        size: 'x-small',
                        variant: 'text',
                        color: 'error',
                        disabled: scrapExchangeRows.value.length <= 1,
                        onClick: () => { scrapExchangeRows.value.splice(index, 1) },
                      }, () => '删'),
                    ]),
                  ]))),
                ]),
              ]),
            ])
            : null,
        ],
      }),
      RecordDialogShell({
        show: productReturnDialog.value,
        maxWidth: 920,
        zIndex: 3000,
        title: productReturnKind.value === 'customer'
          ? props.t('addCustomerReturn')
          : productReturnKind.value === 'supplierMaterial'
            ? '登记原材料退货'
            : props.t('addSupplierReturn'),
        subtitle: productReturnKind.value === 'customer'
          ? '按产品登记退货，不绑定某一笔应收单。'
          : productReturnKind.value === 'supplierMaterial'
            ? '按材料登记退货，可多选；数量受该供应商供料剩余和材料库存限制。'
            : '按产品登记退货，不绑定某一笔应付单；数量受该供应商供货剩余和当前库存限制。',
        cancelLabel: props.t('cancel'),
        saveLabel: props.t('save'),
        onClose: () => { productReturnDialog.value = false },
        onSave: saveProductReturn,
        default: () => [
          h('div', { class: 'record-dialog__section' }, [
            h('div', { class: 'record-dialog__grid' }, [
              h('div', { class: 'record-dialog__field record-dialog__field--half' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: productReturnDate.value,
                  'onUpdate:modelValue': (v: string) => { productReturnDate.value = normalizeDateValue(v) },
                  label: props.t('date'),
                  type: 'date',
                }),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--half' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: productReturnNote.value,
                  'onUpdate:modelValue': (v: string) => { productReturnNote.value = v },
                  label: props.t('note'),
                }),
              ]),
            ]),
          ]),
          h('div', { class: 'table-scroll' }, [
            h(VTable, { class: 'ledger-table', hover: true }, () => [
              h('thead', [h('tr', [
                h('th', { class: 'select-col' }, ''),
                h('th', productReturnKind.value === 'supplierMaterial' ? '材料名称' : props.t('productName')),
                h('th', productReturnKind.value === 'supplierMaterial' ? '材料规格' : props.t('spec')),
                h('th', props.t('unit')),
                h('th', '最多可退'),
                h('th', props.t('quantity')),
                h('th', props.t('unitPrice')),
                h('th', props.t('note')),
              ])]),
              h('tbody', productReturnLoading.value
                ? [h('tr', [h('td', { colspan: 8, class: 'empty-cell' }, '加载中...')])]
                : productReturnRows.value.length
                  ? productReturnRows.value.map((item: any, index: number) => h('tr', { key: `${item.product_name}-${item.spec}-${item.unit}` }, [
                    h('td', { class: 'select-cell' }, [
                      h('button', {
                        type: 'button',
                        class: ['table-check', { checked: item.selected }],
                        onClick: () => {
                          item.selected = !item.selected
                        },
                      }, item.selected ? h('svg', { viewBox: '0 0 24 24', class: 'table-check-icon', 'aria-hidden': 'true' }, [h('path', { d: 'M9.2 16.6 4.9 12.3l-1.4 1.4 5.7 5.7L20.8 7.8l-1.4-1.4z' })]) : null),
                    ]),
                    h('td', item.product_name),
                    h('td', item.spec || '—'),
                    h('td', item.unit || '—'),
                    h('td', money(Number(item.max_qty || 0))),
                    h('td', [
                      h(VTextField, {
                        modelValue: item.quantity,
                        'onUpdate:modelValue': (v: any) => {
                          const maxQty = Number(item.max_qty || 0)
                          let qty = Number(v || 0)
                          if (qty > maxQty) qty = maxQty
                          if (qty < 0) qty = 0
                          item.quantity = qty || ''
                          item.selected = qty > 0
                        },
                        type: 'number',
                        min: 0,
                        max: Number(item.max_qty || 0),
                        density: 'compact',
                        hideDetails: true,
                        style: 'width: 110px',
                      }),
                    ]),
                    h('td', [
                      h(VTextField, {
                        modelValue: item.unit_price,
                        'onUpdate:modelValue': (v: any) => { item.unit_price = Number(v || 0) },
                        type: 'number',
                        min: 0,
                        density: 'compact',
                        hideDetails: true,
                        style: 'width: 110px',
                      }),
                    ]),
                    h('td', [
                      h(VTextField, {
                        modelValue: item.note,
                        'onUpdate:modelValue': (v: string) => { item.note = v },
                        density: 'compact',
                        hideDetails: true,
                        style: 'min-width: 140px',
                      }),
                    ]),
                  ]))
                  : [h('tr', [h('td', { colspan: 8, class: 'empty-cell' }, '暂无可退产品')])]),
            ]),
          ]),
        ],
      }),
      RecordDialogShell({
        show: dialog.value,
        maxWidth: ledgerDialogWidths[props.page] || 720,
        zIndex: (customerDetailDialog.value || supplierDetailDialog.value) ? 2800 : 2400,
        title: editing.value
          ? props.t('edit')
          : props.page === 'customer'
            ? props.t(customerEntryMode.value === 'payment' ? 'addCustomerPayment' : customerEntryMode.value === 'return' ? 'addCustomerReturn' : 'addCustomerSale')
            : props.page === 'supplier'
              ? props.t(supplierEntryMode.value === 'payment' ? 'addSupplierPayment' : supplierEntryMode.value === 'return' ? 'addSupplierReturn' : 'addSupplierPayable')
              : (['cash', 'bank', 'bills'].includes(props.page) ? props.t('addRecord') : props.t('add')),
        subtitle: editing.value
          ? props.t('formEditHint')
          : (props.page === 'customer' && customerEntryMode.value === 'payment'
            ? (linkedReceivableRow.value ? props.t('customerPaymentLinkedHint') : props.t('customerPaymentFormHint'))
            : props.page === 'customer' && customerEntryMode.value === 'return'
              ? (linkedReceivableRow.value
                ? props.t('customerReturnBatchHint', {
                  date: linkedReceivableRow.value.date || '—',
                  qty: Math.abs(Number(linkedReceivableRow.value.quantity || 0)),
                  unit: linkedReceivableRow.value.unit || '',
                  remaining: formatCustomerReceivableDisplay(customerReceivableRemaining(linkedReceivableRow.value)),
                })
                : props.t('customerReturnFormHint'))
                : props.page === 'supplier' && supplierEntryMode.value === 'return'
                  ? props.t('supplierReturnFormHint')
                : props.page === 'supplier' && supplierEntryMode.value === 'payment'
                ? (linkedPayableRow.value ? props.t('supplierPaymentLinkedHint') : props.t('supplierPaymentFormHint'))
                : props.page === 'supplier'
                  ? props.t('supplierPayableFormHint')
                  : props.t('formAddHint')),
        cancelLabel: props.t('cancel'),
        saveLabel: props.t('save'),
        onClose: closeRecordDialog,
        onSave: save,
        default: () => [
          linkedReceivableRow.value && (customerEntryMode.value === 'return' || customerEntryMode.value === 'payment')
            ? h('div', { class: 'record-dialog__section' }, [
              h('div', { class: 'record-dialog__section-title' }, props.t('customerLinkedReceivable')),
              h('div', { class: 'muted' }, [
                linkedReceivableRow.value.product_name,
                linkedReceivableRow.value.spec ? ` / ${linkedReceivableRow.value.spec}` : '',
                linkedReceivableRow.value.unit ? ` ${linkedReceivableRow.value.unit}` : '',
                ` · ${formatLinkedReceivablePaymentHint(linkedReceivableRow.value)}`,
              ]),
            ])
            : null,
          linkedPayableRow.value && (supplierEntryMode.value === 'payment' || supplierEntryMode.value === 'return')
            ? h('div', { class: 'record-dialog__section' }, [
              h('div', { class: 'record-dialog__section-title' }, props.t('supplierLinkedPayable')),
              h('div', { class: 'muted' }, [
                linkedPayableRow.value.product_name,
                linkedPayableRow.value.spec ? ` / ${linkedPayableRow.value.spec}` : '',
                linkedPayableRow.value.unit ? ` ${linkedPayableRow.value.unit}` : '',
                ` · ${props.t('supplierPayable')} ${formatCustomerReceivableDisplay(linkedPayableRow.value.amount_in)}`,
              ]),
            ])
            : null,
          props.page === 'stockIn'
            ? h('div', { class: 'muted tiny', style: 'margin-bottom: 8px' }, props.t(
              !String(form.supplier_name || '').trim()
                ? 'stockInNoSupplierHint'
                : isMaterialSupplierType(stockInSupplierType.value) ? 'stockInMaterialHint' : 'stockInOutsourcingHint',
            ))
            : null,
          ...getFormSections(
            props.page,
            config.value.fields,
            props.page === 'supplier' ? supplierEntryMode.value : customerEntryMode.value,
            stockInSupplierType.value,
            Boolean(String(form.supplier_name || '').trim()),
          ).map(section => {
            const isOptionalMaterialUse = props.page === 'stockIn'
              && !String(form.supplier_name || '').trim()
              && section.titleKey === 'formSectionMaterialCost'
            return h('div', { class: 'record-dialog__section', key: section.titleKey }, [
            h('div', { class: 'record-dialog__section-title' }, props.t(isOptionalMaterialUse ? 'formSectionMaterialUse' : section.titleKey)),
            isOptionalMaterialUse
              ? h('div', { class: 'muted tiny', style: 'margin-bottom: 8px' }, props.t('stockInMaterialUseHint'))
              : null,
            h('div', { class: 'record-dialog__grid' }, section.fields.map(field => renderRecordFormField(field, {
              form,
              config: config.value,
              filterOptions: filterOptions.value,
              profileOptions: profileOptions.value,
              inventoryOptions: inventoryOptions.value,
              productOptions: productOptions.value,
              materialOptions: materialOptions.value,
              editingRow: editing.value,
              lockedCustomerName: customerDetailName.value || filterValue.value,
              lockedSupplierName: supplierDetailName.value || filterValue.value,
              customerEntryMode: customerEntryMode.value,
              supplierEntryMode: supplierEntryMode.value,
              stockInSupplierType: stockInSupplierType.value,
              onStockInSupplierChange: loadStockInSupplierType,
              customerLedgerFinancialLocked: customerLedgerFinancialLocked.value,
              t: props.t,
            }))),
          ])
          }),
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
        maxWidth: 560,
        title: `${props.t('customerProfile')} · ${activeCustomerName() || ''}`,
        subtitle: props.t('customerProfileSub'),
        cancelLabel: props.t('cancel'),
        saveLabel: props.t('save'),
        onClose: () => { customerProfileDialog.value = false },
        onSave: saveCustomerProfile,
        default: () => [
          h('div', { class: 'record-dialog__section' }, [
            h('div', { class: 'record-dialog__grid' }, [
              h('div', { class: 'record-dialog__field record-dialog__field--half' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: customerProfileForm.contact_person,
                  'onUpdate:modelValue': (v: string) => { customerProfileForm.contact_person = v },
                  label: props.t('contactPerson'),
                }),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--half' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: customerProfileForm.phone,
                  'onUpdate:modelValue': (v: string) => { customerProfileForm.phone = v },
                  label: props.t('customerPhone'),
                }),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--full' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: customerProfileForm.address,
                  'onUpdate:modelValue': (v: string) => { customerProfileForm.address = v },
                  label: props.t('customerAddress'),
                }),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--half' }, [
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
      RecordDialogShell({
        show: supplierProfileDialog.value,
        maxWidth: 560,
        title: `${props.t('supplierProfile')} · ${activeSupplierName() || ''}`,
        subtitle: props.t('supplierProfileSub'),
        cancelLabel: props.t('cancel'),
        saveLabel: props.t('save'),
        onClose: () => { supplierProfileDialog.value = false },
        onSave: saveSupplierProfile,
        default: () => [
          h('div', { class: 'record-dialog__section' }, [
            h('div', { class: 'record-dialog__grid' }, [
              h('div', { class: 'record-dialog__field record-dialog__field--full' }, [
                h(VSelect, {
                  ...commonFormFieldProps(),
                  modelValue: supplierProfileForm.supplier_type,
                  'onUpdate:modelValue': (v: SupplierType) => { supplierProfileForm.supplier_type = normalizeSupplierType(v) },
                  items: [
                    { title: props.t('supplierTypeMaterial'), value: 'material' },
                    { title: props.t('supplierTypeOutsourcing'), value: 'outsourcing' },
                  ],
                  label: props.t('supplierType'),
                }),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--half' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: supplierProfileForm.contact_person,
                  'onUpdate:modelValue': (v: string) => { supplierProfileForm.contact_person = v },
                  label: props.t('contactPerson'),
                }),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--half' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: supplierProfileForm.phone,
                  'onUpdate:modelValue': (v: string) => { supplierProfileForm.phone = v },
                  label: props.t('supplierPhone'),
                }),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--full' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: supplierProfileForm.address,
                  'onUpdate:modelValue': (v: string) => { supplierProfileForm.address = v },
                  label: props.t('supplierAddress'),
                }),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--half' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: supplierProfileForm.opening_balance,
                  'onUpdate:modelValue': (v: any) => { supplierProfileForm.opening_balance = Number(v || 0) },
                  label: props.t('supplierOpeningBalance'),
                  type: 'number',
                  step: 'any',
                }),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--full' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: supplierProfileForm.opening_reason,
                  'onUpdate:modelValue': (v: string) => { supplierProfileForm.opening_reason = v },
                  label: '期初应付原因',
                }),
              ]),
              h('div', { class: 'record-dialog__field record-dialog__field--full' }, [
                h(VTextField, {
                  ...commonFormFieldProps(),
                  modelValue: supplierProfileForm.note,
                  'onUpdate:modelValue': (v: string) => { supplierProfileForm.note = v },
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
      printDialog.value || props.page === 'stockOut' || props.page === 'customer' || props.page === 'supplier' ? h(VDialog, {
        modelValue: printDialog.value,
        'onUpdate:modelValue': (v: boolean) => { printDialog.value = v },
        maxWidth: 980,
        scrollable: true,
        zIndex: printKind.value !== 'stockOut' ? 3200 : 2400,
        class: printKind.value !== 'stockOut' ? 'record-dialog-overlay--elevated' : undefined,
      }, () => h(VCard, { class: 'pa-5 print-dialog-card' }, [
        h(VCardTitle, props.t(printKind.value !== 'stockOut' ? 'printReturnPreview' : 'printPreview')),
        h(VCardText, [
          h(VAlert, { type: 'info', variant: 'tonal', density: 'compact', class: 'mb-3' }, () => printKind.value !== 'stockOut'
            ? props.t('printReturnHint', { count: printIds.value.length })
            : `已选择 ${printIds.value.length || selected.value.length} 条出库记录，将合并生成一张单据。金属材料建议使用「${props.t('templateMetal')}」。`),
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
            printKind.value !== 'stockOut'
              ? null
              : h(VTextField, {
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
              ? h('iframe', {
                class: 'print-preview-frame',
                srcdoc: printHtml.value,
                title: props.t(printKind.value !== 'stockOut' ? 'printReturnPreview' : 'printPreview'),
              })
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
      props.page === 'stockOut' || props.page === 'customer' || props.page === 'supplier' ? RecordDialogShell({
        show: printSettingsDialog.value,
        maxWidth: 760,
        zIndex: printKind.value !== 'stockOut' ? 3400 : 2500,
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
  if (pageKey === 'stockIn' || pageKey === 'stockOut') return []
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

function renderSupplierWorkspaceSummary(
  summary: any,
  tFn: (key: string, params?: any) => string,
  hooks: { onOpeningBalanceClick?: () => void } = {},
) {
  if (!summary?.supplier_name) return null
  const balanceInfo = formatSupplierBalanceDisplay(summary.currentBalance || 0)
  const items = [
    { labelKey: 'supplierOpeningBalance', text: formatCell('amount_in', summary.openingBalance || 0), color: 'secondary', clickable: Boolean(hooks.onOpeningBalanceClick), onClick: hooks.onOpeningBalanceClick },
    { labelKey: 'supplierPayable', text: formatCustomerReceivableDisplay(summary.totalIn || 0), color: 'error' },
    { labelKey: 'supplierPaid', text: formatCustomerReceivedDisplay(summary.totalOut || 0), color: 'success' },
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
    h('div', { class: 'customer-workspace-summary-hint muted tiny' }, tFn('supplierWorkspaceSummaryHint')),
  ])
}

function columnLabel(col: string) {
  return ({
    stock_type: 'stockType',
    amount_in: 'amountIn', amount_out: 'amountOut', customer_name: 'customerName', supplier_name: 'supplierName',
    doc_no: 'docNo', contract_no: 'contractNo', product_name: 'productName', unit_price: 'unitPrice',
    material_name: 'materialName', material_spec: 'materialSpec', material_unit: 'materialUnit',
    material_quantity: 'materialQuantity', material_unit_price: 'materialUnitPrice', material_used_quantity: 'materialUsedQuantity',
    tax_rate: 'taxRate', tax_amount: 'taxAmount', invoice_amount: 'invoiceAmount',
    total_in: 'totalInQuantity', total_out: 'totalOutQuantity', stock_qty: 'stockQty',
    default_price: 'defaultPrice', available_qty: 'availableQty',
    month_label: 'date', attachments: 'images',
  } as any)[col] || col
}

function renderCustomerBizKindLabel(row: Record<string, any>, t: (key: string) => string) {
  if (isCustomerPaymentRecord(row) || isCustomerPaymentDescription(String(row.description || ''))) {
    return h('span', { class: 'customer-biz-tag customer-biz-tag--payment' }, t('customerBizPayment'))
  }
  if (isCustomerReturnRecord(row)) {
    return h('span', { class: 'customer-biz-tag customer-biz-tag--return' }, t('customerBizReturn'))
  }
  return h('span', { class: 'customer-biz-tag customer-biz-tag--sale' }, t('customerBizSale'))
}

function renderSupplierBizKindLabel(row: Record<string, any>, t: (key: string) => string) {
  if (isSupplierPaymentRecord(row) || isSupplierPaymentDescription(String(row.description || ''))) {
    return h('span', { class: 'customer-biz-tag customer-biz-tag--payment' }, t('supplierBizPayment'))
  }
  if (isSupplierScrapRecord(row)) {
    return h('span', { class: 'customer-biz-tag customer-biz-tag--scrap' }, scrapBizKindLabel(row))
  }
  if (isSupplierReturnRecord(row)) {
    return h('span', { class: 'customer-biz-tag customer-biz-tag--return' }, t('supplierBizReturn'))
  }
  return h('span', { class: 'customer-biz-tag customer-biz-tag--sale' }, t('supplierBizPayable'))
}

function formFieldLabel(key: string, config: any, t: (key: string) => string, stockInType: SupplierType = 'outsourcing') {
  if (key === '_finished_stock_amount') return t('finishedStockAmount')
  if (config.table === 'stockIn' && isMaterialSupplierType(stockInType)) {
    if (key === 'amount') return t('materialAmount')
    if (key === 'material_name') return t('materialName')
    if (key === 'material_spec') return t('materialSpec')
    if (key === 'material_unit') return t('materialUnit')
    if (key === 'material_quantity') return t('materialQuantity')
    if (key === 'material_unit_price') return t('materialUnitPrice')
    if (key === 'material_used_quantity') return t('materialUsedQuantity')
  }
  if (key === 'contract_no') return t('contractNoOptional')
  return t(ledgerColumnLabel(key, config.table))
}

function ledgerColumnLabel(col: string, table?: string) {
  if (table === 'customer') {
    if (col === 'biz_kind') return 'customerBizKind'
    if (col === 'amount_in') return 'customerReceivable'
    if (col === 'remaining_receivable') return 'customerRemainingColumn'
    if (col === 'amount_out') return 'customerReceived'
    if (col === 'balance') return 'customerBalance'
  }
  if (table === 'supplier') {
    if (col === 'biz_kind') return 'supplierBizKind'
    if (col === 'amount_in') return 'supplierPayable'
    if (col === 'amount_out') return 'supplierPaid'
    if (col === 'balance') return 'supplierBalance'
  }
  return columnLabel(col)
}
function inventoryOptionTitle(item: any, t?: (key: string) => string) {
  if (!item || typeof item !== 'object') return String(item || '')
  const specLabel = item.spec ? item.spec : (t ? t('inventorySpecEmpty') : '无规格')
  const unitLabel = item.unit ? item.unit : (t ? t('inventoryUnitEmpty') : '无单位')
  return `${item.product_name} / ${specLabel} / ${unitLabel} · 库存 ${money(item.stock_qty)}`
}
function stockOutLockedFieldDisplay(key: string, value: string, t: (key: string) => string) {
  if (key === 'spec') return value || t('inventorySpecEmpty')
  if (key === 'unit') return value || t('inventoryUnitEmpty')
  return value
}
function productOptionTitle(item: any) {
  if (!item || typeof item !== 'object') return String(item || '')
  const spec = item.spec ? ` / ${item.spec}` : ''
  const unit = item.unit ? ` ${item.unit}` : ''
  const price = Number(item.default_price || 0) ? ` · 默认单价 ${money(item.default_price)}` : ''
  return `${item.product_name}${spec}${unit}${price}`
}
function materialOptionTitle(item: any) {
  if (!item || typeof item !== 'object') return String(item || '')
  const spec = item.material_spec ? ` / ${item.material_spec}` : ''
  const unit = item.material_unit ? ` ${item.material_unit}` : ''
  const stock = Number(item.stock_qty || 0) ? ` · 可用 ${money(item.stock_qty)}${item.material_unit || ''}` : ''
  const price = Number(item.unit_price || 0) ? ` · 参考单价 ${money(item.unit_price)}` : ''
  return `${item.material_name}${spec}${unit}${stock}${price}`
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
function materialComboboxSlots(form: any, titleFn: (item: any) => string) {
  return {
    selection: ({ item }: any) => {
      const raw = item?.raw ?? item
      if (raw && typeof raw === 'object') return String(raw.material_name || '')
      return String(form.material_name || raw || '')
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
  const isMaterialStockIn = 'material_quantity' in form
  if (['quantity', 'unit_price'].includes(changedKey) && !isMaterialStockIn) {
    if ('amount' in form) form.amount = roundMoneyValue(Number(form.quantity || 0) * Number(form.unit_price || 0))
    if ('amount_in' in form && !('amount' in form)) {
      form.amount_in = roundMoneyValue(Number(form.quantity || 0) * Number(form.unit_price || 0))
    }
  }
  if (['material_quantity', 'material_unit_price'].includes(changedKey) && isMaterialStockIn) {
    form.amount = roundMoneyValue(Number(form.material_quantity || 0) * Number(form.material_unit_price || 0))
  }
  if (!isMaterialStockIn && changedKey === 'amount' && Number(form.quantity || 0) > 0 && Number(form.unit_price || 0) === 0) {
    form.unit_price = roundMoneyValue(Number(form.amount || 0) / Number(form.quantity || 1))
  }
  if (!isMaterialStockIn && changedKey === 'amount' && Number(form.unit_price || 0) > 0 && Number(form.quantity || 0) === 0) {
    form.quantity = roundMoneyValue(Number(form.amount || 0) / Number(form.unit_price || 1))
  }
  if (isMaterialStockIn && changedKey === 'amount' && Number(form.material_quantity || 0) > 0 && Number(form.material_unit_price || 0) === 0) {
    form.material_unit_price = roundMoneyValue(Number(form.amount || 0) / Number(form.material_quantity || 1))
  }
  if (isMaterialStockIn && changedKey === 'amount' && Number(form.material_unit_price || 0) > 0 && Number(form.material_quantity || 0) === 0) {
    form.material_quantity = roundMoneyValue(Number(form.amount || 0) / Number(form.material_unit_price || 1))
  }
}
function numericField(field: string) { return ['income', 'expense', 'amount_in', 'amount_out', 'balance', 'quantity', 'unit_price', 'amount', 'material_quantity', 'material_unit_price', 'material_used_quantity', 'tax_rate', 'tax_amount', 'invoice_amount', 'total_in', 'total_out', 'stock_qty', 'default_price', 'available_qty'].includes(field) }
function amountClass(col: string) { return numericField(col) ? 'amount-cell' : '' }
function formatCell(col: string, value: any) { return numericField(col) ? (Number(value || 0) ? money(value) : '—') : (value || '') }

function formatCustomerReceivableDisplay(value: any) {
  const amount = Number(value || 0)
  if (!amount) return '—'
  if (amount < 0) return `-${money(Math.abs(amount))}`
  return money(amount)
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

function formatSupplierBalanceDisplay(value: any) {
  const balance = Number(value || 0)
  if (Math.abs(balance) < 0.005) {
    return { labelKey: 'supplierBalance', text: money(0), color: 'secondary' }
  }
  if (balance > 0) {
    return { labelKey: 'supplierBalance', text: money(balance), color: 'error' }
  }
  return { labelKey: 'supplierOverpaidTag', text: money(Math.abs(balance)), color: 'success' }
}

function renderSupplierBalanceCell(balance: any, t: (key: string) => string) {
  const amount = Number(balance || 0)
  if (Math.abs(amount) < 0.005) {
    return h('span', { class: 'customer-balance-cell customer-balance-cell--zero' }, money(0))
  }
  const isDebt = amount > 0
  const info = formatSupplierBalanceDisplay(balance)
  return h('span', { class: 'customer-balance-cell' }, [
    h('span', {
      class: isDebt ? 'customer-balance-tag customer-balance-tag--debt' : 'customer-balance-tag customer-balance-tag--credit',
    }, t(isDebt ? 'supplierDebtTag' : 'supplierOverpaidTag')),
    h('span', {
      class: isDebt ? 'customer-balance-amount customer-balance-amount--debt' : 'customer-balance-amount customer-balance-amount--credit',
    }, info.text),
  ])
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

function getFormSections(
  pageKey: string,
  fields: string[],
  entryMode: 'sale' | 'return' | 'payment' | 'payable' = 'sale',
  stockInType: SupplierType = 'outsourcing',
  hasStockInSupplier = true,
): FormSectionSpec[] {
  if (pageKey === 'customer') {
    if (entryMode === 'payment') return formSections.customerPayment
    if (entryMode === 'return') return formSections.customerReturn || formSections.customer
  }
  if (pageKey === 'supplier') {
    if (entryMode === 'payment') return formSections.supplierPayment
    if (entryMode === 'return') return formSections.supplierReturn
    return formSections.supplierPayable
  }
  if (pageKey === 'stockIn') {
    if (!hasStockInSupplier) return formSections.stockInNoSupplier
    return isMaterialSupplierType(stockInType) ? formSections.stockInMaterial : formSections.stockInOutsourcing
  }
  if (formSections[pageKey]) return formSections[pageKey]
  return [{ titleKey: 'formSectionBasic', fields: fields.map(key => ({ key, span: (key === 'note' || key === 'description') ? 'full' : 'half' })) }]
}

function sameProductKey(a: any, b: any) {
  return String(a?.product_name || '').trim() === String(b?.product_name || '').trim()
    && String(a?.spec || '').trim() === String(b?.spec || '').trim()
    && String(a?.unit || '').trim() === String(b?.unit || '').trim()
}

/** 出库可填数量：当前库存；编辑时加回本条已占用量 */
function stockOutAvailableQty(row: any, inventoryOptions: any[] = [], editingRow?: any) {
  const matched = inventoryOptions.find(item => sameProductKey(item, row))
  let available = Number(matched?.stock_qty || 0)
  if (editingRow && sameProductKey(editingRow, row)) {
    available += Number(editingRow.quantity || 0)
  }
  return Math.max(0, roundMoneyValue(available))
}

function renderRecordFormField(
  field: FormFieldSpec,
  ctx: {
    form: any
    config: any
    filterOptions: string[]
    profileOptions?: string[]
    inventoryOptions?: any[]
    productOptions?: any[]
    materialOptions?: any[]
    editingRow?: any
    lockedCustomerName?: string
    lockedSupplierName?: string
    customerEntryMode?: 'sale' | 'return' | 'payment'
    supplierEntryMode?: 'payable' | 'payment' | 'return'
    stockInSupplierType?: SupplierType
    onStockInSupplierChange?: (supplierName: string) => void | Promise<void>
    customerLedgerFinancialLocked?: boolean
    t: (key: string, params?: any) => string
  },
) {
  const { key, span } = normalizeFormField(field)
  const {
    form,
    config,
    filterOptions,
    profileOptions = [],
    inventoryOptions = [],
    productOptions = [],
    materialOptions = [],
    editingRow,
    lockedCustomerName = '',
    lockedSupplierName = '',
    customerEntryMode = 'sale',
    supplierEntryMode = 'payable',
    stockInSupplierType = 'outsourcing',
    onStockInSupplierChange,
    customerLedgerFinancialLocked = false,
    t,
  } = ctx
  const isStockInMaterial = config.table === 'stockIn' && isMaterialSupplierType(stockInSupplierType)
  const fieldLabel = (fieldKey: string) => formFieldLabel(fieldKey, config, t, stockInSupplierType)
  const wrapClass = `record-dialog__field record-dialog__field--${span === 'full' ? 'full' : 'half'}`
  const base = commonFormFieldProps()
  const lockedPartyName = lockedCustomerName || lockedSupplierName

  if (config.filterKey && key === config.filterKey && lockedPartyName) {
    return h('div', { class: wrapClass, key }, [
      h(VTextField, {
        ...base,
        modelValue: lockedPartyName,
          label: fieldLabel(key),
        readonly: true,
      }),
    ])
  }

  if (config.filterKey && key === config.filterKey && (config.table === 'stockIn' || config.table === 'stockOut')) {
    const current = String(form[key] || '').trim()
    const partyItems = current && !profileOptions.includes(current)
      ? [current, ...profileOptions]
      : profileOptions
    return h('div', { class: wrapClass, key }, [
      h(VSelect, {
        ...base,
        modelValue: form[key] || null,
        'onUpdate:modelValue': async (v: string | null) => {
          form[key] = v || ''
          if (config.table === 'stockIn' && key === 'supplier_name' && onStockInSupplierChange) {
            await onStockInSupplierChange(String(v || ''))
          }
        },
        items: partyItems,
          label: fieldLabel(key),
        placeholder: t(key === 'supplier_name' ? 'selectSupplier' : 'selectCustomerToAdd'),
        hint: key === 'supplier_name'
          ? t('supplierOptionalHint')
          : (partyItems.length ? undefined : t('partySelectOnlyHint')),
        persistentHint: key === 'supplier_name' || !partyItems.length,
        clearable: true,
        hideNoData: false,
        noDataText: t('partySelectOnlyHint'),
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
          label: fieldLabel(key),
        placeholder: t(key === 'supplier_name' ? 'typeSupplierName' : 'typeCustomerName'),
        clearable: true,
        hideNoData: true,
      }),
    ])
  }

  if (config.table === 'stockIn' && key === 'material_name') {
    const selected = materialOptions.find(item =>
      item.material_name === form.material_name &&
      (item.material_spec || '') === (form.material_spec || '') &&
      (item.material_unit || '') === (form.material_unit || '')
    ) || form.material_name || null
    const clearMaterialFields = () => {
      form.material_name = ''
      form.material_spec = ''
      form.material_unit = ''
      form.material_used_quantity = 0
    }
    return h('div', { class: wrapClass, key }, [
      h(VCombobox, {
        ...base,
        modelValue: selected,
        'onUpdate:modelValue': (v: any) => {
          if (!v) {
            clearMaterialFields()
          } else if (typeof v === 'object') {
            form.material_name = v.material_name
            form.material_spec = v.material_spec || ''
            form.material_unit = v.material_unit || '公斤'
            if (Number(v.unit_price || 0) > 0 && Number(form.material_unit_price || 0) === 0) {
              form.material_unit_price = Number(v.unit_price || 0)
              autoFillAmountFields(form, 'material_unit_price')
            }
          } else {
            form.material_name = String(v || '')
            if (!String(v || '').trim()) clearMaterialFields()
          }
        },
        items: materialOptions,
        itemTitle: 'material_name',
        customFilter: productComboboxFilter(materialOptionTitle),
        label: fieldLabel(key),
        placeholder: '选择或填写材料',
        returnObject: true,
        clearable: true,
        hideNoData: false,
      }, materialComboboxSlots(form, materialOptionTitle)),
    ])
  }

  if ((config.table === 'stockIn' || config.table === 'customer' || config.table === 'supplier') && key === 'product_name') {
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
            if (config.table === 'stockIn' && v.category) form.category = v.category
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
          label: fieldLabel(key),
        placeholder: t('typeProductName'),
        returnObject: true,
        clearable: true,
        hideNoData: false,
      }, productComboboxSlots(form, productOptionTitle)),
    ])
  }

  if (config.table === 'stockOut' && key === 'product_name') {
    const inventoryTitle = (item: any) => inventoryOptionTitle(item, t)
    const selected = inventoryOptions.find(item =>
      item.product_name === form.product_name &&
      (item.spec || '') === (form.spec || '') &&
      (item.unit || '') === (form.unit || '')
    ) || (form.product_name ? {
      product_name: form.product_name,
      spec: form.spec || '',
      unit: form.unit || '',
      stock_qty: 0,
    } : null)
    return h('div', { class: wrapClass, key }, [
      h(VCombobox, {
        ...base,
        modelValue: selected,
        'onUpdate:modelValue': (v: any) => {
          if (v && typeof v === 'object') {
            form.product_name = v.product_name
            form.spec = v.spec || ''
            form.unit = v.unit || ''
            const available = stockOutAvailableQty(form, inventoryOptions, editingRow)
            if (Number(form.quantity || 0) > available) {
              form.quantity = available
              autoFillAmountFields(form, 'quantity')
            }
          } else if (!v) {
            form.product_name = ''
            form.spec = ''
            form.unit = ''
          }
        },
        items: inventoryOptions,
        itemTitle: 'product_name',
        customFilter: productComboboxFilter(inventoryTitle),
          label: fieldLabel(key),
        placeholder: t('selectInventoryProduct'),
        returnObject: true,
        clearable: true,
        hideNoData: false,
      }, productComboboxSlots(form, inventoryTitle)),
    ])
  }

  if (config.table === 'stockOut' && (key === 'spec' || key === 'unit')) {
    return h('div', { class: wrapClass, key }, [
      h(VTextField, {
        ...base,
        modelValue: stockOutLockedFieldDisplay(key, String(form[key] || ''), t),
          label: fieldLabel(key),
        readonly: true,
        hint: t('inventoryFieldAutoHint'),
        persistentHint: true,
      }),
    ])
  }

  if (config.table === 'stockOut' && key === 'quantity') {
    const hasProduct = Boolean(String(form.product_name || '').trim())
    const available = stockOutAvailableQty(form, inventoryOptions, editingRow)
    return h('div', { class: wrapClass, key }, [
      h(VTextField, {
        ...base,
        modelValue: form.quantity,
        'onUpdate:modelValue': (v: any) => {
          let qty = Number(v || 0)
          if (hasProduct && qty > available) qty = available
          if (qty < 0) qty = 0
          form.quantity = qty
          autoFillAmountFields(form, 'quantity')
        },
        label: fieldLabel(key),
        type: 'number',
        min: 0,
        max: hasProduct ? available : undefined,
        step: 'any',
        hint: hasProduct
          ? t('stockOutAvailableHint', { qty: money(available) })
          : t('stockOutSelectProductFirst'),
        persistentHint: true,
      }),
    ])
  }

  if (config.table === 'stockIn' && (key === 'spec' || key === 'unit')) {
    return h('div', { class: wrapClass, key }, [
      h(VTextField, {
        ...base,
        modelValue: form[key],
        'onUpdate:modelValue': (v: any) => { form[key] = v },
          label: fieldLabel(key),
        ...(key === 'spec' ? { hint: t('stockInSpecHint'), persistentHint: true } : {}),
      }),
    ])
  }

  if (key === 'note' || key === 'description') {
    return h('div', { class: 'record-dialog__field record-dialog__field--full', key }, [
      h(VTextarea, {
        ...base,
        modelValue: form[key],
        'onUpdate:modelValue': (v: any) => { form[key] = v },
          label: fieldLabel(key),
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
          label: fieldLabel(key),
        type: 'date',
      }),
    ])
  }

  if (key === '_finished_stock_amount') {
    const calcValue = roundMoneyValue(Number(form.quantity || 0) * Number(form.unit_price || 0))
    return h('div', { class: wrapClass, key }, [
      h(VTextField, {
        ...base,
        modelValue: calcValue ? money(calcValue) : '',
        label: fieldLabel(key),
        readonly: true,
        hint: t('finishedStockAmountHint'),
        persistentHint: true,
      }),
    ])
  }

  const isAutoCalcAmount = (key === 'amount_in' && (config.table === 'customer' || config.table === 'supplier'))
    || (key === 'amount' && config.table === 'stockOut')
    || (key === 'amount' && config.table === 'stockIn' && !isStockInMaterial)
    || (key === 'amount' && config.table === 'stockIn' && isStockInMaterial)
  if (isAutoCalcAmount) {
    let calcValue = isStockInMaterial
      ? roundMoneyValue(Number(form.material_quantity || 0) * Number(form.material_unit_price || 0))
      : roundMoneyValue(Number(form.quantity || 0) * Number(form.unit_price || 0))
    if (config.table === 'customer' && customerEntryMode === 'return' && calcValue > 0) {
      calcValue = -calcValue
    }
    const displayValue = calcValue < 0 ? `-${money(Math.abs(calcValue))}` : money(calcValue)
    return h('div', { class: wrapClass, key }, [
      h(VTextField, {
        ...base,
        modelValue: calcValue ? displayValue : '',
          label: fieldLabel(key),
        readonly: true,
        hint: t(isStockInMaterial ? 'materialAmountAutoCalc' : 'amountAutoCalc'),
        persistentHint: true,
      }),
    ])
  }

  if (key === 'unit_price' && isStockInMaterial) {
    return h('div', { class: wrapClass, key }, [
      h(VTextField, {
        ...base,
        modelValue: form[key],
        'onUpdate:modelValue': (v: any) => { form[key] = Number(v || 0) },
        label: fieldLabel(key),
        type: 'number',
        step: 'any',
        hint: t('finishedUnitPriceHint'),
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
          label: fieldLabel(key),
      type: numericField(key) ? 'number' : 'text',
      hint: config.table === 'stockIn' && !isStockInMaterial && ['material_spec', 'material_unit'].includes(key)
        ? '随材料选择自动带出'
        : undefined,
      persistentHint: config.table === 'stockIn' && !isStockInMaterial && ['material_spec', 'material_unit'].includes(key),
      readonly: key === 'month_label'
        || (config.table === 'stockIn' && !isStockInMaterial && ['material_spec', 'material_unit'].includes(key))
        || (config.table === 'customer' && customerLedgerFinancialLocked && ['quantity', 'unit_price', 'amount_out'].includes(key)),
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
    const cloudSyncPrefs = reactive({
      exitAutoUpload: true,
      startupCheck: true,
      startupAutoDownload: true,
    })
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
      if (cloudProgress.phase === 'applying') return 0
      if (!cloudProgress.total) return 0
      return Math.min(100, Math.round((cloudProgress.current / cloudProgress.total) * 100))
    })
    const cloudProgressIndeterminate = computed(() => {
      if (cloudProgress.phase === 'preparing' || cloudProgress.phase === 'applying') return true
      return cloudProgress.phase === 'transferring'
        && cloudProgress.total === 1
        && cloudProgress.current === 0
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
      if (!cloudUploading.value && !cloudDownloading.value) return
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
    const loadCloudSyncPrefs = async () => {
      try {
        const prefs = await cloudAPI.getSyncPrefs()
        cloudSyncPrefs.exitAutoUpload = prefs?.exitAutoUpload !== false
        cloudSyncPrefs.startupCheck = prefs?.startupCheck !== false
        cloudSyncPrefs.startupAutoDownload = prefs?.startupAutoDownload !== false
      } catch {
        cloudSyncPrefs.exitAutoUpload = true
        cloudSyncPrefs.startupCheck = true
        cloudSyncPrefs.startupAutoDownload = true
      }
    }
    const saveCloudSyncPref = async (key: 'exitAutoUpload' | 'startupCheck' | 'startupAutoDownload', value: boolean) => {
      cloudSyncPrefs[key] = value
      try {
        await cloudAPI.saveSyncPrefs({ [key]: value })
      } catch {
        emit('notify', props.t('backupFailed'), 'error')
      }
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
      await Promise.all([loadCloudConfig(), loadCloudSyncPrefs()])
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
      const password = await askPasswordConfirm({
        title: props.t('confirmCloudUploadTitle'),
        message: props.t('confirmCloudUploadMessage'),
        confirmColor: 'warning',
        confirmLabel: props.t('cloudSyncUpload'),
      })
      if (!password) return
      beginCloudProgress('upload')
      cloudUploading.value = true
      try {
        const result = await cloudAPI.syncUpload(password)
        notifyCloudSyncResult(result, 'upload')
        cloudStatus.value = await cloudAPI.status()
      } finally {
        cloudUploading.value = false
        finishCloudProgress()
      }
    }
    const cloudSyncDownload = async () => {
      const ok = await askConfirm({
        message: props.t('confirmCloudRestore'),
        confirmColor: 'error',
        confirmLabel: props.t('cloudSyncDownload'),
      })
      if (!ok) return
      beginCloudProgress('download')
      cloudDownloading.value = true
      try {
        const result = await cloudAPI.syncDownload()
        if (result?.canceled) {
          emit('notify', props.t('cloudSyncDownloadCanceled'), 'info')
          return
        }
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
            cloudSectionReady.value ? h('div', { class: 'cloud-sync-prefs' }, [
              h(VSwitch, {
                modelValue: cloudSyncPrefs.exitAutoUpload,
                'onUpdate:modelValue': (v: boolean | null) => { void saveCloudSyncPref('exitAutoUpload', Boolean(v)) },
                label: props.t('cloudExitAutoUpload'),
                density: 'compact',
                hideDetails: true,
                color: 'primary',
              }),
              h(VSwitch, {
                modelValue: cloudSyncPrefs.startupCheck,
                'onUpdate:modelValue': (v: boolean | null) => { void saveCloudSyncPref('startupCheck', Boolean(v)) },
                label: props.t('cloudStartupCheck'),
                density: 'compact',
                hideDetails: true,
                color: 'primary',
              }),
              h(VSwitch, {
                modelValue: cloudSyncPrefs.startupAutoDownload,
                'onUpdate:modelValue': (v: boolean | null) => { void saveCloudSyncPref('startupAutoDownload', Boolean(v)) },
                label: props.t('cloudStartupAutoDownload'),
                density: 'compact',
                hideDetails: true,
                color: 'primary',
                disabled: !cloudSyncPrefs.startupCheck,
              }),
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
              modelValue: cloudProgressIndeterminate.value ? undefined : cloudProgressPercent.value,
              indeterminate: cloudProgressIndeterminate.value,
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
        cloudDownloading.value ? h('div', { class: 'record-dialog__footer' }, [
          h(VSpacer),
          h(VBtn, {
            variant: 'text',
            onClick: () => { void cloudAPI.cancelSync() },
          }, () => props.t('cloudSyncCancel')),
        ]) : null,
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
    const clearing = ref(false)
    const clearTrash = async () => {
      const password = await askPasswordConfirm({
        title: props.t('confirmClearTrashTitle'),
        message: props.t('confirmClearTrashMessage'),
        confirmLabel: props.t('clearTrash'),
      })
      if (!password) return
      clearing.value = true
      try {
        const result = await systemAPI.clearTrash(password)
        if (!result?.ok) {
          emit('notify', result?.error || '清空失败', 'error')
          return
        }
        emit('notify', props.t('clearTrashDone', { count: result.count || 0 }))
        load()
      } finally {
        clearing.value = false
      }
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
          h(VBtn, { variant: 'tonal', size: 'small', color: 'error', loading: clearing.value, onClick: clearTrash }, () => props.t('clearTrash')),
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
  emits: ['notify'],
  setup(props, { emit }) {
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
      { title: props.t('customer'), value: 'customer_profiles' },
      { title: props.t('stockIn'), value: 'stock_in_ledger' },
      { title: props.t('stockOut'), value: 'stock_out_ledger' },
    ]
    const actionOptions = [
      { title: props.t('logActionInsert'), value: 'INSERT' },
      { title: props.t('logActionUpdate'), value: 'UPDATE' },
      { title: props.t('logActionDelete'), value: 'DELETE' },
      { title: props.t('logActionRestore'), value: 'RESTORE' },
    ]
    const moduleLabel = (name: string) => moduleOptions.find((item) => item.value === name)?.title || name
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
    const clearing = ref(false)
    const clearLogs = async () => {
      const password = await askPasswordConfirm({
        title: props.t('confirmClearLogsTitle'),
        message: props.t('confirmClearLogsMessage'),
        confirmLabel: props.t('clearLogs'),
      })
      if (!password) return
      clearing.value = true
      try {
        const result = await systemAPI.clearLogs(password)
        if (!result?.ok) {
          emit('notify', result?.error || '清空失败', 'error')
          return
        }
        emit('notify', props.t('clearLogsDone', { count: result.count || 0 }))
        currentPage.value = 1
        await load()
      } finally {
        clearing.value = false
      }
    }
    return () => h('div', { class: 'page-wrap ledger-page' }, [
      h(PageHeader, { title: props.t('logsTitle'), subtitle: props.t('logsPageSub') }, {
        actions: () => h('div', { class: 'header-toolbar' }, [
          h(VSelect, { modelValue: tableName.value, 'onUpdate:modelValue': (v: string) => { tableName.value = v || '' }, items: moduleOptions, label: props.t('filterModule'), clearable: true, density: 'compact', hideDetails: true, class: 'toolbar-input header-toolbar-input' }),
          h(VSelect, { modelValue: action.value, 'onUpdate:modelValue': (v: string) => { action.value = v || '' }, items: actionOptions, label: props.t('filterAction'), clearable: true, density: 'compact', hideDetails: true, class: 'toolbar-input header-toolbar-input' }),
          h(VTextField, { modelValue: startDate.value, 'onUpdate:modelValue': (v: string) => { startDate.value = v || '' }, label: props.t('filterStartDate'), type: 'date', density: 'compact', hideDetails: true, class: 'toolbar-input header-toolbar-input' }),
          h(VTextField, { modelValue: endDate.value, 'onUpdate:modelValue': (v: string) => { endDate.value = v || '' }, label: props.t('filterEndDate'), type: 'date', density: 'compact', hideDetails: true, class: 'toolbar-input header-toolbar-input' }),
          h(VTextField, { modelValue: keyword.value, 'onUpdate:modelValue': (v: string) => { keyword.value = v }, label: props.t('search'), density: 'compact', hideDetails: true, class: 'toolbar-input header-toolbar-input' }),
          h(VBtn, { variant: 'text', size: 'small', onClick: resetFilters }, () => props.t('resetFilters')),
          h(VBtn, { variant: 'tonal', size: 'small', color: 'error', loading: clearing.value, onClick: clearLogs }, () => props.t('clearLogs')),
        ]),
      }),
      h(VCard, { class: 'data-card table-card utility-table-card' }, () => [
        h('div', { class: 'table-scroll' }, [
          h(VTable, { class: 'ledger-table logs-table', hover: true }, () => [
            h('thead', [h('tr', [
              props.t('time'),
              props.t('actionType'),
              props.t('module'),
              props.t('logDescription'),
              props.t('operator'),
              props.t('logClientIp'),
              props.t('logDeviceInfo'),
            ].map((x) => h('th', x)))]),
            h('tbody', rows.value.map((row) => h('tr', [
              h('td', { class: 'logs-time' }, row.created_at),
              h('td', row.action_label || row.action),
              h('td', row.module_label || moduleLabel(row.table_name)),
              h('td', { class: 'logs-description', title: row.description || '' }, row.description || '—'),
              h('td', row.operator || '—'),
              h('td', { class: 'logs-meta', title: row.client_ip || '' }, row.client_ip || '—'),
              h('td', { class: 'logs-meta', title: row.device_info || '' }, row.device_info || '—'),
            ]))),
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
