<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { api } from '../api'
import { useConnectionStore } from '../stores/connections'
import type { DbItem } from '../types'

const props = defineProps<{ connId: string }>()
const router = useRouter()
const store = useConnectionStore()

const tables = ref<DbItem[]>([])
const schemas = ref<DbItem[]>([])
const loading = ref(false)
const loadingSchemas = ref(false)
const search = ref('')
const selectedDb = ref('')

const connIdNum = computed(() => Number(props.connId))
const currentConn = computed(() => store.list.find(c => c.id === connIdNum.value))
const filteredTables = computed(() =>
  tables.value.filter(t => t.name.toLowerCase().includes(search.value.toLowerCase()))
)

onMounted(async () => {
  store.select(connIdNum.value)
  // 等 store 加载完再获取 schemas
  if (!store.list.length) {
    await store.fetchAll()
  }
  await loadSchemas()
  // 自动选中默认库
  if (currentConn.value?.database && schemas.value.some(s => s.name === currentConn.value!.database)) {
    selectedDb.value = currentConn.value.database
    await loadTables()
  }
})

async function loadSchemas() {
  loadingSchemas.value = true
  try {
    schemas.value = await api.getSchemas(connIdNum.value)
  } catch (e: any) {
    ElMessage.error('获取数据库列表失败: ' + (e.response?.data?.error || e.message))
  } finally {
    loadingSchemas.value = false
  }
}

async function onDbChange(db: string) {
  selectedDb.value = db
  if (db) {
    await loadTables()
  } else {
    tables.value = []
  }
}

async function loadTables() {
  if (!selectedDb.value) return
  loading.value = true
  try {
    tables.value = await api.getTables(connIdNum.value, selectedDb.value)
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || '加载表列表失败')
  } finally {
    loading.value = false
  }
}

async function handleRefresh() {
  if (selectedDb.value) {
    await loadTables()
  } else {
    await loadSchemas()
  }
}

function viewTable(table: string) {
  const dbQ = `?database=${encodeURIComponent(selectedDb.value)}`
  router.push(`/table/${props.connId}/${encodeURIComponent(table)}${dbQ}`)
}

function openQuery(table?: string) {
  const dbQ = `database=${encodeURIComponent(selectedDb.value)}`
  const path = table
    ? `/query/${props.connId}?sql=${encodeURIComponent(`SELECT * FROM \`${table}\` LIMIT 100`)}&${dbQ}`
    : `/query/${props.connId}?${dbQ}`
  router.push(path)
}
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h2>{{ currentConn?.name || '数据面板' }}</h2>
        <span class="conn-badge">{{ currentConn?.host }}:{{ currentConn?.port }}</span>
      </div>
      <div class="header-actions">
        <el-select
          v-model="selectedDb"
          placeholder="选择数据库"
          style="width: 200px"
          clearable
          :loading="loadingSchemas"
          @change="onDbChange"
        >
          <el-option
            v-for="db in schemas"
            :key="db.name"
            :label="db.name"
            :value="db.name"
          />
        </el-select>
        <el-button @click="handleRefresh" :loading="loading">刷新</el-button>
        <el-button type="primary" @click="openQuery()" :disabled="!selectedDb">SQL 查询</el-button>
      </div>
    </div>

    <div class="stats-row">
      <el-card shadow="never">
        <div class="stat-item">
          <div class="stat-num">{{ tables.length }}</div>
          <div class="stat-label">数据表</div>
        </div>
      </el-card>
      <el-card shadow="never">
        <div class="stat-item">
          <div class="stat-num">{{ schemas.length }}</div>
          <div class="stat-label">数据库</div>
        </div>
      </el-card>
    </div>

    <el-card shadow="never" class="table-section">
      <template #header>
        <div class="card-header">
          <span>数据表</span>
          <el-input
            v-model="search"
            placeholder="搜索表名..."
            clearable
            style="width: 240px"
            size="small"
            prefix-icon="Search"
          />
        </div>
      </template>

      <div v-if="!selectedDb" style="text-align:center;padding:40px;color:#909399">
        请先在上方选择一个数据库
      </div>

      <div v-else-if="loading" style="text-align: center; padding: 40px">
        <el-icon class="is-loading" :size="32"><Loading /></el-icon>
      </div>

      <el-table
        v-else
        :data="filteredTables"
        stripe
        @row-click="(row: any) => viewTable(row.name)"
        style="cursor: pointer"
      >
        <el-table-column prop="name" label="表名" />
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-button text size="small" @click.stop="viewTable(row.name)">查看数据</el-button>
            <el-button text size="small" @click.stop="openQuery(row.name)">查询</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!loading && selectedDb && !filteredTables.length" description="没有找到表" />
    </el-card>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 8px;
}
.conn-badge {
  font-size: 12px;
  color: #909399;
}
.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.stats-row {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
}
.stat-item {
  text-align: center;
  min-width: 120px;
}
.stat-num {
  font-size: 28px;
  font-weight: 700;
  color: #409eff;
}
.stat-label {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}
.table-section {
  margin-bottom: 20px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
