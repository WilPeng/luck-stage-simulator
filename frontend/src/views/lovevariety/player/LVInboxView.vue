<template>
  <div class="lv-inbox">
    <div class="page-header">
      <h1>📪 收件箱</h1>
    </div>

    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="inbox.length === 0" class="empty-tip">暂无信件</div>
    <div v-else class="inbox-list">
      <div v-for="letter in inbox" :key="letter.id" class="letter-card">
        <div class="letter-from">
          <span class="from-label">发件人</span>
          <LvAvatar v-if="!letter.isAnonymous" :name="letter.senderName" :avatar="letter.senderAvatar" size="sm" />
          <LvAvatar v-else name="匿" size="sm" />
          <span class="from-value">{{ letter.isAnonymous ? '匿名' : letter.senderName }}</span>
          <span v-if="letter.isAnonymous" class="anon-badge">匿名</span>
        </div>
        <div class="letter-content">{{ letter.content }}</div>
        <div class="letter-meta">
          <span class="letter-time">{{ formatTime(letter.createdAt) }}</span>
          <span class="letter-round">第{{ letter.roundId?.replace('round-', '') || '?' }}轮</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { lvGetInbox } from '../../../services/lovevarietyApi'
import type { LVLetter } from '../../../types/lovevariety'
import LvAvatar from '../../../components/lovevariety/LvAvatar.vue'

const inbox = ref<LVLetter[]>([])
const loading = ref(true)

function formatTime(t: string): string {
  if (!t) return ''
  const d = new Date(t)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

onMounted(async () => {
  try {
    inbox.value = await lvGetInbox()
  } catch {}
  loading.value = false
})
</script>

<style scoped>
.lv-inbox { max-width: 600px; margin: 0 auto; }
.page-header { margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.loading { text-align: center; color: #888; padding: 40px; }
.empty-tip { text-align: center; color: #666; padding: 40px; }
.inbox-list { display: flex; flex-direction: column; gap: 10px; }
.letter-card {
  background: #1a0f2e; border: 1px solid #ff69b422; border-radius: 10px;
  padding: 16px 20px; transition: all 0.2s;
}
.letter-card:hover { border-color: #ff69b444; }
.letter-from { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.from-label { font-size: 11px; color: #888; }
.from-value { font-size: 14px; font-weight: 600; color: #e0e0e0; }
.anon-badge { background: #ffaa0022; color: #ffaa00; font-size: 10px; padding: 1px 6px; border-radius: 6px; border: 1px solid #ffaa0044; }
.letter-content {
  font-size: 14px; color: #ccc; line-height: 1.6;
  padding: 10px 12px; background: #0a0a1a; border-radius: 6px; margin-bottom: 8px;
}
.letter-meta { display: flex; justify-content: space-between; font-size: 11px; color: #555; }
</style>
