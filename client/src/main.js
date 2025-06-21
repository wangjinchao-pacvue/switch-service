import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import router from './router'
import { useAppStore } from './stores/app'
import JsonViewer from 'vue-json-viewer'
import 'vue-json-viewer/style.css'

// Monaco Editor
import { install as VueMonacoEditorPlugin } from '@guolao/vue-monaco-editor'

// 按需导入需要的图标
import {
  Search,
  Management,
  Plus,
  Delete,
  Edit,
  View,
  Refresh,
  Download,
  Upload,
  Setting,
  InfoFilled,
  SuccessFilled,
  WarningFilled,
  CircleCloseFilled,
  Moon,
  Sunny,
  CopyDocument,
  Close,
  Check,
  ArrowRight,
  ArrowLeft,
  More,
  DocumentCopy,
  Connection,
  Monitor,
  DataLine,
  Tools,
  Link,
  Switch,
  Timer,
  Warning,
  CircleCheck,
  CircleClose,
  Document,
  List,
  Location,
  ArrowDown,
  ArrowUp,
  Position
} from '@element-plus/icons-vue'

const app = createApp(App)

// 注册需要的图标
const icons = {
  Search,
  Management,
  Plus,
  Delete,
  Edit,
  View,
  Refresh,
  Download,
  Upload,
  Setting,
  InfoFilled,
  SuccessFilled,
  WarningFilled,
  CircleCloseFilled,
  Moon,
  Sunny,
  CopyDocument,
  Close,
  Check,
  ArrowRight,
  ArrowLeft,
  More,
  DocumentCopy,
  Connection,
  Monitor,
  DataLine,
  Tools,
  Link,
  Switch,
  Timer,
  Warning,
  CircleCheck,
  CircleClose,
  Document,
  List,
  Location,
  ArrowDown,
  ArrowUp,
  Position
}

for (const [key, component] of Object.entries(icons)) {
  app.component(key, component)
}

const pinia = createPinia()
app.use(pinia)
app.use(router)
app.use(ElementPlus)
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