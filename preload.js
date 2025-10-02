const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  getThumbnail: (filePath) => ipcRenderer.invoke('get-thumbnail', filePath),
  getImageData: (filePath) => ipcRenderer.invoke('get-image-data', filePath),
  preloadImages: (filePaths) => ipcRenderer.invoke('preload-images', filePaths),
  getPathForFile: (file) => webUtils.getPathForFile(file),
});