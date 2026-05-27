<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { api } from '../api'
import type { TableData } from '../types'

const props = defineProps<{ connId: string; tableName: string }>()
const route = useRoute()

const data = ref<TableData | null>(null)
const loading = ref(false)

const connIdNum = computed(() => Number(props.connId))
const database = computed(() => (route.query.database as string) || undefined)

onMounted(async () => {
  await loadData()
})

async function loadData() {
  loading.value = true
  try {
    data.value = await api.getTableData(connIdNum.value, props.tableName, database.value)
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || '加载失败')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h2>{{ tableName }}</h2>
        <span class="meta" v-if="data">共 {{ data.total }} 条记录</span>
        <span class="meta" v-if="database"> · 库: {{ database }}</span>
      </div>
      <el-button @click="loadData" :loading="loading">刷新</el-button>
    </div>

    <div v-if="loading" style="text-align: center; padding: 60px">
      <el-icon class="is-loading" :size="32"><Loading /></el-icon>
    </div>

    <template v-else-if="data">
      <el-card shadow="never" class="schema-card">
        <template #header>
          <span>表结构</span>
        </template>
        <el-table :data="data.columns" size="small" stripe>
          <el-table-column prop="Field" label="字段" />
          <el-table-column prop="Type" label="类型" />
          <el-table-column prop="Null" label="允许空" width="80" />
          <el-table-column prop="Key" label="键" width="80" />
          <el-table-column prop="Default" label="默认值" />
          <el-table-column prop="Extra" label="额外" />
        </el-table>
      </el-card>

      <el-card shadow="never" style="margin-top: 16px">
        <template #header>
          <span>数据预览</span>
        </template>
        <el-table
          :data="data.rows"
          stripe
          border
          max-height="600"
          style="width: 100%"
        >
          <el-table-column
            v-for="col in data.columns"
            :key="col.Field"
            :prop="col.Field"
            :label="col.Field"
            :sortable="true"
            show-overflow-tooltip
          >
            <template #default="{ row }">
              <span v-if="row[col.Field] === null" class="null-value">NULL</span>
              <span v-else>{{ row[col.Field] }}</span>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </template>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}
.meta {
  font-size: 12px;
  color: #909399;
}
.schema-card {
  margin-bottom: 16px;
}
.null-value {
  color: #c0c4cc;
  font-style: italic;
}
</style>
