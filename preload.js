const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getThumbnail: (filePath) => ipcRenderer.invoke('get-thumbnail', filePath),
});