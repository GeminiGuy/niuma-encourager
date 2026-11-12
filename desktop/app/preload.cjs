'use strict';

const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  command: action => ipcRenderer.invoke('niuma:window', action),
  onState: callback => ipcRenderer.on('niuma:window-state', (_event, state) => callback(state))
});
