<template>
  <div class="rt-editor">
    <div class="rt-toolbar">
      <button type="button" title="加粗" @mousedown.prevent="cmd('bold')"><b>B</b></button>
      <button type="button" title="斜体" @mousedown.prevent="cmd('italic')"><i>I</i></button>
      <button type="button" title="下划线" @mousedown.prevent="cmd('underline')"><u>U</u></button>
      <button type="button" title="插入链接" @mousedown.prevent="insertLink">🔗 链接</button>
      <button type="button" title="插入图片" @mousedown.prevent="pickImage">🖼 图片</button>
      <input ref="fileInput" type="file" accept="image/*" class="rt-file" @change="onFile" />
      <span v-if="uploading" class="rt-uploading">图片上传中…</span>
    </div>
    <div
      ref="editor"
      class="rt-content"
      contenteditable="true"
      :data-placeholder="placeholder || '输入题目（支持加粗、图片、链接）'"
      @input="onInput"
      @blur="onInput"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { bbUploadGameImage } from '../../../services/bbApi'

const props = withDefaults(defineProps<{ modelValue: string; placeholder?: string }>(), {
  placeholder: '输入题目（支持加粗、图片、链接）'
})
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const editor = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)

function emitFromEditor() {
  if (editor.value) emit('update:modelValue', editor.value.innerHTML)
}

function cmd(command: string) {
  document.execCommand(command, false)
  emitFromEditor()
}

function insertLink() {
  const url = window.prompt('输入链接地址', 'https://')
  if (!url) return
  editor.value?.focus()
  document.execCommand('createLink', false, url)
  emitFromEditor()
}

function pickImage() {
  fileInput.value?.click()
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files && input.files[0]
  if (!file) return
  uploading.value = true
  try {
    const res = await bbUploadGameImage(file)
    editor.value?.focus()
    document.execCommand('insertHTML', false, `<img src="${res.url}" />`)
    emitFromEditor()
  } catch (err: any) {
    window.alert(err?.message || '图片上传失败')
  } finally {
    uploading.value = false
    input.value = ''
  }
}

function onInput() {
  emitFromEditor()
}

onMounted(() => {
  if (editor.value) editor.value.innerHTML = props.modelValue || ''
})

watch(() => props.modelValue, (v) => {
  if (editor.value && editor.value.innerHTML !== (v || '')) {
    editor.value.innerHTML = v || ''
  }
})
</script>

<style scoped>
.rt-editor { border: 1px solid #00ff8833; border-radius: 8px; overflow: hidden; background: #0a1a10; }
.rt-toolbar { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-bottom: 1px solid #00ff8822; flex-wrap: wrap; }
.rt-toolbar button { background: transparent; border: 1px solid #00ff8833; border-radius: 4px; color: #bdbdd8; padding: 3px 10px; cursor: pointer; font-size: 13px; }
.rt-toolbar button:hover { border-color: #00ff8866; color: #00ff88; }
.rt-file { display: none; }
.rt-uploading { color: #00ff88; font-size: 12px; }
.rt-content { min-height: 70px; max-height: 220px; overflow-y: auto; padding: 10px 12px; color: #e0e0e0; font-size: 14px; line-height: 1.5; outline: none; }
.rt-content:empty::before { content: attr(data-placeholder); color: #557; }
.rt-content :deep(img) { max-width: 100%; border-radius: 6px; margin: 6px 0; }
.rt-content :deep(a) { color: #4ea1ff; }
</style>
