import axios from 'axios'
import type { ConnectionConfig, TableData, QueryResult, DbItem } from '../types'

const http = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

export const api = {
  // Connections
  getConnections: () => http.get<ConnectionConfig[]>('/connections').then(r => r.data),
  getConnection: (id: number) => http.get<ConnectionConfig>(`/connections/${id}`).then(r => r.data),
  createConnection: (data: Partial<ConnectionConfig>) => http.post<ConnectionConfig>('/connections', data).then(r => r.data),
  updateConnection: (id: number, data: Partial<ConnectionConfig>) => http.put<ConnectionConfig>(`/connections/${id}`, data).then(r => r.data),
  deleteConnection: (id: number) => http.delete(`/connections/${id}`).then(r => r.data),
  testConnection: (data: Partial<ConnectionConfig>) => http.post<{ ok: boolean }>('/connections/test', data).then(r => r.data),

  // Databases
  getSchemas: (connId: number) =>
    http.get<DbItem[]>(`/databases/${connId}/schemas`).then(r => r.data),
  getTables: (connId: number, database?: string) =>
    http.get<DbItem[]>(`/databases/${connId}/tables`, { params: { database: database || undefined } }).then(r => r.data),
  getTableData: (connId: number, table: string, database?: string) =>
    http.get<TableData>(`/databases/${connId}/tables/${encodeURIComponent(table)}`, { params: { database: database || undefined } }).then(r => r.data),
  runQuery: (connId: number, sql: string, database?: string) =>
    http.post<QueryResult>(`/databases/${connId}/query`, { sql, database }).then(r => r.data),

  // CSV Import
  importCSV: (connId: number, tableName: string, columns: string[], rows: string[][], database?: string) =>
    http.post<{ ok: boolean; rowsInserted: number; tableName: string }>(`/databases/${connId}/import-csv`, { tableName, columns, rows, database }).then(r => r.data),
}
