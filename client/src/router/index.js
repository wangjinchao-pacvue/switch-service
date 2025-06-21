import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from '../views/Dashboard.vue'
import ApiDebugger from '../views/ApiDebugger.vue'

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
  history: createWebHistory(),
  routes
})

export default router 