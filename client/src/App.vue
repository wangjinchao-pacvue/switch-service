<template>
  <div id="app">
    <el-container class="app-container">
      <!-- 左侧导航栏 -->
      <el-aside width="240px" class="sidebar">
        <div class="sidebar-header">
          <div class="app-brand">
            <img src="/logo.png" alt="Switch Service" class="brand-logo" />
            <h1>Switch Service</h1>
          </div>
        </div>
        
        <el-menu
          :default-active="activeMenu"
          class="sidebar-menu"
          @select="handleMenuSelect"
        >
          <el-menu-item index="service-management">
            <el-icon><Setting /></el-icon>
            <span>服务管理</span>
          </el-menu-item>
        </el-menu>
      </el-aside>

      <!-- 右侧主内容区 -->
      <el-container class="main-container">
        <!-- 顶部栏 -->
        <el-header height="60px" class="header">
          <div class="header-content">
            <div class="header-title">
              <h2>{{ currentPageTitle }}</h2>
            </div>
            <div class="header-actions">
              <el-tooltip :content="appStore.theme === 'light' ? '切换到暗色模式' : '切换到亮色模式'" placement="bottom">
                <el-button 
                  type="text" 
                  :icon="appStore.theme === 'light' ? 'Moon' : 'Sunny'"
                  @click="appStore.toggleTheme()"
                  class="theme-toggle"
                />
              </el-tooltip>
            </div>
          </div>
        </el-header>

        <!-- 主内容区 -->
        <el-main class="content">
          <router-view />
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from './stores/app'
import { Setting, Moon, Sunny } from '@element-plus/icons-vue'

const appStore = useAppStore()
const route = useRoute()
const router = useRouter()

// 当前激活的菜单项
const activeMenu = ref('service-management')

// 页面标题映射
const pageTitleMap = {
  'service-management': '服务管理'
}

// 当前页面标题
const currentPageTitle = computed(() => {
  return pageTitleMap[activeMenu.value] || '服务管理'
})

// 处理菜单选择
const handleMenuSelect = (index) => {
  activeMenu.value = index
  
  switch (index) {
    case 'service-management':
      router.push('/')
      break
    default:
      router.push('/')
  }
}

onMounted(async () => {
  // 根据当前路由设置激活菜单
  if (route.path === '/') {
    activeMenu.value = 'service-management'
  }
  
  // 初始加载数据
  await Promise.all([
    appStore.fetchConfig(),
    appStore.fetchProxyServices()
  ])
})
</script>

<style>
/* 全局CSS变量定义 */
:root {
  /* 亮色主题变量 */
  --bg-color: #ffffff;
  --bg-color-secondary: #f5f7fa;
  --bg-color-tertiary: #fafafa;
  --text-color: #303133;
  --text-color-secondary: #606266;
  --text-color-tertiary: #909399;
  --border-color: #dcdfe6;
  --border-color-light: #e4e7ed;
  --border-color-lighter: #ebeef5;
  --shadow-color: rgba(0, 0, 0, 0.1);
  --shadow-color-light: rgba(0, 0, 0, 0.05);
  --card-bg: #ffffff;
  --header-bg: #ffffff;
  --input-bg: #ffffff;
  --button-bg: #ffffff;
  --hover-bg: #f5f7fa;
  --active-bg: #ecf5ff;
  --success-bg: #f0f9ff;
  --warning-bg: #fdf6ec;
  --danger-bg: #fef0f0;
  --info-bg: #f4f4f5;
}

/* 暗色主题变量 - 参考 Cursor 柔和配色方案 */
html.dark {
  --bg-color: #1e1e1e;
  --bg-color-secondary: #2d2d30;
  --bg-color-tertiary: #37373d;
  --text-color: #cccccc;
  --text-color-secondary: #9d9d9d;
  --text-color-tertiary: #6d6d6d;
  --border-color: #3e3e42;
  --border-color-light: #4e4e54;
  --border-color-lighter: #5e5e64;
  --shadow-color: rgba(0, 0, 0, 0.4);
  --shadow-color-light: rgba(0, 0, 0, 0.2);
  --card-bg: #252526;
  --header-bg: #1e1e1e;
  --input-bg: #3c3c3c;
  --button-bg: #2d2d30;
  --hover-bg: #2a2d2e;
  --active-bg: #094771;
  --success-bg: #0e3a2e;
  --warning-bg: #3d2914;
  --danger-bg: #3d1a1a;
  --info-bg: #1e2329;
}

/* 全局样式应用变量 */
body {
  background-color: var(--bg-color);
  color: var(--text-color);
  transition: background-color 0.3s ease, color 0.3s ease;
}

/* Element Plus组件主题覆盖 - 更细致的调整 */
html.dark .el-header {
  background-color: var(--header-bg) !important;
  border-bottom: 1px solid var(--border-color);
}

html.dark .el-main {
  background-color: var(--bg-color) !important;
}

/* 卡片组件 */
html.dark .el-card {
  background-color: var(--card-bg) !important;
  border-color: var(--border-color) !important;
  box-shadow: 0 2px 12px 0 var(--shadow-color) !important;
}

html.dark .el-card__header {
  background-color: var(--bg-color-secondary) !important;
  border-bottom-color: var(--border-color) !important;
  color: var(--text-color) !important;
}

html.dark .el-card__body {
  color: var(--text-color) !important;
}

/* 表格组件 */
html.dark .el-table {
  background-color: var(--card-bg) !important;
  color: var(--text-color) !important;
}

html.dark .el-table th.el-table__cell {
  background-color: var(--bg-color-tertiary) !important;
  color: var(--text-color) !important;
  border-bottom-color: var(--border-color) !important;
  font-weight: 600 !important;
}

html.dark .el-table td.el-table__cell {
  background-color: var(--card-bg) !important;
  border-bottom-color: var(--border-color) !important;
  color: var(--text-color) !important;
}

html.dark .el-table--border .el-table__cell {
  border-right-color: var(--border-color) !important;
}

html.dark .el-table--border::after,
html.dark .el-table--border::before {
  background-color: var(--border-color) !important;
}

html.dark .el-table__empty-block {
  background-color: var(--card-bg) !important;
}

html.dark .el-table__empty-text {
  color: var(--text-color-secondary) !important;
}

html.dark .el-table tbody tr:hover > td {
  background-color: var(--hover-bg) !important;
}

html.dark .el-table tbody tr {
  background-color: var(--card-bg) !important;
}

/* 输入框组件 */
html.dark .el-input__wrapper {
  background-color: var(--input-bg) !important;
  border-color: var(--border-color) !important;
  box-shadow: 0 0 0 1px var(--border-color) inset !important;
}

html.dark .el-input__wrapper:hover {
  border-color: var(--border-color-light) !important;
  box-shadow: 0 0 0 1px var(--border-color-light) inset !important;
}

html.dark .el-input__wrapper.is-focus {
  border-color: #409eff !important;
  box-shadow: 0 0 0 1px #409eff inset !important;
}

html.dark .el-input__inner {
  color: var(--text-color) !important;
}

html.dark .el-input__inner::placeholder {
  color: var(--text-color-tertiary) !important;
}

/* 文本域 */
html.dark .el-textarea__inner {
  background-color: var(--input-bg) !important;
  border-color: var(--border-color) !important;
  color: var(--text-color) !important;
}

html.dark .el-textarea__inner::placeholder {
  color: var(--text-color-tertiary) !important;
}

/* 选择器 */
html.dark .el-select .el-input__wrapper {
  background-color: var(--input-bg) !important;
}

html.dark .el-select-dropdown {
  background-color: var(--card-bg) !important;
  border-color: var(--border-color) !important;
  box-shadow: 0 4px 12px var(--shadow-color) !important;
}

html.dark .el-select-dropdown__item {
  color: var(--text-color) !important;
}

html.dark .el-select-dropdown__item:hover {
  background-color: var(--hover-bg) !important;
}

html.dark .el-select-dropdown__item.selected {
  background-color: var(--active-bg) !important;
  color: #409eff !important;
}

/* 按钮组件 - 暗色主题优化配色 */
html.dark .el-button {
  background-color: var(--button-bg) !important;
  border-color: var(--border-color) !important;
  color: var(--text-color) !important;
  transition: all 0.2s ease !important;
  border-radius: 6px !important;
  font-weight: 500 !important;
}

html.dark .el-button:hover {
  background-color: var(--hover-bg) !important;
  border-color: var(--border-color-light) !important;
  transform: translateY(-1px) !important;
  box-shadow: 0 2px 8px var(--shadow-color-light) !important;
}

/* Primary 按钮 - 蓝色系 */
html.dark .el-button--primary {
  background: linear-gradient(135deg, #4a9eff, #409eff) !important;
  border-color: #409eff !important;
  color: #ffffff !important;
  box-shadow: 0 2px 4px rgba(64, 158, 255, 0.2) !important;
}

html.dark .el-button--primary:hover {
  background: linear-gradient(135deg, #66b1ff, #4a9eff) !important;
  border-color: #66b1ff !important;
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.3) !important;
  transform: translateY(-2px) !important;
}

html.dark .el-button--primary:active {
  transform: translateY(0) !important;
}

/* Success 按钮 - 绿色系优化 */
html.dark .el-button--success {
  background: linear-gradient(135deg, #52c41a, #67c23a) !important;
  border-color: #52c41a !important;
  color: #ffffff !important;
  box-shadow: 0 2px 4px rgba(82, 196, 26, 0.2) !important;
}

html.dark .el-button--success:hover {
  background: linear-gradient(135deg, #73d13d, #52c41a) !important;
  border-color: #73d13d !important;
  box-shadow: 0 4px 12px rgba(82, 196, 26, 0.3) !important;
  transform: translateY(-2px) !important;
}

/* Warning 按钮 - 橙色系优化 */
html.dark .el-button--warning {
  background: linear-gradient(135deg, #fa8c16, #e6a23c) !important;
  border-color: #fa8c16 !important;
  color: #ffffff !important;
  box-shadow: 0 2px 4px rgba(250, 140, 22, 0.2) !important;
}

html.dark .el-button--warning:hover {
  background: linear-gradient(135deg, #ffa940, #fa8c16) !important;
  border-color: #ffa940 !important;
  box-shadow: 0 4px 12px rgba(250, 140, 22, 0.3) !important;
  transform: translateY(-2px) !important;
}

/* Danger 按钮 - 红色系优化 */
html.dark .el-button--danger {
  background: linear-gradient(135deg, #ff4d4f, #f56c6c) !important;
  border-color: #ff4d4f !important;
  color: #ffffff !important;
  box-shadow: 0 2px 4px rgba(255, 77, 79, 0.2) !important;
}

html.dark .el-button--danger:hover {
  background: linear-gradient(135deg, #ff7875, #ff4d4f) !important;
  border-color: #ff7875 !important;
  box-shadow: 0 4px 12px rgba(255, 77, 79, 0.3) !important;
  transform: translateY(-2px) !important;
}

/* Info 按钮 - 灰色系优化 */
html.dark .el-button--info {
  background: linear-gradient(135deg, #8c8c8c, #909399) !important;
  border-color: #8c8c8c !important;
  color: #ffffff !important;
  box-shadow: 0 2px 4px rgba(140, 140, 140, 0.2) !important;
}

html.dark .el-button--info:hover {
  background: linear-gradient(135deg, #a6a6a6, #8c8c8c) !important;
  border-color: #a6a6a6 !important;
  box-shadow: 0 4px 12px rgba(140, 140, 140, 0.3) !important;
  transform: translateY(-2px) !important;
}

/* Text 按钮优化 */
html.dark .el-button--text {
  background-color: transparent !important;
  border-color: transparent !important;
  color: #4a9eff !important;
  padding: 8px 15px !important;
}

html.dark .el-button--text:hover {
  background-color: rgba(74, 158, 255, 0.1) !important;
  color: #66b1ff !important;
  transform: none !important;
}

/* 小尺寸按钮优化 */
html.dark .el-button--small {
  font-size: 12px !important;
  padding: 6px 12px !important;
}

/* 按钮组优化 */
html.dark .el-button-group .el-button {
  border-radius: 0 !important;
  margin-left: -1px !important;
}

html.dark .el-button-group .el-button:first-child {
  border-top-left-radius: 6px !important;
  border-bottom-left-radius: 6px !important;
  margin-left: 0 !important;
}

html.dark .el-button-group .el-button:last-child {
  border-top-right-radius: 6px !important;
  border-bottom-right-radius: 6px !important;
}

html.dark .el-button-group .el-button:not(:first-child):not(:last-child) {
  border-radius: 0 !important;
}

/* 按钮焦点状态 */
html.dark .el-button:focus {
  outline: 2px solid rgba(74, 158, 255, 0.3) !important;
  outline-offset: 2px !important;
}

html.dark .el-button:focus:not(:focus-visible) {
  outline: none !important;
}

/* 禁用状态优化 */
html.dark .el-button:disabled,
html.dark .el-button.is-disabled {
  background: var(--bg-color-secondary) !important;
  border-color: var(--border-color) !important;
  color: var(--text-color-tertiary) !important;
  cursor: not-allowed !important;
  transform: none !important;
  box-shadow: none !important;
  opacity: 0.6 !important;
}

html.dark .el-button--primary:disabled,
html.dark .el-button--primary.is-disabled {
  background: var(--bg-color-secondary) !important;
  border-color: var(--border-color) !important;
  color: var(--text-color-tertiary) !important;
  opacity: 0.5 !important;
}

html.dark .el-button--success:disabled,
html.dark .el-button--success.is-disabled {
  background: var(--bg-color-secondary) !important;
  border-color: var(--border-color) !important;
  color: var(--text-color-tertiary) !important;
  opacity: 0.5 !important;
}

html.dark .el-button--warning:disabled,
html.dark .el-button--warning.is-disabled {
  background: var(--bg-color-secondary) !important;
  border-color: var(--border-color) !important;
  color: var(--text-color-tertiary) !important;
  opacity: 0.5 !important;
}

html.dark .el-button--danger:disabled,
html.dark .el-button--danger.is-disabled {
  background: var(--bg-color-secondary) !important;
  border-color: var(--border-color) !important;
  color: var(--text-color-tertiary) !important;
  opacity: 0.5 !important;
}

html.dark .el-button--info:disabled,
html.dark .el-button--info.is-disabled {
  background: var(--bg-color-secondary) !important;
  border-color: var(--border-color) !important;
  color: var(--text-color-tertiary) !important;
  opacity: 0.5 !important;
}

/* 禁用状态下移除所有交互效果 */
html.dark .el-button:disabled:hover,
html.dark .el-button.is-disabled:hover {
  background: var(--bg-color-secondary) !important;
  border-color: var(--border-color) !important;
  color: var(--text-color-tertiary) !important;
  transform: none !important;
  box-shadow: none !important;
}

/* 加载状态优化 */
html.dark .el-button.is-loading {
  position: relative !important;
  pointer-events: none !important;
}

html.dark .el-button--primary.is-loading {
  background: linear-gradient(135deg, #4a9eff, #409eff) !important;
  opacity: 0.8 !important;
}

html.dark .el-button--success.is-loading {
  background: linear-gradient(135deg, #52c41a, #67c23a) !important;
  opacity: 0.8 !important;
}

html.dark .el-button--warning.is-loading {
  background: linear-gradient(135deg, #fa8c16, #e6a23c) !important;
  opacity: 0.8 !important;
}

html.dark .el-button--danger.is-loading {
  background: linear-gradient(135deg, #ff4d4f, #f56c6c) !important;
  opacity: 0.8 !important;
}

html.dark .el-button--info.is-loading {
  background: linear-gradient(135deg, #8c8c8c, #909399) !important;
  opacity: 0.8 !important;
}

/* 加载图标颜色 */
html.dark .el-button.is-loading .el-icon {
  color: #ffffff !important;
}

/* 标签组件 - 暗色主题优化配色 */
html.dark .el-tag {
  background-color: var(--bg-color-secondary) !important;
  border-color: var(--border-color) !important;
  color: var(--text-color) !important;
  border-radius: 4px !important;
  font-size: 12px !important;
}

html.dark .el-tag--primary {
  background-color: rgba(74, 158, 255, 0.15) !important;
  border-color: #4a9eff !important;
  color: #4a9eff !important;
}

html.dark .el-tag--success {
  background-color: rgba(82, 196, 26, 0.15) !important;
  border-color: #52c41a !important;
  color: #52c41a !important;
}

html.dark .el-tag--warning {
  background-color: rgba(250, 140, 22, 0.15) !important;
  border-color: #fa8c16 !important;
  color: #fa8c16 !important;
}

html.dark .el-tag--danger {
  background-color: rgba(255, 77, 79, 0.15) !important;
  border-color: #ff4d4f !important;
  color: #ff4d4f !important;
}

html.dark .el-tag--info {
  background-color: rgba(140, 140, 140, 0.15) !important;
  border-color: #8c8c8c !important;
  color: #8c8c8c !important;
}

/* 标签悬停效果 */
html.dark .el-tag:hover {
  opacity: 0.8 !important;
  transform: scale(1.02) !important;
  transition: all 0.2s ease !important;
}

/* 抽屉和对话框 */
html.dark .el-drawer {
  background-color: var(--card-bg) !important;
  color: var(--text-color) !important;
}

html.dark .el-drawer__header {
  color: var(--text-color) !important;
  border-bottom: 1px solid var(--border-color) !important;
}

html.dark .el-dialog {
  background-color: var(--card-bg) !important;
  border: 1px solid var(--border-color) !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3) !important;
}

html.dark .el-dialog__header {
  color: var(--text-color) !important;
  border-bottom: 1px solid var(--border-color) !important;
  background: var(--bg-color-secondary) !important;
  padding: 16px 20px !important;
}

html.dark .el-dialog__title {
  color: var(--text-color) !important;
  font-weight: 600 !important;
  font-size: 16px !important;
}

html.dark .el-dialog__body {
  color: var(--text-color) !important;
  padding: 16px 20px !important;
  background: var(--bg-color) !important;
}

html.dark .el-dialog__headerbtn .el-dialog__close {
  color: var(--text-color-secondary) !important;
}

html.dark .el-dialog__headerbtn .el-dialog__close:hover {
  color: var(--text-color) !important;
}

/* 表单组件 */
html.dark .el-form-item__label {
  color: var(--text-color) !important;
}

html.dark .el-form-item__error {
  color: #f56c6c !important;
}

/* 描述列表 */
html.dark .el-descriptions {
  background-color: var(--card-bg) !important;
}

html.dark .el-descriptions__header {
  background-color: var(--bg-color-tertiary) !important;
}

html.dark .el-descriptions__label {
  color: var(--text-color-secondary) !important;
}

html.dark .el-descriptions__content {
  color: var(--text-color) !important;
}

html.dark .el-descriptions__cell {
  border-color: var(--border-color) !important;
}

html.dark .el-descriptions__table {
  background-color: var(--card-bg) !important;
}

html.dark .el-descriptions-item__cell {
  background-color: var(--card-bg) !important;
}

html.dark .el-descriptions-item__label {
  background-color: var(--bg-color-tertiary) !important;
  color: var(--text-color) !important;
  font-weight: 600 !important;
}

html.dark .el-descriptions-item__content {
  background-color: var(--card-bg) !important;
  color: var(--text-color) !important;
  font-weight: 500 !important;
}

/* 进度条 */
html.dark .el-progress__text {
  color: var(--text-color) !important;
}

html.dark .el-progress-bar__outer {
  background-color: var(--bg-color-secondary) !important;
}

html.dark .el-progress-bar__inner {
  background: linear-gradient(90deg, #52c41a, #73d13d) !important;
}

/* 统计数字组件 */
html.dark .el-statistic {
  color: var(--text-color) !important;
}

html.dark .el-statistic__head {
  color: var(--text-color-secondary) !important;
  font-size: 12px !important;
}

html.dark .el-statistic__content {
  color: var(--text-color) !important;
  font-weight: 600 !important;
}

/* 警告框组件 */
html.dark .el-alert {
  background-color: var(--card-bg) !important;
  border-color: var(--border-color) !important;
}

html.dark .el-alert--success {
  background-color: rgba(82, 196, 26, 0.1) !important;
  border-color: #52c41a !important;
  color: #52c41a !important;
}

html.dark .el-alert--warning {
  background-color: rgba(250, 140, 22, 0.1) !important;
  border-color: #fa8c16 !important;
  color: #fa8c16 !important;
}

html.dark .el-alert--error {
  background-color: rgba(255, 77, 79, 0.1) !important;
  border-color: #ff4d4f !important;
  color: #ff4d4f !important;
}

html.dark .el-alert--info {
  background-color: rgba(74, 158, 255, 0.1) !important;
  border-color: #4a9eff !important;
  color: #4a9eff !important;
}

html.dark .el-alert__title {
  color: inherit !important;
}

html.dark .el-alert__description {
  color: inherit !important;
  opacity: 0.8 !important;
}

/* 统计数值 */
html.dark .el-statistic__head {
  color: var(--text-color-secondary) !important;
}

html.dark .el-statistic__content {
  color: var(--text-color) !important;
}

/* 空状态 */
html.dark .el-empty__description {
  color: var(--text-color-secondary) !important;
}

/* 提示框 */
html.dark .el-tooltip__popper {
  background-color: var(--bg-color-tertiary) !important;
  border-color: var(--border-color) !important;
  color: var(--text-color) !important;
}

/* 消息框 */
html.dark .el-message {
  background-color: var(--card-bg) !important;
  border-color: var(--border-color) !important;
  color: var(--text-color) !important;
}

html.dark .el-message-box {
  background-color: var(--card-bg) !important;
  border-color: var(--border-color) !important;
}

html.dark .el-message-box__header {
  color: var(--text-color) !important;
}

html.dark .el-message-box__content {
  color: var(--text-color) !important;
}

/* 警告框 */
html.dark .el-alert {
  background-color: var(--bg-color-secondary) !important;
  border-color: var(--border-color) !important;
  color: var(--text-color) !important;
}

html.dark .el-alert--success {
  background-color: var(--success-bg) !important;
  border-color: #67c23a !important;
}

html.dark .el-alert--warning {
  background-color: var(--warning-bg) !important;
  border-color: #e6a23c !important;
}

html.dark .el-alert--error {
  background-color: var(--danger-bg) !important;
  border-color: #f56c6c !important;
}

html.dark .el-alert--info {
  background-color: var(--info-bg) !important;
  border-color: #909399 !important;
}

/* 骨架屏 */
html.dark .el-skeleton__item {
  background: linear-gradient(90deg, var(--bg-color-secondary) 25%, var(--bg-color-tertiary) 37%, var(--bg-color-secondary) 63%) !important;
}

/* 自定义滚动条 */
html.dark ::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

html.dark ::-webkit-scrollbar-track {
  background-color: var(--bg-color-secondary);
  border-radius: 4px;
}

html.dark ::-webkit-scrollbar-thumb {
  background-color: var(--border-color-light);
  border-radius: 4px;
}

html.dark ::-webkit-scrollbar-thumb:hover {
  background-color: var(--border-color-lighter);
}

html.dark ::-webkit-scrollbar-corner {
  background-color: var(--bg-color-secondary);
}

/* 请求详情对话框特殊样式 */
html.dark .el-descriptions-item {
  background-color: var(--card-bg) !important;
}

html.dark .el-descriptions-item:nth-child(even) {
  background-color: var(--bg-color-secondary) !important;
}

html.dark .el-descriptions-item__label.el-descriptions-item__cell {
  background-color: var(--bg-color-secondary) !important;
  color: var(--text-color-secondary) !important;
}

html.dark .el-descriptions-item__content.el-descriptions-item__cell {
  background-color: var(--card-bg) !important;
  color: var(--text-color) !important;
}

/* 表格样式加强 */
html.dark .el-descriptions--bordered .el-descriptions-item__label,
html.dark .el-descriptions--bordered .el-descriptions-item__content {
  border-color: var(--border-color) !important;
}

html.dark .el-descriptions__body {
  background-color: var(--card-bg) !important;
}

/* 对话框内的表格 */
html.dark .el-dialog .el-descriptions {
  background-color: var(--card-bg) !important;
}

html.dark .el-dialog .el-descriptions__table {
  background-color: var(--card-bg) !important;
}

html.dark .el-dialog .el-descriptions-item__label {
  background-color: var(--bg-color-secondary) !important;
  color: var(--text-color) !important;
  font-weight: 600 !important;
}

html.dark .el-dialog .el-descriptions-item__content {
  background-color: var(--card-bg) !important;
  color: var(--text-color) !important;
  font-weight: 500 !important;
}

/* 代码高亮容器 */
html.dark .el-dialog .code-block {
  background-color: var(--bg-color-tertiary) !important;
  border: 1px solid var(--border-color) !important;
  color: var(--text-color) !important;
}

/* 请求详情特定样式 */
html.dark .request-details-content .section-content {
  background-color: var(--bg-color-secondary) !important;
  border: 1px solid var(--border-color) !important;
}

html.dark .request-details-content .headers-container,
html.dark .request-details-content .code-container {
  background-color: var(--bg-color-secondary) !important;
  border-color: var(--border-color) !important;
}

/* 强化表格文字对比度 */
html.dark .el-descriptions-item__label,
html.dark .el-descriptions-item__content {
  color: var(--text-color) !important;
  font-weight: 500 !important;
}

html.dark .el-descriptions-item__label {
  background-color: var(--bg-color-tertiary) !important;
  font-weight: 600 !important;
}

html.dark .el-descriptions-item__content {
  background-color: var(--card-bg) !important;
}

/* 对话框内表格特殊处理 */
html.dark .el-dialog .el-descriptions-item__label,
html.dark .el-dialog .el-descriptions-item__content {
  color: var(--text-color) !important;
  border-color: var(--border-color) !important;
}

html.dark .el-dialog .el-descriptions-item__label {
  background-color: var(--bg-color-tertiary) !important;
  font-weight: 700 !important;
}

html.dark .el-dialog .el-descriptions-item__content {
  background-color: var(--card-bg) !important;
  font-weight: 500 !important;
}

/* 确保所有文字都有足够对比度 */
html.dark .el-descriptions .el-descriptions-item__cell {
  color: var(--text-color) !important;
}

/* 对话框内表格特殊处理 */
html.dark .el-dialog .el-table {
  background-color: var(--card-bg) !important;
}

html.dark .el-dialog .el-table th.el-table__cell {
  background-color: var(--bg-color-tertiary) !important;
  color: var(--text-color) !important;
  border-color: var(--border-color) !important;
  font-weight: 700 !important;
}

html.dark .el-dialog .el-table td.el-table__cell {
  background-color: var(--card-bg) !important;
  color: var(--text-color) !important;
  border-color: var(--border-color) !important;
}

html.dark .el-dialog .el-table tbody tr:hover > td {
  background-color: var(--hover-bg) !important;
}

html.dark .el-dialog .el-table--border .el-table__cell {
  border-color: var(--border-color) !important;
}

html.dark .el-dialog .el-table--border::after,
html.dark .el-dialog .el-table--border::before {
  background-color: var(--border-color) !important;
}

/* 对话框内描述列表特殊处理 */
html.dark .el-dialog .el-descriptions-item__label {
  background-color: var(--bg-color-tertiary) !important;
  color: var(--text-color) !important;
  font-weight: 700 !important;
  border: 1px solid var(--border-color) !important;
}

html.dark .el-dialog .el-descriptions-item__content {
  background-color: var(--card-bg) !important;
  color: var(--text-color) !important;
  border: 1px solid var(--border-color) !important;
}

html.dark .el-dialog .el-descriptions__cell {
  border-color: var(--border-color) !important;
}

/* 菜单组件暗色主题 */
html.dark .el-menu {
  background-color: transparent !important;
  border: none !important;
}

html.dark .el-menu-item {
  color: var(--text-color-secondary) !important;
  background-color: transparent !important;
}

html.dark .el-menu-item:hover {
  background-color: var(--hover-bg) !important;
  color: var(--text-color) !important;
}

html.dark .el-menu-item.is-active {
  background-color: var(--active-bg) !important;
  color: #409eff !important;
}

html.dark .el-menu-item .el-icon {
  color: inherit !important;
}

/* 侧边栏容器暗色主题 */
html.dark .el-aside {
  background-color: var(--card-bg) !important;
  border-right-color: var(--border-color) !important;
}

/* 滚动条样式 - 更柔和的设计 */
html.dark ::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

html.dark ::-webkit-scrollbar-track {
  background: var(--bg-color-secondary);
  border-radius: 4px;
}

html.dark ::-webkit-scrollbar-thumb {
  background: var(--border-color-light);
  border-radius: 4px;
  transition: background 0.2s ease;
}

html.dark ::-webkit-scrollbar-thumb:hover {
  background: var(--text-color-tertiary);
}

html.dark ::-webkit-scrollbar-corner {
  background: var(--bg-color-secondary);
}
</style>

<style scoped>
/* 应用容器 */
.app-container {
  height: 100vh;
}

/* 左侧导航栏 */
.sidebar {
  background-color: var(--card-bg);
  border-right: 1px solid var(--border-color);
  box-shadow: 2px 0 8px var(--shadow-color-light);
}

.sidebar-header {
  padding: 20px;
  border-bottom: 1px solid var(--border-color);
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

.app-brand h1 {
  margin: 0;
  color: #409eff;
  font-size: 20px;
  font-weight: 600;
}

.sidebar-menu {
  border: none;
  background-color: transparent;
}

.sidebar-menu .el-menu-item {
  margin: 8px 16px;
  border-radius: 8px;
  transition: all 0.3s ease;
}

.sidebar-menu .el-menu-item:hover {
  background-color: var(--hover-bg);
}

.sidebar-menu .el-menu-item.is-active {
  background-color: var(--active-bg);
  color: #409eff;
}

/* 主内容区容器 */
.main-container {
  background-color: var(--bg-color);
}

/* 顶部栏 */
.header {
  background-color: var(--header-bg);
  border-bottom: 1px solid var(--border-color);
  padding: 0;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  padding: 0 24px;
}

.header-title h2 {
  margin: 0;
  color: var(--text-color);
  font-size: 18px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.theme-toggle {
  font-size: 20px;
  padding: 8px;
  border-radius: 50%;
  transition: all 0.3s ease;
  color: var(--text-color-secondary);
}

.theme-toggle:hover {
  background-color: var(--hover-bg);
  transform: scale(1.1);
  color: var(--text-color);
}

/* 主内容区 */
.content {
  background-color: var(--bg-color);
  padding: 24px;
}
</style> 