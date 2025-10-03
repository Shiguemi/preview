const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');
const exifr = require('exifr');
const { execFile } = require('child_process');
const tmp = require('tmp');

const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'exr'];
const cache = new Map();
const MAX_RECENT_FOLDERS = 10;
let recentFolders = [];
let mainWindow = null;

// Load recent folders from storage
function loadRecentFolders() {
  const userDataPath = app.getPath('userData');
  const recentFoldersPath = path.join(userDataPath, 'recent-folders.json');

  try {
    if (fs.existsSync(recentFoldersPath)) {
      const data = fs.readFileSync(recentFoldersPath, 'utf8');
      recentFolders = JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading recent folders:', error);
    recentFolders = [];
  }
}

// Save recent folders to storage
function saveRecentFolders() {
  const userDataPath = app.getPath('userData');
  const recentFoldersPath = path.join(userDataPath, 'recent-folders.json');

  try {
    fs.writeFileSync(recentFoldersPath, JSON.stringify(recentFolders, null, 2));
  } catch (error) {
    console.error('Error saving recent folders:', error);
  }
}

// Add folder to recent list
function addToRecentFolders(folderPath) {
  // Remove if already exists
  recentFolders = recentFolders.filter(f => f !== folderPath);

  // Add to beginning
  recentFolders.unshift(folderPath);

  // Keep only MAX_RECENT_FOLDERS
  if (recentFolders.length > MAX_RECENT_FOLDERS) {
    recentFolders = recentFolders.slice(0, MAX_RECENT_FOLDERS);
  }

  saveRecentFolders();

  // Notify renderer to update menu
  if (mainWindow) {
    mainWindow.webContents.send('recent-folders-updated', recentFolders);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false,
      webviewTag: false,
    },
    webContents: {
      enableWebSQL: false,
    },
  });

  // Remove native menu bar
  Menu.setApplicationMenu(null);

  mainWindow.loadFile('index.html');

  // Enable file path access for drag and drop
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
}

app.whenReady().then(() => {
  loadRecentFolders();
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('select-folder', async (event, recursive = false) => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });

  if (result.canceled) {
    return;
  }

  const folderPath = result.filePaths[0];
  return handleOpenFolder(folderPath, recursive);
});

ipcMain.handle('open-folder', async (event, folderPath, recursive = false) => {
  return handleOpenFolder(folderPath, recursive);
});

function readFilesRecursively(dirPath, baseDir = dirPath) {
  let results = [];

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Recursively read subdirectories
        results = results.concat(readFilesRecursively(fullPath, baseDir));
      } else {
        // Add file with relative path from base directory
        const relativePath = path.relative(baseDir, dirPath);
        const displayName = relativePath ? path.join(relativePath, entry.name) : entry.name;

        results.push({
          name: displayName,
          path: fullPath,
          url: url.format({
            pathname: fullPath,
            protocol: 'file:',
            slashes: true
          })
        });
      }
    }
  } catch (error) {
    console.error(`Error reading directory: ${dirPath}`, error);
  }

  return results;
}

function handleOpenFolder(itemPath, recursive = false) {
  if (!itemPath || typeof itemPath !== 'string') {
    console.log('Invalid folder path received.');
    return null;
  }

  let folderPath = itemPath;
  try {
    const stats = fs.statSync(itemPath);
    if (stats.isFile()) {
      folderPath = path.dirname(itemPath);
    } else if (!stats.isDirectory()) {
      console.log(`Path is not a directory or file: ${itemPath}`);
      return null;
    }
  } catch (error) {
    console.error(`Error accessing path: ${itemPath}`, error);
    return null;
  }

  let files;

  if (recursive) {
    files = readFilesRecursively(folderPath);
  } else {
    files = fs.readdirSync(folderPath).map(file => {
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
  }

  // Add to recent folders
  addToRecentFolders(folderPath);

  return {
    files,
    imageExtensions,
    folderPath,
  };
}

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

ipcMain.handle('get-recent-folders', () => {
    return recentFolders;
});