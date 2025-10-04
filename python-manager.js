const path = require('path');
const fs = require('fs');
const https = require('https');
const os = require('os');
const { spawn, execFileSync } = require('child_process');
const extract = require('extract-zip');
const tar = require('tar');

// Try to import electron, but don't fail if not available
let app = null;
try {
    const electron = require('electron');
    app = electron.app;
} catch (e) {
    // Running outside Electron context
}

class PythonManager {
    constructor() {
        // Determine base directory based on context
        const baseDir = app
            ? app.getPath('userData')
            : path.join(os.homedir(), '.image-preview');

        this.pythonDir = path.join(baseDir, 'python-portable');
        this.venvDir = path.join(baseDir, 'python-venv');
        this.pythonExecutable = null;
        this.backendProcess = null;
        this.backendPort = 5000;
        this.backendUrl = `http://127.0.0.1:${this.backendPort}`;
        this.isReady = false;
        this.initPromise = null;
    }

    /**
     * Initialize Python environment (download, extract, install dependencies)
     */
    async initialize() {
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this._doInitialize();
        return this.initPromise;
    }

    async _doInitialize() {
        console.log('Initializing Python environment...');

        try {
            // Step 1: Check for portable Python, download if not present
            if (!await this.checkPythonInstalled()) {
                console.log('Portable Python not found. Downloading...');
                await this.downloadPython();
                console.log('Portable Python downloaded and extracted successfully.');
            } else {
                console.log('Using existing portable Python installation.');
            }

            // Set executable to the portable python for creating the venv
            this.setPythonExecutable(false);

            // Step 2: Check if venv exists, create if not
            if (!await this.checkVenvExists()) {
                console.log('Creating Python virtual environment...');
                await this.createVenv();
                console.log('Virtual environment created successfully.');
            } else {
                console.log('Using existing virtual environment.');
            }

            // Set executable to the venv python for all subsequent operations
            this.setPythonExecutable(true);

            // Step 3: Check if dependencies are installed, install if not
            if (!await this.checkDependenciesInstalled()) {
                console.log('Installing Python dependencies in venv...');
                await this.installDependencies();
                console.log('Dependencies installed successfully.');
            } else {
                console.log('Dependencies already installed.');
            }

            // Step 4: Start the backend server
            await this.startBackend();

            this.isReady = true;
            console.log('Python environment ready.');
            return true;
        } catch (error) {
            console.error('Failed to initialize Python environment:', error);
            throw error;
        }
    }

    /**
     * Check if the portable Python is already installed
     */
    async checkPythonInstalled() {
        const platform = process.platform;
        let pythonPath;

        if (platform === 'win32') {
            pythonPath = path.join(this.pythonDir, 'python', 'python.exe');
        } else {
            // Linux/macOS standalone build has a 'python' subdirectory
            pythonPath = path.join(this.pythonDir, 'python', 'bin', 'python3');
        }

        return fs.existsSync(pythonPath);
    }

    /**
     * Download and extract a portable version of Python
     */
    async downloadPython() {
        const platform = process.platform;
        const arch = process.arch;
        const version = '3.11.7';
        const standaloneVersion = '20240107';

        let downloadUrl;
        const fileName = 'python-standalone.tar.gz';
        let osString, archString;

        if (platform === 'win32') {
            osString = 'pc-windows-msvc-shared';
            archString = arch === 'x64' ? 'x86_64' : 'i686';
        } else if (platform === 'darwin') {
            osString = 'apple-darwin';
            archString = arch === 'arm64' ? 'aarch64' : 'x86_64';
        } else {
            osString = 'unknown-linux-gnu';
            archString = arch === 'arm64' ? 'aarch64' : 'x86_64';
        }

        downloadUrl = `https://github.com/indygreg/python-build-standalone/releases/download/${standaloneVersion}/cpython-${version}+${standaloneVersion}-${archString}-${osString}-install_only.tar.gz`;

        // Create directory if it doesn't exist
        if (!fs.existsSync(this.pythonDir)) {
            fs.mkdirSync(this.pythonDir, { recursive: true });
        }

        const downloadPath = path.join(this.pythonDir, fileName);

        console.log(`Downloading from: ${downloadUrl}`);
        await this.downloadFile(downloadUrl, downloadPath);
        console.log(`Downloaded to: ${downloadPath}`);

        console.log('Extracting...');
        await tar.x({ file: downloadPath, cwd: this.pythonDir });
        console.log('Extraction complete.');

        // Clean up the downloaded archive
        fs.unlinkSync(downloadPath);
    }

    /**
     * Helper to download a file from a URL
     */
    downloadFile(url, dest) {
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(dest);
            https.get(url, { headers: { 'User-Agent': 'Node.js' } }, (response) => {
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    return this.downloadFile(response.headers.location, dest).then(resolve).catch(reject);
                }
                if (response.statusCode !== 200) {
                    return reject(new Error(`Download failed with status code: ${response.statusCode}`));
                }
                response.pipe(file);
                file.on('finish', () => file.close(resolve));
            }).on('error', (err) => {
                fs.unlink(dest, () => reject(err));
            });
        });
    }

    /**
     * Check if the virtual environment directory exists and is valid
     */
    async checkVenvExists() {
        const platform = process.platform;
        const venvPythonPath = (platform === 'win32')
            ? path.join(this.venvDir, 'Scripts', 'python.exe')
            : path.join(this.venvDir, 'bin', 'python');
        return fs.existsSync(venvPythonPath);
    }

    /**
     * Create the virtual environment using the portable Python
     */
    async createVenv() {
        if (!fs.existsSync(this.venvDir)) {
            fs.mkdirSync(this.venvDir, { recursive: true });
        }
        // Uses the portable python executable set in _doInitialize
        await this.runPythonCommand(['-m', 'venv', this.venvDir]);
    }

    /**
     * Set the pythonExecutable path.
     * @param {boolean} useVenv - If true, points to the venv executable. Otherwise, points to the portable executable.
     */
    setPythonExecutable(useVenv) {
        const platform = process.platform;
        if (useVenv) {
            this.pythonExecutable = (platform === 'win32')
                ? path.join(this.venvDir, 'Scripts', 'python.exe')
                : path.join(this.venvDir, 'bin', 'python');
        } else {
            this.pythonExecutable = (platform === 'win32')
                ? path.join(this.pythonDir, 'python', 'python.exe')
                : path.join(this.pythonDir, 'python', 'bin', 'python3');
        }
        console.log(`Python executable set to: ${this.pythonExecutable}`);
    }

    /**
     * Check if dependencies (e.g., Flask) are installed in the venv
     */
    async checkDependenciesInstalled() {
        try {
            const result = execFileSync(this.pythonExecutable, ['-m', 'pip', 'list'], { encoding: 'utf8' });
            return result.toLowerCase().includes('flask');
        } catch (error) {
            console.error('Failed to check dependencies:', error);
            return false;
        }
    }

    /**
     * Install dependencies from requirements.txt into the venv
     */
    async installDependencies() {
        const backendDir = this.getBackendDir();
        const requirementsPath = path.join(backendDir, 'requirements.txt');
        console.log(`Installing dependencies from: ${requirementsPath}`);
        // Ensure we're using the venv python for this
        this.setPythonExecutable(true);
        await this.runPythonCommand(['-m', 'pip', 'install', '--upgrade', 'pip']);
        await this.runPythonCommand(['-m', 'pip', 'install', '-r', requirementsPath]);
    }

    /**
     * Run a Python command with the currently configured pythonExecutable
     */
    runPythonCommand(args, executable = this.pythonExecutable) {
        return new Promise((resolve, reject) => {
            console.log(`[PythonManager] Running command: ${executable} ${args.join(' ')}`);
            const childProcess = spawn(executable, args, { stdio: 'pipe' });

            let stdout = '';
            let stderr = '';
            childProcess.stdout.on('data', (data) => {
                const output = data.toString();
                stdout += output;
                console.log(`[Python stdout]: ${output.trim()}`);
            });
            childProcess.stderr.on('data', (data) => {
                const output = data.toString();
                stderr += output;
                console.error(`[Python stderr]: ${output.trim()}`);
            });

            childProcess.on('close', (code) => {
                if (code === 0) {
                    resolve(stdout);
                } else {
                    const errorMsg = `Python command failed with code ${code}: ${stderr || stdout}`;
                    console.error(`[PythonManager] ${errorMsg}`);
                    reject(new Error(errorMsg));
                }
            });

            childProcess.on('error', (error) => {
                console.error(`[PythonManager] Process spawn error:`, error);
                reject(error);
            });
        });
    }

    /**
     * Get the path to the backend directory
     */
    getBackendDir() {
        const isPackaged = app && app.isPackaged;
        // In development, __dirname is the project root.
        // In production, it's in the 'app.asar' archive, so we need process.resourcesPath.
        const basePath = isPackaged ? process.resourcesPath : __dirname;
        return path.join(basePath, 'resources', 'backend');
    }

    /**
     * Start the Flask backend server
     */
    async startBackend() {
        const serverPath = path.join(this.getBackendDir(), 'server.py');
        console.log(`Starting backend server: ${serverPath}`);

        this.backendProcess = spawn(this.pythonExecutable, [serverPath, String(this.backendPort)], {
            cwd: this.getBackendDir(),
            stdio: ['ignore', 'pipe', 'pipe']
        });

        this.backendProcess.stdout.on('data', (data) => console.log(`[Python Backend]: ${data.toString().trim()}`));
        this.backendProcess.stderr.on('data', (data) => console.error(`[Python Backend Error]: ${data.toString().trim()}`));
        this.backendProcess.on('error', (err) => console.error('Failed to start backend process:', err));

        // Wait for the server to become available
        await this.waitForBackend();
    }

    /**
     * Periodically check the health endpoint until it responds or times out
     */
    async waitForBackend() {
        const timeout = 30000; // 30 seconds
        const interval = 1000; // 1 second
        const startTime = Date.now();

        return new Promise((resolve, reject) => {
            const check = () => {
                if (Date.now() - startTime > timeout) {
                    return reject(new Error('Backend health check timed out.'));
                }

                const http = require('http');
                const req = http.get(`${this.backendUrl}/health`, (res) => {
                    if (res.statusCode === 200) {
                        console.log('Backend server is healthy and responding.');
                        return resolve();
                    }
                    setTimeout(check, interval);
                });

                req.on('error', (err) => {
                    // Keep trying until timeout
                    setTimeout(check, interval);
                });
            };
            check();
        });
    }

    /**
     * Convert an EXR file to a JPEG data URL
     */
    async convertExr(filePath, maxSize = 800, gamma = 2.2) {
        if (!this.isReady) {
            throw new Error('Python backend is not ready. Waiting for initialization...');
        }

        const postData = JSON.stringify({
            file_path: filePath,
            max_size: maxSize,
            gamma: gamma
        });

        const options = {
            method: 'POST',
            hostname: '127.0.0.1',
            port: this.backendPort,
            path: '/convert',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        return new Promise((resolve, reject) => {
            const http = require('http');
            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        if (response.success) {
                            resolve(response.data);
                        } else {
                            reject(new Error(response.error || 'Conversion failed'));
                        }
                    } catch (e) {
                        reject(new Error(`Failed to parse backend response: ${data}`));
                    }
                });
            });

            req.on('error', reject);
            req.setTimeout(60000, () => {
                req.destroy();
                reject(new Error('Conversion request timed out.'));
            });

            req.write(postData);
            req.end();
        });
    }

    /**
     * Stop the backend server process
     */
    async stop() {
        if (this.backendProcess) {
            console.log('Stopping Python backend server...');
            this.backendProcess.kill();
            this.backendProcess = null;
            this.isReady = false;
        }
    }
}

module.exports = new PythonManager();
