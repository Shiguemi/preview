const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');
const exifr = require('exifr');
const gm = require('gm').subClass({ imageMagick: true });

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
  };
});

ipcMain.handle('get-exr-thumbnail', async (event, filePath) => {
  const fileExtension = path.extname(filePath).toLowerCase();

  if (fileExtension === '.exr') {
    return new Promise((resolve, reject) => {
      gm(filePath)
        .resize(200)
        .toBuffer('JPEG', (err, buffer) => {
          if (err) {
            console.error('Error creating EXR thumbnail:', err);
            resolve(null);
          } else {
            resolve(`data:image/jpeg;base64,${buffer.toString('base64')}`);
          }
        });
    });
  } else {
    try {
      const buffer = await exifr.thumbnail(filePath);
      if (buffer) {
        return `data:image/jpeg;base64,${buffer.toString('base64')}`;
      }
    } catch (error) {
      console.error('Error extracting thumbnail:', error);
    }
  }

  return null;
});