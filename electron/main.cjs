const { app, BrowserWindow } = require('electron');
const path = require('path');
const { startServer } = require('../server/index.cjs');

const isDev = !app.isPackaged;

let mainWindow = null;
let serverInstance = null;

const MAX_PORT_ATTEMPTS = 20;
const BASE_PORT = 3100;

async function findPort(start) {
  const net = require('net');
  for (let port = start; port < start + MAX_PORT_ATTEMPTS; port++) {
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
  throw new Error('No available port found');
}

async function createWindow() {
  const port = await findPort(BASE_PORT);
  serverInstance = await startServer(port);

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
    // Production: Express serves both API and static files
    mainWindow.loadURL(`http://127.0.0.1:${port}`);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
  }
});
