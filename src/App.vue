<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useConnectionStore } from './stores/connections'
import { useTabStore } from './stores/tabs'

const appVersion = __APP_VERSION__
import DbSidebar from './components/DbSidebar.vue'
import DataGrid from './components/DataGrid.vue'
import TableStruct from './components/TableStruct.vue'
import ConnectionsView from './views/Connections.vue'
import QueryView from './views/Query.vue'

const connStore = useConnectionStore()
const tabStore = useTabStore()

const sidebarWidth = ref(260)
const resizing = ref(false)
const showConnections = ref(false)

onMounted(() => {
  connStore.fetchAll()
})

function startResize(e: MouseEvent) {
  resizing.value = true
  const startX = e.clientX
  const startW = sidebarWidth.value
  const onMove = (ev: MouseEvent) => {
    const w = Math.max(180, Math.min(500, startW + (ev.clientX - startX)))
    sidebarWidth.value = w
  }
  const onUp = () => {
    resizing.value = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

function tabProps(tab: any) {
  return { connId: tab.connId, database: tab.database, table: tab.table }
}

function closeTab(id: string) {
  tabStore.close(id)
}

function openNewQuery() {
  // Use connection from active tab, currentId, or first available
  let connId: number | null = null
  if (tabStore.activeTab?.connId) {
    connId = tabStore.activeTab.connId
  } else if (connStore.currentId) {
    connId = connStore.currentId
  } else if (connStore.list.length > 0) {
    connId = connStore.list[0].id!
  }
  if (!connId) {
    showConnections.value = true
    return
  }
  tabStore.open({
    id: `query-${connId}-${Date.now()}`,
    title: '查询',
    type: 'query',
    connId: connId,
    database: '',
  })
}


</script>

<template>
  <div class="app-layout" :class="{ resizing }">
    <!-- Top Bar -->
    <div class="topbar">
      <div class="topbar-left">
        <img src="./assets/hero.png" class="topbar-icon" alt="logo" />
        <span class="topbar-logo">simonDbCat</span><span class="topbar-version">v{{ appVersion }}</span>
      </div>
      <div class="topbar-center">
        <div class="tab-bar-wrapper" v-if="tabStore.tabs.length">
          <div
            v-for="tab in tabStore.tabs"
            :key="tab.id"
            class="tab-item"
            :class="{ active: tab.id === tabStore.activeId }"
            @click="tabStore.activeId = tab.id"
          >
            <span class="tab-icon">
              <template v-if="tab.type === 'table-data'">📋</template>
              <template v-else-if="tab.type === 'table-struct'">🔧</template>
              <template v-else-if="tab.type === 'query'">📝</template>
            </span>
            <span class="tab-label">{{ tab.title }}</span>
            <span class="tab-close" @click.stop="closeTab(tab.id)">✕</span>
          </div>
        </div>
      </div>
      <div class="topbar-right">
        <el-button text size="small" class="topbar-btn" @click="openNewQuery">
          <span class="topbar-btn-icon">📝</span>
          <span>SQL 查询</span>
        </el-button>
        <el-button text size="small" class="topbar-btn" @click="showConnections = !showConnections">
          <span class="topbar-btn-icon">🔌</span>
          <span>连接管理</span>
        </el-button>
      </div>
    </div>

    <!-- Content -->
    <div class="main-area">
      <div class="sidebar-panel" :style="{ width: sidebarWidth + 'px' }">
        <DbSidebar />
      </div>
      <div
        class="resize-handle"
        @mousedown="startResize"
      />
      <div class="content-panel">
        <!-- No tab open -->
        <div v-if="!tabStore.activeTab" class="welcome">
          <div class="welcome-content">
            <div class="welcome-icon">🗄️</div>
            <h2>simonDbCat</h2>
            <span class="welcome-version">v{{ appVersion }}</span>
            <p class="welcome-desc">数据库管理与开发工具</p>
            <p class="welcome-hint">从左侧导航树选择数据库表以查看数据</p>
            <div class="welcome-actions">
              <el-button type="primary" @click="openNewQuery">📝 新建 SQL 查询</el-button>
              <el-button @click="showConnections = true">🔌 管理数据库连接</el-button>
            </div>
          </div>
        </div>

        <!-- Tab content -->
        <template v-else>
          <DataGrid
            v-if="tabStore.activeTab.type === 'table-data'"
            v-bind="tabProps(tabStore.activeTab)"
            :key="tabStore.activeTab.id"
          />
          <TableStruct
            v-else-if="tabStore.activeTab.type === 'table-struct'"
            v-bind="tabProps(tabStore.activeTab)"
            :key="tabStore.activeTab.id"
          />
          <QueryView
            v-else-if="tabStore.activeTab.type === 'query'"
            :connId="String(tabStore.activeTab.connId)"
            :initialSql="tabStore.activeTab.sql"
            :initialDb="tabStore.activeTab.database"
            :key="tabStore.activeTab.id"
          />
        </template>
      </div>
    </div>

    <!-- Connection Manager Drawer -->
    <el-drawer
      v-model="showConnections"
      title="数据库连接管理"
      size="420px"
      direction="rtl"
    >
      <ConnectionsView />
    </el-drawer>
  </div>
</template>

<script lang="ts">
export default { name: 'App' }
</script>

<style>
/* ====== Global Reset & Base ====== */
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #app { height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }

/* ====== App Layout ====== */
.app-layout {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f0f2f5;
}
.app-layout.resizing { cursor: col-resize; user-select: none; }

/* ====== Top Bar (Navicat Style) ====== */
.topbar {
  display: flex;
  align-items: center;
  height: 36px;
  background: #2c3e50;
  color: #fff;
  padding: 0 8px;
  gap: 8px;
  flex-shrink: 0;
  -webkit-app-region: drag;
}
.topbar-left {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}
.topbar-icon {
  width: 20px;
  height: 20px;
  border-radius: 3px;
}
.topbar-logo {
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.5px;
  color: #ecf0f1;
}
.topbar-version {
  font-size: 10px;
  color: rgba(255,255,255,0.5);
  margin-left: 4px;
}
.topbar-center {
  flex: 1;
  overflow: hidden;
  display: flex;
  align-items: center;
  -webkit-app-region: no-drag;
}
.topbar-right {
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}
.topbar-btn {
  color: rgba(255,255,255,0.85) !important;
  font-size: 12px;
}
.topbar-btn:hover {
  color: #fff !important;
  background: rgba(255,255,255,0.1) !important;
}
.topbar-btn-icon {
  margin-right: 4px;
}

/* ====== Tab Bar (Custom Tabs like Navicat) ====== */
.tab-bar-wrapper {
  display: flex;
  align-items: center;
  gap: 1px;
  height: 30px;
  padding-top: 4px;
  overflow-x: auto;
  overflow-y: hidden;
}
.tab-bar-wrapper::-webkit-scrollbar { height: 2px; }
.tab-bar-wrapper::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 1px; }

.tab-item {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 8px;
  font-size: 11px;
  color: rgba(255,255,255,0.6);
  background: rgba(255,255,255,0.08);
  border-radius: 3px 3px 0 0;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.12s;
  flex-shrink: 0;
  position: relative;
  user-select: none;
}
.tab-item:hover {
  color: rgba(255,255,255,0.9);
  background: rgba(255,255,255,0.15);
}
.tab-item.active {
  color: #fff;
  background: #f0f2f5;
  color: #303133;
}
.tab-item.active .tab-icon { opacity: 1; }
.tab-icon {
  font-size: 11px;
  opacity: 0.7;
}
.tab-label {
  font-size: 11px;
  font-weight: 500;
}
.tab-close {
  font-size: 10px;
  opacity: 0.4;
  margin-left: 2px;
  padding: 1px 3px;
  border-radius: 2px;
  line-height: 1;
}
.tab-close:hover {
  opacity: 1;
  background: rgba(0,0,0,0.15);
}
.tab-item.active .tab-close:hover {
  background: rgba(0,0,0,0.08);
}

/* ====== Main Area ====== */
.main-area {
  flex: 1;
  display: flex;
  overflow: hidden;
}
.sidebar-panel {
  flex-shrink: 0;
  overflow: hidden;
}
.resize-handle {
  width: 3px;
  cursor: col-resize;
  background: transparent;
  flex-shrink: 0;
  transition: background 0.12s;
  position: relative;
  z-index: 10;
}
.resize-handle:hover { background: #409eff; }
.content-panel {
  flex: 1;
  overflow: auto;
  background: #f0f2f5;
}

/* ====== Welcome Screen ====== */
.welcome {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: #f0f2f5;
}
.welcome-content {
  text-align: center;
  max-width: 400px;
}
.welcome-icon {
  font-size: 48px;
  margin-bottom: 12px;
}
.welcome-content h2 {
  font-size: 24px;
  margin-bottom: 2px;
  color: #303133;
  font-weight: 600;
}
.welcome-version {
  font-size: 12px;
  color: #909399;
  display: block;
  margin-bottom: 6px;
}
.welcome-desc {
  font-size: 13px;
  color: #606266;
  margin-bottom: 4px;
}
.welcome-hint {
  font-size: 12px;
  color: #909399;
  margin-bottom: 24px;
}
.welcome-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
}
</style>
