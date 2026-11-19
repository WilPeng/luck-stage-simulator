/**
 * BB 设备提醒（提示音 + 浏览器通知）
 *
 * - 设置在所有 BB 页面间共享，并持久化到 localStorage
 * - 音频需要用户手势解锁，首次点击/按键时会静默预加载
 * - 浏览器通知需要 Notification 权限，开启时向浏览器申请
 */
import { reactive } from 'vue'

export type BbNotificationSound = 'message' | 'summon'
export type BbNotificationPermission = 'granted' | 'denied' | 'default' | 'unsupported'

const STORAGE_KEY = 'bb:notifications-enabled'

const SOUND_PATHS: Record<BbNotificationSound, string> = {
  message: '/sounds/message-pop.mp3',
  summon: '/sounds/summon-announce.mp3'
}

const SOUND_VOLUMES: Record<BbNotificationSound, number> = {
  message: 0.7,
  summon: 0.7
}

function readEnabled(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw === null ? true : raw === '1'
  } catch {
    return true
  }
}

function currentPermission(): BbNotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  const p = Notification.permission
  if (p === 'granted' || p === 'denied') return p
  return 'default'
}

const state = reactive({
  enabled: readEnabled(),
  permission: currentPermission(),
  unlocked: false
})

const audios = new Map<BbNotificationSound, HTMLAudioElement>()
let unlockBound = false

function getAudio(kind: BbNotificationSound): HTMLAudioElement {
  let audio = audios.get(kind)
  if (!audio) {
    audio = new Audio(SOUND_PATHS[kind])
    audio.preload = 'auto'
    audio.volume = SOUND_VOLUMES[kind]
    audios.set(kind, audio)
  }
  return audio
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, state.enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function unlockAudioNow() {
  if (typeof window === 'undefined') return
  state.unlocked = true
  for (const kind of ['message', 'summon'] as const) {
    const audio = getAudio(kind)
    try {
      audio.muted = true
      const p = audio.play()
      if (p && typeof p.then === 'function') {
        p.then(() => {
          audio.pause()
          audio.currentTime = 0
          audio.muted = false
        }).catch(() => {
          audio.muted = false
        })
      } else {
        audio.muted = false
      }
    } catch {
      audio.muted = false
    }
  }
}

/**
 * 绑定一次全局用户手势，解锁浏览器音频自动播放限制。
 * 可在任意 BB 页面挂载时调用，重复调用无副作用。
 */
export function bindAudioUnlock() {
  if (unlockBound || typeof window === 'undefined') return
  unlockBound = true
  const unlock = () => {
    unlockAudioNow()
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
    window.removeEventListener('touchstart', unlock)
  }
  window.addEventListener('pointerdown', unlock, { once: true, passive: true })
  window.addEventListener('keydown', unlock, { once: true })
  window.addEventListener('touchstart', unlock, { once: true, passive: true })
  // 若登录页点击产生的用户激活仍有效，立即静默解锁一次
  unlockAudioNow()
}

/** 同步浏览器当前的 Notification 权限状态。 */
export function refreshNotificationPermission() {
  state.permission = currentPermission()
}

/** 向浏览器申请通知权限（必须在用户手势中调用）。 */
export async function requestNotificationPermission(): Promise<BbNotificationPermission> {
  state.permission = currentPermission()
  if (state.permission === 'unsupported' || state.permission === 'granted' || state.permission === 'denied') {
    return state.permission
  }
  try {
    const result = await Notification.requestPermission()
    state.permission = (result === 'granted' || result === 'denied') ? result : 'default'
  } catch {
    state.permission = currentPermission()
  }
  return state.permission
}

/** 开启/关闭设备提醒，开启时会顺手申请浏览器通知权限。 */
export async function setNotificationsEnabled(enabled: boolean): Promise<BbNotificationPermission> {
  state.enabled = enabled
  persist()
  if (!enabled) return state.permission
  bindAudioUnlock()
  unlockAudioNow()
  return requestNotificationPermission()
}

export function toggleNotifications(): Promise<BbNotificationPermission> | void {
  return setNotificationsEnabled(!state.enabled)
}

/** 播放提醒音效；提醒关闭时静默。 */
export function playNotificationSound(kind: BbNotificationSound) {
  if (!state.enabled || typeof window === 'undefined') return
  const audio = getAudio(kind)
  try {
    audio.currentTime = 0
    const p = audio.play()
    if (p && typeof p.catch === 'function') p.catch(() => { /* 浏览器未解锁时忽略 */ })
  } catch {
    /* ignore */
  }
}

/**
 * 发送系统级浏览器通知。
 * 页面可见时不重复弹通知（页面内已有提示），仅在后台/最小化时提醒。
 */
export function showBrowserNotification(title: string, body: string, tag = 'bb-notify') {
  if (!state.enabled || typeof window === 'undefined') return
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return
  try {
    const notification = new Notification(title, {
      body,
      tag,
      renotify: true
    } as NotificationOptions)
    notification.onclick = () => {
      try { window.focus() } catch { /* ignore */ }
      notification.close()
    }
  } catch {
    /* 移动端浏览器可能不支持直接构造 Notification */
  }
}

/** 共享的提醒设置状态。 */
export function useBbNotification() {
  return state
}
