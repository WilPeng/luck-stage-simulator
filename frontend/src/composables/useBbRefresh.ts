import { onScopeDispose, watch } from 'vue'
import { useBbRealtimeStore } from '../stores/bbRealtimeStore'

/**
 * 订阅当前组件依赖的写操作路径。路径可以是完整的接口或一组接口的公共前缀。
 */
export function useBbRefresh(reload: () => void | Promise<void>, ...paths: string[]) {
  const rt = useBbRealtimeStore()
  let pending = false
  let running = false
  let disposed = false

  onScopeDispose(() => { disposed = true })
  watch(() => rt.updatedPaths, async (updates) => {
    if (!updates.some(update => paths.some(path => update === path || update.startsWith(path + '/')))) return
    pending = true
    if (running) return
    running = true
    while (pending && !disposed) {
      pending = false
      try { await reload() } catch (e) { console.error('BB realtime update failed:', e) }
    }
    running = false
  })
}
