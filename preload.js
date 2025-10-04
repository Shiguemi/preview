const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  selectFolder: (recursive = false) => ipcRenderer.invoke('select-folder', recursive),
  openFolder: (folderPath, recursive = false) => ipcRenderer.invoke('open-folder', folderPath, recursive),
  getThumbnail: (filePath) => ipcRenderer.invoke('get-thumbnail', filePath),
  getImageData: (filePath) => ipcRenderer.invoke('get-image-data', filePath),
  preloadImages: (filePaths) => ipcRenderer.invoke('preload-images', filePaths),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  getRecentFolders: () => ipcRenderer.invoke('get-recent-folders'),
  onRecentFoldersUpdated: (callback) => ipcRenderer.on('recent-folders-updated', (event, folders) => callback(folders)),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  // Python backend status
  onPythonBackendReady: (callback) => ipcRenderer.on('python-backend-ready', callback),
  onPythonBackendError: (callback) => ipcRenderer.on('python-backend-error', (event, error) => callback(error)),
});