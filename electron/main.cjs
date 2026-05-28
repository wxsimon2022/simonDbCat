const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

const isDev = !app.isPackaged;
let mainWindow = null;
let serverInstance = null;

// ─── Auto Updater ─────────────────────────────────
function setupAutoUpdater() {
  if (isDev) return; // Skip in dev mode

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox({
      type: 'info',
      title: '发现新版本',
      message: `新版本 v${info.version} 可用`,
      detail: `当前版本: v${app.getVersion()}\n是否下载更新?`,
      buttons: ['下载', '稍后'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  });

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
      type: 'info',
      title: '更新已下载',
      message: '更新已下载完成，是否立即重启安装?',
      buttons: ['立即重启', '稍后'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('[auto-updater]', err.message);
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[auto-updater] 已是最新版本');
  });

  // Check for updates after a short delay
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => {
      console.error('[auto-updater] check failed:', err.message);
    });
  }, 5000);
}

// ─── App Start ────────────────────────────────────
async function startApp() {
  try {
    const serverPath = isDev
      ? path.join(__dirname, '..', 'server', 'index.cjs')
      : path.join(process.resourcesPath, 'app.asar', 'server', 'index.cjs');

    if (!fs.existsSync(serverPath)) {
      throw new Error(`Server file not found at: ${serverPath}`);
    }

    const { startServer } = require(serverPath);

    const port = await findPort(3100);
    const distPath = isDev
      ? path.join(__dirname, '..', 'dist')
      : path.join(path.dirname(serverPath), '..', 'dist');

    serverInstance = await startServer(port, distPath);
    createWindow(port);
    setupAutoUpdater();
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
