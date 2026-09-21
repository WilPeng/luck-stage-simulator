import { watch } from 'vue'
import { useSfRealtimeStore } from '../stores/sfRealtimeStore'

/**
 * 订阅全局实时广播：任意 /api/:gameId 写操作成功后触发回调（用于页面免刷新刷新）。
 */
export function useSfRefresh(fn: () => void | Promise<void>) {
  const store = useSfRealtimeStore()
  watch(() => store.tick, () => { fn() })
}
