import { watch } from 'vue'
import { useBbRealtimeStore } from '../stores/bbRealtimeStore'

/**
 * 订阅 BB 全局实时更新（bb:update），在任意 BB 写操作后自动重新加载数据。
 * 用法：useBbRefresh(loadData)
 */
export function useBbRefresh(reload: () => void | Promise<void>) {
  const rt = useBbRealtimeStore()
  watch(() => rt.tick, () => {
    try { reload() } catch (e) { /* ignore */ }
  })
}
