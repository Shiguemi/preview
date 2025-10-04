const path = require('path');
const fs = require('fs');
const https = require('https');
const os = require('os');
const { spawn, execFileSync } = require('child_process');
const extract = require('extract-zip');

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

        this.venvDir = path.join(baseDir, 'python-venv');
        this.systemPython = null;
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
            // Find system Python
            if (!await this.findSystemPython()) {
                throw new Error('Python 3 not found on system. Please install Python 3.8 or higher.');
            }

            console.log('Found system Python:', this.systemPython);

            // Check if venv exists and is valid
            if (!await this.checkVenvExists()) {
                console.log('Creating Python virtual environment...');
                await this.createVenv();
                console.log('Virtual environment created successfully');
            } else {
                console.log('Using existing virtual environment');
            }

            // Set venv Python executable
            this.setVenvPythonExecutable();

            // Check if dependencies are installed in venv
            if (!await this.checkDependenciesInstalled()) {
                console.log('Installing Python dependencies in venv...');
                await this.installDependencies();
                console.log('Dependencies installed successfully');
            } else {
                console.log('Dependencies already installed');
            }

            // Start backend server
            await this.startBackend();

            this.isReady = true;
            console.log('Python environment ready');
            return true;
        } catch (error) {
            console.error('Failed to initialize Python environment:', error);
            throw error;
        }
    }

    /**
     * Try to find system Python installation
     */
    async findSystemPython() {
        const pythonCommands = ['python3', 'python'];

        for (const cmd of pythonCommands) {
            try {
                const { execSync } = require('child_process');
                const versionOutput = execSync(`${cmd} --version`, { encoding: 'utf8', stdio: 'pipe' });

                if (versionOutput.includes('Python 3')) {
                    // Found Python 3, get full path
                    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
                    const pythonPath = execSync(`${whichCmd} ${cmd}`, { encoding: 'utf8' })
                        .trim()
                        .split('\n')[0]
                        .replace(/\r/g, ''); // Remove carriage returns

                    this.systemPython = pythonPath;
                    console.log(`Found system Python: ${pythonPath} (${versionOutput.trim()})`);
                    return true;
                }
            } catch (error) {
                // Python not found, continue to next command
                continue;
            }
        }

        return false;
    }

    /**
     * Check if venv exists
     */
    async checkVenvExists() {
        const platform = process.platform;
        let venvPythonPath;

        if (platform === 'win32') {
            venvPythonPath = path.join(this.venvDir, 'Scripts', 'python.exe');
        } else {
            venvPythonPath = path.join(this.venvDir, 'bin', 'python');
        }

        return fs.existsSync(venvPythonPath);
    }

    /**
     * Create virtual environment
     */
    async createVenv() {
        // Create parent directory if it doesn't exist
        const parentDir = path.dirname(this.venvDir);
        if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
        }

        // Create venv using system Python
        console.log(`Creating venv at: ${this.venvDir}`);
        await this.runSystemPythonCommand(['-m', 'venv', this.venvDir]);
    }

    /**
     * Set venv Python executable path
     */
    setVenvPythonExecutable() {
        const platform = process.platform;

        if (platform === 'win32') {
            this.pythonExecutable = path.join(this.venvDir, 'Scripts', 'python.exe');
        } else {
            this.pythonExecutable = path.join(this.venvDir, 'bin', 'python');
        }

        console.log(`Venv Python executable: ${this.pythonExecutable}`);
    }

    /**
     * Run command with system Python (not venv)
     */
    runSystemPythonCommand(args) {
        return new Promise((resolve, reject) => {
            console.log(`[PythonManager] Running system command: ${this.systemPython} ${args.join(' ')}`);

            const childProcess = spawn(this.systemPython, args, {
                stdio: 'pipe'
            });

            let stdout = '';
            let stderr = '';

            childProcess.stdout.on('data', (data) => {
                stdout += data.toString();
                console.log(`[Python stdout]: ${data.toString()}`);
            });

            childProcess.stderr.on('data', (data) => {
                stderr += data.toString();
                console.error(`[Python stderr]: ${data.toString()}`);
            });

            childProcess.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    console.error(`[PythonManager] Command failed with code ${code}`);
                    console.error(`[PythonManager] stdout: ${stdout}`);
                    console.error(`[PythonManager] stderr: ${stderr}`);
                    reject(new Error(`Python command failed with code ${code}: ${stderr || stdout}`));
                }
            });

            childProcess.on('error', (error) => {
                console.error(`[PythonManager] Process error:`, error);
                reject(error);
            });
        });
    }

    /**
     * Check if Python is already installed
     */
    async checkPythonInstalled() {
        const platform = process.platform;
        let pythonPath;

        if (platform === 'win32') {
            pythonPath = path.join(this.pythonDir, 'python.exe');
        } else {
            pythonPath = path.join(this.pythonDir, 'bin', 'python3');
        }

        return fs.existsSync(pythonPath);
    }

    /**
     * Download Python portable version
     */
    async downloadPython() {
        const platform = process.platform;
        const arch = process.arch;

        let downloadUrl;
        let fileName;

        // Python embeddable package URLs
        if (platform === 'win32') {
            if (arch === 'x64') {
                downloadUrl = 'https://www.python.org/ftp/python/3.11.7/python-3.11.7-embed-amd64.zip';
                fileName = 'python-embed.zip';
            } else {
                downloadUrl = 'https://www.python.org/ftp/python/3.11.7/python-3.11.7-embed-win32.zip';
                fileName = 'python-embed.zip';
            }
        } else if (platform === 'darwin') {
            // For macOS, we'll use python.org installer or standalone build
            downloadUrl = 'https://www.python.org/ftp/python/3.11.7/python-3.11.7-macos11.pkg';
            fileName = 'python.pkg';
        } else {
            // Linux - use python-build-standalone
            downloadUrl = `https://github.com/indygreg/python-build-standalone/releases/download/20231002/cpython-3.11.6+20231002-${arch}-unknown-linux-gnu-install_only.tar.gz`;
            fileName = 'python.tar.gz';
        }

        // Create directory if it doesn't exist
        if (!fs.existsSync(this.pythonDir)) {
            fs.mkdirSync(this.pythonDir, { recursive: true });
        }

        const downloadPath = path.join(this.pythonDir, fileName);

        // Download file
        await this.downloadFile(downloadUrl, downloadPath);

        // Extract
        if (platform === 'win32') {
            await extract(downloadPath, { dir: this.pythonDir });
            // Download get-pip.py for Windows embeddable
            const getPipUrl = 'https://bootstrap.pypa.io/get-pip.py';
            const getPipPath = path.join(this.pythonDir, 'get-pip.py');
            await this.downloadFile(getPipUrl, getPipPath);
        } else if (platform === 'linux') {
            // Extract tar.gz
            await this.extractTarGz(downloadPath, this.pythonDir);
        }

        // Clean up download file
        fs.unlinkSync(downloadPath);
    }

    /**
     * Download file from URL
     */
    downloadFile(url, dest) {
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(dest);

            https.get(url, (response) => {
                // Handle redirects
                if (response.statusCode === 301 || response.statusCode === 302) {
                    return this.downloadFile(response.headers.location, dest)
                        .then(resolve)
                        .catch(reject);
                }

                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            }).on('error', (err) => {
                fs.unlinkSync(dest);
                reject(err);
            });
        });
    }

    /**
     * Extract tar.gz file (for Linux)
     */
    async extractTarGz(archivePath, targetDir) {
        return new Promise((resolve, reject) => {
            const tar = require('tar');
            tar.x({
                file: archivePath,
                cwd: targetDir
            }).then(resolve).catch(reject);
        });
    }

    /**
     * Set Python executable path based on platform
     */
    setPythonExecutable() {
        const platform = process.platform;

        if (platform === 'win32') {
            this.pythonExecutable = path.join(this.pythonDir, 'python.exe');
        } else if (platform === 'darwin') {
            this.pythonExecutable = path.join(this.pythonDir, 'bin', 'python3');
        } else {
            // Linux - python-build-standalone structure
            this.pythonExecutable = path.join(this.pythonDir, 'python', 'bin', 'python3');
        }
    }

    /**
     * Check if dependencies are installed
     */
    async checkDependenciesInstalled() {
        try {
            const result = execFileSync(this.pythonExecutable, ['-m', 'pip', 'list'], {
                encoding: 'utf8'
            });

            // Check if flask is installed
            return result.includes('Flask');
        } catch (error) {
            return false;
        }
    }

    /**
     * Install Python dependencies
     */
    async installDependencies() {
        const backendDir = this.getBackendDir();
        const requirementsPath = path.join(backendDir, 'requirements.txt');

        // Install requirements in venv (pip is included by default in venv)
        console.log(`Installing dependencies from: ${requirementsPath}`);
        await this.runPythonCommand(['-m', 'pip', 'install', '--upgrade', 'pip']);
        await this.runPythonCommand(['-m', 'pip', 'install', '-r', requirementsPath]);
    }

    /**
     * Run Python command
     */
    runPythonCommand(args) {
        return new Promise((resolve, reject) => {
            console.log(`[PythonManager] Running command: ${this.pythonExecutable} ${args.join(' ')}`);

            const childProcess = spawn(this.pythonExecutable, args, {
                stdio: 'pipe'
            });

            let stdout = '';
            let stderr = '';

            childProcess.stdout.on('data', (data) => {
                stdout += data.toString();
                console.log(`[Python stdout]: ${data.toString()}`);
            });

            childProcess.stderr.on('data', (data) => {
                stderr += data.toString();
                console.error(`[Python stderr]: ${data.toString()}`);
            });

            childProcess.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    console.error(`[PythonManager] Command failed with code ${code}`);
                    console.error(`[PythonManager] stdout: ${stdout}`);
                    console.error(`[PythonManager] stderr: ${stderr}`);
                    reject(new Error(`Python command failed with code ${code}: ${stderr || stdout}`));
                }
            });

            childProcess.on('error', (error) => {
                console.error(`[PythonManager] Process error:`, error);
                reject(error);
            });
        });
    }

    /**
     * Get backend directory path
     */
    getBackendDir() {
        if (app && app.isPackaged) {
            return path.join(process.resourcesPath, 'backend');
        } else {
            return path.join(__dirname, 'resources', 'backend');
        }
    }

    /**
     * Start backend server
     */
    async startBackend() {
        const backendDir = this.getBackendDir();
        const serverPath = path.join(backendDir, 'server.py');

        return new Promise((resolve, reject) => {
            this.backendProcess = spawn(this.pythonExecutable, [serverPath, String(this.backendPort)], {
                cwd: backendDir,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            this.backendProcess.stdout.on('data', (data) => {
                console.log(`Python backend: ${data}`);
            });

            this.backendProcess.stderr.on('data', (data) => {
                console.error(`Python backend error: ${data}`);
            });

            this.backendProcess.on('error', (error) => {
                console.error('Failed to start backend:', error);
                reject(error);
            });

            // Wait for server to be ready
            setTimeout(() => {
                this.checkBackendHealth()
                    .then(() => {
                        console.log('Backend server started successfully');
                        resolve();
                    })
                    .catch(reject);
            }, 2000);
        });
    }

    /**
     * Check backend health
     */
    async checkBackendHealth() {
        return new Promise((resolve, reject) => {
            const http = require('http');

            const req = http.get(`${this.backendUrl}/health`, (res) => {
                if (res.statusCode === 200) {
                    resolve(true);
                } else {
                    reject(new Error(`Backend health check failed with status ${res.statusCode}`));
                }
            });

            req.on('error', reject);
            req.setTimeout(5000, () => {
                req.destroy();
                reject(new Error('Backend health check timeout'));
            });
        });
    }

    /**
     * Convert EXR file to JPEG
     */
    async convertExr(filePath, maxSize = 800, gamma = 2.2) {
        console.log(`[PythonManager] convertExr called for: ${filePath}`);
        console.log(`[PythonManager] Backend ready: ${this.isReady}`);

        if (!this.isReady) {
            const error = new Error('Python backend is not ready');
            console.error('[PythonManager] Error:', error.message);
            throw error;
        }

        // Read file content in Node.js (which can access all Windows paths including network drives)
        let fileBuffer;
        try {
            fileBuffer = await fs.promises.readFile(filePath);
            console.log(`[PythonManager] Read file: ${filePath}, size: ${fileBuffer.length} bytes`);
        } catch (error) {
            console.error(`[PythonManager] Failed to read file: ${filePath}`, error);
            throw new Error(`Failed to read file: ${error.message}`);
        }

        return new Promise((resolve, reject) => {
            const http = require('http');

            const postData = JSON.stringify({
                file_data: fileBuffer.toString('base64'),
                max_size: maxSize,
                gamma: gamma
            });

            console.log(`[PythonManager] Sending POST request to ${this.backendUrl}/convert`);
            console.log(`[PythonManager] Request data: file_size=${fileBuffer.length}, max_size=${maxSize}, gamma=${gamma}`);

            const options = {
                hostname: '127.0.0.1',
                port: this.backendPort,
                path: '/convert',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = http.request(options, (res) => {
                console.log(`[PythonManager] Response status: ${res.statusCode}`);
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    console.log(`[PythonManager] Response received, length: ${data.length}`);
                    try {
                        const response = JSON.parse(data);
                        console.log(`[PythonManager] Response parsed, success: ${response.success}`);
                        if (response.success) {
                            console.log(`[PythonManager] Conversion successful, data length: ${response.data?.length}`);
                            resolve(response.data);
                        } else {
                            console.error(`[PythonManager] Conversion failed: ${response.error}`);
                            reject(new Error(response.error || 'Conversion failed'));
                        }
                    } catch (error) {
                        console.error(`[PythonManager] Failed to parse response:`, error);
                        console.error(`[PythonManager] Raw response:`, data);
                        reject(new Error('Failed to parse response'));
                    }
                });
            });

            req.on('error', (error) => {
                console.error(`[PythonManager] Request error:`, error);
                reject(error);
            });

            req.setTimeout(60000, () => {  // Increased to 60 seconds for large files
                console.error(`[PythonManager] Request timeout for: ${filePath}`);
                req.destroy();
                reject(new Error('Conversion timeout'));
            });

            req.write(postData);
            req.end();
        });
    }

    /**
     * Stop backend server
     */
    async stop() {
        if (this.backendProcess) {
            this.backendProcess.kill();
            this.backendProcess = null;
            this.isReady = false;
        }
    }
}

module.exports = new PythonManager();
