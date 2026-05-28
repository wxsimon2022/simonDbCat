<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'
import type { ColumnInfo, IndexInfo, ForeignKeyInfo, ViewInfo, RoutineInfo, TriggerInfo, EventInfo } from '../types'

const props = defineProps<{
  connId: string
  table: string
  database: string
}>()

const connIdNum = computed(() => Number(props.connId))

// Active tab
const activeTab = ref<'columns' | 'indexes' | 'foreign-keys'>('columns')

// Columns
const columns = ref<ColumnInfo[]>([])
const columnsLoading = ref(false)

// Indexes
const indexes = ref<IndexInfo[]>([])
const indexesLoading = ref(false)

// Foreign Keys
const foreignKeys = ref<ForeignKeyInfo[]>([])
const fkLoading = ref(false)

// Views
const views = ref<ViewInfo[]>([])
const viewsLoading = ref(false)

// Routines
const routines = ref<RoutineInfo[]>([])
const routinesLoading = ref(false)

// Triggers
const triggers = ref<TriggerInfo[]>([])
const triggersLoading = ref(false)

// Events
const events = ref<EventInfo[]>([])
const eventsLoading = ref(false)

// Column editing
const editingColumn = ref<string | null>(null)
const editColForm = ref({ name: '', type: '', nullable: true, defaultVal: '', comment: '' })
const showAddColumn = ref(false)
const addColForm = ref({ name: '', type: 'VARCHAR(255)', nullable: true, defaultVal: '', comment: '', after: '' })

// Index editing
const showAddIndex = ref(false)
const addIndexForm = ref({ indexName: '', columns: [] as string[], unique: false, indexType: 'BTREE' })

// View / Routine / Trigger detail
const selectedView = ref<ViewInfo | null>(null)
const showViewDetail = ref(false)
const selectedRoutine = ref<RoutineInfo | null>(null)
const showRoutineDetail = ref(false)
const selectedTrigger = ref<TriggerInfo | null>(null)
const showTriggerDetail = ref(false)

onMounted(() => { loadAll() })

async function loadAll() {
  await Promise.all([loadColumns(), loadIndexes(), loadForeignKeys()])
}

// ─── Columns ────────────────────────────────────
async function loadColumns() {
  columnsLoading.value = true
  try {
    const res = await api.getTableData(connIdNum.value, props.table, props.database || undefined, 1, 0)
    columns.value = res.columns
  } catch (e: any) {
    ElMessage.error('加载字段失败: ' + (e.response?.data?.error || e.message))
  } finally { columnsLoading.value = false }
}

function startEditColumn(col: ColumnInfo) {
  editingColumn.value = col.Field
  editColForm.value = { name: col.Field, type: col.Type, nullable: col.Null === 'YES', defaultVal: col.Default || '', comment: '' }
}

async function saveColumn() {
  if (!editingColumn.value) return
  try {
    await api.modifyColumn(connIdNum.value, props.table, editingColumn.value, {
      name: editColForm.value.name,
      type: editColForm.value.type,
      nullable: editColForm.value.nullable,
      default: editColForm.value.defaultVal || undefined,
      comment: editColForm.value.comment || undefined,
    }, props.database || undefined)
    ElMessage.success('字段已修改')
    editingColumn.value = null
    await loadColumns()
  } catch (e: any) { ElMessage.error('修改失败: ' + (e.response?.data?.error || e.message)) }
}

async function dropColumn(col: string) {
  try {
    await ElMessageBox.confirm(`确定删除字段 "${col}"?`, '确认删除', { type: 'warning' })
    await api.dropColumn(connIdNum.value, props.table, col, props.database || undefined)
    ElMessage.success('字段已删除')
    await loadColumns()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error('删除失败: ' + (e.response?.data?.error || e.message)) }
}

async function addColumn() {
  try {
    await api.addColumn(connIdNum.value, props.table, {
      name: addColForm.value.name,
      type: addColForm.value.type,
      nullable: addColForm.value.nullable,
      default: addColForm.value.defaultVal || undefined,
      comment: addColForm.value.comment || undefined,
      after: addColForm.value.after || undefined,
    }, props.database || undefined)
    ElMessage.success('字段已添加')
    showAddColumn.value = false
    addColForm.value = { name: '', type: 'VARCHAR(255)', nullable: true, defaultVal: '', comment: '', after: '' }
    await loadColumns()
  } catch (e: any) { ElMessage.error('添加失败: ' + (e.response?.data?.error || e.message)) }
}

// ─── Indexes ────────────────────────────────────
async function loadIndexes() {
  indexesLoading.value = true
  try {
    indexes.value = await api.getIndexes(connIdNum.value, props.table, props.database || undefined)
  } catch (e: any) { ElMessage.error('加载索引失败: ' + (e.response?.data?.error || e.message)) }
  finally { indexesLoading.value = false }
}

async function dropIndex(keyName: string) {
  try {
    await ElMessageBox.confirm(`确定删除索引 "${keyName}"?`, '确认删除', { type: 'warning' })
    await api.dropIndex(connIdNum.value, props.table, keyName, props.database || undefined)
    ElMessage.success('索引已删除')
    await loadIndexes()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error('删除失败: ' + (e.response?.data?.error || e.message)) }
}

async function createIndex() {
  if (!addIndexForm.value.indexName || !addIndexForm.value.columns.length) {
    ElMessage.warning('请输入索引名并选择字段')
    return
  }
  try {
    await api.createIndex(connIdNum.value, props.table, addIndexForm.value, props.database || undefined)
    ElMessage.success('索引已创建')
    showAddIndex.value = false
    addIndexForm.value = { indexName: '', columns: [], unique: false, indexType: 'BTREE' }
    await loadIndexes()
  } catch (e: any) { ElMessage.error('创建失败: ' + (e.response?.data?.error || e.message)) }
}

// ─── Foreign Keys ───────────────────────────────
async function loadForeignKeys() {
  fkLoading.value = true
  try {
    foreignKeys.value = await api.getForeignKeys(connIdNum.value, props.table, props.database || undefined)
  } catch (e: any) { ElMessage.error('加载外键失败: ' + (e.response?.data?.error || e.message)) }
  finally { fkLoading.value = false }
}

async function loadViews() {
  viewsLoading.value = true
  try {
    views.value = await api.getViews(connIdNum.value, props.database || undefined)
  } catch (e: any) { /* ignore */ }
  finally { viewsLoading.value = false }
}

async function loadRoutines() {
  routinesLoading.value = true
  try {
    routines.value = await api.getRoutines(connIdNum.value, props.database || undefined)
  } catch (e: any) { /* ignore */ }
  finally { routinesLoading.value = false }
}

async function loadTriggers() {
  triggersLoading.value = true
  try {
    triggers.value = await api.getTriggers(connIdNum.value, props.database || undefined)
  } catch (e: any) { /* ignore */ }
  finally { triggersLoading.value = false }
}

async function loadEvents() {
  eventsLoading.value = true
  try {
    events.value = await api.getEvents(connIdNum.value, props.database || undefined)
  } catch (e: any) { /* ignore */ }
  finally { eventsLoading.value = false }
}

async function viewViewDetail(v: ViewInfo) {
  try {
    const detail = await api.getView(connIdNum.value, v.name, props.database || undefined)
    selectedView.value = detail
    showViewDetail.value = true
  } catch (e: any) { ElMessage.error('加载视图详情失败: ' + (e.message)) }
}

function viewRoutineDetail(r: RoutineInfo) {
  selectedRoutine.value = r
  showRoutineDetail.value = true
}

function viewTriggerDetail(t: TriggerInfo) {
  selectedTrigger.value = t
  showTriggerDetail.value = true
}
</script>

<template>
  <div class="struct-container">
    <!-- Sub-tabs: Columns | Indexes | Foreign Keys | Views | Routines | Triggers | Events -->
    <div class="struct-tabs">
      <el-tabs v-model="activeTab" type="border-card">
        <el-tab-pane label="📋 字段" name="columns">
          <div class="tab-toolbar">
            <el-button size="small" @click="showAddColumn = true">➕ 添加字段</el-button>
            <el-button size="small" @click="loadColumns" :loading="columnsLoading">🔄 刷新</el-button>
          </div>

          <div v-if="showAddColumn" class="add-form">
            <div class="form-row">
              <input v-model="addColForm.name" placeholder="字段名" class="form-input" />
              <input v-model="addColForm.type" placeholder="类型 (如 VARCHAR(255))" class="form-input" style="width:160px" />
              <label><input type="checkbox" v-model="addColForm.nullable" /> NULL</label>
              <input v-model="addColForm.defaultVal" placeholder="默认值" class="form-input" style="width:100px" />
              <input v-model="addColForm.comment" placeholder="注释" class="form-input" style="width:120px" />
              <el-button size="small" type="primary" @click="addColumn">✔ 确认</el-button>
              <el-button size="small" @click="showAddColumn = false">✖ 取消</el-button>
            </div>
          </div>

          <el-table :data="columns" v-loading="columnsLoading" stripe size="small" max-height="500">
            <el-table-column prop="Field" label="字段名" min-width="140" />
            <el-table-column prop="Type" label="类型" min-width="140" />
            <el-table-column prop="Null" label="允许NULL" width="80" />
            <el-table-column prop="Key" label="键" width="60" />
            <el-table-column prop="Default" label="默认值" min-width="100">
              <template #default="{ row }">
                <span class="null-value" v-if="row.Default === null">NULL</span>
                <span v-else>{{ row.Default }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="Extra" label="额外" min-width="120" />
            <el-table-column label="操作" width="160" fixed="right">
              <template #default="{ row }">
                <el-button text size="small" @click="startEditColumn(row)">✏️ 编辑</el-button>
                <el-button text size="small" type="danger" @click="dropColumn(row.Field)">🗑️ 删除</el-button>
              </template>
            </el-table-column>
          </el-table>

          <!-- Inline edit dialog -->
          <el-dialog :model-value="!!editingColumn" @update:model-value="(v) => { if(!v) editingColumn = null }" title="编辑字段" width="480px">
            <el-form label-width="100px" v-if="editingColumn">
              <el-form-item label="字段名"><el-input v-model="editColForm.name" /></el-form-item>
              <el-form-item label="类型"><el-input v-model="editColForm.type" placeholder="VARCHAR(255)" /></el-form-item>
              <el-form-item label="允许NULL"><el-switch v-model="editColForm.nullable" /></el-form-item>
              <el-form-item label="默认值"><el-input v-model="editColForm.defaultVal" /></el-form-item>
              <el-form-item label="注释"><el-input v-model="editColForm.comment" /></el-form-item>
            </el-form>
            <template #footer>
              <el-button @click="editingColumn = null">取消</el-button>
              <el-button type="primary" @click="saveColumn">保存</el-button>
            </template>
          </el-dialog>
        </el-tab-pane>

        <el-tab-pane label="🔑 索引" name="indexes">
          <div class="tab-toolbar">
            <el-button size="small" @click="showAddIndex = true">➕ 添加索引</el-button>
            <el-button size="small" @click="loadIndexes" :loading="indexesLoading">🔄 刷新</el-button>
          </div>

          <div v-if="showAddIndex" class="add-form">
            <div class="form-row">
              <input v-model="addIndexForm.indexName" placeholder="索引名" class="form-input" />
              <input v-model="addIndexForm.columns" placeholder="字段名(逗号分隔)" class="form-input" style="width:200px"
                @input="(e: any) => addIndexForm.columns = e.target.value.split(',').map((s: string) => s.trim())"
              />
              <label><input type="checkbox" v-model="addIndexForm.unique" /> UNIQUE</label>
              <el-button size="small" type="primary" @click="createIndex">✔ 创建</el-button>
              <el-button size="small" @click="showAddIndex = false">✖ 取消</el-button>
            </div>
          </div>

          <el-table :data="indexes" v-loading="indexesLoading" stripe size="small" max-height="500">
            <el-table-column prop="keyName" label="索引名" min-width="160" />
            <el-table-column label="唯一" width="60">
              <template #default="{ row }">{{ row.unique ? '✅' : '❌' }}</template>
            </el-table-column>
            <el-table-column label="字段" min-width="200">
              <template #default="{ row }">{{ row.columns.map((c: any) => c.column).join(', ') }}</template>
            </el-table-column>
            <el-table-column prop="indexType" label="类型" width="80" />
            <el-table-column label="操作" width="100">
              <template #default="{ row }">
                <el-button text size="small" type="danger" @click="dropIndex(row.keyName)">🗑️ 删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!indexesLoading && !indexes.length" description="无索引" />
        </el-tab-pane>

        <el-tab-pane label="🔗 外键" name="foreign-keys">
          <div class="tab-toolbar">
            <el-button size="small" @click="loadForeignKeys" :loading="fkLoading">🔄 刷新</el-button>
          </div>
          <el-table :data="foreignKeys" v-loading="fkLoading" stripe size="small" max-height="500">
            <el-table-column prop="constraintName" label="约束名" min-width="140" />
            <el-table-column prop="columnName" label="字段" width="120" />
            <el-table-column label="引用" min-width="200">
              <template #default="{ row }">{{ row.refTable }}.{{ row.refColumn }}</template>
            </el-table-column>
            <el-table-column prop="onUpdate" label="更新规则" width="100" />
            <el-table-column prop="onDelete" label="删除规则" width="100" />
          </el-table>
          <el-empty v-if="!fkLoading && !foreignKeys.length" description="无外键" />
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<style scoped>
.struct-container { padding: 0; background: #fff; }
.struct-tabs :deep(.el-tabs__content) { padding: 0; }
.tab-toolbar { display: flex; gap: 8px; padding: 8px 12px; border-bottom: 1px solid #f0f0f0; }
.add-form { padding: 8px 12px; background: #f0f9eb; border-bottom: 1px solid #e4e7ed; }
.form-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; }
.form-input { padding: 4px 8px; border: 1px solid #c0c4cc; border-radius: 3px; font-size: 12px; outline: none; }
.form-input:focus { border-color: #409eff; }
.null-value { color: #c0c4cc; font-style: italic; }
</style>
