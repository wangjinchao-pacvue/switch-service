<template>
  <div id="app">
    <el-container>
      <el-header>
        <div class="header-content">
          <div class="app-brand">
            <img src="/logo.png" alt="Switch Service" class="brand-logo" />
            <h1>Switch Service</h1>
          </div>
        </div>
      </el-header>
      <el-main>
        <router-view />
      </el-main>
    </el-container>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useAppStore } from './stores/app'

const appStore = useAppStore()

onMounted(async () => {
  // 初始加载数据
  await Promise.all([
    appStore.fetchConfig(),
    appStore.fetchProxyServices()
  ])
})
</script>

<style scoped>
.header-content {
  display: flex;
  align-items: center;
  height: 100%;
}

.app-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-logo {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s ease;
}

.brand-logo:hover {
  transform: scale(1.05);
}

h1 {
  margin: 0;
  color: #409eff;
}
</style> 