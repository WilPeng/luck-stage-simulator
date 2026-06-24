<template>
  <div class="app-container">
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
  font-family: 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
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

/* 移除默认 a 标签样式 */
a {
  text-decoration: none;
  color: inherit;
}
</style>
