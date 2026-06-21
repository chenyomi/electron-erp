import { contextBridge, ipcRenderer } from 'electron'

const allowedChannels = new Set(['update:state', 'update:open-dialog'])

const api = {
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, listener: (...args: any[]) => void) => {
    if (!allowedChannels.has(channel)) return () => {}
    const subscription = (_event: Electron.IpcRendererEvent, ...args: any[]) => listener(...args)
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
