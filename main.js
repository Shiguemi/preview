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
        // Use tmp.tmpName to get a temporary path. ImageMagick will create the file.
        // This avoids file locking issues on Windows that can occur with tmp.fileSync().
        tmp.tmpName({ postfix: '.jpg' }, (err, tmpPath) => {
            if (err) {
                console.error('Failed to create temporary file name:', err);
                return resolve(null);
            }

            const command = process.platform === 'win32' ? 'magick' : 'convert';
            const args = process.platform === 'win32'
                ? ['convert', filePath, '-resize', '200x200', tmpPath]
                : [filePath, '-resize', '200x200', tmpPath];

            execFile(command, args, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error converting EXR file "${filePath}" with command "${command}":`, stderr);
                    // The temp file might not exist, so we clean up without checking.
                    fs.unlink(tmpPath, () => {});
                    resolve(null);
                    return;
                }

                fs.readFile(tmpPath, (readErr, data) => {
                    // Clean up the temp file in any case.
                    fs.unlink(tmpPath, () => {});
                    if (readErr) {
                        console.error('Error reading temporary thumbnail file:', readErr);
                        resolve(null);
                        return;
                    }
                    resolve(`data:image/jpeg;base64,${data.toString('base64')}`);
                });
            });
        });
    });
});