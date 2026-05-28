<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
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
const connLoading = ref(false)

// ─── Autocomplete State ────────────────────────────
const showSuggestions = ref(false)
const suggestions = ref<string[]>([])
const selectedSuggestion = ref(0)
const cursorPos = ref({ x: 0, y: 0 })
const schemaCache = ref<{ table: string; columns: string[] }[]>([])
const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'EXISTS',
  'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
  'CREATE', 'TABLE', 'ALTER', 'DROP', 'INDEX', 'VIEW', 'DATABASE',
  'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'CROSS', 'ON',
  'GROUP', 'BY', 'HAVING', 'ORDER', 'ASC', 'DESC',
  'LIMIT', 'OFFSET', 'UNION', 'ALL', 'DISTINCT',
  'AS', 'IS', 'NULL', 'TRUE', 'FALSE',
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'IF', 'ELSEIF', 'THEN', 'END IF',
  'FOREIGN', 'KEY', 'REFERENCES', 'CONSTRAINT',
  'PRIMARY', 'UNIQUE', 'CHECK', 'DEFAULT',
  'SHOW', 'DESCRIBE', 'EXPLAIN', 'USE',
  'TRUNCATE', 'REPLACE', 'MERGE',
  'CASCADE', 'RESTRICT', 'SET NULL',
  'AUTO_INCREMENT', 'COMMENT', 'ENGINE', 'CHARSET', 'COLLATE',
  'CURRENT_TIMESTAMP', 'NOW', 'DATE', 'TIME', 'YEAR',
  'VARCHAR', 'INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT',
  'TEXT', 'LONGTEXT', 'MEDIUMTEXT', 'BLOB', 'FLOAT', 'DOUBLE', 'DECIMAL',
  'BOOLEAN', 'ENUM', 'JSON',
]

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
  await loadSchemaCache()
})

watch(selectedDb, () => { loadSchemaCache() })

function loadSavedQueries() {
  try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) savedQueries.value = JSON.parse(raw) } catch {}
}

function persistSavedQueries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(savedQueries.value))
}

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

async function loadSchemaCache() {
  if (!selectedDb.value) return
  try {
    // Get tables
    const tables = await api.getTables(connIdNum.value, selectedDb.value)
    const cache: { table: string; columns: string[] }[] = []
    for (const t of tables.slice(0, 50)) { // limit to 50 tables
      try {
        const res = await api.runQuery(connIdNum.value,
          `SHOW COLUMNS FROM \`${t.name}\``,
          selectedDb.value)
        cache.push({
          table: t.name,
          columns: (res.rows as any[]).map((r: any) => r.Field),
        })
      } catch {}
    }
    schemaCache.value = cache
  } catch {}
}

// ─── Autocomplete Logic ────────────────────────────
const editorRef = ref<HTMLTextAreaElement | null>(null)

function getWordAtCursor(): { word: string; start: number; end: number } {
  const ta = editorRef.value
  if (!ta) return { word: '', start: 0, end: 0 }
  const pos = ta.selectionStart
  const text = sql.value
  // Find word start (backwards from cursor)
  let start = pos
  while (start > 0 && /[a-zA-Z0-9_$]/.test(text[start - 1])) start--
  // Find word end (forwards from cursor)
  let end = pos
  while (end < text.length && /[a-zA-Z0-9_$]/.test(text[end])) end++
  return { word: text.slice(start, end).toLowerCase(), start, end }
}

function getCursorPixelPos(): { x: number; y: number } {
  const ta = editorRef.value
  if (!ta) return { x: 0, y: 0 }
  const pos = ta.selectionStart
  const text = sql.value
  const before = text.slice(0, pos)
  const lines = before.split('\n')
  const lineNum = lines.length - 1
  const colNum = lines[lineNum]?.length || 0
  // Calculate approximate position based on font metrics
  const charW = 7.8 // monospace 13px ≈ 7.8px per char
  const lineH = 19.5 // 1.5 * 13px
  return {
    x: Math.min(colNum * charW + 12, 600),
    y: (lineNum + 1) * lineH + 8,
  }
}

function getSuggestionsForWord(word: string): string[] {
  if (!word || word.length < 1) return []
  const lower = word.toLowerCase()
  const results: string[] = []

  // Match SQL keywords
  for (const kw of SQL_KEYWORDS) {
    if (kw.toLowerCase().startsWith(lower) && !results.includes(kw)) {
      results.push(kw)
    }
  }

  // Match table names
  for (const t of schemaCache.value) {
    if (t.table.toLowerCase().includes(lower) && !results.includes(t.table)) {
      results.push(t.table)
    }
  }

  // Match column names
  for (const t of schemaCache.value) {
    for (const col of t.columns) {
      if (col.toLowerCase().includes(lower) && !results.includes(col)) {
        results.push(col)
      }
    }
  }

  return results.slice(0, 20)
}

function handleInput() {
  nextTick(() => updateSuggestions())
}

function updateSuggestions() {
  const { word } = getWordAtCursor()
  if (word.length >= 1) {
    const matches = getSuggestionsForWord(word)
    if (matches.length > 0) {
      suggestions.value = matches
      selectedSuggestion.value = 0
      showSuggestions.value = true
      const pos = getCursorPixelPos()
      cursorPos.value = pos
      return
    }
  }
  showSuggestions.value = false
}

function acceptSuggestion(suggestion: string) {
  const ta = editorRef.value
  if (!ta) return
  const { start, end } = getWordAtCursor()
  const before = sql.value.slice(0, start)
  const after = sql.value.slice(end)
  sql.value = before + suggestion + after
  showSuggestions.value = false
  // Restore cursor focus
  nextTick(() => {
    ta.focus()
    const newPos = start + suggestion.length
    ta.setSelectionRange(newPos, newPos)
  })
}

function handleSuggestionKeydown(e: KeyboardEvent) {
  if (!showSuggestions.value) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedSuggestion.value = Math.min(selectedSuggestion.value + 1, suggestions.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedSuggestion.value = Math.max(selectedSuggestion.value - 1, 0)
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    if (suggestions.value[selectedSuggestion.value]) {
      e.preventDefault()
      acceptSuggestion(suggestions.value[selectedSuggestion.value])
    }
  } else if (e.key === 'Escape') {
    showSuggestions.value = false
  }
}


// ─── Query Execution ───────────────────────────────
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
  const keywords = SQL_KEYWORDS.map(k => k.toLowerCase())
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
  if (target.files?.length) { importFile.value = target.files[0]; showCsvDialog.value = true }
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
    importFile.value = null; showCsvDialog.value = false
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || e.message || '导入失败')
  } finally { importing.value = false; showCsvDialog.value = false }
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

function clickCsvInput() {
  document.getElementById('csvInput')?.click()
}
</script>

<template>
  <div class="query-container" @click="showSuggestions = false">
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

    <!-- SQL Editor -->
    <div class="query-editor-section" style="position:relative">
      <div class="editor-wrapper">
        <div class="editor-line-numbers">
          <div v-for="i in Math.max(sql.split('\n').length, 1)" :key="i" class="line-num">{{ i }}</div>
        </div>
        <textarea
          ref="editorRef"
          v-model="sql"
          class="sql-editor"
          placeholder="输入 SQL 语句，例如：SELECT * FROM users LIMIT 100"
          spellcheck="false"
          @input="handleInput"
          @keydown="handleSuggestionKeydown"
          @keydown.meta.enter.prevent="runQuery"
          @keydown.ctrl.enter.prevent="runQuery"
          @scroll="showSuggestions = false"
        />
      </div>
      <div class="editor-footer">
        <div class="sql-tips">
          <el-tag size="small" @click="sql += ' LIMIT 100'" style="cursor:pointer">LIMIT 100</el-tag>
          <el-tag size="small" @click="sql = 'SHOW TABLES'" style="cursor:pointer">SHOW TABLES</el-tag>
          <el-tag size="small" @click="sql = 'SHOW DATABASES'" style="cursor:pointer">SHOW DATABASES</el-tag>
          <el-tag size="small" @click="sql = 'DESCRIBE '" style="cursor:pointer">DESCRIBE</el-tag>
        </div>
        <span class="shortcut-hint">⌘+⏎ 执行 · 联想提示</span>
      </div>

      <!-- Autocomplete Dropdown -->
      <div
        v-if="showSuggestions && suggestions.length"
        class="suggestions-dropdown"
        :style="{ left: cursorPos.x + 'px', top: cursorPos.y + 'px' }"
      >
        <div
          v-for="(s, i) in suggestions"
          :key="i"
          class="suggestion-item"
          :class="{ active: i === selectedSuggestion }"
          @mousedown.prevent="acceptSuggestion(s)"
          @mouseenter="selectedSuggestion = i"
        >{{ s }}</div>
      </div>
    </div>

    <!-- Results & History -->
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
      <p>将创建一个同名的数据表并导入数据。</p>
      <template #footer>
        <el-button @click="showCsvDialog = false">取消</el-button>
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
.query-editor-section { flex-shrink: 0; border-bottom: 1px solid #d9dce0; position: relative; }
.editor-wrapper { display: flex; background: #1e1e1e; min-height: 90px; }
.editor-line-numbers { background: #252526; color: #858585; padding: 8px 6px; text-align: right; font-family: 'SF Mono', Menlo, monospace; font-size: 12px; line-height: 1.5; min-width: 32px; user-select: none; }
.line-num { padding: 0 4px; }
.sql-editor { flex: 1; background: #1e1e1e; color: #d4d4d4; border: none; outline: none; resize: vertical; padding: 8px 12px; font-family: 'SF Mono', Menlo, monospace; font-size: 13px; line-height: 1.5; min-height: 90px; tab-size: 2; }
.sql-editor::placeholder { color: #6a6a6a; }
.editor-footer { display: flex; align-items: center; justify-content: space-between; padding: 4px 12px; background: #fafafa; border-top: 1px solid #e4e7ed; }
.sql-tips { display: flex; gap: 4px; flex-wrap: wrap; }
.shortcut-hint { font-size: 11px; color: #909399; }

/* Autocomplete Dropdown */
.suggestions-dropdown {
  position: absolute;
  z-index: 999;
  background: #252526;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
  max-height: 280px;
  overflow-y: auto;
  min-width: 150px;
  font-family: 'SF Mono', Menlo, monospace;
  font-size: 12px;
}
.suggestion-item {
  padding: 5px 14px;
  color: #d4d4d4;
  cursor: pointer;
  white-space: nowrap;
}
.suggestion-item:hover,
.suggestion-item.active {
  background: #094771;
  color: #fff;
}

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
