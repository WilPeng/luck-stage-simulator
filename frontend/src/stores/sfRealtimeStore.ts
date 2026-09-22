import { defineStore } from 'pinia'
import { ref } from 'vue'

// WebSocket 实时推送已停用（性能原因）。保留同名接口，调用点无需改动；
// 各页面改用原有轮询 / 手动刷新获取最新数据。
export const useSfRealtimeStore = defineStore('sfRealtime', () => {
  const tick = ref(0)
  const stageTick = ref(0)
  const seasonTick = ref(0)
  const lastPath = ref('')
  const connected = ref(false)

  function connect() {
    // 不再建立 socket 连接
  }

  function disconnect() {
    connected.value = false
  }

  return { tick, stageTick, seasonTick, lastPath, connected, connect, disconnect }
})
