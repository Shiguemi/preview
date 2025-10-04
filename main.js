const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');
const exifr = require('exifr');
const pythonManager = require('./python-manager');

// Setup logging to file
const logFile = path.join(app.getPath('userData'), 'debug.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

// Override console.log and console.error to write to file
const originalLog = console.log;
const originalError = console.error;

console.log = (...args) => {
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
  logStream.write(`[LOG] ${new Date().toISOString()} ${message}\n`);
  originalLog.apply(console, args);
};

console.error = (...args) => {
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
  logStream.write(`[ERROR] ${new Date().toISOString()} ${message}\n`);
  originalError.apply(console, args);
};

console.log(`=== Application Started - Log file: ${logFile} ===`);

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

  // Add keyboard shortcut to toggle DevTools (Ctrl+Shift+D)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'd') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // Enable file path access for drag and drop
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
}

app.whenReady().then(async () => {
  loadRecentFolders();
  createWindow();

  // Initialize Python environment in background
  console.log('=== Starting Python Backend Initialization ===');
  pythonManager.initialize()
    .then(() => {
      console.log('=== Python Backend Ready! ===');
      // Notify renderer process
      if (mainWindow) {
        mainWindow.webContents.send('python-backend-ready');
      }
    })
    .catch(error => {
      console.error('=== Failed to initialize Python environment ===');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      // Notify renderer process about error
      if (mainWindow) {
        mainWindow.webContents.send('python-backend-error', error.message);
      }
    });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  await pythonManager.stop();
  logStream.end();
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

let fileScannerIterator = null; // To hold the state of the file scanning generator

// This function is now an async generator, making it pausable
async function* streamFilesRecursively(dirPath, baseDir = dirPath) {
    const BATCH_SIZE = 50;
    let fileBatch = [];
    let dirs = [dirPath];

    while (dirs.length > 0) {
        const currentDir = dirs.pop();
        try {
            const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);

                if (entry.isDirectory()) {
                    dirs.push(fullPath);
                } else {
                    const relativePath = path.relative(baseDir, currentDir);
                    const displayName = relativePath ? path.join(relativePath, entry.name) : entry.name;

                    fileBatch.push({
                        name: displayName,
                        path: fullPath,
                        url: url.format({
                            pathname: fullPath,
                            protocol: 'file:',
                            slashes: true
                        })
                    });

                    if (fileBatch.length >= BATCH_SIZE) {
                        yield fileBatch;
                        fileBatch = [];
                    }
                }
            }
        } catch (error) {
            console.error(`Error reading directory: ${currentDir}`, error);
            if (mainWindow) {
                mainWindow.webContents.send('folder-scan-error', error.message);
            }
        }
    }

    if (fileBatch.length > 0) {
        yield fileBatch;
    }
}

async function handleOpenFolder(itemPath, recursive = false) {
  if (!itemPath || typeof itemPath !== 'string') {
    console.log('Invalid folder path received.');
    return;
  }

  let folderPath = itemPath;
  try {
    const stats = await fs.promises.stat(itemPath);
    if (stats.isFile()) {
      folderPath = path.dirname(itemPath);
    } else if (!stats.isDirectory()) {
      console.log(`Path is not a directory or file: ${itemPath}`);
      return;
    }
  } catch (error) {
    console.error(`Error accessing path: ${itemPath}`, error);
    return;
  }

  addToRecentFolders(folderPath);

  mainWindow.webContents.send('folder-opened', {
    folderPath,
    imageExtensions,
  });

  if (recursive) {
    // Create the generator but don't start it yet. The renderer will request the first batch.
    fileScannerIterator = streamFilesRecursively(folderPath);
  } else {
    // For non-recursive, we can send everything at once as it's usually fast.
    const files = (await fs.promises.readdir(folderPath)).map(file => {
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
    mainWindow.webContents.send('folder-scan-update', files);
    mainWindow.webContents.send('folder-scan-complete');
  }
}

// New handler to drive the generator
ipcMain.on('request-more-files', async () => {
  if (fileScannerIterator) {
    const result = await fileScannerIterator.next();
    if (!result.done) {
      mainWindow.webContents.send('folder-scan-update', result.value);
    } else {
      mainWindow.webContents.send('folder-scan-complete');
      fileScannerIterator = null; // Clean up
    }
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

    // Handle EXR files using Python backend
    try {
        console.log(`[EXR] Processing thumbnail for: ${filePath}`);

        // Wait for Python backend to be ready
        if (!pythonManager.isReady) {
            console.log('[EXR] Python backend not ready yet, waiting...');
            await pythonManager.initialize();
            console.log('[EXR] Python backend initialized');
        }

        console.log(`[EXR] Calling convertExr for: ${filePath}`);
        const thumbnailUrl = await pythonManager.convertExr(filePath, 800, 2.2);

        if (thumbnailUrl) {
            console.log(`[EXR] Conversion successful, thumbnail size: ${thumbnailUrl.length} chars`);
            cache.set(filePath, thumbnailUrl);
            return thumbnailUrl;
        } else {
            console.error(`[EXR] Conversion returned null for: ${filePath}`);
            return null;
        }
    } catch (error) {
        console.error(`[EXR] Failed to convert EXR file: ${filePath}`);
        console.error('[EXR] Error details:', error.message);
        console.error('[EXR] Stack:', error.stack);
        return null;
    }
});

async function loadImageData(filePath) {
    const cacheKey = `full-${filePath}`;
    if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
    }

    const fileExtension = path.extname(filePath).toLowerCase();

    let result;

    if (fileExtension === '.exr') {
        // Wait for Python backend to be ready
        if (!pythonManager.isReady) {
            console.log('Python backend not ready for full image, waiting...');
            await pythonManager.initialize();
        }
        // Use Python backend for full-size EXR conversion (no resize)
        result = await pythonManager.convertExr(filePath, null, 2.2);
    } else {
        // Handle other image formats
        const data = await fs.promises.readFile(filePath);
        const extension = fileExtension.substring(1);
        const mimeType = `image/${extension === 'jpg' ? 'jpeg' : extension}`;
        result = `data:${mimeType};base64,${data.toString('base64')}`;
    }

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

ipcMain.handle('quit-app', () => {
    app.quit();
});

ipcMain.handle('get-python-status', () => {
    return {
        isReady: pythonManager.isReady,
        backendUrl: pythonManager.backendUrl
    };
});