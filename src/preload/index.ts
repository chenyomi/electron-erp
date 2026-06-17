import { contextBridge, ipcRenderer } from 'electron'

const api = {
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args)
}

contextBridge.exposeInMainWorld('electronAPI', api)
