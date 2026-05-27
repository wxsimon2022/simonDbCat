<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { api } from '../api'
import { useConnectionStore } from '../stores/connections'
import type { QueryResult, DbItem } from '../types'

const props = defineProps<{ connId: string }>()
const route = useRoute()
const store = useConnectionStore()

const connIdNum = computed(() => Number(props.connId))
const sql = ref('')
const result = ref<QueryResult | null>(null)
const running = ref(false)
const error = ref('')
const history = ref<string[]>([])
const databases = ref<DbItem[]>([])
const selectedDb = ref('')

onMounted(async () => {
  store.select(connIdNum.value)
  const sqlParam = route.query.sql as string
  if (sqlParam) sql.value = sqlParam
  await loadDatabases()
})

async function loadDatabases() {
  try {
    databases.value = await api.getSchemas(connIdNum.value)
  } catch {}
}

async function runQuery() {
  if (!sql.value.trim()) return
  running.value = true
  error.value = ''
  result.value = null
  try {
    result.value = await api.runQuery(connIdNum.value, sql.value, selectedDb.value || undefined)
    history.value.unshift(sql.value)
    if (history.value.length > 20) history.value.pop()
    ElMessage.success('查询完成')
  } catch (e: any) {
    error.value = e.response?.data?.error || e.message || '查询失败'
    ElMessage.error(error.value)
  } finally {
    running.value = false
  }
}

function clearResult() {
  result.value = null
  error.value = ''
}
</script>

<template>
  <div>
    <div class="page-header">
      <h2>SQL 查询</h2>
      <div class="header-actions">
        <el-select
          v-model="selectedDb"
          placeholder="选择数据库"
          clearable
          style="width: 180px"
          @change="() => {}"
        >
          <el-option
            v-for="db in databases"
            :key="db.name"
            :label="db.name"
            :value="db.name"
          />
        </el-select>
        <el-button @click="clearResult">清空结果</el-button>
        <el-button type="primary" :loading="running" @click="runQuery">
          ▶ 执行
        </el-button>
      </div>
    </div>

    <el-row :gutter="16">
      <el-col :span="24">
        <el-card shadow="never" class="sql-card">
          <el-input
            v-model="sql"
            type="textarea"
            :rows="8"
            placeholder="输入 SQL 语句，例如：SELECT * FROM users LIMIT 50"
            style="font-family: 'SF Mono', Menlo, monospace; font-size: 13px"
          />
          <div class="sql-tips">
            <el-tag size="small" @click="sql += ' LIMIT 100'" style="cursor: pointer">LIMIT 100</el-tag>
            <el-tag size="small" @click="sql = 'SHOW TABLES'" style="cursor: pointer">SHOW TABLES</el-tag>
            <el-tag size="small" @click="sql = 'SELECT COUNT(*) AS total FROM '" style="cursor: pointer">COUNT</el-tag>
          </div>
        </el-card>
      </el-col>

      <el-col :span="24" style="margin-top: 16px">
        <el-card shadow="never" v-if="error">
          <template #header>
            <span style="color: #f56c6c">错误</span>
          </template>
          <pre class="error-msg">{{ error }}</pre>
        </el-card>

        <el-card shadow="never" v-if="result">
          <template #header>
            <span>查询结果 ({{ result.rows.length }} 行)</span>
          </template>
          <el-table
            :data="result.rows"
            stripe
            border
            max-height="500"
            style="width: 100%"
          >
            <el-table-column
              v-for="col in result.columns"
              :key="col.Field"
              :prop="col.Field"
              :label="col.Field"
              show-overflow-tooltip
              min-width="120"
            >
              <template #default="{ row }">
                <span v-if="row[col.Field] === null" class="null-value">NULL</span>
                <span v-else>{{ row[col.Field] }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 8px;
}
.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.sql-card {
  margin-bottom: 16px;
}
.sql-tips {
  margin-top: 8px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.error-msg {
  color: #f56c6c;
  white-space: pre-wrap;
  font-family: 'SF Mono', Menlo, monospace;
  font-size: 13px;
}
.null-value {
  color: #c0c4cc;
  font-style: italic;
}
</style>
