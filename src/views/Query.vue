<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { api } from '../api'
import { useConnectionStore } from '../stores/connections'
import type { QueryResult, DbItem } from '../types'

const props = defineProps<{
  connId: string
  initialSql?: string
  initialDb?: string
}>()

const route = useRoute()
const store = useConnectionStore()

const connIdNum = computed(() => Number(props.connId))
const sql = ref(props.initialSql || '')
const result = ref<QueryResult | null>(null)
const running = ref(false)
const error = ref('')
const history = ref<string[]>([])
const databases = ref<DbItem[]>([])
const selectedDb = ref(props.initialDb || '')

// Saved queries
const savedQueries = ref<{ name: string; sql: string; connId: number }[]>([])
const showSaveDialog = ref(false)
const saveName = ref('')
const showLoadPanel = ref(false)
const importFile = ref<File | null>(null)
const showCsvDialog = ref(false)
const importing = ref(false)

const STORAGE_KEY = 'simonDbCat_savedQueries'

onMounted(async () => {
  store.select(connIdNum.value)
  loadSavedQueries()
  if (!props.initialSql) {
    const sqlParam = route.query.sql as string
    if (sqlParam) sql.value = sqlParam
  }
  if (!props.initialDb) {
    const dbParam = route.query.database as string
    if (dbParam) selectedDb.value = dbParam
  }
  await loadDatabases()
})

function loadSavedQueries() {
  try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) savedQueries.value = JSON.parse(raw) } catch {}
}

function persistSavedQueries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(savedQueries.value))
}

const connLoading = ref(false)

async function loadDatabases() {
  connLoading.value = true
  try {
    databases.value = await api.getSchemas(connIdNum.value)
  } catch (e: any) {
    ElMessage.error('获取数据库列表失败: ' + (e.response?.data?.error || e.message))
  } finally {
    connLoading.value = false
  }
}

async function runQuery() {
  if (!sql.value.trim()) return
  running.value = true; error.value = ''; result.value = null
  try {
    const res = await api.runQuery(connIdNum.value, sql.value, selectedDb.value || undefined)
    result.value = res
    history.value.unshift(sql.value)
    if (history.value.length > 50) history.value.pop()
    if (res.rows?.length) ElMessage.success(`查询完成，${res.rows.length} 行结果`)
    else if (res.affectedRows) ElMessage.success(`执行成功，影响 ${res.affectedRows} 行`)
    else ElMessage.success('执行完成')
  } catch (e: any) {
    error.value = e.response?.data?.error || e.message || '查询失败'
    ElMessage.error(error.value)
  } finally { running.value = false }
}

function clearResult() { result.value = null; error.value = '' }
function loadHistory(q: string) { sql.value = q }

function saveQuery() {
  showSaveDialog.value = true
  saveName.value = sql.value.split('\n')[0]?.slice(0, 40) || '查询'
}

function doSaveQuery() {
  if (!saveName.value.trim()) { ElMessage.warning('请输入查询名称'); return }
  savedQueries.value.unshift({ name: saveName.value, sql: sql.value, connId: connIdNum.value })
  persistSavedQueries(); showSaveDialog.value = false
  ElMessage.success('已保存')
}

function loadQuery(q: { name: string; sql: string }) {
  sql.value = q.sql; showLoadPanel.value = false
}

function deleteSavedQuery(idx: number) {
  savedQueries.value.splice(idx, 1); persistSavedQueries()
}

function formatSQL() {
  const keywords = ['select','from','where','and','or','not','in','like',
    'insert','into','values','update','set','delete',
    'create','table','alter','drop','index','join','left','right','inner','outer','on',
    'group','by','having','order','asc','desc','limit','offset','union','all','distinct',
    'as','is','null','true','false','count','sum','avg','min','max','between','exists']
  let f = sql.value
  for (const kw of keywords) f = f.replace(new RegExp(`\\b${kw}\\b`, 'gi'), kw.toUpperCase())
  sql.value = f
}

function exportCSV() {
  if (!result.value?.rows?.length) { ElMessage.warning('没有结果'); return }
  const cols = result.value.columns
  const header = cols.map(c => `"${c.Field}"`).join(',')
  const rows = result.value.rows.map(r => cols.map(c => {
    const v = r[c.Field]; return v === null ? '' : `"${String(v).replace(/"/g, '""')}"`
  }).join(',')).join('\n')
  downloadFile(`${header}\n${rows}`, 'query_result.csv', 'text/csv')
  ElMessage.success('已导出 CSV')
}

function exportJSON() {
  if (!result.value?.rows?.length) { ElMessage.warning('没有结果'); return }
  downloadFile(JSON.stringify(result.value.rows, null, 2), 'query_result.json', 'application/json')
  ElMessage.success('已导出 JSON')
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8;` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename
  a.click(); URL.revokeObjectURL(url)
}

// CSV Import
function handleFileSelect(e: Event) {

  const target = e.target as HTMLInputElement
  if (target.files?.length) importFile.value = target.files[0]; showCsvDialog.value = true
}

async function doImportCSV() {
  if (!importFile.value) { ElMessage.warning('请选择 CSV 文件'); return }
  if (!selectedDb.value) { ElMessage.warning('请选择数据库'); return }
  importing.value = true
  try {
    const text = await importFile.value.text()
    const lines = text.split('\n').filter(l => l.trim())
    if (lines.length < 2) { ElMessage.warning('CSV 文件为空'); return }
    const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, ''))
    const tableName = importFile.value.name.replace(/\.csv$/i, '')
    const rows: string[][] = []
    for (let i = 1; i < lines.length; i++) {
      rows.push(parseCSVLine(lines[i]).map(v => v.replace(/^"|"$/g, '')))
    }
    const res = await api.importCSV(connIdNum.value, tableName, headers, rows, selectedDb.value)
    ElMessage.success(`已导入 ${res.rowsInserted} 行到表「${tableName}」`)
    sql.value = `SELECT * FROM \`${tableName}\` LIMIT 100`
    importFile.value = null
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || e.message || '导入失败')
  } finally { importing.value = false }
}

function clickCsvInput() {
  document.getElementById("csvInput")?.click()
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []; let current = ''; let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuotes = !inQuotes; continue }
    if (ch === ',' && !inQuotes) { result.push(current); current = ''; continue }
    current += ch
  }
  result.push(current)
  return result
}
</script>

<template>
  <div class="query-container">
    <div class="query-toolbar">
      <div class="toolbar-left"><span class="query-title">SQL 查询</span></div>
      <div class="toolbar-center">
        <el-select v-model="selectedDb" placeholder="选择数据库" clearable size="small" style="width:180px"
          :loading="connLoading" @visible-change="(v: boolean) => v && loadDatabases()">
          <el-option v-for="db in databases" :key="db.name" :label="db.name" :value="db.name" />
        </el-select>
      </div>
      <div class="toolbar-actions">
        <el-tooltip content="保存查询" placement="bottom"><el-button size="small" @click="saveQuery">💾 保存</el-button></el-tooltip>
        <el-tooltip content="加载查询" placement="bottom"><el-button size="small" @click="showLoadPanel = !showLoadPanel">📂 加载</el-button></el-tooltip>
        <el-tooltip content="导入 CSV" placement="bottom">
          <el-button size="small" @click="clickCsvInput()">📥</el-button>
        </el-tooltip>
        <input type="file" id="csvInput" accept=".csv" style="display:none" @change="handleFileSelect" />
        <el-divider direction="vertical" />
        <el-tooltip content="格式化 SQL" placement="bottom"><el-button size="small" @click="formatSQL">✨</el-button></el-tooltip>
        <el-tooltip content="清空结果" placement="bottom"><el-button size="small" @click="clearResult">清空</el-button></el-tooltip>
        <el-button type="primary" size="small" :loading="running" @click="runQuery" class="run-btn">▶ 执行</el-button>
      </div>
    </div>

    <div class="query-editor-section">
      <div class="editor-wrapper">
        <div class="editor-line-numbers">
          <div v-for="i in Math.max(sql.split('\n').length, 1)" :key="i" class="line-num">{{ i }}</div>
        </div>
        <textarea v-model="sql" class="sql-editor" placeholder="输入 SQL 语句，例如：SELECT * FROM users LIMIT 100"
          spellcheck="false" @keydown.meta.enter.prevent="runQuery" @keydown.ctrl.enter.prevent="runQuery" />
      </div>
      <div class="editor-footer">
        <div class="sql-tips">
          <el-tag size="small" @click="sql += ' LIMIT 100'" style="cursor:pointer">LIMIT 100</el-tag>
          <el-tag size="small" @click="sql = 'SHOW TABLES'" style="cursor:pointer">SHOW TABLES</el-tag>
          <el-tag size="small" @click="sql = 'SHOW DATABASES'" style="cursor:pointer">SHOW DATABASES</el-tag>
          <el-tag size="small" @click="sql = 'DESCRIBE '" style="cursor:pointer">DESCRIBE</el-tag>
        </div>
        <span class="shortcut-hint">⌘+⏎ 执行</span>
      </div>
    </div>

    <div class="query-results-row">
      <div class="query-results-main">
        <div v-if="error" class="result-error">
          <div class="error-header">❌ 错误</div>
          <pre class="error-msg">{{ error }}</pre>
        </div>
        <div v-if="result" class="result-card">
          <div class="result-header">
            <span v-if="result.rows?.length">查询结果 ({{ result.rows.length }} 行)</span>
            <span v-else-if="result.affectedRows">执行成功，影响 {{ result.affectedRows }} 行</span>
            <span v-else>执行完成</span>
            <div class="result-header-actions" v-if="result.rows?.length">
              <el-button size="small" text @click="exportCSV">CSV</el-button>
              <el-button size="small" text @click="exportJSON">JSON</el-button>
            </div>
          </div>
          <el-table v-if="result.rows?.length" :data="result.rows" stripe border max-height="400" style="width:100%" size="small">
            <el-table-column v-for="col in result.columns" :key="col.Field" :prop="col.Field" :label="col.Field"
              show-overflow-tooltip min-width="100">
              <template #default="{ row }">
                <span v-if="row[col.Field] === null" class="null-value">NULL</span>
                <span v-else>{{ row[col.Field] }}</span>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>

      <div class="query-side">
        <div v-if="showLoadPanel" class="side-panel">
          <div class="side-panel-header">📂 已保存的查询</div>
          <div class="side-panel-body">
            <div v-for="(q, idx) in savedQueries" :key="idx" class="saved-item" @click="loadQuery(q)">
              <div class="saved-name">{{ q.name }}</div>
              <pre class="saved-sql">{{ q.sql.slice(0, 80) }}{{ q.sql.length > 80 ? '...' : '' }}</pre>
              <div class="saved-actions"><el-button text size="small" @click.stop="deleteSavedQuery(idx)" type="danger">删除</el-button></div>
            </div>
            <el-empty v-if="!savedQueries.length" description="暂无保存的查询" />
          </div>
        </div>
        <div v-if="history.length" class="side-panel">
          <div class="side-panel-header">📜 历史记录</div>
          <div class="side-panel-body">
            <div v-for="(q, i) in history.slice(0, 15)" :key="i" class="saved-item" @click="loadHistory(q)">
              <pre class="saved-sql">{{ q.slice(0, 100) }}{{ q.length > 100 ? '...' : '' }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>

    <el-dialog v-model="showSaveDialog" title="保存查询" width="400px">
      <el-input v-model="saveName" placeholder="查询名称" />
      <template #footer>
        <el-button @click="showSaveDialog = false">取消</el-button>
        <el-button type="primary" @click="doSaveQuery">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showCsvDialog" title="导入 CSV" width="500px" @close="importFile = null">
      <p>文件: {{ importFile?.name }}</p>
      <p>将创建一个同名的数据表并导入数据。表名: {{ importFile?.name.replace(/\.csv$/i, '') }}</p>
      <template #footer>
        <el-button @click="importFile = null">取消</el-button>
        <el-button type="primary" :loading="importing" @click="doImportCSV">导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.query-container { height: 100%; display: flex; flex-direction: column; background: #f5f7fa; }
.query-toolbar { display: flex; align-items: center; gap: 12px; padding: 6px 12px; border-bottom: 1px solid #d9dce0; background: #fafafa; flex-shrink: 0; }
.toolbar-left { flex-shrink: 0; }
.toolbar-center { flex: 1; display: flex; justify-content: center; }
.toolbar-actions { display: flex; gap: 6px; flex-shrink: 0; }
.query-title { font-weight: 600; font-size: 13px; color: #303133; }
.run-btn { font-weight: 600; padding: 6px 18px; }
.query-editor-section { flex-shrink: 0; border-bottom: 1px solid #d9dce0; }
.editor-wrapper { display: flex; background: #1e1e1e; min-height: 90px; }
.editor-line-numbers { background: #252526; color: #858585; padding: 8px 6px; text-align: right; font-family: 'SF Mono', Menlo, monospace; font-size: 12px; line-height: 1.5; min-width: 32px; user-select: none; }
.line-num { padding: 0 4px; }
.sql-editor { flex: 1; background: #1e1e1e; color: #d4d4d4; border: none; outline: none; resize: vertical; padding: 8px 12px; font-family: 'SF Mono', Menlo, monospace; font-size: 13px; line-height: 1.5; min-height: 90px; tab-size: 2; }
.sql-editor::placeholder { color: #6a6a6a; }
.editor-footer { display: flex; align-items: center; justify-content: space-between; padding: 4px 12px; background: #fafafa; border-top: 1px solid #e4e7ed; }
.sql-tips { display: flex; gap: 4px; flex-wrap: wrap; }
.shortcut-hint { font-size: 11px; color: #909399; }
.query-results-row { flex: 1; overflow: auto; display: flex; gap: 12px; padding: 8px 12px; }
.query-results-main { flex: 1; min-width: 0; }
.query-side { width: 280px; flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; }
.result-header { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; font-weight: 600; font-size: 12px; color: #303133; }
.result-header-actions { display: flex; gap: 4px; }
.result-card { margin-bottom: 12px; }
.error-header { font-weight: 600; font-size: 12px; color: #f56c6c; margin-bottom: 4px; }
.error-msg { color: #f56c6c; white-space: pre-wrap; font-family: 'SF Mono', monospace; font-size: 12px; background: #fef0f0; padding: 12px; border-radius: 4px; border: 1px solid #fde2e2; }
.null-value { color: #c0c4cc; font-style: italic; }
.side-panel { background: #fff; border: 1px solid #e4e7ed; border-radius: 4px; overflow: hidden; }
.side-panel-header { padding: 8px 12px; font-size: 12px; font-weight: 600; color: #303133; border-bottom: 1px solid #e4e7ed; background: #fafafa; }
.side-panel-body { max-height: 300px; overflow-y: auto; }
.saved-item { padding: 6px 12px; border-bottom: 1px solid #f0f0f0; cursor: pointer; }
.saved-item:hover { background: #ecf5ff; }
.saved-name { font-size: 12px; font-weight: 600; color: #303133; margin-bottom: 2px; }
.saved-sql { font-family: 'SF Mono', monospace; font-size: 11px; color: #909399; white-space: pre-wrap; word-break: break-all; margin: 0; }
.saved-actions { margin-top: 2px; }
</style>
