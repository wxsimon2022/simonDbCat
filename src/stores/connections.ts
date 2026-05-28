import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '../api'
import type { ConnectionConfig } from '../types'

export const useConnectionStore = defineStore('connections', () => {
  const list = ref<ConnectionConfig[]>([])
  const currentId = ref<number | null>(null)
  const loading = ref(false)
  const currentDatabase = ref('')

  async function fetchAll() {
    loading.value = true
    try {
      list.value = await api.getConnections()
    } finally {
      loading.value = false
    }
  }

  async function create(data: Partial<ConnectionConfig>) {
    const conn = await api.createConnection(data)
    list.value.unshift(conn)
    return conn
  }

  async function update(id: number, data: Partial<ConnectionConfig>) {
    const conn = await api.updateConnection(id, data)
    const idx = list.value.findIndex(c => c.id === id)
    if (idx !== -1) list.value[idx] = conn
    return conn
  }

  async function remove(id: number) {
    await api.deleteConnection(id)
    list.value = list.value.filter(c => c.id !== id)
    if (currentId.value === id) currentId.value = null
  }

  async function test(data: Partial<ConnectionConfig>) {
    return api.testConnection(data)
  }

  function select(id: number) {
    currentId.value = id
  }

  function selectDatabase(db: string) {
    currentDatabase.value = db
  }

  return { list, currentId, currentDatabase, loading, fetchAll, create, update, remove, test, select, selectDatabase }
})
