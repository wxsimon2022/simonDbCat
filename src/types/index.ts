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
  limit: number
  offset: number
}

export interface QueryResult {
  columns: ColumnInfo[]
  rows: Record<string, unknown>[]
  affectedRows: number
}

export interface DbItem {
  name: string
}

export interface IndexInfo {
  keyName: string
  unique: boolean
  columns: { seq: number; column: string }[]
  indexType: string
}

export interface ForeignKeyInfo {
  columnName: string
  constraintName: string
  refTable: string
  refColumn: string
  onUpdate: string
  onDelete: string
}

export interface ViewInfo {
  name: string
  createView?: string
}

export interface RoutineInfo {
  name: string
  type: string
  definition: string
  created: string
  altered: string
}

export interface TriggerInfo {
  name: string
  event: string
  table: string
  timing: string
  statement: string
  created: string
}

export interface EventInfo {
  name: string
  definer: string
  type: string
  status: string
  starts: string
  ends: string
}

export interface ExplainPlan {
  plan: Record<string, unknown>[]
}

export interface MultiQueryResult {
  results: {
    sql: string
    columns?: ColumnInfo[]
    rows?: Record<string, unknown>[]
    affectedRows?: number
    error?: string
    success: boolean
  }[]
}

export interface ExportResult {
  data: string
  format: string
  columns: string[]
  total: number
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

declare const __APP_VERSION__: string;
