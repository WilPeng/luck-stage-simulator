<template>
  <div ref="rootEl" class="notify-settings">
    <button
      type="button"
      class="notify-trigger"
      :class="{ active: notify.enabled }"
      :title="notify.enabled ? '提醒已开启，点击设置' : '提醒已关闭，点击开启'"
      @click="open = !open"
    >
      <span class="notify-icon">{{ notify.enabled ? '🔔' : '🔕' }}</span>
      <span class="notify-label">{{ notify.enabled ? '提醒已开启' : '提醒已关闭' }}</span>
      <span v-if="notify.enabled && notify.permission === 'default'" class="notify-dot"></span>
    </button>

    <div v-if="open" class="notify-popover" @click.stop>
      <div class="np-head">
        <span>🔔 消息提醒</span>
        <button type="button" class="np-close" @click="open = false">✕</button>
      </div>

      <div class="np-row">
        <div class="np-text">
          <div class="np-title">开启设备提醒</div>
          <div class="np-desc">房间有新消息、管理员召集比赛时，播放提示音并推送浏览器通知。</div>
        </div>
        <button
          type="button"
          class="np-switch"
          :class="{ on: notify.enabled }"
          role="switch"
          :aria-checked="notify.enabled"
          :aria-label="notify.enabled ? '关闭提醒' : '开启提醒'"
          @click="toggle"
        >
          <span></span>
        </button>
      </div>

      <div class="np-permission" :class="notify.permission">
        <span class="np-perm-dot"></span>
        <span>{{ permissionText }}</span>
      </div>

      <button
        v-if="notify.enabled && notify.permission === 'default'"
        type="button"
        class="np-btn np-btn-primary"
        @click="askPermission"
      >申请浏览器通知权限</button>

      <div class="np-sounds">
        <div class="np-sounds-head">
          <span>新消息提示音</span>
          <button type="button" class="np-preview-btn" @click="preview('message')">▶ 试听</button>
        </div>
        <div class="np-sound-list">
          <button
            v-for="opt in messageOptions"
            :key="opt.id"
            type="button"
            class="np-sound"
            :class="{ selected: notify.messageSound === opt.id }"
            @click="chooseSound('message', opt.id)"
          >
            <span class="np-radio"></span>
            <span class="np-sound-name">{{ opt.label }}</span>
            <span class="np-play">▶</span>
          </button>
        </div>
      </div>

      <div class="np-sounds">
        <div class="np-sounds-head">
          <span>比赛召集提示音</span>
          <button type="button" class="np-preview-btn" @click="preview('summon')">▶ 试听</button>
        </div>
        <div class="np-sound-list">
          <button
            v-for="opt in summonOptions"
            :key="opt.id"
            type="button"
            class="np-sound"
            :class="{ selected: notify.summonSound === opt.id }"
            @click="chooseSound('summon', opt.id)"
          >
            <span class="np-radio"></span>
            <span class="np-sound-name">{{ opt.label }}</span>
            <span class="np-play">▶</span>
          </button>
        </div>
      </div>

      <div class="np-tip">所选提示音保存在当前设备。关闭提醒后，将不再播放提示音，也不会推送浏览器通知。</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  MESSAGE_SOUND_OPTIONS,
  SUMMON_SOUND_OPTIONS,
  previewNotificationSound,
  refreshNotificationPermission,
  requestNotificationPermission,
  setNotificationSound,
  setNotificationsEnabled,
  useBbNotification,
  type BbNotificationSound
} from '../../../composables/useBbNotification'

const notify = useBbNotification()
const open = ref(false)
const rootEl = ref<HTMLElement | null>(null)
const messageOptions = MESSAGE_SOUND_OPTIONS
const summonOptions = SUMMON_SOUND_OPTIONS

const permissionText = computed(() => {
  switch (notify.permission) {
    case 'granted': return '浏览器通知：已允许'
    case 'denied': return '浏览器通知：已被拒绝，请在浏览器设置中允许'
    case 'unsupported': return '当前浏览器不支持系统通知（提示音仍可播放）'
    default: return '浏览器通知：尚未授权'
  }
})

async function toggle() {
  await setNotificationsEnabled(!notify.enabled)
}

async function askPermission() {
  await requestNotificationPermission()
}

function preview(kind: BbNotificationSound) {
  previewNotificationSound(kind)
}

function chooseSound(kind: BbNotificationSound, id: string) {
  setNotificationSound(kind, id)
}

function handleDocumentClick(event: MouseEvent) {
  if (!open.value) return
  if (rootEl.value && !rootEl.value.contains(event.target as Node)) open.value = false
}

onMounted(() => {
  refreshNotificationPermission()
  document.addEventListener('click', handleDocumentClick)
})

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick)
})
</script>

<style scoped>
.notify-settings { position: relative; }
.notify-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid #b39bff44;
  background: transparent;
  color: #8f83b8;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}
.notify-trigger:hover { background: #b39bff15; color: #b39bff; }
.notify-trigger.active { color: #e6c988; border-color: #e6c98866; background: #e6c98812; }
.notify-icon { font-size: 14px; line-height: 1; }
.notify-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ff6b6b;
  box-shadow: 0 0 0 3px #ff6b6b33;
  animation: np-pulse 1.8s infinite;
}
@keyframes np-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
.notify-popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 1200;
  width: 300px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 96px);
  overflow-y: auto;
  padding: 14px;
  background: linear-gradient(135deg, #2a1a4a, #1b1130);
  border: 1px solid #b39bff55;
  border-radius: 12px;
  box-shadow: 0 16px 40px #00000088;
  text-align: left;
}
.np-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #e6c988;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
}
.np-close {
  background: none;
  border: none;
  color: #8f83b8;
  cursor: pointer;
  font-size: 14px;
}
.np-row { display: flex; align-items: flex-start; gap: 12px; }
.np-text { flex: 1; min-width: 0; }
.np-title { color: #ece7fb; font-size: 13px; font-weight: 600; margin-bottom: 3px; }
.np-desc { color: #8f83b8; font-size: 11px; line-height: 1.5; }
.np-switch {
  flex: none;
  width: 42px;
  height: 24px;
  padding: 2px;
  border-radius: 999px;
  border: 1px solid #ffffff22;
  background: #ffffff10;
  cursor: pointer;
  transition: all 0.2s;
}
.np-switch span {
  display: block;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #8f83b8;
  transition: all 0.2s;
}
.np-switch.on { background: #e6c98844; border-color: #e6c98888; }
.np-switch.on span { transform: translateX(18px); background: #e6c988; }
.np-permission {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 12px 0;
  padding: 7px 9px;
  border-radius: 7px;
  background: #ffffff06;
  border: 1px solid #ffffff10;
  color: #a99bd0;
  font-size: 11px;
  line-height: 1.45;
}
.np-perm-dot {
  flex: none;
  width: 7px;
  height: 7px;
  margin-top: 3px;
  border-radius: 50%;
  background: #8f83b8;
}
.np-permission.granted { color: #8ee6b0; background: #22c55e14; border-color: #22c55e33; }
.np-permission.granted .np-perm-dot { background: #8ee6b0; }
.np-permission.denied { color: #ff9b9b; background: #ff444412; border-color: #ff444433; }
.np-permission.denied .np-perm-dot { background: #ff6b6b; }
.np-permission.default .np-perm-dot { background: #e6c988; }
.np-btn {
  width: 100%;
  padding: 7px 10px;
  border-radius: 7px;
  border: 1px solid #b39bff44;
  background: transparent;
  color: #b39bff;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}
.np-btn:hover { background: #b39bff18; }
.np-btn-primary { border-color: #e6c98866; color: #e6c988; }
.np-btn-primary:hover { background: #e6c98818; }
.np-sounds { margin-top: 14px; }
.np-sounds-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 7px;
  color: #cfc4ea;
  font-size: 12px;
  font-weight: 600;
}
.np-preview-btn {
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid #b39bff44;
  background: transparent;
  color: #b39bff;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.2s;
}
.np-preview-btn:hover { background: #b39bff18; }
.np-sound-list { display: flex; flex-direction: column; gap: 5px; }
.np-sound {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 9px;
  border-radius: 7px;
  border: 1px solid #ffffff12;
  background: #ffffff05;
  color: #a99bd0;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s;
}
.np-sound:hover { background: #b39bff12; border-color: #b39bff44; }
.np-sound.selected { background: #e6c98812; border-color: #e6c98866; color: #e6c988; }
.np-radio {
  flex: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid #6b5f92;
  transition: all 0.2s;
}
.np-sound.selected .np-radio {
  border-color: #e6c988;
  background: radial-gradient(circle, #e6c988 0 42%, transparent 46%);
}
.np-sound-name { flex: 1; min-width: 0; }
.np-play { flex: none; font-size: 9px; color: #7d6fa6; }
.np-sound.selected .np-play { color: #e6c988; }
.np-tip { margin-top: 12px; color: #6b5f92; font-size: 10px; line-height: 1.4; }

@media (max-width: 768px) {
  .notify-label { display: none; }
  .notify-trigger { padding: 6px 9px; }
  .notify-popover {
    position: fixed;
    top: 58px;
    right: 10px;
    left: 10px;
    width: auto;
    max-width: none;
    max-height: calc(100vh - 72px);
  }
}
</style>
