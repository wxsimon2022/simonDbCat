import axios from 'axios'
import type {
  ConnectionConfig, TableData, QueryResult, DbItem,
  IndexInfo, ForeignKeyInfo, ViewInfo, RoutineInfo,
  TriggerInfo, EventInfo, ExportResult, MultiQueryResult,
} from '../types'

const http = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

export const api = {
  // ─── Connections ────────────────────────────────
  getConnections: () => http.get<ConnectionConfig[]>('/connections').then(r => r.data),
  getConnection: (id: number) => http.get<ConnectionConfig>(`/connections/${id}`).then(r => r.data),
  createConnection: (data: Partial<ConnectionConfig>) => http.post<ConnectionConfig>('/connections', data).then(r => r.data),
  updateConnection: (id: number, data: Partial<ConnectionConfig>) => http.put<ConnectionConfig>(`/connections/${id}`, data).then(r => r.data),
  deleteConnection: (id: number) => http.delete(`/connections/${id}`).then(r => r.data),
  testConnection: (data: Partial<ConnectionConfig>) => http.post<{ ok: boolean }>('/connections/test', data).then(r => r.data),

  // ─── Databases & Schemas ────────────────────────
  getSchemas: (connId: number) =>
    http.get<DbItem[]>(`/databases/${connId}/schemas`).then(r => r.data),
  getTables: (connId: number, database?: string) =>
    http.get<DbItem[]>(`/databases/${connId}/tables`, { params: { database: database || undefined } }).then(r => r.data),

  // ─── P0: Table Data (paginated + editable) ──────
  getTableData: (connId: number, table: string, database?: string, limit?: number, offset?: number, sort?: string, order?: string) =>
    http.get<TableData>(`/databases/${connId}/tables/${encodeURIComponent(table)}`, {
      params: { database: database || undefined, limit, offset, sort, order },
    }).then(r => r.data),

  insertRow: (connId: number, table: string, data: Record<string, unknown>, database?: string) =>
    http.post<{ ok: boolean; insertId: number }>(`/databases/${connId}/tables/${encodeURIComponent(table)}/data`, { data }, { params: { database } }).then(r => r.data),

  updateRow: (connId: number, table: string, where: Record<string, unknown>, data: Record<string, unknown>, database?: string) =>
    http.put<{ ok: boolean; affectedRows: number }>(`/databases/${connId}/tables/${encodeURIComponent(table)}/data`, { where, data }, { params: { database } }).then(r => r.data),

  deleteRow: (connId: number, table: string, where: Record<string, unknown>, database?: string) =>
    http.delete<{ ok: boolean; affectedRows: number }>(`/databases/${connId}/tables/${encodeURIComponent(table)}/data`, {
      params: { database, ...Object.fromEntries(Object.entries(where).map(([k, v]) => [k, String(v)])) },
    }).then(r => r.data),

  exportTable: (connId: number, table: string, format: string, database?: string, limit?: number) =>
    http.post<ExportResult>(`/databases/${connId}/tables/${encodeURIComponent(table)}/export`, { format, limit }, { params: { database } }).then(r => r.data),

  // ─── P0: Query ──────────────────────────────────
  runQuery: (connId: number, sql: string, database?: string) =>
    http.post<QueryResult>(`/databases/${connId}/query`, { sql, database }).then(r => r.data),

  exportQuery: (connId: number, sql: string, format: string, database?: string, tableName?: string) =>
    http.post<ExportResult>(`/databases/${connId}/query/export`, { sql, format, database, tableName }).then(r => r.data),

  // ─── P1: Indexes ────────────────────────────────
  getIndexes: (connId: number, table: string, database?: string) =>
    http.get<IndexInfo[]>(`/databases/${connId}/tables/${encodeURIComponent(table)}/indexes`, { params: { database } }).then(r => r.data),

  createIndex: (connId: number, table: string, data: { indexName: string; columns: string[]; unique: boolean; indexType?: string }, database?: string) =>
    http.post(`/databases/${connId}/tables/${encodeURIComponent(table)}/indexes`, data, { params: { database } }).then(r => r.data),

  dropIndex: (connId: number, table: string, indexName: string, database?: string) =>
    http.delete(`/databases/${connId}/tables/${encodeURIComponent(table)}/indexes/${encodeURIComponent(indexName)}`, { params: { database } }).then(r => r.data),

  // ─── P1: Foreign Keys ───────────────────────────
  getForeignKeys: (connId: number, table: string, database?: string) =>
    http.get<ForeignKeyInfo[]>(`/databases/${connId}/tables/${encodeURIComponent(table)}/foreign-keys`, { params: { database } }).then(r => r.data),

  // ─── P1: Views ──────────────────────────────────
  getViews: (connId: number, database?: string) =>
    http.get<ViewInfo[]>(`/databases/${connId}/views`, { params: { database } }).then(r => r.data),

  getView: (connId: number, view: string, database?: string) =>
    http.get<ViewInfo>(`/databases/${connId}/views/${encodeURIComponent(view)}`, { params: { database } }).then(r => r.data),

  // ─── P1: Routines ───────────────────────────────
  getRoutines: (connId: number, database?: string) =>
    http.get<RoutineInfo[]>(`/databases/${connId}/routines`, { params: { database } }).then(r => r.data),

  // ─── P1: Triggers ───────────────────────────────
  getTriggers: (connId: number, database?: string) =>
    http.get<TriggerInfo[]>(`/databases/${connId}/triggers`, { params: { database } }).then(r => r.data),

  // ─── P1: Events ─────────────────────────────────
  getEvents: (connId: number, database?: string) =>
    http.get<EventInfo[]>(`/databases/${connId}/events`, { params: { database } }).then(r => r.data),

  // ─── P1: Columns (Table Designer) ───────────────
  addColumn: (connId: number, table: string, data: { name: string; type: string; nullable?: boolean; default?: string; comment?: string; after?: string }, database?: string) =>
    http.post(`/databases/${connId}/tables/${encodeURIComponent(table)}/columns`, data, { params: { database } }).then(r => r.data),

  modifyColumn: (connId: number, table: string, column: string, data: { name?: string; type?: string; nullable?: boolean; default?: string; comment?: string }, database?: string) =>
    http.put(`/databases/${connId}/tables/${encodeURIComponent(table)}/columns/${encodeURIComponent(column)}`, data, { params: { database } }).then(r => r.data),

  dropColumn: (connId: number, table: string, column: string, database?: string) =>
    http.delete(`/databases/${connId}/tables/${encodeURIComponent(table)}/columns/${encodeURIComponent(column)}`, { params: { database } }).then(r => r.data),

  // ─── P2: EXPLAIN ────────────────────────────────
  explainQuery: (connId: number, sql: string, database?: string) =>
    http.post<{ plan: Record<string, unknown>[] }>(`/databases/${connId}/explain`, { sql, database }).then(r => r.data),

  // ─── P2: Multi-query ────────────────────────────
  runMultiQuery: (connId: number, sql: string, database?: string) =>
    http.post<MultiQueryResult>(`/databases/${connId}/query-multi`, { sql, database }).then(r => r.data),

  // ─── CSV Import ────────────────────────────────
  importCSV: (connId: number, tableName: string, columns: string[], rows: string[][], database?: string) =>
    http.post<{ ok: boolean; rowsInserted: number; tableName: string }>(`/databases/${connId}/import-csv`, { tableName, columns, rows, database }).then(r => r.data),
}
