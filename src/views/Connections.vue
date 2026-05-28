<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useConnectionStore } from '../stores/connections'
import type { ConnectionConfig } from '../types'

const router = useRouter()
const store = useConnectionStore()
const dialogVisible = ref(false)
const editing = ref(false)
const editingId = ref<number | null>(null)
const testing = ref(false)
const showPassword = ref(false)

const form = ref<Partial<ConnectionConfig>>({
  name: '',
  type: 'mysql',
  host: '127.0.0.1',
  port: 3306,
  username: 'root',
  password: '',
  database: '',
})

const rules = {
  name: [{ required: true, message: '请输入连接名称', trigger: 'blur' }],
  host: [{ required: true, message: '请输入主机地址', trigger: 'blur' }],
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
}

const formRef = ref()

onMounted(() => {
  store.fetchAll()
})

function openCreate() {
  editing.value = false
  editingId.value = null
  form.value = { name: '', type: 'mysql', host: '127.0.0.1', port: 3306, username: 'root', password: '', database: '' }
  dialogVisible.value = true
}

function openEdit(conn: ConnectionConfig) {
  editing.value = true
  editingId.value = conn.id!
  form.value = { ...conn }
  dialogVisible.value = true
}

async function handleSave() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  try {
    if (editing.value && editingId.value) {
      await store.update(editingId.value, form.value)
      ElMessage.success('更新成功')
    } else {
      await store.create(form.value)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || '操作失败')
  }
}

async function handleDelete(id: number, name: string) {
  try {
    await ElMessageBox.confirm(`确定删除连接「${name}」?`, '提示', { type: 'warning' })
    await store.remove(id)
    ElMessage.success('已删除')
  } catch {}
}

async function handleTest() {
  testing.value = true
  try {
    await store.test(form.value)
    ElMessage.success('连接成功 ✅')
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || '连接失败')
  } finally {
    testing.value = false
  }
}

function connect(conn: ConnectionConfig) {
  store.select(conn.id!)
  router.push(`/dashboard/${conn.id}`)
}

function getTypeIcon(type: string) {
  return type === 'mysql' ? '🐬' : '🗄️'
}
</script>

<template>
  <div class="connections-view">
    <div class="cv-header">
      <h2>数据库连接</h2>
      <el-button type="primary" size="small" @click="openCreate">+ 新建</el-button>
    </div>

    <div class="conn-list">
      <div
        v-for="conn in store.list"
        :key="conn.id"
        class="conn-card"
        @click="connect(conn)"
      >
        <div class="conn-card-left">
          <div class="conn-icon">{{ getTypeIcon(conn.type) }}</div>
        </div>
        <div class="conn-card-center">
          <div class="conn-name">{{ conn.name }}</div>
          <div class="conn-detail">{{ conn.host }}:{{ conn.port }}</div>
        </div>
        <div class="conn-card-right" @click.stop>
          <el-button text size="small" @click="openEdit(conn)">编辑</el-button>
          <el-button text size="small" type="danger" @click="handleDelete(conn.id!, conn.name)">删除</el-button>
        </div>
      </div>
    </div>

    <el-empty v-if="!store.list.length && !store.loading" description="暂无连接配置" />

    <el-dialog
      v-model="dialogVisible"
      :title="editing ? '编辑连接' : '新建连接'"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px" status-icon>
        <el-form-item label="连接名称" prop="name">
          <el-input v-model="form.name" placeholder="例如：本地测试库" />
        </el-form-item>
        <el-form-item label="数据库类型">
          <el-radio-group v-model="form.type">
            <el-radio value="mysql">MySQL</el-radio>
            <el-radio value="mariadb">MariaDB</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="16">
            <el-form-item label="主机地址" prop="host">
              <el-input v-model="form.host" placeholder="127.0.0.1" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="端口">
              <el-input v-model.number="form.port" type="number" min="1" max="65535" class="no-spinner" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" placeholder="root" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input
            v-model="form.password"
            :type="showPassword ? 'text' : 'password'"
            placeholder="输入密码"
          >
            <template #suffix>
              <span class="pwd-toggle" @click="showPassword = !showPassword">
                {{ showPassword ? '🙈' : '👁️' }}
              </span>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item label="默认数据库">
          <el-input v-model="form.database" placeholder="可选，留空显示所有库" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button :loading="testing" @click="handleTest">测试连接</el-button>
        <el-button type="primary" @click="handleSave">{{ editing ? '更新' : '创建' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.connections-view {
  padding: 0;
}
.cv-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.cv-header h2 {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}
.conn-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.conn-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}
.conn-card:hover {
  border-color: #409eff;
  box-shadow: 0 1px 4px rgba(64,158,255,0.12);
}
.conn-card-left {
  flex-shrink: 0;
}
.conn-icon {
  font-size: 24px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ecf5ff;
  border-radius: 8px;
}
.conn-card-center {
  flex: 1;
  min-width: 0;
}
.conn-name {
  font-weight: 600;
  font-size: 14px;
  color: #303133;
  margin-bottom: 2px;
}
.conn-detail {
  font-size: 11px;
  color: #909399;
}
.conn-card-right {
  flex-shrink: 0;
  display: flex;
  gap: 4px;
}
.pwd-toggle {
  cursor: pointer;
  font-size: 14px;
  user-select: none;
}
.no-spinner :deep(input::-webkit-outer-spin-button),
.no-spinner :deep(input::-webkit-inner-spin-button) {
  -webkit-appearance: none;
  margin: 0;
}
.no-spinner :deep(input[type="number"]) {
  -moz-appearance: textfield;
}
</style>
