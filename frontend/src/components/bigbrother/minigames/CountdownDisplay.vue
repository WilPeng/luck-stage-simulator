<template>
  <span class="cd-display"><span class="cd-int">{{ intPart }}</span><span class="cd-dot">.</span><span class="cd-dec">{{ decPart }}</span></span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ value: number | string }>()

const parts = computed(() => {
  const n = Math.max(0, Number(props.value) || 0)
  const [i, d] = n.toFixed(1).split('.')
  return { i, d }
})

const intPart = computed(() => parts.value.i)
const decPart = computed(() => parts.value.d)
</script>

<style scoped>
.cd-display { display: inline-flex; align-items: baseline; }
.cd-dot { font-size: 1em; }
.cd-dec { font-size: 0.72em; }
</style>
