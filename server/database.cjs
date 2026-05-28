const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Check if running inside Electron asar (packaged)
const isPacked = __dirname.includes('.asar');

let DB_DIR;

if (isPacked) {
  // Production (packaged): use writable path in user's home
  DB_DIR = path.join(os.homedir(), '.simonDbCat', 'data');
  const srcDb = path.join(__dirname, '..', '..', '..', 'server', 'data', 'config.db');
  // Copy default DB if exists and target doesn't exist
  if (!fs.existsSync(path.join(DB_DIR, 'config.db')) && fs.existsSync(srcDb)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    fs.copyFileSync(srcDb, path.join(DB_DIR, 'config.db'));
  }
} else {
  // Development
  DB_DIR = path.join(__dirname, 'data');
}

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const CONFIG_DB = path.join(DB_DIR, 'config.db');
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
