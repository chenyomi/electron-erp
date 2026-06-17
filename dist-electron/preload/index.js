"use strict";
const electron = require("electron");
const api = {
  invoke: (channel, ...args) => electron.ipcRenderer.invoke(channel, ...args)
};
electron.contextBridge.exposeInMainWorld("electronAPI", api);
