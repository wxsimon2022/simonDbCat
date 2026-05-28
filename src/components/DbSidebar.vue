<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'
import { useConnectionStore } from '../stores/connections'
import { useTabStore } from '../stores/tabs'

interface TreeNode {
  id: string
  label: string
  type: 'connection' | 'database' | 'table'
  isLeaf?: boolean
  connId?: number
  database?: string
  table?: string
}

interface ContextMenu {
  visible: boolean
  x: number
  y: number
  node: TreeNode | null
  items: { label: string; icon: string; action: () => void; divider?: boolean }[]
}

const store = useConnectionStore()
const tabStore = useTabStore()
const treeData = ref<TreeNode[]>([])
const searchQuery = ref('')
const contextMenu = ref<ContextMenu>({ visible: false, x: 0, y: 0, node: null, items: [] })
const treeKey = ref(0) // force re-render on refresh

onMounted(async () => {
  if (!store.list.length) {
    try { await store.fetchAll() } catch {}
  }
  buildTree()
  document.addEventListener('click', closeContextMenu)
})
onUnmounted(() => document.removeEventListener('click', closeContextMenu))

function buildTree() {
  treeData.value = store.list.map(conn => ({
    id: `conn-${conn.id}`,
    label: conn.name || `连接 ${conn.id}`,
    type: 'connection' as const,
    connId: conn.id,
    isLeaf: false, // has children (databases)
  }))
}

async function loadNode(node: TreeNode, resolve: (children: TreeNode[]) => void) {
  try {
    if (node.type === 'connection') {
      const schemas = await api.getSchemas(node.connId!)
      resolve(schemas.map(db => ({
        id: `db-${node.connId}-${db.name}`,
        label: db.name,
        type: 'database' as const,
        connId: node.connId,
        database: db.name,
        isLeaf: false, // has tables
      })))
    } else if (node.type === 'database') {
      const tables = await api.getTables(node.connId!, node.database)
      resolve(tables.map(t => ({
        id: `table-${node.connId}-${node.database}-${t.name}`,
        label: t.name,
        type: 'table' as const,
        connId: node.connId,
        database: node.database,
        table: t.name,
        isLeaf: true, // leaf node
      })))
    } else {
      resolve([])
    }
  } catch (e: any) {
    console.error('loadNode error:', e)
    ElMessage.error(`加载 ${node.label} 失败: ${e.response?.data?.error || e.message}`)
    resolve([])
  }
}

function handleNodeClick(node: TreeNode) {
  if (node.type === 'table') {
    tabStore.open({
      id: `data-${node.connId}-${node.database}-${node.table}`,
      title: node.table!,
      type: 'table-data',
      connId: node.connId!,
      database: node.database!,
      table: node.table,
    })
  }
}

function handleNodeDblClick(node: TreeNode) {
  if (node.type === 'table') {
    tabStore.open({
      id: `struct-${node.connId}-${node.database}-${node.table}`,
      title: `${node.table} (结构)`,
      type: 'table-struct',
      connId: node.connId!,
      database: node.database!,
      table: node.table,
    })
  }
}

function closeContextMenu() { contextMenu.value.visible = false }

function getNodeIcon(node: TreeNode): string {
  switch (node.type) {
    case 'connection': return '🔗'
    case 'database': return '🗄️'
    case 'table': return '📄'
    default: return '📄'
  }
}

async function refreshTree() {
  treeData.value = []
  await store.fetchAll()
  treeKey.value++
  buildTree()
}

function handleContextMenu(node: TreeNode, event: MouseEvent) {
  event.preventDefault(); event.stopPropagation()
  const items: ContextMenu['items'] = []

  if (node.type === 'table') {
    items.push(
      { label: '打开表', icon: '📂', action: () => handleNodeClick(node) },
      { label: '设计表', icon: '🔧', action: () => handleNodeDblClick(node) },
      { label: '', icon: '', action: () => {}, divider: true },
      { label: '复制表名', icon: '📋', action: () => { navigator.clipboard.writeText(node.table!); ElMessage.success('已复制') } },
      { label: '复制表', icon: '📑', action: () => duplicateTable(node) },
      { label: '', icon: '', action: () => {}, divider: true },
      { label: '截断表', icon: '🗑️', action: () => truncateTable(node) },
      { label: '删除表', icon: '❌', action: () => dropTable(node) },
    )
  } else if (node.type === 'database') {
    items.push(
      { label: '新建查询', icon: '📝', action: () => openNewQuery(node) },
    )
  } else if (node.type === 'connection') {
    items.push(
      { label: '刷新', icon: '🔄', action: () => { treeKey.value++; buildTree() } },
    )
  }

  if (!items.length) return
  contextMenu.value = { visible: true, x: event.clientX, y: event.clientY, node, items }
}

async function duplicateTable(node: TreeNode) {
  const newName = `${node.table}_copy`
  try {
    await api.runQuery(node.connId!, `CREATE TABLE \`${newName}\` LIKE \`${node.table}\``, node.database!)
    await api.runQuery(node.connId!, `INSERT INTO \`${newName}\` SELECT * FROM \`${node.table}\``, node.database!)
    ElMessage.success(`已复制为「${newName}」`)
  } catch (e: any) { ElMessage.error(e.response?.data?.error || '复制失败') }
}

async function truncateTable(node: TreeNode) {
  try {
    await ElMessageBox.confirm(`截断表「${node.table}」?`, '危险操作', { type: 'warning', confirmButtonText: '截断' })
    await api.runQuery(node.connId!, `TRUNCATE TABLE \`${node.table}\``, node.database!)
    ElMessage.success('表已截断')
  } catch {}
}

async function dropTable(node: TreeNode) {
  try {
    await ElMessageBox.confirm(`删除表「${node.table}」?`, '删除确认', { type: 'warning' })
    await api.runQuery(node.connId!, `DROP TABLE \`${node.table}\``, node.database!)
    ElMessage.success('表已删除')
  } catch {}
}

function openNewQuery(node: TreeNode) {
  tabStore.open({
    id: `query-${node.connId}-${Date.now()}`, title: '查询',
    type: 'query', connId: node.connId!, database: node.database!,
  })
}

// Filter function
function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  return nodes.map(n => {
    const match = n.label.toLowerCase().includes(query)
    // For non-leaf nodes, we can't filter children in lazy mode
    // so just match the label
    return match ? { ...n } : null
  }).filter(Boolean) as TreeNode[]
}

function getFilteredData() {
  if (!searchQuery.value) return treeData.value
  return filterTree(treeData.value, searchQuery.value.toLowerCase())
}
</script>

<template>
  <div class="sidebar-container">
    <div class="sidebar-header">
      <span class="sidebar-title">数据库浏览器</span>
      <div class="sidebar-header-actions">
        <span class="conn-count">{{ store.list.length }} 连接</span>
        <el-tooltip content="刷新" placement="bottom">
          <el-button text size="small" @click="refreshTree" class="header-btn">🔄</el-button>
        </el-tooltip>
      </div>
    </div>
    <div class="sidebar-search">
      <el-input v-model="searchQuery" placeholder="筛选..." size="small" clearable prefix-icon="Search" />
    </div>
    <div class="sidebar-tree">
      <div v-if="!treeData.length && !store.loading" class="tree-empty">
        <p v-if="!store.list.length">暂无连接，请在「连接管理」中添加</p>
        <p v-else>加载中...</p>
      </div>
      <el-tree
        v-if="treeData.length"
        :key="treeKey"
        :data="getFilteredData()"
        node-key="id"
        :props="{ children: 'children', label: 'label', isLeaf: 'isLeaf' }"
        :load="loadNode"
        lazy
        highlight-current
        @node-click="handleNodeClick"
        @node-contextmenu="handleContextMenu"
      >
        <template #default="{ node, data }">
          <span class="tree-node" @dblclick.prevent="handleNodeDblClick(data)">
            <span class="tree-icon">{{ getNodeIcon(data) }}</span>
            <span class="tree-label">{{ node.label }}</span>
          </span>
        </template>
      </el-tree>
    </div>

    <teleport to="body">
      <div v-if="contextMenu.visible" class="context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }" @click.stop>
        <template v-for="(item, idx) in contextMenu.items" :key="idx">
          <div v-if="item.divider" class="ctx-divider" />
          <div v-else class="ctx-item" @click="item.action(); closeContextMenu()">
            <span class="ctx-icon">{{ item.icon }}</span>
            <span>{{ item.label }}</span>
          </div>
        </template>
      </div>
    </teleport>
  </div>
</template>

<style scoped>
.sidebar-container { height: 100%; display: flex; flex-direction: column; background: #f0f2f5; border-right: 1px solid #d9dce0; }
.sidebar-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #e6e9ed; border-bottom: 1px solid #d9dce0; }
.sidebar-header-actions { display: flex; align-items: center; gap: 6px; }
.sidebar-title { font-size: 11px; font-weight: 700; color: #555; text-transform: uppercase; letter-spacing: 0.5px; }
.conn-count { font-size: 10px; color: #909399; }
.header-btn { color: #666; font-size: 13px; }
.sidebar-search { padding: 6px 8px; background: #f0f2f5; }
.sidebar-search :deep(.el-input__wrapper) { background: #fff; box-shadow: none; border: 1px solid #d9dce0; border-radius: 3px; }
.sidebar-search :deep(.el-input__inner) { font-size: 12px; }
.sidebar-tree { flex: 1; overflow: auto; padding: 2px 0; }
.tree-empty { padding: 20px; text-align: center; color: #909399; font-size: 12px; }
:deep(.el-tree) { background: transparent; --el-tree-node-hover-bg-color: #e3e6ea; --el-tree-node-content-height: 26px; }
:deep(.el-tree-node__content) { padding: 0 6px; }
:deep(.el-tree-node__content:hover) { background: #e3e6ea; }
:deep(.el-tree-node.is-current > .el-tree-node__content) { background: #cde1f5; }
.tree-node { display: flex; align-items: center; gap: 4px; font-size: 12px; width: 100%; }
.tree-icon { flex-shrink: 0; font-size: 12px; }
.tree-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: #303133; }
.context-menu { position: fixed; z-index: 9999; min-width: 180px; background: #fff; border: 1px solid #d9dce0; border-radius: 4px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); padding: 4px 0; }
.ctx-item { display: flex; align-items: center; gap: 8px; padding: 6px 16px; font-size: 12px; color: #303133; cursor: pointer; }
.ctx-item:hover { background: #ecf5ff; color: #409eff; }
.ctx-icon { width: 16px; text-align: center; }
.ctx-divider { height: 1px; background: #e4e7ed; margin: 4px 8px; }
</style>
