<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'
import type { ColumnInfo, TableData } from '../types'

const props = defineProps<{
  connId: string
  table: string
  database: string
}>()

const connIdNum = computed(() => Number(props.connId))
const data = ref<TableData | null>(null)
const loading = ref(false)
const pageSize = ref(100)
const currentPage = ref(1)
const totalRows = ref(0)
const sortColumn = ref('')
const sortOrder = ref<'asc' | 'desc'>('asc')
const searchText = ref('')

// Editing state
const editingCell = ref<{ row: number; col: string } | null>(null)
const editValue = ref<any>(null)
const editedRows = ref<Set<number>>(new Set())
const rowSnapshot = ref<Map<number, Record<string, unknown>>>(new Map())
const addingRow = ref(false)
const newRow = ref<Record<string, any>>({})
const selectedRows = ref<Set<number>>(new Set())

// Export dialog
const showExportDialog = ref(false)
const exportFormat = ref<'csv' | 'json' | 'sql'>('csv')
const exporting = ref(false)
const exportAll = ref(false)

onMounted(() => loadData())

watch([() => props.table, () => props.database, pageSize, currentPage, sortColumn, sortOrder], () => loadData())

async function loadData() {
  loading.value = true
  try {
    const offset = (currentPage.value - 1) * pageSize.value
    data.value = await api.getTableData(
      connIdNum.value, props.table, props.database || undefined,
      pageSize.value, offset,
      sortColumn.value || undefined, sortOrder.value,
    )
    totalRows.value = data.value.total
    editedRows.value.clear()
    rowSnapshot.value.clear()
    addingRow.value = false
  } catch (e: any) {
    ElMessage.error('加载数据失败: ' + (e.response?.data?.error || e.message))
  } finally {
    loading.value = false
  }
}

const totalPages = computed(() => Math.ceil(totalRows.value / pageSize.value))

function changePage(p: number) {
  if (p < 1 || p > totalPages.value) return
  currentPage.value = p
}

function toggleSort(col: string) {
  if (sortColumn.value === col) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortColumn.value = col
    sortOrder.value = 'asc'
  }
}

const displayRows = computed(() => {
  if (!data.value) return []
  let rows = data.value.rows
  if (searchText.value) {
    const q = searchText.value.toLowerCase()
    rows = rows.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q)))
  }
  return rows
})

const filteredTotal = computed(() => displayRows.value.length)

// ─── Inline Editing ──────────────────────────────
function startEdit(rowIdx: number, col: string) {
  const row = displayRows.value[rowIdx]
  if (!row) return
  editingCell.value = { row: rowIdx, col }
  editValue.value = row[col]
  if (!editedRows.value.has(rowIdx)) {
    editedRows.value.add(rowIdx)
    rowSnapshot.value.set(rowIdx, { ...row })
  }
}

function confirmEdit() {
  if (!editingCell.value) return
  const { row, col } = editingCell.value
  const rowData = displayRows.value[row]
  if (rowData) rowData[col] = editValue.value
  editingCell.value = null
}

function cancelEdit() {
  if (!editingCell.value) return
  const { row, col } = editingCell.value
  // Restore snapshot if first edit
  if (rowSnapshot.value.has(row)) {
    const snap = rowSnapshot.value.get(row)!
    const rowData = displayRows.value[row]
    if (rowData) rowData[col] = snap[col]
  }
  editingCell.value = null
}

function onCellKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') { confirmEdit(); e.preventDefault() }
  if (e.key === 'Escape') { cancelEdit(); e.preventDefault() }
}

// ─── Row Operations ──────────────────────────────
function addRow() {
  addingRow.value = true
  newRow.value = {}
  // Pre-fill primary key with placeholder
}

async function commitNewRow() {
  if (Object.keys(newRow.value).length === 0) {
    ElMessage.warning('请至少输入一个字段')
    return
  }
  try {
    await api.insertRow(connIdNum.value, props.table, newRow.value, props.database || undefined)
    ElMessage.success('行已添加')
    addingRow.value = false
    newRow.value = {}
    await loadData()
  } catch (e: any) {
    ElMessage.error('添加失败: ' + (e.response?.data?.error || e.message))
  }
}

function cancelNewRow() {
  addingRow.value = false
  newRow.value = {}
}

async function commitEdits() {
  const rowIndices = Array.from(editedRows.value)
  if (rowIndices.length === 0) return

  try {
    for (const idx of rowIndices) {
      const row = data.value!.rows[idx]
      const snap = rowSnapshot.value.get(idx)
      if (!snap) continue
      const changes: Record<string, unknown> = {}
      const where: Record<string, unknown> = {}
      // Build WHERE from all columns (use all original values as key)
      for (const col of Object.keys(row)) {
        if (JSON.stringify(row[col]) !== JSON.stringify(snap[col])) {
          changes[col] = row[col]
        }
        where[col] = snap[col]
      }
      if (Object.keys(changes).length > 0) {
        await api.updateRow(connIdNum.value, props.table, where, changes, props.database || undefined)
      }
    }
    ElMessage.success(`已更新 ${rowIndices.length} 行`)
    await loadData()
  } catch (e: any) {
    ElMessage.error('提交失败: ' + (e.response?.data?.error || e.message))
  }
}

async function deleteSelectedRows() {
  if (selectedRows.value.size === 0) { ElMessage.warning('请先选择要删除的行'); return }
  try {
    await ElMessageBox.confirm(`确定删除 ${selectedRows.value.size} 行?`, '确认删除', { type: 'warning' })
    for (const idx of selectedRows.value) {
      const row = data.value!.rows[idx]
      await api.deleteRow(connIdNum.value, props.table, row as Record<string, unknown>, props.database || undefined)
    }
    ElMessage.success(`已删除 ${selectedRows.value.size} 行`)
    selectedRows.value.clear()
    await loadData()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error('删除失败: ' + (e.response?.data?.error || e.message))
  }
}

function toggleRowSelect(idx: number) {
  if (selectedRows.value.has(idx)) selectedRows.value.delete(idx)
  else selectedRows.value.add(idx)
}

function selectAll() {
  if (selectedRows.value.size === displayRows.value.length) {
    selectedRows.value.clear()
  } else {
    selectedRows.value = new Set(displayRows.value.map((_, i) => i))
  }
}

// ─── Export ──────────────────────────────────────
async function doExport() {
  exporting.value = true
  try {
    const result = await api.exportTable(
      connIdNum.value, props.table, exportFormat.value,
      props.database || undefined,
      exportAll.value ? 10000 : pageSize.value,
    )
    const ext = exportFormat.value
    const blob = new Blob([result.data], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${props.table}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success(`已导出 ${result.total} 行`)
    showExportDialog.value = false
  } catch (e: any) {
    ElMessage.error('导出失败: ' + (e.response?.data?.error || e.message))
  } finally {
    exporting.value = false
  }
}

const columns = computed(() => data.value?.columns || [])
</script>

<template>
  <div class="data-grid-container">
    <!-- Toolbar -->
    <div class="grid-toolbar">
      <div class="toolbar-left">
        <el-button size="small" @click="selectAll">
          {{ selectedRows.size === displayRows.length ? '取消全选' : '全选' }}
        </el-button>
        <el-button size="small" type="danger" plain @click="deleteSelectedRows" :disabled="selectedRows.size === 0">
          🗑️ 删除选中 ({{ selectedRows.size }})
        </el-button>
        <el-divider direction="vertical" />
        <el-button size="small" @click="addRow" :disabled="addingRow">➕ 新增行</el-button>
        <el-button size="small" type="primary" @click="commitEdits" :disabled="editedRows.size === 0">
          💾 提交更改 ({{ editedRows.size }})
        </el-button>
      </div>
      <div class="toolbar-right">
        <el-input
          v-model="searchText" placeholder="筛选行..." size="small" clearable
          prefix-icon="Search" style="width: 180px"
        />
        <el-button size="small" @click="showExportDialog = true">📥 导出</el-button>
        <el-button size="small" @click="loadData" :loading="loading">🔄 刷新</el-button>
      </div>
    </div>

    <!-- New Row Input -->
    <div v-if="addingRow" class="new-row-bar">
      <span class="new-row-label">新行:</span>
      <template v-for="col in columns" :key="col.Field">
        <input
          v-if="col.Extra !== 'auto_increment'"
          v-model="newRow[col.Field]"
          :placeholder="col.Field"
          class="new-row-input"
          @keydown.enter="commitNewRow"
        />
      </template>
      <el-button size="small" type="primary" @click="commitNewRow">✔ 确认</el-button>
      <el-button size="small" @click="cancelNewRow">✖ 取消</el-button>
    </div>

    <!-- Table -->
    <div class="grid-body" v-loading="loading">
      <table class="data-table" v-if="data">
        <thead>
          <tr>
            <th class="row-select-col">
              <span class="row-num-header">#</span>
            </th>
            <th
              v-for="col in columns" :key="col.Field"
              class="col-header"
              :class="{ sortable: true, sorted: sortColumn === col.Field }"
              @click="toggleSort(col.Field)"
            >
              <span class="col-name">{{ col.Field }}</span>
              <span class="col-type">{{ col.Type }}</span>
              <span v-if="sortColumn === col.Field" class="sort-indicator">
                {{ sortOrder === 'asc' ? '▲' : '▼' }}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIdx) in displayRows" :key="rowIdx"
            :class="{
              'edited-row': editedRows.has(rowIdx),
              'selected-row': selectedRows.has(rowIdx),
              'new-row-anim': rowIdx >= data.rows.length - 1 && editedRows.has(rowIdx),
            }"
          >
            <td class="row-select-col" @click="toggleRowSelect(rowIdx)">
              <input type="checkbox" :checked="selectedRows.has(rowIdx)" @change="toggleRowSelect(rowIdx)" />
            </td>
            <td v-for="col in columns" :key="col.Field" class="cell"
              @dblclick="startEdit(rowIdx, col.Field)"
            >
              <div v-if="editingCell?.row === rowIdx && editingCell?.col === col.Field" class="cell-edit">
                <input
                  v-model="editValue"
                  class="cell-input"
                  @keydown="onCellKeydown"
                  @blur="confirmEdit"
                  autofocus
                />
              </div>
              <div v-else class="cell-value" :class="{ 'null-value': row[col.Field] === null }">
                {{ row[col.Field] === null ? 'NULL' : row[col.Field] }}
              </div>
            </td>
          </tr>
          <tr v-if="!displayRows.length">
            <td :colspan="columns.length + 1" class="empty-cell">暂无数据</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div class="grid-footer" v-if="data">
      <div class="footer-left">
        <span class="row-count">共 {{ totalRows }} 行，当前 {{ displayRows.length }} 行</span>
        <span v-if="editedRows.size" class="edit-badge">{{ editedRows.size }} 行待提交</span>
      </div>
      <div class="footer-right">
        <el-select v-model="pageSize" size="small" style="width: 120px" @change="currentPage = 1">
          <el-option label="25 条/页" :value="25" />
          <el-option label="50 条/页" :value="50" />
          <el-option label="100 条/页" :value="100" />
          <el-option label="200 条/页" :value="200" />
        </el-select>
        <el-pagination
          v-if="totalPages > 1"
          :current-page="currentPage"
          :page-count="totalPages"
          :pager-count="5"
          layout="prev, pager, next"
          @current-change="changePage"
          small
        />
      </div>
    </div>

    <!-- Export Dialog -->
    <el-dialog v-model="showExportDialog" title="导出数据" width="400px">
      <el-form label-width="100px">
        <el-form-item label="导出格式">
          <el-radio-group v-model="exportFormat">
            <el-radio value="csv">CSV</el-radio>
            <el-radio value="json">JSON</el-radio>
            <el-radio value="sql">SQL</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="导出范围">
          <el-checkbox v-model="exportAll">导出全部 (最多 10000 行)</el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showExportDialog = false">取消</el-button>
        <el-button type="primary" :loading="exporting" @click="doExport">导出</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.data-grid-container { height: 100%; display: flex; flex-direction: column; background: #fff; }
.grid-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid #e4e7ed; background: #fafafa; flex-shrink: 0; gap: 8px; flex-wrap: wrap; }
.toolbar-left, .toolbar-right { display: flex; align-items: center; gap: 6px; }
.new-row-bar { display: flex; align-items: center; gap: 6px; padding: 6px 12px; background: #f0f9eb; border-bottom: 1px solid #e4e7ed; font-size: 12px; flex-wrap: wrap; }
.new-row-label { font-weight: 600; color: #67c23a; white-space: nowrap; }
.new-row-input { padding: 3px 6px; border: 1px solid #c0c4cc; border-radius: 3px; font-size: 12px; width: 100px; outline: none; }
.new-row-input:focus { border-color: #409eff; }
.grid-body { flex: 1; overflow: auto; }
.data-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.data-table th { position: sticky; top: 0; z-index: 2; background: #f5f7fa; border-bottom: 2px solid #e4e7ed; padding: 6px 8px; text-align: left; white-space: nowrap; user-select: none; }
.col-header { cursor: pointer; }
.col-header:hover { background: #ecf5ff; }
.col-header.sorted { background: #e6f0ff; }
.col-name { font-weight: 600; color: #303133; margin-right: 4px; }
.col-type { font-size: 10px; color: #909399; font-weight: normal; }
.sort-indicator { font-size: 10px; color: #409eff; margin-left: 2px; }
.row-select-col { width: 40px; text-align: center; padding: 4px !important; }
.row-num-header { color: #909399; font-size: 10px; }
.data-table td { padding: 4px 8px; border-bottom: 1px solid #f0f0f0; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.data-table tr:hover td { background: #f5f7fa; }
.data-table tr.selected-row td { background: #ecf5ff; }
.data-table tr.edited-row td { background: #fdf6ec; }
.cell-value { min-height: 20px; cursor: pointer; }
.null-value { color: #c0c4cc; font-style: italic; }
.cell-edit { position: relative; }
.cell-input { width: 100%; padding: 2px 4px; border: 1px solid #409eff; border-radius: 2px; font-size: 12px; outline: none; background: #fff; box-sizing: border-box; }
.empty-cell { text-align: center; padding: 40px; color: #909399; }
.grid-footer { display: flex; align-items: center; justify-content: space-between; padding: 6px 12px; border-top: 1px solid #e4e7ed; background: #fafafa; flex-shrink: 0; }
.footer-left, .footer-right { display: flex; align-items: center; gap: 8px; }
.row-count { font-size: 12px; color: #909399; }
.edit-badge { font-size: 11px; color: #e6a23c; background: #fdf6ec; padding: 2px 8px; border-radius: 10px; }
</style>
