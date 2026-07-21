<template>
  <div class="placeholder-page">
    <span class="placeholder-icon">📋</span>
    <h2 class="placeholder-title">该页面暂无内容</h2>
    <p class="placeholder-desc">请等待管理员开启该阶段</p>
  </div>
</template>

<style lang="scss" scoped>
.placeholder-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  color: var(--text-primary);
  gap: 16px;
}

.placeholder-icon {
  font-size: 64px;
}

.placeholder-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.placeholder-desc {
  margin: 0;
  color: var(--text-muted);
  font-size: 14px;
}
</style>
