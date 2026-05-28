import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface TabItem {
  id: string
  title: string
  type: 'table-data' | 'table-struct' | 'query'
  connId: number
  database: string
  table?: string
  sql?: string
}

export const useTabStore = defineStore('tabs', () => {
  const tabs = ref<TabItem[]>([])
  const activeId = ref<string | null>(null)

  const activeTab = computed(() => tabs.value.find(t => t.id === activeId.value))

  function open(tab: TabItem) {
    const exist = tabs.value.find(t => t.id === tab.id)
    if (exist) {
      activeId.value = tab.id
      return
    }
    tabs.value.push(tab)
    activeId.value = tab.id
  }

  function close(id: string) {
    const idx = tabs.value.findIndex(t => t.id === id)
    if (idx === -1) return
    tabs.value.splice(idx, 1)
    if (activeId.value === id) {
      activeId.value = tabs.value[idx]?.id || tabs.value[idx - 1]?.id || null
    }
  }

  function closeOther(id: string) {
    tabs.value = tabs.value.filter(t => t.id === id)
    activeId.value = id
  }

  function closeAll() {
    tabs.value = []
    activeId.value = null
  }

  return { tabs, activeId, activeTab, open, close, closeOther, closeAll }
})
