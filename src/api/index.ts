import axios from 'axios'
import type { ConnectionConfig, TableData, QueryResult, DbItem } from '../types'

const http = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

export const api = {
  // Connections
  getConnections: () => http.get<ConnectionConfig[]>('/connections').then(r => r.data),
  getConnection: (id: number) => http.get<ConnectionConfig>(`/connections/${id}`).then(r => r.data),
  createConnection: (data: Partial<ConnectionConfig>) => http.post<ConnectionConfig>('/connections', data).then(r => r.data),
  updateConnection: (id: number, data: Partial<ConnectionConfig>) => http.put<ConnectionConfig>(`/connections/${id}`, data).then(r => r.data),
  deleteConnection: (id: number) => http.delete(`/connections/${id}`).then(r => r.data),
  testConnection: (data: Partial<ConnectionConfig>) => http.post<{ ok: boolean }>('/connections/test', data).then(r => r.data),

  // Databases — 全部用查询参数传 database
  getSchemas: (connId: number) =>
    http.get<DbItem[]>(`/databases/${connId}/schemas`).then(r => r.data),

  getTables: (connId: number, database?: string) =>
    http.get<DbItem[]>(`/databases/${connId}/tables`, { params: { database: database || undefined } }).then(r => r.data),

  getTableData: (connId: number, table: string, database?: string) =>
    http.get<TableData>(`/databases/${connId}/tables/${encodeURIComponent(table)}`, { params: { database: database || undefined } }).then(r => r.data),

  runQuery: (connId: number, sql: string, database?: string) =>
    http.post<QueryResult>(`/databases/${connId}/query`, { sql, database }).then(r => r.data),
}
