import { createRouter, createWebHashHistory } from 'vue-router'
import Dashboard from '../views/DashboardNaive.vue'
import ApiDebugger from '../views/ApiDebuggerNaive.vue'

const routes = [
  {
    path: '/',
    name: 'Dashboard',
    component: Dashboard
  },
  {
    path: '/api-debugger',
    name: 'ApiDebugger',
    component: ApiDebugger
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router 