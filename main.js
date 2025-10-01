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
    },
  });

  mainWindow.loadFile('index.html');
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
  try {
    const stats = fs.statSync(folderPath);
    if (!stats.isDirectory()) {
      console.log(`Attempted to open a file, not a directory: ${folderPath}`);
      return null; // Or return an error/specific message
    }
  } catch (error) {
    console.error(`Error accessing path: ${folderPath}`, error);
    return null;
  }

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