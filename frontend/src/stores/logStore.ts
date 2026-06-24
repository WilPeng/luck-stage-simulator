import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { OperationLog } from '../types/log'
import { getLogs, addLogAPI } from '../services/api'

export const useLogStore = defineStore('log', () => {
  const logs = ref<OperationLog[]>([])

  async function fetchLogs(): Promise<void> {
    logs.value = await getLogs()
  }

  async function addLog(log: Omit<OperationLog, 'id' | 'createdAt'>): Promise<void> {
    await addLogAPI(log)
    await fetchLogs()
  }

  function getLogsByUserId(userId: string): OperationLog[] {
    return logs.value.filter(l => l.userId === userId)
  }

  function getRecentLogs(count: number = 10): OperationLog[] {
    return logs.value.slice(0, count)
  }

  return {
    logs,
    fetchLogs,
    addLog,
    getLogsByUserId,
    getRecentLogs
  }
})