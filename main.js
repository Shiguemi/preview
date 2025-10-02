const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');
const exifr = require('exifr');
const { execFile } = require('child_process');
const tmp = require('tmp');

const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'exr'];
const cache = new Map();

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: false, // Re-enable to allow renderer to access file.path
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');

  // The drop event is now handled by the renderer process to prevent navigation.
  // The main process no longer needs to listen to the webContents 'drop' event for this.
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });

  if (result.canceled) {
    return;
  }

  const folderPath = result.filePaths[0];
  const files = fs.readdirSync(folderPath).map(file => {
    const filePath = path.join(folderPath, file);
    return {
      name: file,
      path: filePath,
      url: url.format({
        pathname: filePath,
        protocol: 'file:',
        slashes: true
      })
    };
  });

  return {
    files,
    imageExtensions,
    folderPath,
  };
});

ipcMain.handle('open-folder', async (event, folderPath) => {
  console.log('[main.js] open-folder called with:', folderPath);
  
  if (typeof folderPath !== 'string' || !folderPath) {
    console.error('[main.js] Invalid folder path received:', folderPath);
    return null;
  }

  try {
    const stats = fs.statSync(folderPath);
    console.log('[main.js] Path stats:', { isDirectory: stats.isDirectory(), isFile: stats.isFile() });
    
    // If it's a file, use its parent directory
    let targetPath = folderPath;
    if (stats.isFile()) {
      targetPath = path.dirname(folderPath);
      console.log('[main.js] File dropped, using parent directory:', targetPath);
    } else if (!stats.isDirectory()) {
      console.log(`[main.js] Path is neither file nor directory: ${folderPath}`);
      return null;
    }
    
    const files = fs.readdirSync(targetPath).map(file => {
      const filePath = path.join(targetPath, file);
      return {
        name: file,
        path: filePath,
        url: url.format({
          pathname: filePath,
          protocol: 'file:',
          slashes: true
        })
      };
    });

    console.log('[main.js] Returning result with', files.length, 'files from', targetPath);
    
    return {
      files,
      imageExtensions,
      folderPath: targetPath,
    };
  } catch (error) {
    console.error(`[main.js] Error accessing path: ${folderPath}`, error);
    return null;
  }
});

ipcMain.handle('select-folder-from-drop', async (event, signalInfo) => {
  console.log(`[main.js] select-folder-from-drop called with signal:`, signalInfo);
  
  let defaultPathForDialog = null;
  // Check if the renderer sent a path from the drop event
  if (signalInfo && signalInfo.path && typeof signalInfo.path === 'string') {
    try {
      const stats = fs.statSync(signalInfo.path);
      if (stats.isDirectory()) {
        defaultPathForDialog = signalInfo.path;
        console.log(`[main.js] Dropped item is a directory. Setting defaultPath to: ${defaultPathForDialog}`);
      } else if (stats.isFile()) {
        defaultPathForDialog = path.dirname(signalInfo.path);
        console.log(`[main.js] Dropped item is a file. Setting defaultPath to its parent: ${defaultPathForDialog}`);
      }
    } catch (error) {
      console.warn(`[main.js] Could not stat dropped path "${signalInfo.path}". Error: ${error.message}. Dialog will open to last used location.`);
    }
  } else {
    console.log(`[main.js] No valid path provided from renderer. Dialog will open to last used location.`);
  }

  const dialogOptions = {
    properties: ['openFile', 'openDirectory'],
    filters: [
      { name: 'Images', extensions: imageExtensions },
      { name: 'All Files', extensions: ['*'] }
    ]
  };

  if (defaultPathForDialog) {
    dialogOptions.defaultPath = defaultPathForDialog;
  }

  const result = await dialog.showOpenDialog(dialogOptions);

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    console.log('[main.js] File/Folder dialog was canceled or no path selected.');
    return null;
  }

  const selectedPath = result.filePaths[0];
  console.log(`[main.js] Path selected from dialog: ${selectedPath}`);
  
  return handleOpenFolderRequest(selectedPath);
});

// Helper function to encapsulate the folder opening logic
async function handleOpenFolderRequest(folderPath) {
  console.log('[main.js] handleOpenFolderRequest called with:', folderPath);
  
  if (typeof folderPath !== 'string' || !folderPath) {
    console.error('[main.js] Invalid folder path received:', folderPath);
    return null;
  }

  try {
    const stats = fs.statSync(folderPath);
    console.log('[main.js] Path stats:', { isDirectory: stats.isDirectory(), isFile: stats.isFile() });
    
    let targetPath = folderPath;
    if (stats.isFile()) {
      targetPath = path.dirname(folderPath);
      console.log('[main.js] File dropped, using parent directory:', targetPath);
    } else if (!stats.isDirectory()) {
      console.log(`[main.js] Path is neither file nor directory: ${folderPath}`);
      return null;
    }
    
    const files = fs.readdirSync(targetPath).map(file => {
      const filePath = path.join(targetPath, file);
      return {
        name: file,
        path: filePath,
        url: url.format({
          pathname: filePath,
          protocol: 'file:',
          slashes: true
        })
      };
    });

    console.log('[main.js] Returning result with', files.length, 'files from', targetPath);
    
    return {
      files,
      imageExtensions,
      folderPath: targetPath,
    };
  } catch (error) {
    console.error(`[main.js] Error accessing path: ${folderPath}`, error);
    return null;
  }
}

ipcMain.handle('get-file-path-from-drop', async (event, dataTransfer) => {
  console.log('[main.js] get-file-path-from-drop called');

  try {
    // In the main process, we don't have direct access to the dataTransfer object
    // from the renderer. We need a different approach.
    // For now, return null and let the renderer handle it directly
    return null;
  } catch (error) {
    console.error('[main.js] Error in get-file-path-from-drop:', error);
    return null;
  }
});

ipcMain.handle('get-thumbnail', async (event, filePath) => {
    if (cache.has(filePath)) {
        return cache.get(filePath);
    }

    const fileExtension = path.extname(filePath).toLowerCase();

    if (fileExtension !== '.exr') {
        try {
            const buffer = await exifr.thumbnail(filePath);
            if (buffer) {
                const thumbnailUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;
                cache.set(filePath, thumbnailUrl);
                return thumbnailUrl;
            }
        } catch (error) {
            // exifr throws an error if it can't find a thumbnail, which is expected.
        }
        return null;
    }

    // Handle EXR files by calling the 'convert' command-line tool from ImageMagick.
    return new Promise((resolve) => {
        tmp.tmpName({ postfix: '.jpg' }, (err, tmpPath) => {
            if (err) {
                console.error('Failed to create temporary file name:', err);
                return resolve(null);
            }

            const command = process.platform === 'win32' ? 'magick' : 'convert';
            const args = process.platform === 'win32'
                ? ['convert', filePath, '-gamma', '2.2', '-resize', '800x800', tmpPath]
                : [filePath, '-gamma', '2.2', '-resize', '800x800', tmpPath];

            execFile(command, args, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error converting EXR file "${filePath}" with command "${command}":`, stderr);
                    fs.unlink(tmpPath, () => {});
                    resolve(null);
                    return;
                }

                fs.readFile(tmpPath, (readErr, data) => {
                    fs.unlink(tmpPath, () => {});
                    if (readErr) {
                        console.error('Error reading temporary thumbnail file:', readErr);
                        resolve(null);
                        return;
                    }
                    const thumbnailUrl = `data:image/jpeg;base64,${data.toString('base64')}`;
                    cache.set(filePath, thumbnailUrl);
                    resolve(thumbnailUrl);
                });
            });
        });
    });
});

async function loadImageData(filePath) {
    const cacheKey = `full-${filePath}`;
    if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
    }

    const fileExtension = path.extname(filePath).toLowerCase();

    const result = await new Promise((resolve, reject) => {
        if (fileExtension === '.exr') {
            tmp.tmpName({ postfix: '.jpg' }, (err, tmpPath) => {
                if (err) {
                    console.error('Failed to create temporary file name:', err);
                    return reject(err);
                }

                const command = process.platform === 'win32' ? 'magick' : 'convert';
                const args = process.platform === 'win32'
                    ? ['convert', filePath, '-gamma', '2.2', tmpPath]
                    : [filePath, '-gamma', '2.2', tmpPath];

                execFile(command, args, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`Error converting EXR file "${filePath}" with command "${command}":`, stderr);
                        fs.unlink(tmpPath, () => {});
                        return reject(new Error(`Failed to convert EXR file: ${stderr}`));
                    }

                    fs.readFile(tmpPath, (readErr, data) => {
                        fs.unlink(tmpPath, () => {});
                        if (readErr) {
                            console.error('Error reading temporary image file:', readErr);
                            return reject(readErr);
                        }
                        resolve(`data:image/jpeg;base64,${data.toString('base64')}`);
                    });
                });
            });
        } else {
            fs.readFile(filePath, (err, data) => {
                if (err) {
                    console.error('Failed to read image file:', err);
                    return reject(err);
                }
                const extension = fileExtension.substring(1);
                const mimeType = `image/${extension === 'jpg' ? 'jpeg' : extension}`;
                resolve(`data:${mimeType};base64,${data.toString('base64')}`);
            });
        }
    });

    cache.set(cacheKey, result);
    return result;
}

ipcMain.handle('get-image-data', (event, filePath) => {
    return loadImageData(filePath);
});

ipcMain.handle('preload-images', async (event, filePaths) => {
    for (const filePath of filePaths) {
        try {
            await loadImageData(filePath);
        } catch (error) {
            console.error(`Failed to preload image: ${filePath}`, error);
        }
    }
});
