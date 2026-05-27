import axios from 'axios'
import type { ConnectionConfig, TableData, QueryResult, DbItem } from '../types'

const http = axios.create({
  baseURL: 'http://localhost:3100/api',
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

  // Databases
  getSchemas: (connId: number) => http.get<DbItem[]>(`/databases/${connId}/schemas`).then(r => r.data),
  getTables: (connId: number) => http.get<DbItem[]>(`/databases/${connId}/tables`).then(r => r.data),
  getTableData: (connId: number, table: string) => http.get<TableData>(`/databases/${connId}/tables/${table}`).then(r => r.data),
  runQuery: (connId: number, sql: string) => http.post<QueryResult>(`/databases/${connId}/query`, { sql }).then(r => r.data),
}
