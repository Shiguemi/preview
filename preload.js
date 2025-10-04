const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // Folder operations
  selectFolder: (recursive = false) => ipcRenderer.invoke('select-folder', recursive),
  openFolder: (folderPath, recursive = false) => ipcRenderer.invoke('open-folder', folderPath, recursive),

  // File scanning events
  onFolderOpened: (callback) => ipcRenderer.on('folder-opened', (event, data) => callback(data)),
  onFolderScanUpdate: (callback) => ipcRenderer.on('folder-scan-update', (event, files) => callback(files)),
  onFolderScanComplete: (callback) => ipcRenderer.on('folder-scan-complete', callback),
  onFolderScanError: (callback) => ipcRenderer.on('folder-scan-error', (event, error) => callback(error)),

  // Thumbnail and image data
  getThumbnail: (filePath) => ipcRenderer.invoke('get-thumbnail', filePath),
  getImageData: (filePath) => ipcRenderer.invoke('get-image-data', filePath),
  preloadImages: (filePaths) => ipcRenderer.invoke('preload-images', filePaths),

  // Recent folders
  getRecentFolders: () => ipcRenderer.invoke('get-recent-folders'),
  onRecentFoldersUpdated: (callback) => ipcRenderer.on('recent-folders-updated', (event, folders) => callback(folders)),

  // App control
  quitApp: () => ipcRenderer.invoke('quit-app'),

  // Python backend status
  onPythonBackendReady: (callback) => ipcRenderer.on('python-backend-ready', callback),
  onPythonBackendError: (callback) => ipcRenderer.on('python-backend-error', (event, error) => callback(error)),
});