import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import router from './router'
import { useAppStore } from './stores/app'

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
  ArrowUp
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
  ArrowUp
}

for (const [key, component] of Object.entries(icons)) {
  app.component(key, component)
}

const pinia = createPinia()
app.use(pinia)
app.use(router)
app.use(ElementPlus)

// 初始化主题
const appStore = useAppStore()
appStore.initTheme()

app.mount('#app') 