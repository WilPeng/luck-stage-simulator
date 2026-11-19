/**
 * BB 设备提醒（提示音 + 浏览器通知）
 *
 * - 设置在所有 BB 页面间共享，并持久化到 localStorage
 * - 消息 / 召集提示音各有多个音效供选手自行选择
 * - 音频需要用户手势解锁，首次点击/按键时会静默预加载
 * - 浏览器通知需要 Notification 权限，开启时向浏览器申请
 */
import { reactive } from 'vue'

export type BbNotificationSound = 'message' | 'summon'
export type BbNotificationPermission = 'granted' | 'denied' | 'default' | 'unsupported'

export interface BbSoundOption {
  id: string
  label: string
  src: string
}

export const MESSAGE_SOUND_OPTIONS: BbSoundOption[] = [
  { id: 'pop', label: '轻快弹跳', src: '/sounds/message-pop.mp3' },
  { id: 'bell', label: '清脆铃声', src: '/sounds/message-bell.mp3' },
  { id: 'bubble', label: '气泡提示', src: '/sounds/message-bubble.mp3' },
  { id: 'positive', label: '愉悦提示', src: '/sounds/message-positive.mp3' }
]

export const SUMMON_SOUND_OPTIONS: BbSoundOption[] = [
  { id: 'announce', label: '清亮播报', src: '/sounds/summon-announce.mp3' },
  { id: 'alarm', label: '游戏警报', src: '/sounds/summon-alarm.mp3' },
  { id: 'tone', label: '游戏提示', src: '/sounds/summon-tone.mp3' }
]

const ENABLED_KEY = 'bb:notifications-enabled'
const MESSAGE_SOUND_KEY = 'bb:notification-sound-message'
const SUMMON_SOUND_KEY = 'bb:notification-sound-summon'

function soundOptions(kind: BbNotificationSound): BbSoundOption[] {
  return kind === 'message' ? MESSAGE_SOUND_OPTIONS : SUMMON_SOUND_OPTIONS
}

function readEnabled(): boolean {
  try {
    const raw = localStorage.getItem(ENABLED_KEY)
    return raw === null ? true : raw === '1'
  } catch {
    return true
  }
}

function readSound(kind: BbNotificationSound): string {
  const options = soundOptions(kind)
  try {
    const key = kind === 'message' ? MESSAGE_SOUND_KEY : SUMMON_SOUND_KEY
    const saved = localStorage.getItem(key)
    if (saved && options.some(o => o.id === saved)) return saved
  } catch {
    /* ignore */
  }
  return options[0].id
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
  messageSound: readSound('message'),
  summonSound: readSound('summon'),
  unlocked: false
})

const audios = new Map<string, HTMLAudioElement>()
let unlockBound = false

function getAudio(src: string): HTMLAudioElement {
  let audio = audios.get(src)
  if (!audio) {
    audio = new Audio(src)
    audio.preload = 'auto'
    audio.volume = 0.7
    audios.set(src, audio)
  }
  return audio
}

function selectedOption(kind: BbNotificationSound): BbSoundOption {
  const options = soundOptions(kind)
  const id = kind === 'message' ? state.messageSound : state.summonSound
  return options.find(o => o.id === id) || options[0]
}

function persistEnabled() {
  try {
    localStorage.setItem(ENABLED_KEY, state.enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function persistSound(kind: BbNotificationSound) {
  try {
    const key = kind === 'message' ? MESSAGE_SOUND_KEY : SUMMON_SOUND_KEY
    localStorage.setItem(key, kind === 'message' ? state.messageSound : state.summonSound)
  } catch {
    /* ignore */
  }
}

function primeAudio(src: string) {
  const audio = getAudio(src)
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

function unlockAudioNow() {
  if (typeof window === 'undefined') return
  state.unlocked = true
  primeAudio(selectedOption('message').src)
  primeAudio(selectedOption('summon').src)
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
  persistEnabled()
  if (!enabled) return state.permission
  bindAudioUnlock()
  unlockAudioNow()
  return requestNotificationPermission()
}

export function toggleNotifications(): Promise<BbNotificationPermission> | void {
  return setNotificationsEnabled(!state.enabled)
}

/**
 * 选择某一类提醒的提示音，并立即试听。
 * 即使提醒处于关闭状态也允许选择/试听。
 */
export function setNotificationSound(kind: BbNotificationSound, id: string) {
  const options = soundOptions(kind)
  if (!options.some(o => o.id === id)) return
  if (kind === 'message') state.messageSound = id
  else state.summonSound = id
  persistSound(kind)
  playNotificationSound(kind, true)
}

/** 播放提醒音效；提醒关闭时静默（force 用于设置面板试听）。 */
export function playNotificationSound(kind: BbNotificationSound, force = false) {
  if ((!state.enabled && !force) || typeof window === 'undefined') return
  const audio = getAudio(selectedOption(kind).src)
  try {
    audio.currentTime = 0
    const p = audio.play()
    if (p && typeof p.catch === 'function') p.catch(() => { /* 浏览器未解锁时忽略 */ })
  } catch {
    /* ignore */
  }
}

/** 试听某一类提醒当前选择的提示音。 */
export function previewNotificationSound(kind: BbNotificationSound) {
  playNotificationSound(kind, true)
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
