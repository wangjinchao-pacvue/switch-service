<template>
  <div id="app">
    <n-config-provider :theme="themeConfig" :theme-overrides="themeOverrides">
      <n-message-provider>
        <n-layout class="app-layout" has-sider>
          <!-- 左侧导航栏 -->
          <n-layout-sider 
            bordered 
            :width="240" 
            :collapsed-width="64"
            :collapsed="collapsed"
            show-trigger
            @collapse="collapsed = true"
            @expand="collapsed = false"
            class="sidebar"
            :data-collapsed="collapsed"
          >
            <div class="sidebar-header">
              <div class="app-brand">
                <img src="/logo.png" alt="Switch Service" class="brand-logo" />
                <h1 v-show="!collapsed">Switch Service</h1>
              </div>
            </div>
            
            <n-menu
              v-model:value="activeMenu"
              :collapsed="collapsed"
              :collapsed-width="64"
              :collapsed-icon-size="22"
              :options="menuOptions"
              @update:value="handleMenuSelect"
              class="sidebar-menu"
            />
          </n-layout-sider>

          <!-- 右侧主内容区 -->
          <n-layout>
            <!-- 顶部栏 -->
            <n-layout-header bordered class="header">
              <div class="header-content">
                <div class="header-title">
                  <h2>{{ currentPageTitle }}</h2>
                </div>
                <div class="header-actions">
                  <!-- 导入导出按钮组 -->
                  <n-tooltip>
                    <template #trigger>
                      <n-button 
                        text
                        @click="exportConfig"
                        :loading="appStore.loading"
                        size="large"
                      >
                        <template #icon>
                          <n-icon size="18"><DownloadIcon /></n-icon>
                        </template>
                      </n-button>
                    </template>
                    导出配置文件
                  </n-tooltip>
                  
                  <n-tooltip 
                    :disabled="!hasRunningServices"
                  >
                    <template #trigger>
                      <n-button 
                        text
                        @click="triggerImport"
                        :loading="appStore.loading"
                        :disabled="hasRunningServices"
                        size="large"
                      >
                        <template #icon>
                          <n-icon size="18"><UploadIcon /></n-icon>
                        </template>
                      </n-button>
                    </template>
                    {{ hasRunningServices ? `有 ${runningServicesCount} 个服务正在运行，需要先停止所有服务` : '导入配置文件' }}
                  </n-tooltip>

                  <!-- 主题切换按钮 -->
                  <n-tooltip :delay="500">
                    <template #trigger>
                      <n-button 
                        text 
                        @click="appStore.toggleTheme()"
                        class="theme-toggle"
                        size="large"
                      >
                        <template #icon>
                          <n-icon size="20">
                            <component :is="appStore.theme === 'light' ? MoonIcon : SunnyIcon" />
                          </n-icon>
                        </template>
                      </n-button>
                    </template>
                    {{ appStore.theme === 'light' ? '切换到暗色模式' : '切换到亮色模式' }}
                  </n-tooltip>

                  <!-- 隐藏的文件输入 -->
                  <input 
                    ref="fileInputRef" 
                    type="file" 
                    accept=".json" 
                    @change="handleFileImport" 
                    style="display: none;" 
                  />
                </div>
              </div>
            </n-layout-header>

            <!-- 主内容区 -->
            <n-layout-content class="content">
              <router-view />
            </n-layout-content>
          </n-layout>
        </n-layout>
      </n-message-provider>
    </n-config-provider>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, h } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from './stores/app'
import { 
  NConfigProvider, NMessageProvider, NLayout, NLayoutSider, NLayoutHeader, 
  NLayoutContent, NMenu, NButton, NTooltip, NIcon, NButtonGroup, darkTheme
} from 'naive-ui'
import { SettingsOutline, MoonOutline, SunnyOutline, LocationOutline, DownloadOutline, CloudUploadOutline } from '@vicons/ionicons5'

// 创建图标组件
const SettingIcon = () => h(SettingsOutline)
const MoonIcon = () => h(MoonOutline)
const SunnyIcon = () => h(SunnyOutline)
const PositionIcon = () => h(LocationOutline)
const DownloadIcon = () => h(DownloadOutline)
const UploadIcon = () => h(CloudUploadOutline)

const appStore = useAppStore()
const route = useRoute()
const router = useRouter()

// 响应式数据
const collapsed = ref(false)
const activeMenu = ref('service-management')
const fileInputRef = ref(null)

// 主题配置
const isDark = computed(() => appStore.isDark)
const themeConfig = computed(() => {
  return isDark.value ? darkTheme : null
})

const themeOverrides = computed(() => {
  if (isDark.value) {
    // 暗色主题 - 深蓝色调
    return {
      common: {
        primaryColor: '#4A9EFF',
        primaryColorHover: '#6BB0FF', 
        primaryColorPressed: '#3A8EEF',
        primaryColorSuppl: 'rgba(74, 158, 255, 0.1)',
        successColor: '#52C41A',
        successColorHover: '#73D13D',
        successColorPressed: '#389E0D',
        warningColor: '#FAAD14',
        warningColorHover: '#FFEC3D',
        warningColorPressed: '#D48806',
        errorColor: '#FF4D4F',
        errorColorHover: '#FF7875',
        errorColorPressed: '#D9363E',
        infoColor: '#1890FF',
        infoColorHover: '#40A9FF',
        infoColorPressed: '#096DD9',
        bodyColor: '#0F1419',
        cardColor: '#1A1F29',
        popoverColor: '#1F242E',
        borderColor: '#2A2F3A',
        textColorBase: '#E8EDF3',
        textColor1: '#F2F7FC',
        textColor2: '#E8EDF3',
        textColor3: '#9CA3AF'
      },
      Layout: {
        siderColor: '#1A1F29',
        headerColor: '#1A1F29'
      },
      Menu: {
        itemTextColor: '#E8EDF3',
        itemTextColorActive: '#FFFFFF',
        itemTextColorHover: '#FFFFFF',
        itemColorActive: '#4A9EFF',
        itemColorHover: '#242934'
      }
    }
  } else {
    // 亮色主题 - 柔和蓝色调，匹配logo
    return {
      common: {
        primaryColor: '#2E86DE',
        primaryColorHover: '#54A0FF',
        primaryColorPressed: '#1E3A8A',
        primaryColorSuppl: 'rgba(46, 134, 222, 0.1)',
        successColor: '#10B981',
        successColorHover: '#34D399',
        successColorPressed: '#059669',
        warningColor: '#F59E0B',
        warningColorHover: '#FCD34D',
        warningColorPressed: '#D97706',
        errorColor: '#EF4444',
        errorColorHover: '#F87171',
        errorColorPressed: '#DC2626',
        infoColor: '#3B82F6',
        infoColorHover: '#60A5FA',
        infoColorPressed: '#1D4ED8',
        bodyColor: '#FAFBFC',
        cardColor: '#FFFFFF',
        popoverColor: '#FFFFFF',
        borderColor: '#E5E7EB',
        textColorBase: '#1F2937',
        textColor1: '#111827',
        textColor2: '#374151',
        textColor3: '#6B7280'
      },
      Layout: {
        siderColor: '#FFFFFF',
        headerColor: '#FFFFFF'
      },
      Menu: {
        itemTextColor: '#374151',
        itemTextColorActive: '#FFFFFF',
        itemTextColorHover: '#1F2937',
        itemColorActive: '#2E86DE',
        itemColorHover: '#F3F4F6'
      }
    }
  }
})

// 菜单选项
const menuOptions = computed(() => [
  {
    label: '服务管理',
    key: 'service-management',
    icon: SettingIcon
  },
  {
    label: '接口调试',
    key: 'api-debugger',
    icon: PositionIcon
  }
])

// 页面标题映射
const pageTitleMap = {
  'service-management': '服务管理',
  'api-debugger': '接口调试'
}

// 当前页面标题
const currentPageTitle = computed(() => {
  return pageTitleMap[activeMenu.value] || '服务管理'
})

// 处理菜单选择
const handleMenuSelect = (key) => {
  activeMenu.value = key
  
  switch (key) {
    case 'service-management':
      router.push('/')
      break
    case 'api-debugger':
      router.push('/api-debugger')
      break
    default:
      router.push('/')
  }
}

// 导入导出功能
const exportConfig = async () => {
  try {
    await appStore.exportConfig()
  } catch (error) {
    console.error('导出配置失败:', error)
  }
}

const triggerImport = () => {
  if (hasRunningServices.value) {
    return
  }
  fileInputRef.value?.click()
}

const handleFileImport = async (event) => {
  const file = event.target.files[0]
  if (!file) return
  
  try {
    await appStore.importConfig(file)
    // 清空文件输入
    event.target.value = ''
  } catch (error) {
    console.error('导入配置失败:', error)
    event.target.value = ''
  }
}

// 计算属性：是否有运行中的服务
const hasRunningServices = computed(() => {
  return appStore.proxyServices?.some(service => service.isRunning) || false
})

const runningServicesCount = computed(() => {
  return appStore.proxyServices?.filter(service => service.isRunning).length || 0
})

onMounted(async () => {
  // 根据当前路由设置激活菜单
  if (route.path === '/') {
    activeMenu.value = 'service-management'
  } else if (route.path === '/api-debugger') {
    activeMenu.value = 'api-debugger'
  }
  
  // 初始加载数据
  await Promise.all([
    appStore.fetchConfig(),
    appStore.fetchProxyServices()
  ])
})
</script>

<style>
/* 全局CSS变量定义 - 蓝色主题系统 */
:root {
  /* 亮色主题变量 - 柔和蓝色调 */
  --bg-color: #ffffff;
  --bg-color-page: #fafbfc;
  --bg-color-soft: #f8fafc;
  --bg-color-secondary: #f1f5f9;
  --bg-color-tertiary: #f8fafc;
  --text-color: #1f2937;
  --text-color-primary: #111827;
  --text-color-secondary: #374151;
  --text-color-tertiary: #6b7280;
  --border-color: #e5e7eb;
  --border-color-light: #f3f4f6;
  --border-color-lighter: #f9fafb;
  --shadow-color: rgba(0, 0, 0, 0.08);
  --shadow-color-light: rgba(0, 0, 0, 0.04);
  --card-bg: #ffffff;
  --header-bg: #ffffff;
  --input-bg: #ffffff;
  --button-bg: #ffffff;
  --hover-bg: #f8fafc;
  --active-bg: rgba(46, 134, 222, 0.1);
  --primary-color: #2e86de;
  --primary-hover: #54a0ff;
  --primary-active: #1e3a8a;
}

/* 暗色主题变量 - 深蓝色调 */
html.dark {
  --bg-color: #0f1419;
  --bg-color-page: #0a0e13;
  --bg-color-soft: #1a1f29;
  --bg-color-secondary: #1f242e;
  --bg-color-tertiary: #242934;
  --text-color: #e8edf3;
  --text-color-primary: #f2f7fc;
  --text-color-secondary: #9ca3af;
  --text-color-tertiary: #6b7280;
  --border-color: #2a2f3a;
  --border-color-light: #1f242e;
  --border-color-lighter: #1a1f29;
  --shadow-color: rgba(0, 0, 0, 0.6);
  --shadow-color-light: rgba(0, 0, 0, 0.3);
  --card-bg: #1a1f29;
  --header-bg: #1a1f29;
  --input-bg: #1f242e;
  --button-bg: #1f242e;
  --hover-bg: #242934;
  --active-bg: rgba(74, 158, 255, 0.15);
  --primary-color: #4a9eff;
  --primary-hover: #6bb0ff;
  --primary-active: #3a8eef;
}

/* 全局字体设置 */
* {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* 代码字体 */
code, pre, .code, .monospace {
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', 'Monaco', 'Courier New', monospace !important;
  font-feature-settings: 'liga' 1, 'calt' 1;
}

/* 全局样式应用变量 */
body {
  background-color: var(--bg-color);
  color: var(--text-color);
  transition: background-color 0.3s ease, color 0.3s ease;
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
  padding: 0;
}

/* 全局强制覆盖NaiveUI收起状态样式 */
.n-layout-sider--collapsed .n-menu--collapsed .n-menu-item {
  padding: 0 !important;
  margin: 4px 8px !important;
  border-radius: 8px !important;
  height: 40px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

.n-layout-sider--collapsed .n-menu--collapsed .n-menu-item .n-menu-item-content {
  padding: 0 !important;
  justify-content: center !important;
  width: 100% !important;
  height: 100% !important;
  display: flex !important;
  align-items: center !important;
}

.n-layout-sider--collapsed .n-menu--collapsed .n-menu-item .n-menu-item-content-header {
  display: none !important;
}

.n-layout-sider--collapsed .n-menu--collapsed .n-menu-item .n-icon {
  font-size: 20px !important;
  margin: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

.n-layout-sider--collapsed .sidebar-header {
  padding: 16px !important;
  display: flex !important;
  justify-content: center !important;
  align-items: center !important;
}

.n-layout-sider--collapsed .brand-logo {
  width: 28px !important;
  height: 28px !important;
}

#app {
  height: 100vh;
  overflow: hidden;
}

.app-layout {
  height: 100vh;
}

/* 侧边栏样式 */
.sidebar {
  height: 100vh;
  transition: all 0.3s ease;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
  transition: all 0.3s ease;
  display: flex;
  justify-content: flex-start;
  align-items: center;
  min-height: 64px;
  box-sizing: border-box;
}

/* 收起状态下的侧边栏头部 */
.sidebar[data-collapsed="true"] .sidebar-header {
  padding: 16px;
  justify-content: center;
}

.app-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  transition: all 0.3s ease;
}

/* 收起状态下的品牌区域 */
.sidebar[data-collapsed="true"] .app-brand {
  gap: 0;
  justify-content: center;
}

.brand-logo {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  transition: all 0.3s ease;
  flex-shrink: 0;
}

/* 收起状态下的logo稍微小一点 */
.sidebar[data-collapsed="true"] .brand-logo {
  width: 28px;
  height: 28px;
}

.app-brand h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  transition: all 0.3s ease;
}

/* 收起状态下隐藏标题 */
.sidebar[data-collapsed="true"] .app-brand h1 {
  width: 0;
  opacity: 0;
  margin: 0;
}

.sidebar-menu {
  padding: 8px;
  transition: all 0.3s ease;
}

/* 收起状态下的菜单样式 */
.sidebar[data-collapsed="true"] .sidebar-menu {
  padding: 8px 4px;
}

/* 收起状态下的菜单项图标居中 */
.sidebar[data-collapsed="true"] .n-menu-item {
  justify-content: center !important;
  padding: 8px 12px !important;
  margin: 4px 8px !important;
  border-radius: 8px !important;
}

.sidebar[data-collapsed="true"] .n-menu-item-content {
  justify-content: center !important;
  padding: 0 !important;
  width: 100% !important;
}

.sidebar[data-collapsed="true"] .n-menu-item-content-header {
  display: none !important;
}

/* 收起状态下的图标样式 */
.sidebar[data-collapsed="true"] .n-menu-item .n-icon {
  margin: 0 !important;
  font-size: 20px !important;
}

/* 收起状态下的菜单项工具提示 */
.sidebar[data-collapsed="true"] .n-menu-item {
  position: relative;
}

/* 确保收起状态下菜单项有合适的最小高度 */
.sidebar[data-collapsed="true"] .n-menu-item {
  min-height: 40px !important;
}

/* 收起状态下的菜单项间距 */
.sidebar[data-collapsed="true"] .n-menu .n-menu-item {
  margin-bottom: 4px;
}

/* 收起状态下的logo容器优化 */
.sidebar[data-collapsed="true"] .sidebar-header {
  position: relative;
}

.sidebar[data-collapsed="true"] .sidebar-header::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 32px;
  height: 1px;
  background: var(--border-color);
}

/* Tooltip在收起状态下的优化 */
.sidebar[data-collapsed="true"] .n-menu-item {
  position: relative;
}

/* 确保收起状态下的触发器样式 */
.sidebar .n-layout-sider-scroll-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.sidebar[data-collapsed="true"] .n-layout-trigger {
  border-radius: 8px;
  margin: 8px;
  transition: all 0.3s ease;
}

/* 使用深度选择器强制覆盖NaiveUI的收起状态样式 */
.sidebar :deep(.n-layout-sider-scroll-container) {
  overflow: visible !important;
}

.sidebar :deep(.n-menu--collapsed) {
  width: 64px !important;
}

.sidebar :deep(.n-menu--collapsed .n-menu-item) {
  padding: 0 !important;
  margin: 4px 8px !important;
  border-radius: 8px !important;
  height: 40px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

.sidebar :deep(.n-menu--collapsed .n-menu-item .n-menu-item-content) {
  padding: 0 !important;
  justify-content: center !important;
  width: 100% !important;
  height: 100% !important;
  display: flex !important;
  align-items: center !important;
}

.sidebar :deep(.n-menu--collapsed .n-menu-item .n-menu-item-content-header) {
  display: none !important;
}

.sidebar :deep(.n-menu--collapsed .n-menu-item .n-icon) {
  font-size: 20px !important;
  margin: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

/* 确保收起状态下的侧边栏头部正确显示 */
.sidebar :deep(.n-layout-sider--collapsed .sidebar-header) {
  padding: 16px !important;
  display: flex !important;
  justify-content: center !important;
  align-items: center !important;
}

.sidebar :deep(.n-layout-sider--collapsed .brand-logo) {
  width: 28px !important;
  height: 28px !important;
}

/* 侧边栏过渡动画 */
.sidebar .n-layout-sider {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 菜单项的过渡动画 */
.sidebar .n-menu-item {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.sidebar .n-menu-item-content {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 收起状态下的图标大小优化 */
.sidebar[data-collapsed="true"] .n-menu-item .n-icon {
  font-size: 20px;
  transition: all 0.3s ease;
}

/* 展开状态下的图标大小 */
.sidebar:not([data-collapsed="true"]) .n-menu-item .n-icon {
  font-size: 18px;
  transition: all 0.3s ease;
}

/* 头部样式 */
.header {
  height: 60px;
  padding: 0 24px;
  display: flex;
  align-items: center;
}

.header-content {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-title h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-color-primary);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .header-content {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  
  .header-title {
    text-align: center;
  }
  
  .header-actions {
    justify-content: center;
    flex-wrap: wrap;
    gap: 8px;
  }
}

.theme-toggle {
  border-radius: 6px;
}

/* 内容区域样式 */
.content {
  padding: 0;
  overflow: auto;
  height: calc(100vh - 60px);
}

/* 暗色主题下的特殊处理 */
html.dark .app-layout {
  background-color: #0d1117;
}

html.dark .sidebar-header {
  background-color: #161b22;
  border-bottom-color: #30363d;
}

html.dark .header {
  background-color: #161b22;
  border-bottom-color: #30363d;
}

html.dark .content {
  background-color: #0d1117;
}

/* 暗色主题下收起状态的样式优化 */
html.dark .sidebar[data-collapsed="true"] .sidebar-header::after {
  background: #30363d;
}

html.dark .sidebar[data-collapsed="true"] .n-menu-item:hover {
  background-color: rgba(255, 255, 255, 0.06);
}

html.dark .sidebar[data-collapsed="true"] .n-menu-item--selected {
  background-color: rgba(74, 158, 255, 0.15);
}

/* 亮色主题下收起状态的样式优化 */
html:not(.dark) .sidebar[data-collapsed="true"] .n-menu-item:hover {
  background-color: rgba(0, 0, 0, 0.04);
}

html:not(.dark) .sidebar[data-collapsed="true"] .n-menu-item--selected {
  background-color: rgba(46, 134, 222, 0.1);
}

/* 现代化滚动条样式 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 10px;
}

::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 10px;
  border: 1px solid transparent;
  background-clip: content-box;
  transition: all 0.2s ease;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.35);
  background-clip: content-box;
}

::-webkit-scrollbar-thumb:active {
  background: rgba(0, 0, 0, 0.5);
  background-clip: content-box;
}

/* 暗色主题下的滚动条样式 */
html.dark ::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  background-clip: content-box;
}

html.dark ::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
  background-clip: content-box;
}

html.dark ::-webkit-scrollbar-thumb:active {
  background: rgba(255, 255, 255, 0.35);
  background-clip: content-box;
}

/* 滚动条角落样式 */
::-webkit-scrollbar-corner {
  background: transparent;
}

/* Firefox 滚动条样式 */
* {
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
}

html.dark * {
  scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
}

/* 小容器内的滚动条优化 */
.headers-list::-webkit-scrollbar,
.system-logs-content::-webkit-scrollbar {
  width: 6px;
}

.headers-list::-webkit-scrollbar-thumb,
.system-logs-content::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 8px;
  border: none;
  background-clip: padding-box;
}

.headers-list::-webkit-scrollbar-thumb:hover,
.system-logs-content::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.25);
}

html.dark .headers-list::-webkit-scrollbar-thumb,
html.dark .system-logs-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
}

html.dark .headers-list::-webkit-scrollbar-thumb:hover,
html.dark .system-logs-content::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* Monaco编辑器滚动条优化 */
.monaco-editor .monaco-scrollable-element > .scrollbar > .slider {
  border-radius: 8px !important;
}

.monaco-editor .monaco-scrollable-element > .scrollbar.vertical > .slider {
  width: 6px !important;
  margin-left: 1px !important;
}

.monaco-editor .monaco-scrollable-element > .scrollbar.horizontal > .slider {
  height: 6px !important;
  margin-top: 1px !important;
}

/* Monaco编辑器暗色主题滚动条 */
html.dark .monaco-editor .monaco-scrollable-element > .scrollbar > .slider {
  background: rgba(255, 255, 255, 0.1) !important;
}

html.dark .monaco-editor .monaco-scrollable-element > .scrollbar > .slider:hover {
  background: rgba(255, 255, 255, 0.2) !important;
}

/* Monaco编辑器亮色主题滚动条 */
html:not(.dark) .monaco-editor .monaco-scrollable-element > .scrollbar > .slider {
  background: rgba(0, 0, 0, 0.15) !important;
}

html:not(.dark) .monaco-editor .monaco-scrollable-element > .scrollbar > .slider:hover {
  background: rgba(0, 0, 0, 0.25) !important;
}

/* Naive UI 组件滚动条优化 */
.n-scrollbar-rail__scrollbar {
  border-radius: 8px !important;
  transition: all 0.2s ease !important;
}

.n-scrollbar-rail--vertical .n-scrollbar-rail__scrollbar {
  width: 6px !important;
}

.n-scrollbar-rail--horizontal .n-scrollbar-rail__scrollbar {
  height: 6px !important;
}

/* Naive UI 暗色主题滚动条 */
html.dark .n-scrollbar-rail__scrollbar {
  background: rgba(255, 255, 255, 0.1) !important;
}

html.dark .n-scrollbar-rail:hover .n-scrollbar-rail__scrollbar {
  background: rgba(255, 255, 255, 0.2) !important;
}

/* Naive UI 亮色主题滚动条 */
html:not(.dark) .n-scrollbar-rail__scrollbar {
  background: rgba(0, 0, 0, 0.15) !important;
}

html:not(.dark) .n-scrollbar-rail:hover .n-scrollbar-rail__scrollbar {
  background: rgba(0, 0, 0, 0.25) !important;
}
</style> 