export interface ConnectionConfig {
  id?: number
  name: string
  type: 'mysql' | 'mariadb'
  host: string
  port: number
  username: string
  password: string
  database: string
  created_at?: string
  updated_at?: string
}

export interface ColumnInfo {
  Field: string
  Type: string
  Null: string
  Key: string
  Default: string | null
  Extra: string
}

export interface TableData {
  columns: ColumnInfo[]
  rows: Record<string, unknown>[]
  total: number
}

export interface QueryResult {
  columns: ColumnInfo[]
  rows: Record<string, unknown>[]
  affectedRows: number
}

export interface DbItem {
  name: string
}

export interface UpdateStatus {
  status: 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error'
  message: string
  version?: string
  progress?: number
  bytesPerSecond?: number
  total?: number
  transferred?: number
}

// Electron API exposed via preload
export interface ElectronAPI {
  platform: string
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
  getAppVersion: () => Promise<string>
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

// Vite injected global
declare const __APP_VERSION__: string;
