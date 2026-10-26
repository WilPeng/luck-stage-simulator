<template>
  <div class="app-container dark" data-theme="dark">
    <ConfigProvider>
      <div>
        <router-view />
      </div>
    </ConfigProvider>
  </div>
</template>

<script setup lang="ts">
import { ConfigProvider } from 'tdesign-vue-next'
</script>

<style>
/* 全局基础样式 */
*, *::before, *::after {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
}

body {
  font-family: var(--bb-font-body, 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', sans-serif);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background:
    radial-gradient(1100px 620px at 78% 0%, rgba(96, 58, 160, 0.32) 0%, transparent 60%),
    radial-gradient(900px 520px at 8% 100%, rgba(64, 38, 128, 0.3) 0%, transparent 62%),
    linear-gradient(160deg, #160d29 0%, #1e1236 48%, #120a22 100%);
  background-attachment: fixed;
  color: var(--bb-text-primary, #ece7fb);
}

#app {
  width: 100%;
  height: 100%;
}

/* 滚动条美化 */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.3);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(128, 128, 128, 0.5);
}

a {
  text-decoration: none;
  color: inherit;
}
</style>
