<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'
import { useConnectionStore } from '../stores/connections'
import type { QueryResult, DbItem, MultiQueryResult } from '../types'

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
const connLoading = ref(false)

// P2: Multi-query
const multiResult = ref<MultiQueryResult | null>(null)
const useMultiQuery = ref(false)

// P2: EXPLAIN
const explainResult = ref<any>(null)
const showExplain = ref(false)
const explainLoading = ref(false)

// P2: Export
const showExportDialog = ref(false)
const exportFormat = ref<'csv' | 'json' | 'sql'>('csv')
const exporting = ref(false)
const exportTableName = ref('exported_table')

// P2: DB Objects browser
const showDbObjects = ref(false)
const viewsList = ref<any[]>([])
const routinesList = ref<any[]>([])
const triggersList = ref<any[]>([])
const eventsList = ref<any[]>([])
const objectsLoading = ref(false)
const dbObjectTab = ref<'views' | 'routines' | 'triggers' | 'events'>('views')

// Autocomplete
import { nextTick } from 'vue'
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
  'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'CONSTRAINT',
  'UNIQUE', 'CHECK', 'DEFAULT',
  'SHOW', 'DESCRIBE', 'EXPLAIN', 'USE',
  'TRUNCATE', 'REPLACE', 'MERGE',
  'CASCADE', 'RESTRICT',
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
  if (!props.initialDb) {
    const dbParam = route.query.database as string
    if (dbParam) selectedDb.value = dbParam
    else if (store.currentDatabase) selectedDb.value = store.currentDatabase
  }
  if (!props.initialSql) {
    const sqlParam = route.query.sql as string
    if (sqlParam) sql.value = sqlParam
  }
  await loadDatabases()
  await loadSchemaCache()
})

watch(selectedDb, () => { loadSchemaCache(); loadDbObjects() })

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
  } finally { connLoading.value = false }
}

async function loadSchemaCache() {
  if (!selectedDb.value) return
  try {
    const tables = await api.getTables(connIdNum.value, selectedDb.value)
    const cache: { table: string; columns: string[] }[] = []
    for (const t of tables.slice(0, 50)) {
      try {
        const res = await api.runQuery(connIdNum.value, `SHOW COLUMNS FROM \`${t.name}\``, selectedDb.value)
        cache.push({ table: t.name, columns: (res.rows as any[]).map(r => r.Field) })
      } catch {}
    }
    schemaCache.value = cache
  } catch {}
}

// ─── DB Objects Browser ─────────────────────────
async function loadDbObjects() {
  if (!selectedDb.value) return
  objectsLoading.value = true
  try {
    const [v, r, t, e] = await Promise.all([
      api.getViews(connIdNum.value, selectedDb.value).catch(() => []),
      api.getRoutines(connIdNum.value, selectedDb.value).catch(() => []),
      api.getTriggers(connIdNum.value, selectedDb.value).catch(() => []),
      api.getEvents(connIdNum.value, selectedDb.value).catch(() => []),
    ])
    viewsList.value = v
    routinesList.value = r
    triggersList.value = t
    eventsList.value = e
  } catch {} finally { objectsLoading.value = false }
}

async function insertViewSQL(view: any) {
  try {
    const detail = await api.getView(connIdNum.value, view.name, selectedDb.value || undefined)
    sql.value = 'SELECT * FROM `' + view.name + '`'
    showDbObjects.value = false
  } catch {}
}

// ─── Execute Query ──────────────────────────────
async function executeQuery() {
  if (!sql.value.trim()) return
  if (!selectedDb.value) { ElMessage.warning('请选择数据库'); return }
  running.value = true
  error.value = ''
  result.value = null
  multiResult.value = null

  // Add to history
  history.value = [sql.value, ...history.value.filter(s => s !== sql.value)].slice(0, 50)

  try {
    if (useMultiQuery.value && sql.value.includes(';')) {
      multiResult.value = await api.runMultiQuery(connIdNum.value, sql.value, selectedDb.value || undefined)
    } else {
      result.value = await api.runQuery(connIdNum.value, sql.value, selectedDb.value || undefined)
    }
  } catch (e: any) {
    error.value = e.response?.data?.error || e.message
  } finally { running.value = false }
}

// ─── EXPLAIN ────────────────────────────────────
async function runExplain() {
  if (!sql.value.trim()) return
  if (!selectedDb.value) { ElMessage.warning('请选择数据库'); return }
  explainLoading.value = true
  showExplain.value = true
  try {
    const res = await api.explainQuery(connIdNum.value, sql.value, selectedDb.value || undefined)
    explainResult.value = res.plan
  } catch (e: any) {
    ElMessage.error('EXPLAIN 失败: ' + (e.response?.data?.error || e.message))
  } finally { explainLoading.value = false }
}

// ─── Export ──────────────────────────────────────
async function doExport() {
  if (!result.value && !multiResult.value) { ElMessage.warning('没有查询结果可导出'); return }
  exporting.value = true
  try {
    const res = await api.exportQuery(
      connIdNum.value, sql.value, exportFormat.value,
      selectedDb.value || undefined, exportTableName.value,
    )
    const blob = new Blob([res.data], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `query_result.${exportFormat.value}`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success(`已导出 ${res.total} 行`)
    showExportDialog.value = false
  } catch (e: any) {
    ElMessage.error('导出失败: ' + (e.response?.data?.error || e.message))
  } finally { exporting.value = false }
}

// ─── SQL Format ─────────────────────────────────
function formatSQL() {
  if (!sql.value.trim()) return
  let formatted = sql.value
    .replace(/\s+/g, ' ')
    .replace(/\b(SELECT|FROM|WHERE|AND|OR|ORDER BY|GROUP BY|HAVING|LIMIT|INSERT INTO|VALUES|UPDATE|SET|DELETE|CREATE|ALTER|DROP|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|ON|UNION|EXISTS|NOT|IN)\b/gi,
      (match: string) => '\n' + match.toUpperCase())
    .replace(/\n\s+/g, '\n  ')
    .trim()
  sql.value = formatted
}

// ─── Autocomplete ───────────────────────────────
const editorRef = ref<HTMLTextAreaElement | null>(null)

function handleInput() {
  const { word } = getWordAtCursor()
  if (word.length < 2) { showSuggestions.value = false; return }
  const allSuggestions = [
    ...SQL_KEYWORDS,
    ...schemaCache.value.flatMap(t => [t.table, ...t.columns]),
  ]
  const filtered = [...new Set(allSuggestions)]
    .filter(s => s.toLowerCase().startsWith(word) && s.toLowerCase() !== word)
    .slice(0, 12)
  if (filtered.length) {
    suggestions.value = filtered
    selectedSuggestion.value = 0
    showSuggestions.value = true
    updateCursorPos()
  } else {
    showSuggestions.value = false
  }
}

function getWordAtCursor(): { word: string; start: number; end: number } {
  const ta = editorRef.value
  if (!ta) return { word: '', start: 0, end: 0 }
  const pos = ta.selectionStart
  const text = sql.value
  let start = pos
  while (start > 0 && /[a-zA-Z0-9_$]/.test(text[start - 1])) start--
  let end = pos
  while (end < text.length && /[a-zA-Z0-9_$]/.test(text[end])) end++
  return { word: text.slice(start, end).toLowerCase(), start, end }
}

function updateCursorPos() {
  const ta = editorRef.value
  if (!ta) return
  const pos = ta.selectionStart
  const text = sql.value
  const before = text.slice(0, pos)
  const lines = before.split('\n')
  const lineNum = lines.length
  const colNum = lines[lines.length - 1].length
  const lineHeight = 18
  const charWidth = 8
  cursorPos.value = { x: Math.min(colNum * charWidth, ta.offsetWidth - 200), y: lineNum * lineHeight + 25 }
}

function selectSuggestion(s: string) {
  const { start, end } = getWordAtCursor()
  sql.value = sql.value.slice(0, start) + s + sql.value.slice(end)
  showSuggestions.value = false
  nextTick(() => { editorRef.value?.focus() })
}

function onKeydown(e: KeyboardEvent) {
  if (showSuggestions.value) {
    if (e.key === 'ArrowDown') { selectedSuggestion.value = Math.min(selectedSuggestion.value + 1, suggestions.value.length - 1); e.preventDefault() }
    else if (e.key === 'ArrowUp') { selectedSuggestion.value = Math.max(selectedSuggestion.value - 1, 0); e.preventDefault() }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectSuggestion(suggestions.value[selectedSuggestion.value]) }
    else if (e.key === 'Escape') { showSuggestions.value = false; e.preventDefault() }
    else return
  }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); executeQuery() }
}

function loadHistory(q: string) { sql.value = q }
function saveQuery() { savedQueries.value.push({ name: saveName.value, sql: sql.value, connId: connIdNum.value }); persistSavedQueries(); showSaveDialog.value = false; saveName.value = '' }
function deleteSavedQuery(idx: number) { savedQueries.value.splice(idx, 1); persistSavedQueries() }
function loadSavedQuery(q: { sql: string }) { sql.value = q.sql }

// CSV Import
const showCsvDialog = ref(false)
const importFile = ref<File | null>(null)
const importing = ref(false)

async function doImportCSV() {
  if (!importFile.value) return
  importing.value = true
  try {
    const text = await importFile.value.text()
    const lines = text.split('\n').filter(l => l.trim())
    if (lines.length < 2) throw new Error('CSV 至少需要表头+1行数据')
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
    const rows = lines.slice(1).map(l => l.split(',').map(c => c.trim().replace(/^"|"$/g, '')))
    const tableName = importFile.value.name.replace(/\.csv$/i, '')
    const res = await api.importCSV(connIdNum.value, tableName, headers, rows, selectedDb.value || undefined)
    ElMessage.success(`已导入 ${res.rowsInserted} 行到表 ${res.tableName}`)
    showCsvDialog.value = false
    importFile.value = null
  } catch (e: any) {
    ElMessage.error('导入失败: ' + (e.response?.data?.error || e.message))
  } finally { importing.value = false }
}
</script>

<template>
  <div class="query-container">
    <!-- Toolbar -->
    <div class="query-toolbar">
      <div class="toolbar-left">
        <span class="query-title">📝 SQL 查询</span>
      </div>
      <div class="toolbar-center">
        <el-select v-model="selectedDb" placeholder="选择数据库" clearable size="small" style="width:200px" :loading="connLoading">
          <el-option v-for="db in databases" :key="db.name" :label="db.name" :value="db.name" />
        </el-select>
        <el-checkbox v-model="useMultiQuery" size="small" style="margin-left:8px">多语句</el-checkbox>
      </div>
      <div class="toolbar-actions">
        <el-tooltip content="显示数据库对象" placement="bottom">
          <el-button size="small" @click="showDbObjects = !showDbObjects" :type="showDbObjects ? 'primary' : ''">📂</el-button>
        </el-tooltip>
        <el-button size="small" @click="formatSQL">✨ 格式化</el-button>
        <el-button size="small" :disabled="!result" @click="showExportDialog = true">📥 导出</el-button>
        <el-button size="small" :disabled="!sql.trim()" @click="runExplain" :loading="explainLoading">🔍 EXPLAIN</el-button>
        <el-button size="small" @click="showSaveDialog = true">💾 保存</el-button>
        <el-button size="small" @click="showLoadPanel = !showLoadPanel">📂 加载</el-button>
        <el-button size="small" @click="showCsvDialog = true">📄 导入CSV</el-button>
        <el-button type="primary" size="small" class="run-btn" @click="executeQuery" :loading="running" :disabled="!sql.trim()">
          {{ running ? '执行中...' : '▶ 运行' }}
        </el-button>
      </div>
    </div>

    <!-- Editor -->
    <div class="query-editor-section">
      <div class="editor-wrapper">
        <div class="editor-line-numbers">
          <div v-for="n in Math.max(sql.split('\n').length, 1)" :key="n" class="line-num">{{ n }}</div>
        </div>
        <textarea
          ref="editorRef"
          v-model="sql"
          class="sql-editor"
          placeholder="输入 SQL 语句... (Ctrl+Enter 执行)"
          spellcheck="false"
          @input="handleInput"
          @keydown="onKeydown"
          @scroll="updateCursorPos"
        ></textarea>
        <!-- Autocomplete Dropdown -->
        <div v-if="showSuggestions" class="suggestions-dropdown"
          :style="{ left: cursorPos.x + 'px', top: cursorPos.y + 'px' }">
          <div v-for="(s, i) in suggestions" :key="i" class="suggestion-item"
            :class="{ active: i === selectedSuggestion }"
            @click="selectSuggestion(s)" @mouseenter="selectedSuggestion = i">
            {{ s }}
          </div>
        </div>
      </div>
      <div class="editor-footer">
        <span class="sql-tips">Ctrl+Enter 执行 | Ctrl+Space 补全</span>
      </div>
    </div>

    <!-- DB Objects Panel -->
    <div v-if="showDbObjects && selectedDb" class="db-objects-panel">
      <el-tabs v-model="dbObjectTab" type="card" size="small">
        <el-tab-pane label="视图" name="views">
          <div class="obj-list">
            <div v-for="v in viewsList" :key="v.name" class="obj-item" @click="insertViewSQL(v)">👁️ {{ v.name }}</div>
            <el-empty v-if="!viewsList.length" description="无视图" />
          </div>
        </el-tab-pane>
        <el-tab-pane label="存储过程" name="routines">
          <div class="obj-list">
            <div v-for="r in routinesList" :key="r.name" class="obj-item">
              <span>{{ r.type === 'PROCEDURE' ? '⚙️' : '🔧' }} {{ r.name }}</span>
              <span class="obj-type">{{ r.type }}</span>
            </div>
            <el-empty v-if="!routinesList.length" description="无存储过程" />
          </div>
        </el-tab-pane>
        <el-tab-pane label="触发器" name="triggers">
          <div class="obj-list">
            <div v-for="t in triggersList" :key="t.name" class="obj-item">🔔 {{ t.name }} ({{ t.timing }} {{ t.event }})</div>
            <el-empty v-if="!triggersList.length" description="无触发器" />
          </div>
        </el-tab-pane>
        <el-tab-pane label="事件" name="events">
          <div class="obj-list">
            <div v-for="e in eventsList" :key="e.name" class="obj-item">⏰ {{ e.name }}</div>
            <el-empty v-if="!eventsList.length" description="无事件" />
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- Results -->
    <div class="query-results-row">
      <div class="query-results-main">
        <!-- Single query result -->
        <div v-if="result" class="result-card">
          <div class="result-header">
            <span>查询结果 ({{ result.rows.length }} 行)</span>
          </div>
          <el-table :data="result.rows" stripe size="small" max-height="500" style="width:100%">
            <el-table-column v-for="col in result.columns" :key="col.Field" :prop="col.Field" :label="col.Field" min-width="100" show-overflow-tooltip />
          </el-table>
        </div>

        <!-- Multi-query result -->
        <div v-if="multiResult" class="multi-result">
          <div v-for="(r, i) in multiResult.results" :key="i" class="result-card">
            <div class="result-header">
              <span class="result-label">#{{ i + 1 }}: {{ r.sql.slice(0, 80) }}{{ r.sql.length > 80 ? '...' : '' }}</span>
              <span :class="r.success ? 'status-ok' : 'status-err'">{{ r.success ? `✓ ${r.rows?.length || r.affectedRows || 0} 行` : '✗ 失败' }}</span>
            </div>
            <div v-if="!r.success" class="error-msg">{{ r.error }}</div>
            <el-table v-else-if="r.columns && r.rows" :data="r.rows" stripe size="small" max-height="300" style="width:100%">
              <el-table-column v-for="col in r.columns" :key="col.Field" :prop="col.Field" :label="col.Field" min-width="100" show-overflow-tooltip />
            </el-table>
          </div>
        </div>

        <!-- Error -->
        <div v-if="error" class="error-card">
          <div class="error-header">❌ 查询错误</div>
          <div class="error-msg">{{ error }}</div>
        </div>

        <!-- Empty -->
        <div v-if="!result && !multiResult && !error" class="welcome-query">
          <p>输入 SQL 语句后点击「运行」或按 Ctrl+Enter</p>
        </div>
      </div>

      <!-- Side panels -->
      <div class="query-side">
        <!-- EXPLAIN -->
        <div v-if="showExplain" class="side-panel">
          <div class="side-panel-header">🔍 EXPLAIN 执行计划</div>
          <div class="side-panel-body">
            <div v-if="explainLoading" class="panel-loading">分析中...</div>
            <el-table v-else-if="explainResult" :data="explainResult" stripe size="small" max-height="400">
              <el-table-column prop="id" label="ID" width="40" />
              <el-table-column prop="select_type" label="类型" width="80" />
              <el-table-column prop="table" label="表" width="80" />
              <el-table-column prop="type" label="访问" width="70" />
              <el-table-column prop="possible_keys" label="可能索引" width="90" />
              <el-table-column prop="key" label="实际索引" width="90" />
              <el-table-column prop="rows" label="行数" width="60" />
              <el-table-column prop="Extra" label="额外" min-width="120" />
            </el-table>
            <el-empty v-else description="无执行计划" />
          </div>
        </div>

        <!-- Saved Queries -->
        <div v-if="showLoadPanel" class="side-panel">
          <div class="side-panel-header">💾 保存的查询</div>
          <div class="side-panel-body">
            <div v-for="(q, idx) in savedQueries" :key="idx" class="saved-item" @click="loadSavedQuery(q)">
              <div class="saved-name">{{ q.name }}</div>
              <pre class="saved-sql">{{ q.sql.slice(0, 100) }}{{ q.sql.length > 100 ? '...' : '' }}</pre>
              <div class="saved-actions"><el-button text size="small" type="danger" @click.stop="deleteSavedQuery(idx)">删除</el-button></div>
            </div>
            <el-empty v-if="!savedQueries.length" description="暂无保存的查询" />
          </div>
        </div>

        <!-- History -->
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

    <!-- Dialogs -->
    <el-dialog v-model="showSaveDialog" title="保存查询" width="400px">
      <el-input v-model="saveName" placeholder="查询名称" />
      <template #footer>
        <el-button @click="showSaveDialog = false">取消</el-button>
        <el-button type="primary" @click="saveQuery">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showExportDialog" title="导出查询结果" width="400px">
      <el-form label-width="100px">
        <el-form-item label="导出格式">
          <el-radio-group v-model="exportFormat">
            <el-radio value="csv">CSV</el-radio>
            <el-radio value="json">JSON</el-radio>
            <el-radio value="sql">SQL INSERT</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="表名(SQL)" v-if="exportFormat === 'sql'">
          <el-input v-model="exportTableName" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showExportDialog = false">取消</el-button>
        <el-button type="primary" :loading="exporting" @click="doExport">导出</el-button>
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
.query-toolbar { display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-bottom: 1px solid #d9dce0; background: #fafafa; flex-shrink: 0; flex-wrap: wrap; }
.toolbar-left { flex-shrink: 0; }
.toolbar-center { display: flex; align-items: center; }
.toolbar-actions { display: flex; gap: 4px; flex-wrap: wrap; }
.query-title { font-weight: 600; font-size: 13px; color: #303133; white-space: nowrap; }
.run-btn { font-weight: 600; }
.query-editor-section { flex-shrink: 0; border-bottom: 1px solid #d9dce0; position: relative; }
.editor-wrapper { display: flex; background: #1e1e1e; min-height: 80px; position: relative; }
.editor-line-numbers { background: #252526; color: #858585; padding: 8px 6px; text-align: right; font-family: 'SF Mono', Menlo, monospace; font-size: 12px; line-height: 1.5; min-width: 32px; user-select: none; }
.line-num { padding: 0 4px; }
.sql-editor { flex: 1; background: #1e1e1e; color: #d4d4d4; border: none; outline: none; resize: vertical; padding: 8px 12px; font-family: 'SF Mono', Menlo, monospace; font-size: 13px; line-height: 1.5; min-height: 80px; tab-size: 2; }
.sql-editor::placeholder { color: #6a6a6a; }
.editor-footer { display: flex; align-items: center; justify-content: space-between; padding: 4px 12px; background: #fafafa; border-top: 1px solid #e4e7ed; }
.sql-tips { font-size: 11px; color: #909399; }
.suggestions-dropdown { position: absolute; z-index: 999; background: #252526; border: 1px solid #3c3c3c; border-radius: 4px; box-shadow: 0 4px 16px rgba(0,0,0,0.4); max-height: 280px; overflow-y: auto; min-width: 150px; font-family: 'SF Mono', Menlo, monospace; font-size: 12px; }
.suggestion-item { padding: 5px 14px; color: #d4d4d4; cursor: pointer; white-space: nowrap; }
.suggestion-item:hover, .suggestion-item.active { background: #094771; color: #fff; }
.db-objects-panel { border-bottom: 1px solid #e4e7ed; background: #fff; padding: 4px 12px; max-height: 200px; overflow-y: auto; }
.obj-list { display: flex; flex-direction: column; gap: 2px; }
.obj-item { display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; font-size: 12px; cursor: pointer; border-radius: 3px; }
.obj-item:hover { background: #ecf5ff; }
.obj-type { font-size: 10px; color: #909399; }
.query-results-row { flex: 1; overflow: auto; display: flex; gap: 12px; padding: 8px 12px; }
.query-results-main { flex: 1; min-width: 0; }
.query-side { width: 300px; flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; }
.result-card { margin-bottom: 12px; }
.result-header { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; font-size: 12px; color: #303133; }
.result-label { font-weight: 600; }
.status-ok { color: #67c23a; font-size: 11px; }
.status-err { color: #f56c6c; font-size: 11px; }
.error-card { margin-bottom: 12px; }
.error-header { font-weight: 600; font-size: 12px; color: #f56c6c; margin-bottom: 4px; }
.error-msg { color: #f56c6c; white-space: pre-wrap; font-family: 'SF Mono', monospace; font-size: 12px; background: #fef0f0; padding: 12px; border-radius: 4px; border: 1px solid #fde2e2; }
.welcome-query { text-align: center; padding: 60px 20px; color: #909399; }
.panel-loading { padding: 20px; text-align: center; color: #909399; font-size: 12px; }
.side-panel { background: #fff; border: 1px solid #e4e7ed; border-radius: 4px; overflow: hidden; }
.side-panel-header { padding: 8px 12px; font-size: 12px; font-weight: 600; color: #303133; border-bottom: 1px solid #e4e7ed; background: #fafafa; }
.side-panel-body { max-height: 300px; overflow-y: auto; }
.saved-item { padding: 6px 12px; border-bottom: 1px solid #f0f0f0; cursor: pointer; }
.saved-item:hover { background: #ecf5ff; }
.saved-name { font-size: 12px; font-weight: 600; color: #303133; margin-bottom: 2px; }
.saved-sql { font-family: 'SF Mono', monospace; font-size: 11px; color: #909399; white-space: pre-wrap; word-break: break-all; margin: 0; }
.saved-actions { margin-top: 2px; }
</style>
