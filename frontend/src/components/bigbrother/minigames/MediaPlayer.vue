<template>
  <div v-if="url" class="media-player">
    <div v-if="label" class="mp-label">{{ label }}</div>

    <template v-if="kind === 'video'">
      <!-- 统一播放一次：隐藏原生控件，禁止拖动/快进，播放结束后由父组件进入答题 -->
      <div v-if="onceLocked" class="mp-once">
        <video
          ref="videoEl"
          :src="url"
          class="mp-el"
          preload="auto"
          playsinline
          :autoplay="autoplay"
          :controls="false"
          disablePictureInPicture
          controlsList="nodownload noplaybackrate noremoteplayback"
          @loadedmetadata="onLoaded"
          @canplay="tryPlay"
          @play="onPlay"
          @pause="onPause"
          @ended="onEnded"
          @timeupdate="onTimeUpdate"
          @seeking="onSeeking"
          @error="onError"
          @contextmenu.prevent
          @click.prevent
          @keydown.prevent
        ></video>
        <div class="mp-shield" @click.prevent.stop @contextmenu.prevent></div>
        <div class="mp-overlay">
          <button v-if="needsGesture && !ended" class="mp-play-btn" @click.stop.prevent="startPlay">▶ 点击播放</button>
          <div v-else-if="loadError" class="mp-tip done">⚠️ 视频加载失败，已跳过播放</div>
          <div v-else-if="!ended" class="mp-tip">播放中 · 不可拖动进度条</div>
          <div v-else class="mp-tip done">✅ 播放完毕，自动进入答题</div>
        </div>
        <div class="mp-progress"><div class="mp-progress-fill" :style="{ width: progressPct + '%' }"></div></div>
      </div>

      <video
        v-else
        :src="url"
        class="mp-el"
        controls
        preload="metadata"
        playsinline
        :autoplay="autoplay"
      ></video>
    </template>

    <audio
      v-else
      :src="url"
      class="mp-el"
      controls
      preload="metadata"
      :autoplay="autoplay"
    ></audio>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'

interface MediaInfo {
  url?: string
  kind?: 'audio' | 'video'
  name?: string
  playMode?: 'once' | 'free'
}

const props = withDefaults(defineProps<{
  media?: MediaInfo | null
  label?: string
  autoplay?: boolean
}>(), {
  media: null,
  label: '',
  autoplay: false
})

const emit = defineEmits<{ (e: 'ended'): void }>()

const url = computed(() => {
  const u = props.media?.url || ''
  if (!u) return ''
  if (/^https?:\/\//.test(u)) return u
  const base = ((import.meta as any).env?.VITE_API_BASE || '').replace(/\/$/, '') || '/api'
  const root = base.replace(/\/api$/, '')
  return `${root}${u.startsWith('/') ? '' : '/'}${u}`
})

const kind = computed(() => props.media?.kind === 'video' ? 'video' : 'audio')
const onceLocked = computed(() => kind.value === 'video' && props.media?.playMode === 'once')

const videoEl = ref<HTMLVideoElement | null>(null)
const playing = ref(false)
const ended = ref(false)
const needsGesture = ref(false)
const loadError = ref(false)
const progressPct = ref(0)
let lastTime = 0
let resettingSeek = false

function resetOnceState() {
  playing.value = false
  ended.value = false
  needsGesture.value = false
  loadError.value = false
  progressPct.value = 0
  lastTime = 0
}

watch(onceLocked, (v) => {
  if (!v) return
  resetOnceState()
  nextTick(() => tryPlay())
})

watch(() => props.media?.url, () => {
  if (!onceLocked.value) return
  resetOnceState()
  nextTick(() => tryPlay())
})

function onLoaded() {
  if (onceLocked.value) tryPlay()
}

async function tryPlay() {
  const v = videoEl.value
  if (!v || ended.value) return
  try {
    await v.play()
    playing.value = true
    needsGesture.value = false
  } catch {
    // 浏览器自动播放策略可能拦截，需要选手点击一次开始播放
    needsGesture.value = true
    playing.value = false
  }
}

function startPlay() {
  tryPlay()
}

function onPlay() {
  playing.value = true
  needsGesture.value = false
}

function onPause() {
  if (!ended.value) playing.value = false
}

function onEnded() {
  ended.value = true
  playing.value = false
  progressPct.value = 100
  emit('ended')
}

function onError() {
  loadError.value = true
  ended.value = true
  playing.value = false
  needsGesture.value = false
  emit('ended')
}

function onTimeUpdate() {
  const v = videoEl.value
  if (!v) return
  if (v.duration && Number.isFinite(v.duration)) {
    progressPct.value = Math.min(100, Math.max(0, (v.currentTime / v.duration) * 100))
  }
  if (v.currentTime > lastTime) lastTime = v.currentTime
}

// 禁止任何拖动/快进：一旦检测到跳转，立即回到已播放到的位置
function onSeeking() {
  const v = videoEl.value
  if (!v || resettingSeek) return
  if (Math.abs(v.currentTime - lastTime) > 0.4) {
    resettingSeek = true
    try { v.currentTime = lastTime } catch { /* ignore */ }
    setTimeout(() => { resettingSeek = false }, 0)
  }
}
</script>

<style scoped>
.media-player { display: flex; flex-direction: column; gap: 6px; margin: 10px 0; }
.mp-label { font-size: 12px; color: #e6c988; word-break: break-all; }
.mp-el { width: 100%; max-height: 320px; border-radius: 8px; background: #000; }
audio.mp-el { background: transparent; }

.mp-once { position: relative; border-radius: 8px; overflow: hidden; background: #000; }
.mp-once .mp-el { display: block; }
.mp-shield { position: absolute; inset: 0; z-index: 2; background: transparent; }
.mp-overlay {
  position: absolute; inset: 0; z-index: 3;
  display: flex; align-items: center; justify-content: center;
  pointer-events: none;
}
.mp-play-btn {
  pointer-events: auto;
  padding: 12px 22px; border-radius: 999px; cursor: pointer;
  border: 1px solid #b39bff88; background: #17112acc; color: #e6e0ff;
  font-size: 15px; font-weight: 700; backdrop-filter: blur(6px);
}
.mp-play-btn:hover { background: #b39bff33; border-color: #b39bff; }
.mp-tip {
  padding: 6px 14px; border-radius: 999px; font-size: 12px;
  color: #e6e0ff; background: #00000088; border: 1px solid #ffffff22;
  backdrop-filter: blur(4px);
}
.mp-tip.done { color: #7ee0a0; border-color: #7ee0a055; }
.mp-progress {
  position: absolute; left: 0; right: 0; bottom: 0; height: 4px;
  background: #ffffff22; z-index: 4;
}
.mp-progress-fill { height: 100%; background: linear-gradient(90deg, #b39bff, #e6c988); transition: width 0.2s linear; }
</style>
