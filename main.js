const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');
const exifr = require('exifr');
const { execFile } = require('child_process');
const tmp = require('tmp');

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

ipcMain.handle('get-thumbnail', async (event, filePath) => {
  const fileExtension = path.extname(filePath).toLowerCase();

  if (fileExtension !== '.exr') {
    try {
      const buffer = await exifr.thumbnail(filePath);
      if (buffer) {
        return `data:image/jpeg;base64,${buffer.toString('base64')}`;
      }
    } catch (error) {
      // exifr throws an error if it can't find a thumbnail, which is expected.
    }
    return null;
  }

  // Handle EXR files by calling the 'convert' command-line tool from ImageMagick.
  return new Promise((resolve) => {
    const tmpobj = tmp.fileSync({ postfix: '.jpg' });

    const command = process.platform === 'win32' ? 'magick' : 'convert';
    const args = process.platform === 'win32'
      ? ['convert', filePath, '-resize', '200x200', tmpobj.name]
      : [filePath, '-resize', '200x200', tmpobj.name];

    execFile(command, args, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error converting EXR file "${filePath}" with command "${command}":`, stderr);
        tmpobj.removeCallback();
        resolve(null);
        return;
      }

      fs.readFile(tmpobj.name, (err, data) => {
        tmpobj.removeCallback();
        if (err) {
          console.error('Error reading temporary thumbnail file:', err);
          resolve(null);
          return;
        }
        resolve(`data:image/jpeg;base64,${data.toString('base64')}`);
      });
    });
  });
});