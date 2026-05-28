const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = !app.isPackaged;
let mainWindow = null;
let serverInstance = null;

async function startApp() {
  try {
    // Determine server paths
    const serverPath = isDev
      ? path.join(__dirname, '..', 'server', 'index.cjs')
      : path.join(process.resourcesPath, 'server', 'index.cjs');

    // Validate server file exists
    if (!fs.existsSync(serverPath)) {
      throw new Error(`Server file not found at: ${serverPath}`);
    }

    const { startServer } = require(serverPath);

    // Find available port
    const port = await findPort(3100);
    serverInstance = await startServer(port);

    createWindow(port);
  } catch (err) {
    console.error('Fatal error:', err);
    dialog.showErrorBox('启动失败', err.message + '\n\n' + err.stack);
  }
}

async function findPort(start) {
  const net = require('net');
  for (let port = start; port < start + 20; port++) {
    try {
      await new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.on('error', reject);
        srv.listen(port, '127.0.0.1', () => {
          srv.close(() => resolve());
        });
      });
      return port;
    } catch {}
  }
  throw new Error('无法找到可用端口 (3100-3119)');
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "simonDbCat - 数据库管理工具",
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL(`http://localhost:3000`);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL(`http://127.0.0.1:${port}`);
  }

  // Capture renderer errors
  mainWindow.webContents.on('console-message', (event, level, msg) => {
    if (level >= 2) console.error('[renderer]', msg);
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(startApp);

app.on('window-all-closed', () => {
  if (serverInstance) { serverInstance.close(); serverInstance = null; }
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) startApp();
});

app.on('before-quit', () => {
  if (serverInstance) { serverInstance.close(); serverInstance = null; }
});
