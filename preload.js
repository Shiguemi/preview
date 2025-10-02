const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getThumbnail: (filePath) => ipcRenderer.invoke('get-thumbnail', filePath),
  getImageData: (filePath) => ipcRenderer.invoke('get-image-data', filePath),
  preloadImages: (filePaths) => ipcRenderer.invoke('preload-images', filePaths),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  getFilePathFromDrop: (dataTransfer) => ipcRenderer.invoke('get-file-path-from-drop', dataTransfer),
  selectFolderFromDrop: (fileName) => ipcRenderer.invoke('select-folder-from-drop', fileName),
  // Listener for messages from the main process
  onShowFolderDialogFromDrop: (callback) => ipcRenderer.on('show-folder-dialog-from-drop', callback),
});

// Also expose the handleFolderOpen function for external testing
contextBridge.exposeInMainWorld('handleFolderOpen', (result) => {
  // This will be overridden by the renderer process
  console.log('handleFolderOpen called from preload:', result);
});
