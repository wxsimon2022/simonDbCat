<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConnectionStore } from './stores/connections'

const router = useRouter()
const route = useRoute()
const store = useConnectionStore()
const drawer = ref(false)

store.fetchAll()

watch(() => route.path, () => {
  drawer.value = false
})
</script>

<template>
  <el-container class="app-container">
    <el-header class="app-header">
      <div class="header-left">
        <el-button text @click="drawer = !drawer" style="font-size: 20px; color: #fff">
          ☰
        </el-button>
        <span class="logo">simonDbCat</span>
        <span class="subtitle">数据库管理工具</span>
      </div>
      <div class="header-right">
        <el-tag v-if="store.currentId" type="success" effect="dark" size="small">
          {{ store.list.find(c => c.id === store.currentId)?.name || '已连接' }}
        </el-tag>
      </div>
    </el-header>

    <el-container>
      <el-drawer v-model="drawer" direction="ltr" size="240px" :with-header="false">
        <el-menu
          :default-active="route.path"
          @select="(idx: string) => router.push(idx)"
          style="border-right: none"
        >
          <el-menu-item index="/connections">
            <el-icon><connection /></el-icon>
            <span>数据库连接</span>
          </el-menu-item>
          <el-menu-item v-if="store.currentId" :index="`/dashboard/${store.currentId}`">
            <el-icon><data-board /></el-icon>
            <span>数据面板</span>
          </el-menu-item>
          <el-menu-item v-if="store.currentId" :index="`/query/${store.currentId}`">
            <el-icon><edit-pen /></el-icon>
            <span>SQL 查询</span>
          </el-menu-item>
        </el-menu>
      </el-drawer>

      <el-main class="app-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.app-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
}
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #409eff;
  color: #fff;
  padding: 0 20px;
  height: 50px;
  flex-shrink: 0;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.logo {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 1px;
}
.subtitle {
  font-size: 12px;
  opacity: 0.8;
}
.app-main {
  background: #f5f7fa;
  padding: 20px;
  overflow: auto;
}
</style>
