const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getExrThumbnail: (filePath) => ipcRenderer.invoke('get-exr-thumbnail', filePath),
});