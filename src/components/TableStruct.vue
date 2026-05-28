<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'

const props = defineProps<{
  connId: number
  database: string
  table: string
}>()

interface ColumnInfo {
  Field: string
  Type: string
  Collation: string | null
  Null: string
  Key: string
  Default: string | null
  Extra: string
  Privileges: string
  Comment: string
}

interface IndexInfo {
  Table: string
  Non_unique: number
  Key_name: string
  Seq_in_index: number
  Column_name: string
  Collation: string | null
  Cardinality: number | null
  Sub_part: number | null
  Packed: string | null
  Null: string
  Index_type: string
  Comment: string
  Index_comment: string
  Visible: string
  Expression: string | null
}

interface ForeignKeyInfo {
  CONSTRAINT_NAME: string
  COLUMN_NAME: string
  REFERENCED_TABLE_NAME: string
  REFERENCED_COLUMN_NAME: string
  UPDATE_RULE: string
  DELETE_RULE: string
}

interface TriggerInfo {
  TRIGGER_NAME: string
  EVENT_MANIPULATION: string
  EVENT_OBJECT_TABLE: string
  ACTION_TIMING: string
  ACTION_STATEMENT: string
  ACTION_ORIENTATION: string
}

const columns = ref<ColumnInfo[]>([])
const indexes = ref<IndexInfo[]>([])
const foreignKeys = ref<ForeignKeyInfo[]>([])
const triggers = ref<TriggerInfo[]>([])
const loading = ref(false)
const activeTab = ref('columns')

// New column form
const showNewColumn = ref(false)
const newCol = ref({ Field: '', Type: 'VARCHAR(255)', Null: 'YES', Default: null as string | null, Extra: '', Comment: '' })

onMounted(() => loadData())

async function loadData() {
  loading.value = true
  try {
    const [colRes, idxRes, fkRes, trgRes] = await Promise.all([
      api.runQuery(props.connId, `SHOW FULL COLUMNS FROM \`${props.table}\``, props.database),
      api.runQuery(props.connId, `SHOW INDEX FROM \`${props.table}\``, props.database),
      api.runQuery(props.connId, `
        SELECT COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME,
               REFERENCED_COLUMN_NAME, UPDATE_RULE, DELETE_RULE
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = '${props.database}'
          AND TABLE_NAME = '${props.table}'
          AND REFERENCED_TABLE_NAME IS NOT NULL
      `, props.database),
      api.runQuery(props.connId, `
        SELECT TRIGGER_NAME, EVENT_MANIPULATION, EVENT_OBJECT_TABLE,
               ACTION_TIMING, ACTION_STATEMENT, ACTION_ORIENTATION
        FROM INFORMATION_SCHEMA.TRIGGERS
        WHERE EVENT_OBJECT_SCHEMA = '${props.database}'
          AND EVENT_OBJECT_TABLE = '${props.table}'
      `, props.database),
    ])
    columns.value = colRes.rows as unknown as ColumnInfo[]
    indexes.value = idxRes.rows as unknown as IndexInfo[]
    foreignKeys.value = fkRes.rows as unknown as ForeignKeyInfo[]
    triggers.value = trgRes.rows as unknown as TriggerInfo[]
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || '加载失败')
  } finally {
    loading.value = false
  }
}

// Add column
async function addColumn() {
  if (!newCol.value.Field) { ElMessage.warning('请输入字段名'); return }
  try {
    const colDef = `\`${newCol.value.Field}\` ${newCol.value.Type} ${newCol.value.Null === 'NO' ? 'NOT NULL' : ''}${newCol.value.Default !== null && newCol.value.Default !== '' ? ` DEFAULT '${String(newCol.value.Default).replace(/'/g, "\\'")}'` : ''} ${newCol.value.Extra} ${newCol.value.Comment ? `COMMENT '${newCol.value.Comment.replace(/'/g, "\\'")}'` : ''}`
    await api.runQuery(
      props.connId,
      `ALTER TABLE \`${props.table}\` ADD ${colDef}`,
      props.database,
    )
    ElMessage.success('字段已添加')
    showNewColumn.value = false
    newCol.value = { Field: '', Type: 'VARCHAR(255)', Null: 'YES', Default: null, Extra: '', Comment: '' }
    loadData()
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || '添加字段失败')
  }
}

// Drop column
async function dropColumn(field: string) {
  try {
    await ElMessageBox.confirm(`确定删除字段「${field}」?`, '删除确认', { type: 'warning' })
    await api.runQuery(
      props.connId,
      `ALTER TABLE \`${props.table}\` DROP COLUMN \`${field}\``,
      props.database,
    )
    ElMessage.success('字段已删除')
    loadData()
  } catch {}
}

// Modify column dialog
const showModifyCol = ref(false)
const modifyCol = ref<ColumnInfo | null>(null)
const modifyForm = ref({ Field: '', Type: '', Null: '', Default: null as string | null, Extra: '', Comment: '' })

function openModify(col: ColumnInfo) {
  modifyCol.value = col
  modifyForm.value = {
    Field: col.Field,
    Type: col.Type,
    Null: col.Null,
    Default: col.Default,
    Extra: col.Extra,
    Comment: col.Comment,
  }
  showModifyCol.value = true
}

async function saveModify() {
  if (!modifyCol.value) return
  try {
    const colDef = `\`${modifyForm.value.Field}\` ${modifyForm.value.Type} ${modifyForm.value.Null === 'NO' ? 'NOT NULL' : ''}${modifyForm.value.Default !== null && modifyForm.value.Default !== '' ? ` DEFAULT '${String(modifyForm.value.Default).replace(/'/g, "\\'")}'` : ''} ${modifyForm.value.Extra} ${modifyForm.value.Comment ? `COMMENT '${modifyForm.value.Comment.replace(/'/g, "\\'")}'` : ''}`
    await api.runQuery(
      props.connId,
      `ALTER TABLE \`${props.table}\` MODIFY ${colDef}`,
      props.database,
    )
    ElMessage.success('字段已修改')
    showModifyCol.value = false
    loadData()
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || '修改失败')
  }
}

// Drop index
async function dropIndex(keyName: string) {
  try {
    await ElMessageBox.confirm(`确定删除索引「${keyName}」?`, '删除确认', { type: 'warning' })
    // If it's a primary key, need special handling
    if (keyName === 'PRIMARY') {
      await api.runQuery(
        props.connId,
        `ALTER TABLE \`${props.table}\` DROP PRIMARY KEY`,
        props.database,
      )
    } else {
      await api.runQuery(
        props.connId,
        `ALTER TABLE \`${props.table}\` DROP INDEX \`${keyName}\``,
        props.database,
      )
    }
    ElMessage.success('索引已删除')
    loadData()
  } catch {}
}


const uniqueIndexKeys = computed(() => {
  const seen = new Set<string>()
  return indexes.value.filter(idx => {
    if (seen.has(idx.Key_name)) return false
    seen.add(idx.Key_name)
    return true
  })
})

function copyDdl() {
  navigator.clipboard.writeText(ddl.value).then(() => ElMessage.success("已复制")).catch(() => ElMessage.error("复制失败"))
}

// Generated DDL
const ddl = computed(() => {
  const lines: string[] = []
  lines.push(`CREATE TABLE \`${props.table}\` (`)
  for (const col of columns.value) {
    let line = `  \`${col.Field}\` ${col.Type}`
    if (col.Null === 'NO') line += ' NOT NULL'
    if (col.Default !== null && col.Default !== undefined) {
      if (col.Default === 'CURRENT_TIMESTAMP' || col.Default === 'CURRENT_TIMESTAMP()') {
        line += ` DEFAULT ${col.Default}`
      } else {
        line += ` DEFAULT '${String(col.Default).replace(/'/g, "\\'")}'`
      }
    }
    if (col.Extra) line += ` ${col.Extra}`
    if (col.Comment) line += ` COMMENT '${col.Comment.replace(/'/g, "\\'")}'`
    line += ','
    lines.push(line)
  }

  // Add primary key
  const pkIndex = uniqueIndexKeys.value.find(k => k.Key_name === 'PRIMARY')
  if (pkIndex) {
    const pkCols = indexes.value.filter(i => i.Key_name === 'PRIMARY').sort((a, b) => a.Seq_in_index - b.Seq_in_index)
    lines.push(`  PRIMARY KEY (${pkCols.map(i => `\`${i.Column_name}\``).join(', ')}),`)
  }

  // Add other indexes
  for (const idx of uniqueIndexKeys.value) {
    if (idx.Key_name === 'PRIMARY') continue
    const cols = indexes.value.filter(i => i.Key_name === idx.Key_name).sort((a, b) => a.Seq_in_index - b.Seq_in_index)
    const type = idx.Non_unique ? '' : 'UNIQUE '
    lines.push(`  ${type}INDEX \`${idx.Key_name}\` (${cols.map(i => `\`${i.Column_name}\``).join(', ')}),`)
  }

  // Add foreign keys
  for (const fk of foreignKeys.value) {
    lines.push(`  CONSTRAINT \`${fk.CONSTRAINT_NAME}\` FOREIGN KEY (\`${fk.COLUMN_NAME}\`) REFERENCES \`${fk.REFERENCED_TABLE_NAME}\` (\`${fk.REFERENCED_COLUMN_NAME}\`) ON DELETE ${fk.DELETE_RULE} ON UPDATE ${fk.UPDATE_RULE},`)
  }

  // Remove trailing comma
  if (lines[lines.length - 1]?.endsWith(',')) {
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1)
  }

  lines.push(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;')
  return lines.join('\n')
})
</script>

<template>
  <div class="struct-container">
    <!-- Toolbar -->
    <div class="struct-toolbar">
      <div class="toolbar-left">
        <span class="struct-title">{{ table }}</span>
        <span class="struct-db" v-if="database">{{ database }}</span>
      </div>
      <div class="toolbar-actions">
        <el-button size="small" type="primary" @click="showNewColumn = true" v-if="activeTab === 'columns'">
          ➕ 添加字段
        </el-button>
        <el-button size="small" @click="loadData" :loading="loading">🔄 刷新</el-button>
      </div>
    </div>

    <!-- Tabs -->
    <el-tabs v-model="activeTab" class="struct-tabs">
      <!-- Columns Tab -->
      <el-tab-pane label="字段" name="columns">
        <!-- Add column form -->
        <div v-if="showNewColumn" class="new-col-form">
          <div class="new-col-grid">
            <el-input v-model="newCol.Field" placeholder="字段名" size="small" style="width:140px" />
            <el-input v-model="newCol.Type" placeholder="类型" size="small" style="width:160px" />
            <el-select v-model="newCol.Null" size="small" style="width:90px">
              <el-option label="NULL" value="YES" />
              <el-option label="NOT NULL" value="NO" />
            </el-select>
            <el-input v-model="newCol.Default" placeholder="默认值" size="small" style="width:120px" />
            <el-input v-model="newCol.Extra" placeholder="额外" size="small" style="width:120px" />
            <el-input v-model="newCol.Comment" placeholder="注释" size="small" style="width:140px" />
          </div>
          <div class="new-col-actions">
            <el-button size="small" type="primary" @click="addColumn">保存</el-button>
            <el-button size="small" @click="showNewColumn = false">取消</el-button>
          </div>
        </div>

        <el-table :data="columns" stripe size="small" max-height="calc(100vh - 250px)" class="struct-table">
          <el-table-column type="index" width="36" />
          <el-table-column prop="Field" label="字段名" width="140" />
          <el-table-column prop="Type" label="类型" width="180" />
          <el-table-column prop="Collation" label="排序规则" width="120">
            <template #default="{ row }">
              <span v-if="!row.Collation" class="gray-text">—</span>
              <span v-else>{{ row.Collation }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="Null" label="允许空" width="70" />
          <el-table-column prop="Key" label="键" width="60" />
          <el-table-column prop="Default" label="默认值" width="140">
            <template #default="{ row }">
              <span v-if="row.Default === null" class="gray-text">NULL</span>
              <span v-else>{{ row.Default }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="Extra" label="额外" width="120" />
          <el-table-column prop="Comment" label="注释" min-width="180" />
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }">
              <el-button text size="small" type="primary" @click="openModify(row)">修改</el-button>
              <el-button text size="small" type="danger" @click="dropColumn(row.Field)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- Indexes Tab -->
      <el-tab-pane label="索引" name="indexes">
        <el-table :data="uniqueIndexKeys" stripe size="small" max-height="calc(100vh - 250px)" class="struct-table">
          <el-table-column prop="Key_name" label="索引名" width="160">
            <template #default="{ row }">
              <span v-if="row.Key_name === 'PRIMARY'" class="pk-badge">PRIMARY</span>
              <span v-else>{{ row.Key_name }}</span>
            </template>
          </el-table-column>
          <el-table-column label="包含字段" min-width="200">
            <template #default="{ row }">
              <span v-for="(idx) in indexes.filter(i => i.Key_name === row.Key_name).sort((a, b) => a.Seq_in_index - b.Seq_in_index)" :key="idx.Seq_in_index">
                <el-tag size="small" style="margin-right:4px">{{ idx.Column_name }}{{ idx.Sub_part ? `(${idx.Sub_part})` : '' }}</el-tag>
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="Non_unique" label="类型" width="80">
            <template #default="{ row }">
              {{ row.Non_unique ? '普通' : '唯一' }}
            </template>
          </el-table-column>
          <el-table-column prop="Index_type" label="索引类型" width="100" />
          <el-table-column prop="Cardinality" label="基数" width="80" />
          <el-table-column prop="Collation" label="排序" width="70" />
          <el-table-column label="操作" width="80" fixed="right">
            <template #default="{ row }">
              <el-button text size="small" type="danger" @click="dropIndex(row.Key_name)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- Foreign Keys Tab -->
      <el-tab-pane label="外键" name="foreign-keys">
        <el-empty v-if="!foreignKeys.length" description="没有外键约束" />
        <el-table v-else :data="foreignKeys" stripe size="small" max-height="calc(100vh - 250px)" class="struct-table">
          <el-table-column prop="CONSTRAINT_NAME" label="约束名" width="160" />
          <el-table-column prop="COLUMN_NAME" label="字段" width="140" />
          <el-table-column prop="REFERENCED_TABLE_NAME" label="引用表" width="140" />
          <el-table-column prop="REFERENCED_COLUMN_NAME" label="引用字段" width="140" />
          <el-table-column prop="UPDATE_RULE" label="更新规则" width="100" />
          <el-table-column prop="DELETE_RULE" label="删除规则" min-width="100" />
        </el-table>
      </el-tab-pane>

      <!-- Triggers Tab -->
      <el-tab-pane label="触发器" name="triggers">
        <el-empty v-if="!triggers.length" description="没有触发器" />
        <el-table v-else :data="triggers" stripe size="small" max-height="calc(100vh - 250px)" class="struct-table">
          <el-table-column prop="TRIGGER_NAME" label="触发器名" width="180" />
          <el-table-column prop="ACTION_TIMING" label="时机" width="80" />
          <el-table-column prop="EVENT_MANIPULATION" label="事件" width="80" />
          <el-table-column prop="ACTION_STATEMENT" label="语句" min-width="400" show-overflow-tooltip />
        </el-table>
      </el-tab-pane>

      <!-- DDL Tab -->
      <el-tab-pane label="DDL" name="ddl">
        <div class="ddl-header">
          <el-button size="small" @click="copyDdl">
            📋 复制 DDL
          </el-button>
        </div>
        <pre class="ddl-preview"><code>{{ ddl }}</code></pre>
      </el-tab-pane>
    </el-tabs>

    <!-- Modify Column Dialog -->
    <el-dialog v-model="showModifyCol" title="修改字段" width="500px">
      <el-form label-width="80px" size="small">
        <el-form-item label="字段名">
          <el-input v-model="modifyForm.Field" />
        </el-form-item>
        <el-form-item label="类型">
          <el-input v-model="modifyForm.Type" placeholder="例如 VARCHAR(255)" />
        </el-form-item>
        <el-form-item label="允许空">
          <el-select v-model="modifyForm.Null">
            <el-option label="是 (NULL)" value="YES" />
            <el-option label="否 (NOT NULL)" value="NO" />
          </el-select>
        </el-form-item>
        <el-form-item label="默认值">
          <el-input v-model="modifyForm.Default" placeholder="留空为 NULL" />
        </el-form-item>
        <el-form-item label="额外">
          <el-input v-model="modifyForm.Extra" placeholder="例如 auto_increment" />
        </el-form-item>
        <el-form-item label="注释">
          <el-input v-model="modifyForm.Comment" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showModifyCol = false">取消</el-button>
        <el-button type="primary" @click="saveModify">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts">
export default { name: 'TableStruct' }
</script>

<style scoped>
.struct-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f5f7fa;
}
.struct-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid #d9dce0;
  background: #fafafa;
}
.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.struct-title {
  font-weight: 600;
  font-size: 13px;
  color: #303133;
}
.struct-db {
  font-size: 11px;
  color: #909399;
  background: #e6e9ed;
  padding: 1px 6px;
  border-radius: 3px;
}
.toolbar-actions {
  display: flex;
  gap: 6px;
}
.struct-tabs {
  flex: 1;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.struct-tabs :deep(.el-tabs__header) {
  margin: 0;
  padding: 0 12px;
  background: #fafafa;
  border-bottom: 1px solid #d9dce0;
}
.struct-tabs :deep(.el-tabs__item) {
  height: 32px;
  line-height: 32px;
  font-size: 12px;
  color: #555;
}
.struct-tabs :deep(.el-tabs__item.is-active) {
  color: #409eff;
  font-weight: 600;
}
.struct-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: auto;
  padding: 8px 12px;
}
.struct-table :deep(th) {
  background: #e6e9ed !important;
  font-weight: 600;
  font-size: 11px !important;
  color: #333 !important;
}
.struct-table :deep(td) {
  font-size: 12px !important;
}

/* New Column Form */
.new-col-form {
  background: #eef1f6;
  border: 1px solid #d9dce0;
  border-radius: 4px;
  padding: 10px;
  margin-bottom: 8px;
}
.new-col-grid {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.new-col-actions {
  display: flex;
  gap: 6px;
}

/* DDL */
.ddl-header {
  margin-bottom: 8px;
}
.ddl-preview {
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 16px;
  border-radius: 4px;
  font-family: 'SF Mono', Menlo, monospace;
  font-size: 12px;
  overflow: auto;
  max-height: calc(100vh - 300px);
  white-space: pre;
  line-height: 1.6;
}
.ddl-preview code {
  display: block;
}
.pk-badge {
  background: #e6a23c;
  color: #fff;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 600;
}
.gray-text {
  color: #c0c4cc;
}
</style>
