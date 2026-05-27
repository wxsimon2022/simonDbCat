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
