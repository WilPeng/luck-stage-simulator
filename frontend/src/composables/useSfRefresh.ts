import { watch } from 'vue'
import { useSfRealtimeStore } from '../stores/sfRealtimeStore'

/**
 * 订阅全局实时广播：任意与当前页面相关的写操作成功后触发回调（用于免刷新刷新）。
 *
 * @param fn 回调
 * @param matcher 可选：仅当被写入的接口路径匹配时才触发。支持字符串（includes）、正则、或函数。
 * @param delay 去抖毫秒数（默认 350ms），避免连续写入导致密集刷新。
 */
export function useSfRefresh(
  fn: () => void | Promise<void>,
  matcher?: string | RegExp | ((path: string) => boolean),
  delay = 350
) {
  const store = useSfRealtimeStore()

  const test = (path: string): boolean => {
    if (!matcher) return true
    if (typeof matcher === 'string') return path.includes(matcher)
    if (matcher instanceof RegExp) return matcher.test(path)
    return matcher(path)
  }

  let timer: number | undefined
  watch(() => store.tick, () => {
    if (!test(store.lastPath || '')) return
    if (timer) return
    timer = window.setTimeout(async () => {
      timer = undefined
      try {
        await fn()
      } catch {
        /* ignore */
      }
    }, delay)
  })
}
