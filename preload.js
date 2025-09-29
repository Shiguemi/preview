const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getThumbnail: (filePath) => ipcRenderer.invoke('get-thumbnail', filePath),
  getImageData: (filePath) => ipcRenderer.invoke('get-image-data', filePath),
  preloadImages: (filePaths) => ipcRenderer.invoke('preload-images', filePaths),
});