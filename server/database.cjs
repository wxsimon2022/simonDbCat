const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// In production (Electron packaged), use userData directory for writable DB
// In dev, use the server/data directory
let DB_DIR;

if (process.resourcesPath && !process.env.VITE_DEV_SERVER) {
  // Production: copy from resources to writable userData path
  const userDataDir = process.env.ELECTRON_USER_DATA || path.join(require('os').homedir(), '.simonDbCat');
  DB_DIR = path.join(userDataDir, 'data');
} else {
  // Development
  DB_DIR = path.join(__dirname, 'data');
}

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const CONFIG_DB = path.join(DB_DIR, 'config.db');

// In production, copy default DB if it doesn't exist
if (process.resourcesPath && !fs.existsSync(CONFIG_DB)) {
  const srcDb = path.join(process.resourcesPath, 'server', 'data', 'config.db');
  if (fs.existsSync(srcDb)) {
    fs.copyFileSync(srcDb, CONFIG_DB);
  }
}

const db = new Database(CONFIG_DB);

db.exec(`
  CREATE TABLE IF NOT EXISTS connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'mysql',
    host TEXT NOT NULL DEFAULT '127.0.0.1',
    port INTEGER NOT NULL DEFAULT 3306,
    username TEXT NOT NULL DEFAULT 'root',
    password TEXT DEFAULT '',
    database TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

module.exports = db;
