/**
 * BB House 作息规则：睡眠时间窗 / 睡眠时长 / 洗澡冷却
 */

const DEFAULT_SLEEP_DURATION_MINUTES = 360
const DEFAULT_SLEEP_WINDOW_START = '22:00'
const DEFAULT_SLEEP_WINDOW_END = '02:00'
const DEFAULT_SHOWER_COOLDOWN_MINUTES = 30
const SHOWER_DURATION_MINUTES = 10

function pad2(n) {
  return String(n).padStart(2, '0')
}

function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function isValidHHMM(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function normalizeHHMM(value, fallback) {
  return isValidHHMM(value) ? value : fallback
}

function hhmmToMinutes(value, fallbackMinutes) {
  if (!isValidHHMM(value)) return fallbackMinutes
  const [h, m] = value.split(':').map(Number)
  return h * 60 + m
}

function clampInt(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function getSleepSettings(season) {
  const legacyHour = season?.autoSleepHour == null ? NaN : Number(season.autoSleepHour)
  const legacyStart = Number.isFinite(legacyHour)
    ? `${pad2(Math.min(23, Math.max(0, Math.round(legacyHour))))}:00`
    : DEFAULT_SLEEP_WINDOW_START
  return {
    sleepDurationMinutes: clampInt(season?.sleepDurationMinutes, 1, 1440, DEFAULT_SLEEP_DURATION_MINUTES),
    sleepWindowStart: normalizeHHMM(season?.sleepWindowStart, legacyStart),
    sleepWindowEnd: normalizeHHMM(season?.sleepWindowEnd, DEFAULT_SLEEP_WINDOW_END)
  }
}

function getShowerSettings(season) {
  return {
    showerCooldownMinutes: clampInt(season?.showerCooldownMinutes, 0, 1440, DEFAULT_SHOWER_COOLDOWN_MINUTES),
    showerDurationMinutes: SHOWER_DURATION_MINUTES
  }
}

/**
 * 计算包含 / 最近一次睡眠窗口。
 * 支持跨日期：如 22:00 - 02:00。
 */
function getSleepCycle(now = new Date(), windowStart, windowEnd) {
  const startMin = hhmmToMinutes(windowStart, 22 * 60)
  const endMin = hhmmToMinutes(windowEnd, 2 * 60)
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    Math.floor(startMin / 60),
    startMin % 60,
    0,
    0
  )
  if (now.getTime() < start.getTime()) {
    start.setDate(start.getDate() - 1)
  }

  const windowMinutes = ((endMin - startMin + 1440) % 1440) || 1440
  const end = new Date(start.getTime() + windowMinutes * 60 * 1000)

  return {
    cycleDate: localDateStr(start),
    startAt: start.getTime(),
    endAt: end.getTime(),
    windowMinutes
  }
}

/**
 * 当前睡眠状态。
 * completed: 本睡眠周期（以窗口开始日期计）是否已完成
 * inWindow: 当前是否处于可主动睡觉的时间范围
 * shouldForce: 已过窗口结束时间且本周期尚未完成 -> 应被动入睡
 */
function getSleepState(season, now = new Date(), lastSleepDate = null) {
  const settings = getSleepSettings(season)
  const cycle = getSleepCycle(now, settings.sleepWindowStart, settings.sleepWindowEnd)
  const nowTs = now.getTime()
  const completed = !!lastSleepDate && lastSleepDate === cycle.cycleDate
  const inWindow = nowTs >= cycle.startAt && nowTs < cycle.endAt
  const windowEnded = nowTs >= cycle.endAt

  return {
    ...cycle,
    ...settings,
    completed,
    inWindow,
    windowEnded,
    shouldForce: windowEnded && !completed
  }
}

function getShowerCooldownUntil(season, now = new Date()) {
  const { showerCooldownMinutes } = getShowerSettings(season)
  return new Date(now.getTime() + showerCooldownMinutes * 60 * 1000).toISOString()
}

module.exports = {
  DEFAULT_SLEEP_DURATION_MINUTES,
  DEFAULT_SLEEP_WINDOW_START,
  DEFAULT_SLEEP_WINDOW_END,
  DEFAULT_SHOWER_COOLDOWN_MINUTES,
  SHOWER_DURATION_MINUTES,
  localDateStr,
  isValidHHMM,
  normalizeHHMM,
  getSleepSettings,
  getShowerSettings,
  getSleepCycle,
  getSleepState,
  getShowerCooldownUntil
}
