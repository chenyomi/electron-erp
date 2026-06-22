import { app, shell, BrowserWindow, ipcMain, dialog, nativeImage, Menu, type MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { getDataDir, initDatabase } from './db'
import { registerIpcHandlers } from './ipc'
import { autoBackup } from './backup'
import { initAutoUpdater, checkForUpdates } from './updater'
import * as fs from 'fs'

const appIconPath = join(__dirname, '../../resources/icon.png')
const APP_NAME = '东昊账务'

function focusedWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null
}

function showInfo(title: string, message: string, detail?: string): void {
  const parent = focusedWindow()
  const options = {
    type: 'info' as const,
    title,
    message,
    detail,
    buttons: ['知道了'],
  }
  if (parent) dialog.showMessageBox(parent, options)
  else dialog.showMessageBox(options)
}

function openDataSubdir(dirName: string): void {
  const targetDir = join(getDataDir(), dirName)
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true })
  shell.openPath(targetDir)
}

function createApplicationMenu(): void {
  app.setName(APP_NAME)
  app.setAboutPanelOptions({
    applicationName: APP_NAME,
    applicationVersion: app.getVersion(),
    version: app.getVersion(),
    copyright: '温州东昊汽车配件有限公司',
    credits: '本地账务、库存、附件、备份恢复管理系统',
    iconPath: appIconPath,
  })

  const appMenu: MenuItemConstructorOptions[] = process.platform === 'darwin'
    ? [{
      label: APP_NAME,
      submenu: [
        { label: `关于${APP_NAME}`, role: 'about' },
        { type: 'separator' },
        { label: '服务', role: 'services' },
        { type: 'separator' },
        { label: `隐藏${APP_NAME}`, accelerator: 'Command+H', role: 'hide' },
        { label: '隐藏其他', accelerator: 'Command+Alt+H', role: 'hideOthers' },
        { label: '全部显示', role: 'unhide' },
        { type: 'separator' },
        { label: `退出${APP_NAME}`, accelerator: 'Command+Q', role: 'quit' },
      ],
    }]
    : []

  const template: MenuItemConstructorOptions[] = [
    ...appMenu,
    {
      label: '数据',
      submenu: [
        {
          label: '立即备份',
          accelerator: 'CmdOrCtrl+B',
          click: () => {
            void (async () => {
              const result = await autoBackup()
              if (result.ok) {
                showInfo('备份完成', '已创建新的账务备份。', result.path)
              } else {
                dialog.showErrorBox('备份失败', result.error || '请稍后重试。')
              }
            })()
          },
        },
        { type: 'separator' },
        {
          label: '打开数据文件夹',
          click: () => shell.openPath(getDataDir()),
        },
        {
          label: '打开备份文件夹',
          click: () => openDataSubdir('backups'),
        },
        {
          label: '打开附件图片文件夹',
          click: () => openDataSubdir('attachments'),
        },
        {
          label: '打开导入图片文件夹',
          click: () => openDataSubdir('excel-images'),
        },
        { type: 'separator' },
        {
          label: '重新载入账本',
          accelerator: 'CmdOrCtrl+R',
          click: () => focusedWindow()?.webContents.reload(),
        },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: '重做', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: '全选', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '实际大小', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { label: '放大', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: '缩小', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { type: 'separator' },
        { label: '切换全屏', role: 'togglefullscreen' },
        ...(is.dev ? [
          { type: 'separator' as const },
          { label: '开发者工具', accelerator: process.platform === 'darwin' ? 'Alt+Command+I' : 'Ctrl+Shift+I', role: 'toggleDevTools' as const },
        ] : []),
      ],
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', accelerator: 'CmdOrCtrl+M', role: 'minimize' },
        { label: '关闭窗口', accelerator: 'CmdOrCtrl+W', role: 'close' },
        ...(process.platform === 'darwin' ? [
          { type: 'separator' as const },
          { label: '前置所有窗口', role: 'front' as const },
        ] : []),
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '检查更新',
          click: () => {
            focusedWindow()?.webContents.send('update:open-dialog')
            checkForUpdates().catch(() => {})
          },
        },
        { type: 'separator' },
        {
          label: '关于东昊账务',
          click: () => showInfo(
            '东昊账务',
            '温州东昊汽车配件有限公司账务管理系统',
            `版本 ${app.getVersion()}\n支持现金、公账、承兑票、客户往来、出入库、附件、导入导出和备份恢复。`
          ),
        },
        {
          label: '使用建议',
          click: () => showInfo(
            '使用建议',
            '建议每天收工前备份一次。',
            '重要操作前先点“数据 > 立即备份”；换电脑时请在应用内“数据管理”导出备份包。'
          ),
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    icon: appIconPath,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f1729',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('close', () => {
    void autoBackup({ automatic: true })
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.donghao.ledger')

  if (process.platform === 'darwin') {
    app.dock.setIcon(nativeImage.createFromPath(appIconPath))
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  initDatabase()
  registerIpcHandlers()
  initAutoUpdater()
  createApplicationMenu()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error('应用启动失败:', error)
  dialog.showErrorBox(
    '东昊账务启动失败',
    `${message}\n\n若提示 better-sqlite3 / mach-o / dlopen，请在项目目录执行：\npnpm rebuild:native`
  )
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
