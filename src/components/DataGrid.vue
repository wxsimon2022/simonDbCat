<script setup lang="ts">
import { ref, onMounted, watch, computed, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'
import type { TableData } from '../types'

const props = defineProps<{
  connId: number
  database: string
  table: string
}>()

const data = ref<TableData | null>(null)
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(200)
const totalRows = ref(0)

// Inline editing
const editState = ref<Record<string, { editing: boolean; value: string }>>({})
const editInputRef = ref<Record<string, any>>({})

// Filter dialog (Navicat style)
const showFilterDialog = ref(false)
const filterConditions = ref<{ field: string; op: string; value: string; logic: 'AND' | 'OR' }[]>([])

// Quick filter bar
const quickFilters = ref<Record<string, string>>({})
const showQuickFilter = ref(false)

// Find bar
const showFindBar = ref(false)
const findText = ref('')
const findCaseSensitive = ref(false)
const highlightRows = ref<Set<number>>(new Set())

// Sort
const sortColumn = ref('')
const sortOrder = ref<'ASC' | 'DESC' | ''>('')

// Selection / context menu
const selectedRows = ref<Record<string, unknown>[]>([])
const contextMenu = ref({ visible: false, x: 0, y: 0, row: null as Record<string, unknown> | null, field: '', cellValue: '' })
const cellValueDialog = ref({ visible: false, title: '', value: '' })

// Adding row
const addingRow = ref(false)

// Column header context menu
const colHeaderMenu = ref({ visible: false, x: 0, y: 0, field: '' })

onMounted(() => { loadData(); document.addEventListener('click', closeAllMenus) })

watch([currentPage, pageSize], () => loadData())

function getCellKey(rowIdx: number, field: string) { return `${rowIdx}_${field}` }

function buildWhereClause(): string {
  const parts: string[] = []
  // Quick filters
  for (const [col, val] of Object.entries(quickFilters.value)) {
    if (val) parts.push(`\`${col}\` LIKE '%${String(val).replace(/'/g, "\\'")}%'`)
  }
  // Advanced filter conditions
  if (filterConditions.value.length) {
    let expr = ''
    for (const fc of filterConditions.value) {
      if (!fc.value && fc.op !== 'IS NULL' && fc.op !== 'IS NOT NULL') continue
      const cond = buildCondition(fc)
      if (!expr) expr = cond
      else expr += ` ${fc.logic} ${cond}`
    }
    if (expr) parts.push(`(${expr})`)
  }
  return parts.length ? ' WHERE ' + parts.join(' AND ') : ''
}

function buildCondition(fc: { field: string; op: string; value: string }): string {
  const col = `\`${fc.field}\``
  const val = String(fc.value).replace(/'/g, "\\'")
  switch (fc.op) {
    case '=': return `${col} = '${val}'`
    case '!=': return `${col} != '${val}'`
    case '>': return `${col} > '${val}'`
    case '>=': return `${col} >= '${val}'`
    case '<': return `${col} < '${val}'`
    case '<=': return `${col} <= '${val}'`
    case 'LIKE': return `${col} LIKE '%${val}%'`
    case 'NOT LIKE': return `${col} NOT LIKE '%${val}%'`
    case 'IN': return `${col} IN (${val.split(',').map(s => `'${s.trim().replace(/'/g, "\\'")}'`).join(',')})`
    case 'IS NULL': return `${col} IS NULL`
    case 'IS NOT NULL': return `${col} IS NOT NULL`
    default: return `${col} LIKE '%${val}%'`
  }
}

async function loadData() {
  loading.value = true
  try {
    const where = buildWhereClause()
    const order = sortColumn.value && sortOrder.value
      ? ` ORDER BY \`${sortColumn.value}\` ${sortOrder.value}`
      : ''
    const offset = (currentPage.value - 1) * pageSize.value
    const querySql = `SELECT * FROM \`${props.table}\`${where}${order} LIMIT ${pageSize.value} OFFSET ${offset}`
    const res = await api.runQuery(props.connId, querySql, props.database)
    data.value = { columns: res.columns, rows: res.rows, total: res.rows.length }
    const countRes = await api.runQuery(props.connId, `SELECT COUNT(*) AS total FROM \`${props.table}\`${where}`, props.database)
    totalRows.value = Number(countRes.rows[0]?.total || 0)
    editState.value = {}
    addingRow.value = false
    applyFindHighlight()
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || '加载失败')
  } finally {
    loading.value = false
  }
}

function refresh() { currentPage.value = 1; loadData() }

// ─── Find ──────────────────────────────────────────
function toggleFind() { showFindBar.value = !showFindBar.value; if (!showFindBar.value) highlightRows.value = new Set() }

function applyFindHighlight() {
  if (!findText.value || !data.value) { highlightRows.value = new Set(); return }
  const set = new Set<number>()
  const text = findCaseSensitive.value ? findText.value : findText.value.toLowerCase()
  data.value.rows.forEach((row, i) => {
    for (const val of Object.values(row)) {
      const s = String(val ?? '')
      const match = findCaseSensitive.value ? s.includes(text) : s.toLowerCase().includes(text)
      if (match) { set.add(i); break }
    }
  })
  highlightRows.value = set
}

function findNext() {
  if (!highlightRows.value.size) return
  const sorted = [...highlightRows.value].sort((a, b) => a - b)
  const tableEl = document.querySelector('.navicat-grid .el-table__body-wrapper')
  if (tableEl) {
    const firstRow = sorted[0]
    const rowEl = tableEl.querySelector(`tr[data-row-index="${firstRow}"]`)
    if (rowEl) rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

// ─── Inline Editing ─────────────────────────────────
function startEdit(rowIdx: number, field: string, value: unknown) {
  const key = getCellKey(rowIdx, field)
  editState.value[key] = { editing: true, value: String(value ?? '') }
  nextTick(() => { const input = editInputRef.value[key]; if (input) { input.focus(); input.select?.() } })
}

function commitEdit(rowIdx: number, field: string) {
  const key = getCellKey(rowIdx, field)
  const state = editState.value[key]
  if (!state || !state.editing) return
  state.editing = false
  if (!data.value) return
  const row = data.value.rows[rowIdx]
  const oldValue = String(row[field] ?? '')
  if (state.value === oldValue) return
  const pkCol = data.value.columns.find(c => c.Key === 'PRI')
  if (!pkCol) { ElMessage.warning('没有主键，无法编辑'); return }
  const pkValue = row[pkCol.Field]
  const newVal = state.value
  const escapedVal = newVal === '' ? 'NULL' : `'${String(newVal).replace(/'/g, "\\'")}'`
  api.runQuery(props.connId, `UPDATE \`${props.table}\` SET \`${field}\` = ${escapedVal} WHERE \`${pkCol.Field}\` = '${String(pkValue).replace(/'/g, "\\'")}'`, props.database)
    .then(() => { row[field] = newVal === '' ? null : newVal })
    .catch((e: any) => { ElMessage.error(e.response?.data?.error || '更新失败'); loadData() })
}

function cancelEdit(rowIdx: number, field: string) { const s = editState.value[getCellKey(rowIdx, field)]; if (s) s.editing = false }

function handleCellKeydown(e: KeyboardEvent, rowIdx: number, field: string, fields: string[]) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault(); commitEdit(rowIdx, field)
    const idx = fields.indexOf(field)
    if (idx < fields.length - 1) startEdit(rowIdx, fields[idx + 1], data.value?.rows[rowIdx]?.[fields[idx + 1]])
  } else if (e.key === 'Tab') {
    e.preventDefault(); commitEdit(rowIdx, field)
    const idx = fields.indexOf(field)
    if (e.shiftKey && idx > 0) startEdit(rowIdx, fields[idx - 1], data.value?.rows[rowIdx]?.[fields[idx - 1]])
    else if (!e.shiftKey && idx < fields.length - 1) startEdit(rowIdx, fields[idx + 1], data.value?.rows[rowIdx]?.[fields[idx + 1]])
  } else if (e.key === 'Escape') { cancelEdit(rowIdx, field) }
}

// ─── Sort ──────────────────────────────────────────
function setSort(field: string) {
  if (sortColumn.value === field) {
    if (sortOrder.value === 'ASC') sortOrder.value = 'DESC'
    else if (sortOrder.value === 'DESC') sortOrder.value = ''
    else sortOrder.value = 'ASC'
  } else { sortColumn.value = field; sortOrder.value = 'ASC' }
  currentPage.value = 1; loadData()
}

// ─── Filter ────────────────────────────────────────
function addFilterCondition() {
  filterConditions.value.push({ field: data.value?.columns[0]?.Field || '', op: '=', value: '', logic: 'AND' })
}

function removeFilterCondition(idx: number) { filterConditions.value.splice(idx, 1) }

function applyAdvancedFilter() {
  currentPage.value = 1; showFilterDialog.value = false; loadData()
}

function clearAllFilters() {
  filterConditions.value = []; quickFilters.value = {}; currentPage.value = 1; loadData()
}

function applyQuickFilter() { currentPage.value = 1; loadData() }

// ─── Cell Context Menu ────────────────────────────
function handleCellContext(e: MouseEvent, row: Record<string, unknown>, field: string) {
  e.preventDefault()
  contextMenu.value = {
    visible: true, x: e.clientX, y: e.clientY,
    row, field, cellValue: String(row[field] ?? ''),
  }
}

function closeAllMenus() {
  contextMenu.value.visible = false
  colHeaderMenu.value.visible = false
}

function copyCell() {
  navigator.clipboard.writeText(contextMenu.value.cellValue)
  ElMessage.success('已复制')
  contextMenu.value.visible = false
}

function copyRow() {
  if (!contextMenu.value.row) return
  const vals = (data.value?.columns || []).map(c => String(contextMenu.value.row![c.Field] ?? '')).join('\t')
  navigator.clipboard.writeText(vals)
  ElMessage.success('已复制行')
  contextMenu.value.visible = false
}

function copyRowWithHeaders() {
  if (!contextMenu.value.row) return
  const headers = (data.value?.columns || []).map(c => c.Field).join('\t')
  const vals = (data.value?.columns || []).map(c => String(contextMenu.value.row![c.Field] ?? '')).join('\t')
  navigator.clipboard.writeText(headers + '\n' + vals)
  ElMessage.success('已复制行（含表头）')
  contextMenu.value.visible = false
}

function copyAsInsert() {
  if (!contextMenu.value.row) return
  const cols = data.value!.columns
  const names = cols.map(c => `\`${c.Field}\``).join(', ')
  const vals = cols.map(c => {
    const v = contextMenu.value.row![c.Field]
    return v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "\\'")}'`
  }).join(', ')
  navigator.clipboard.writeText(`INSERT INTO \`${props.table}\` (${names}) VALUES (${vals});`)
  ElMessage.success('已复制 INSERT SQL')
  contextMenu.value.visible = false
}

async function setCellNull() {
  if (!contextMenu.value.row) return
  const pkCol = data.value?.columns.find(c => c.Key === 'PRI')
  if (!pkCol) { ElMessage.warning('没有主键'); return }
  try {
    await api.runQuery(props.connId,
      `UPDATE \`${props.table}\` SET \`${contextMenu.value.field}\` = NULL WHERE \`${pkCol.Field}\` = '${String(contextMenu.value.row[pkCol.Field]).replace(/'/g, "\\'")}'`,
      props.database)
    ElMessage.success('已设为 NULL')
    contextMenu.value.visible = false
    loadData()
  } catch (e: any) { ElMessage.error(e.response?.data?.error || '操作失败') }
}

function viewCellValue() {
  const v = contextMenu.value.cellValue
  cellValueDialog.value = {
    visible: true,
    title: `${contextMenu.value.field} — 值查看`,
    value: v,
  }
  contextMenu.value.visible = false
}

// ─── Column Header Context Menu ───────────────────
function handleHeaderContext(e: MouseEvent, field: string) {
  e.preventDefault()
  colHeaderMenu.value = { visible: true, x: e.clientX, y: e.clientY, field }
}

function sortByField(dir: 'ASC' | 'DESC') {
  sortColumn.value = colHeaderMenu.value.field
  sortOrder.value = dir
  colHeaderMenu.value.visible = false
  currentPage.value = 1; loadData()
}

function clearSort() {
  sortColumn.value = ''; sortOrder.value = ''
  colHeaderMenu.value.visible = false; loadData()
}

function filterByField() {
  const field = colHeaderMenu.value.field
  colHeaderMenu.value.visible = false
  if (!quickFilters.value[field]) quickFilters.value[field] = ''
  showQuickFilter.value = true
}

// ─── Row Operations ───────────────────────────────
async function deleteSelectedRows() {
  if (!selectedRows.value.length || !data.value) return
  const pkCol = data.value.columns.find(c => c.Key === 'PRI')
  if (!pkCol) { ElMessage.warning('没有主键，无法删除'); return }
  try {
    await ElMessageBox.confirm(`确定删除选中的 ${selectedRows.value.length} 行?`, '提示', { type: 'warning' })
    for (const row of selectedRows.value) {
      await api.runQuery(props.connId,
        `DELETE FROM \`${props.table}\` WHERE \`${pkCol.Field}\` = '${String(row[pkCol.Field]).replace(/'/g, "\\'")}'`,
        props.database)
    }
    ElMessage.success('已删除 ' + selectedRows.value.length + ' 行')
    selectedRows.value = []; loadData()
  } catch {}
}

async function addRow() {
  if (!data.value) return
  const nonPkCols = data.value.columns.filter(c => !(c.Key === 'PRI' && c.Extra?.includes('auto_increment')))
  const names = nonPkCols.map(c => `\`${c.Field}\``).join(', ')
  const vals = nonPkCols.map(() => 'DEFAULT').join(', ')
  try {
    await api.runQuery(props.connId, `INSERT INTO \`${props.table}\` (${names}) VALUES (${vals})`, props.database)
    ElMessage.success('已添加新行')
    loadData()
    if (totalRows.value > 0) currentPage.value = Math.ceil((totalRows.value + 1) / pageSize.value)
  } catch (e: any) { ElMessage.error(e.response?.data?.error || '添加失败') }
}

async function duplicateRow(row: Record<string, unknown>) {
  const nonPkCols = (data.value?.columns || []).filter(c => !(c.Key === 'PRI' && c.Extra?.includes('auto_increment')))
  const names = nonPkCols.map(c => `\`${c.Field}\``).join(', ')
  const vals = nonPkCols.map(c => {
    const v = row[c.Field]; return v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "\\'")}'`
  }).join(', ')
  try {
    await api.runQuery(props.connId, `INSERT INTO \`${props.table}\` (${names}) VALUES (${vals})`, props.database)
    ElMessage.success('已复制行'); loadData()
  } catch (e: any) { ElMessage.error(e.response?.data?.error || '复制失败') }
}

function deleteRow(row: Record<string, unknown>) {
  const pkCol = data.value?.columns.find(c => c.Key === 'PRI')
  if (!pkCol) { ElMessage.warning('没有主键'); return }
  ElMessageBox.confirm('确定删除该行?', '提示', { type: 'warning' })
    .then(async () => {
      await api.runQuery(props.connId,
        `DELETE FROM \`${props.table}\` WHERE \`${pkCol!.Field}\` = '${String(row[pkCol!.Field]).replace(/'/g, "\\'")}'`,
        props.database)
      ElMessage.success('已删除'); loadData()
    }).catch(() => {})
}

// ─── Export ────────────────────────────────────────
function exportCSV() {
  if (!data.value) return
  const cols = data.value.columns
  const header = cols.map(c => `"${c.Field}"`).join(',')
  const rows = data.value.rows.map(r => cols.map(c => {
    const v = r[c.Field]; return v === null || v === undefined ? '' : `"${String(v).replace(/"/g, '""')}"`
  }).join(',')).join('\n')
  const csv = `${header}\n${rows}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `${props.table}_${new Date().toISOString().slice(0,10)}.csv`
  a.click(); URL.revokeObjectURL(url); ElMessage.success('已导出 CSV')
}

function exportInsertSQL() {
  if (!data.value?.rows.length) { ElMessage.warning('没有数据可导出'); return }
  const cols = data.value.columns
  const stmts = data.value.rows.map(row => {
    const vals = cols.map(c => {
      const v = row[c.Field]; return v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "\\'")}'`
    }).join(', ')
    return `INSERT INTO \`${props.table}\` (${cols.map(c => `\`${c.Field}\``).join(', ')}) VALUES (${vals});`
  }).join('\n')
  const blob = new Blob([stmts], { type: 'text/plain;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `${props.table}_insert_${new Date().toISOString().slice(0,10)}.sql`
  a.click(); URL.revokeObjectURL(url); ElMessage.success('已导出 SQL')
}

function exportJSON() {
  if (!data.value?.rows.length) { ElMessage.warning('没有数据可导出'); return }
  const json = JSON.stringify(data.value.rows, null, 2)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `${props.table}_${new Date().toISOString().slice(0,10)}.json`
  a.click(); URL.revokeObjectURL(url); ElMessage.success('已导出 JSON')
}

function copyCellValue(val: string) {
  navigator.clipboard.writeText(val)
  ElMessage.success('已复制')
  cellValueDialog.value.visible = false
}

const filteredFields = computed(() => data.value?.columns.map(c => c.Field) || [])
const totalPages = computed(() => Math.ceil(totalRows.value / pageSize.value))
</script>

<template>
  <div class="datagrid-container">
    <!-- Toolbar -->
    <div class="datagrid-toolbar">
      <div class="toolbar-left">
        <span class="datagrid-title">{{ table }}</span>
        <span class="datagrid-db" v-if="database">{{ database }}</span>
        <span class="datagrid-meta">{{ totalRows }} 行</span>
      </div>
      <div class="toolbar-center">
        <div class="toolbar-btn-group">
          <el-tooltip content="添加行" placement="bottom">
            <el-button size="small" @click="addRow" :disabled="!data">➕</el-button>
          </el-tooltip>
          <el-tooltip content="删除选中行" placement="bottom">
            <el-button size="small" @click="deleteSelectedRows" :disabled="!selectedRows.length" type="danger" plain>🗑️</el-button>
          </el-tooltip>
          <el-divider direction="vertical" />
          <el-tooltip content="快速筛选" placement="bottom">
            <el-button size="small" @click="showQuickFilter = !showQuickFilter" :type="showQuickFilter ? 'primary' : ''" plain>🔍</el-button>
          </el-tooltip>
          <el-tooltip content="高级筛选" placement="bottom">
            <el-button size="small" @click="showFilterDialog = true" plain>⚙️ 筛选</el-button>
          </el-tooltip>
          <el-tooltip content="查找 (Ctrl+F)" placement="bottom">
            <el-button size="small" @click="toggleFind" :type="showFindBar ? 'primary' : ''" plain>📄</el-button>
          </el-tooltip>
          <el-divider direction="vertical" />
          <el-tooltip content="刷新" placement="bottom">
            <el-button size="small" @click="refresh" :loading="loading">🔄</el-button>
          </el-tooltip>
        </div>
      </div>
      <div class="toolbar-right">
        <el-dropdown trigger="click" @command="(cmd: string) => { if (cmd === 'csv') exportCSV(); else if (cmd === 'insert') exportInsertSQL(); else if (cmd === 'json') exportJSON() }">
          <el-button size="small">导出 ⬇️</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="csv">CSV</el-dropdown-item>
              <el-dropdown-item command="json">JSON</el-dropdown-item>
              <el-dropdown-item command="insert">INSERT SQL</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <!-- Quick Filter Bar -->
    <div v-if="showQuickFilter" class="quick-filter-bar">
      <span class="filter-label">快速筛选:</span>
      <div class="filter-chips" v-if="data">
        <template v-for="col in data.columns.slice(0, 8)" :key="col.Field">
          <el-input
            v-if="quickFilters[col.Field] !== undefined || Object.keys(quickFilters).includes(col.Field)"
            v-model="quickFilters[col.Field]"
            :placeholder="col.Field"
            size="small"
            clearable
            style="width:120px"
            @clear="applyQuickFilter"
            @keyup.enter="applyQuickFilter"
          />
        </template>
        <el-button size="small" text @click="showQuickFilter = false">✕</el-button>
      </div>
    </div>

    <!-- Find Bar -->
    <div v-if="showFindBar" class="find-bar">
      <el-input
        v-model="findText"
        placeholder="查找..."
        size="small"
        clearable
        style="width:220px"
        @input="applyFindHighlight"
        @keyup.enter="findNext"
      />
      <el-checkbox v-model="findCaseSensitive" size="small" @change="applyFindHighlight">区分大小写</el-checkbox>
      <span class="find-count" v-if="findText">{{ highlightRows.size }} 处匹配</span>
      <el-button size="small" text @click="toggleFind">✕</el-button>
    </div>

    <!-- Table -->
    <el-table
      :data="data?.rows || []"
      stripe
      border
      :max-height="showFindBar ? 'calc(100vh - 230px)' : 'calc(100vh - 190px)'"
      style="width: 100%"
      size="small"
      highlight-current-row
      @selection-change="selectedRows = $event"
      class="navicat-grid"
      @cell-contextmenu="handleCellContext"
      row-class-name="data-row"
    >
      <!-- Row selection -->
      <el-table-column type="selection" width="28" />

      <!-- Row number -->
      <el-table-column label="#" width="40" fixed>
        <template #default="{ $index }">
          <span class="row-num">{{ ($index + 1) + (currentPage - 1) * pageSize }}</span>
        </template>
      </el-table-column>

      <!-- Data columns -->
      <el-table-column
        v-for="col in data?.columns || []"
        :key="col.Field"
        :prop="col.Field"
        :label="col.Field"
        show-overflow-tooltip
        min-width="130"
        :class-name="findText && highlightRows.size ? 'findable-col' : ''"
      >
        <template #header>
          <div class="th-wrap" @click="setSort(col.Field)" @contextmenu="handleHeaderContext($event, col.Field)">
            <span class="th-label">{{ col.Field }}</span>
            <span class="th-sort" v-if="sortColumn === col.Field">{{ sortOrder === 'ASC' ? '▲' : '▼' }}</span>
            <span class="th-key" v-if="col.Key === 'PRI'">🔑</span>
            <span class="th-type">{{ col.Type }}</span>
          </div>
        </template>
        <template #default="{ row, $index }">
          <div
            class="cell-edit"
            @dblclick="startEdit($index, col.Field, row[col.Field])"
            :class="{
              'cell-editing': editState[getCellKey($index, col.Field)]?.editing,
              'cell-highlight': findText && highlightRows.has($index)
            }"
          >
            <template v-if="editState[getCellKey($index, col.Field)]?.editing">
              <el-input
                :ref="(el: any) => editInputRef[getCellKey($index, col.Field)] = el?.ref || el"
                v-model="editState[getCellKey($index, col.Field)].value"
                size="small"
                @keydown="handleCellKeydown($event, $index, col.Field, filteredFields)"
                @blur="commitEdit($index, col.Field)"
              />
            </template>
            <template v-else>
              <span v-if="row[col.Field] === null" class="null-value">NULL</span>
              <span v-else class="cell-value">{{ row[col.Field] }}</span>
            </template>
          </div>
        </template>
      </el-table-column>

      <!-- Actions -->
      <el-table-column label="" width="40" fixed="right">
        <template #default="{ row }">
          <el-dropdown trigger="click" size="small">
            <el-button text size="small">⋮</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="duplicateRow(row)">复制行</el-dropdown-item>
                <el-dropdown-item @click="deleteRow(row)" divided>删除行</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </el-table-column>
    </el-table>

    <!-- Pagination -->
    <div class="datagrid-pagination" v-if="totalPages > 1">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :total="totalRows"
        :page-sizes="[50, 100, 200, 500, 1000]"
        layout="total, sizes, prev, pager, next, jumper"
        small
      />
    </div>
  </div>

  <!-- Cell Context Menu -->
  <teleport to="body">
    <div v-if="contextMenu.visible" class="cell-context-menu" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }" @click.stop>
      <div class="ctx-item" @click="copyCell"><span class="ctx-icon">📋</span>复制单元格</div>
      <div class="ctx-item" @click="copyRow"><span class="ctx-icon">📄</span>复制行</div>
      <div class="ctx-item" @click="copyRowWithHeaders"><span class="ctx-icon">📊</span>复制行（含表头）</div>
      <div class="ctx-item" @click="copyAsInsert"><span class="ctx-icon">💾</span>复制为 INSERT</div>
      <div class="ctx-divider" />
      <div class="ctx-item" @click="viewCellValue"><span class="ctx-icon">🔍</span>查看值</div>
      <div class="ctx-item" @click="setCellNull"><span class="ctx-icon">⊘</span>设为 NULL</div>
    </div>

    <!-- Column Header Context Menu -->
    <div v-if="colHeaderMenu.visible" class="cell-context-menu" :style="{ left: colHeaderMenu.x + 'px', top: colHeaderMenu.y + 'px' }" @click.stop>
      <div class="ctx-item" @click="sortByField('ASC')"><span class="ctx-icon">▲</span>升序排序</div>
      <div class="ctx-item" @click="sortByField('DESC')"><span class="ctx-icon">▼</span>降序排序</div>
      <div class="ctx-item" @click="clearSort" v-if="sortColumn"><span class="ctx-icon">✕</span>清除排序</div>
      <div class="ctx-divider" />
      <div class="ctx-item" @click="filterByField"><span class="ctx-icon">🔍</span>按此列筛选</div>
    </div>

    <!-- Cell Value Viewer -->
    <el-dialog v-model="cellValueDialog.visible" :title="cellValueDialog.title" width="700px" top="5vh">
      <pre class="cell-value-viewer">{{ cellValueDialog.value }}</pre>
      <template #footer>
          <el-button @click="copyCellValue(cellValueDialog.value)">复制</el-button>
        <el-button type="primary" @click="cellValueDialog.visible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- Advanced Filter Dialog -->
    <el-dialog v-model="showFilterDialog" title="高级筛选" width="600px" top="10vh">
      <div v-if="!filterConditions.length" class="filter-empty">
        <p>暂无筛选条件</p>
      </div>
      <div v-for="(fc, idx) in filterConditions" :key="idx" class="filter-row">
        <el-select v-model="fc.logic" size="small" style="width:70px" :disabled="idx === 0">
          <el-option label="AND" value="AND" />
          <el-option label="OR" value="OR" />
        </el-select>
        <el-select v-model="fc.field" size="small" style="width:140px" filterable>
          <el-option v-for="col in data?.columns || []" :key="col.Field" :label="col.Field" :value="col.Field" />
        </el-select>
        <el-select v-model="fc.op" size="small" style="width:110px">
          <el-option label="=" value="=" />
          <el-option label="!=" value="!=" />
          <el-option label=">" value=">" />
          <el-option label=">=" value=">=" />
          <el-option label="<" value="<" />
          <el-option label="<=" value="<=" />
          <el-option label="LIKE" value="LIKE" />
          <el-option label="NOT LIKE" value="NOT LIKE" />
          <el-option label="IN" value="IN" />
          <el-option label="IS NULL" value="IS NULL" />
          <el-option label="IS NOT NULL" value="IS NOT NULL" />
        </el-select>
        <el-input v-model="fc.value" size="small" placeholder="值" style="width:140px"
          :disabled="fc.op === 'IS NULL' || fc.op === 'IS NOT NULL'" />
        <el-button text size="small" @click="removeFilterCondition(idx)">✕</el-button>
      </div>
      <div class="filter-actions-dialog">
        <el-button size="small" @click="addFilterCondition">➕ 添加条件</el-button>
      </div>
      <template #footer>
        <el-button @click="clearAllFilters">清除全部</el-button>
        <el-button type="primary" @click="applyAdvancedFilter">应用筛选</el-button>
      </template>
    </el-dialog>
  </teleport>
</template>

<style scoped>
.datagrid-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f5f7fa;
}

/* Toolbar */
.datagrid-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  border-bottom: 1px solid #d9dce0;
  background: #fafafa;
  flex-shrink: 0;
}
.toolbar-left { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.toolbar-center { flex: 1; display: flex; justify-content: center; }
.toolbar-right { flex-shrink: 0; }
.toolbar-btn-group { display: flex; align-items: center; gap: 4px; }
.datagrid-title { font-weight: 600; font-size: 13px; color: #303133; }
.datagrid-db { font-size: 11px; color: #909399; background: #e6e9ed; padding: 1px 6px; border-radius: 3px; }
.datagrid-meta { font-size: 11px; color: #909399; }

/* Quick Filter */
.quick-filter-bar {
  display: flex; align-items: center; gap: 6px; padding: 4px 12px;
  background: #eef1f6; border-bottom: 1px solid #d9dce0; flex-wrap: wrap;
}
.filter-label { font-size: 11px; font-weight: 600; color: #555; white-space: nowrap; }
.filter-chips { display: flex; gap: 4px; flex-wrap: wrap; flex: 1; }
.filter-chips :deep(.el-input__wrapper) { background: #fff; box-shadow: none; border: 1px solid #d9dce0; border-radius: 3px; }

/* Find Bar */
.find-bar {
  display: flex; align-items: center; gap: 8px; padding: 4px 12px;
  background: #fff8e1; border-bottom: 1px solid #e0c78a;
}
.find-count { font-size: 11px; color: #909399; }

/* Row number */
.row-num { color: #909399; font-size: 11px; }

/* Table */
.navicat-grid :deep(.el-table__header-wrapper th) {
  background: #e6e9ed; color: #333; font-weight: 600; font-size: 11px;
  padding: 4px 6px; border-bottom: 1px solid #d9dce0;
}
.navicat-grid :deep(.el-table__body td) { padding: 2px 6px; font-size: 12px; }
.navicat-grid :deep(.el-table--striped .el-table__body tr.el-table__row--striped td) { background: #f8f9fb; }
.navicat-grid :deep(.el-table__body tr:hover > td) { background: #e8f0fe; }
.th-wrap { display: flex; align-items: center; gap: 4px; cursor: pointer; user-select: none; }
.th-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.th-sort { font-size: 9px; color: #409eff; flex-shrink: 0; }
.th-key { font-size: 10px; flex-shrink: 0; }
.th-type { font-size: 10px; color: #909399; margin-left: auto; flex-shrink: 0; }

/* Cell editing */
.cell-edit { min-height: 22px; }
.cell-editing { padding: 0; }
.cell-value { cursor: pointer; min-height: 22px; display: block; padding: 0 2px; }
.cell-value:hover { background: #fffbe6; border-radius: 2px; }
.null-value { color: #c0c4cc; font-style: italic; font-size: 11px; padding: 0 2px; }
.cell-highlight { background: #fff3cd !important; border-radius: 2px; }

/* Pagination */
.datagrid-pagination { padding: 6px 12px; display: flex; justify-content: flex-end; background: #fafafa; border-top: 1px solid #d9dce0; flex-shrink: 0; }

/* Context Menu */
.cell-context-menu {
  position: fixed; z-index: 9999; min-width: 180px;
  background: #fff; border: 1px solid #d9dce0; border-radius: 4px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12); padding: 4px 0;
}
.ctx-item {
  display: flex; align-items: center; gap: 8px; padding: 6px 16px;
  font-size: 12px; color: #303133; cursor: pointer; transition: background 0.1s;
}
.ctx-item:hover { background: #ecf5ff; color: #409eff; }
.ctx-icon { width: 16px; text-align: center; font-size: 12px; }
.ctx-divider { height: 1px; background: #e4e7ed; margin: 4px 8px; }

/* Cell Value Viewer */
.cell-value-viewer {
  background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 4px;
  font-family: 'SF Mono', Menlo, monospace; font-size: 12px;
  overflow: auto; max-height: 60vh; white-space: pre-wrap; word-break: break-all;
}

/* Filter Dialog */
.filter-empty { text-align: center; padding: 20px; color: #909399; }
.filter-row { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.filter-actions-dialog { margin-top: 8px; }
</style>
