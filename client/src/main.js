import { createApp } from 'vue'
import { createPinia } from 'pinia'
// 使用Naive UI
import naive from 'naive-ui'
// 添加Naive UI的通用样式
import 'vfonts/Lato.css'
import 'vfonts/FiraCode.css'
import App from './App.vue'
import router from './router'
import { useAppStore } from './stores/app'
import JsonViewer from 'vue-json-viewer'
import 'vue-json-viewer/style.css'

// Monaco Editor
import { install as VueMonacoEditorPlugin } from '@guolao/vue-monaco-editor'

const app = createApp(App)

const pinia = createPinia()
app.use(pinia)
app.use(router)
app.use(naive) // 使用Naive UI
app.use(JsonViewer)
app.use(VueMonacoEditorPlugin, {
  paths: {
    // CDN 路径
    vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.43.0/min/vs'
  }
})

// 初始化主题
const appStore = useAppStore()
appStore.initTheme()

app.mount('#app') 