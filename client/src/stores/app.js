import { defineStore } from 'pinia'
import axios from 'axios'

export const useAppStore = defineStore('app', {
  state: () => ({
    config: {
      eureka: {
        host: 'localhost',
        port: 8761,
        servicePath: '/eureka/apps'
      },
      proxyServices: []
    },
    eurekaServices: [],
    proxyServices: [],
    proxyStats: {
      total: 0,
      running: 0,
      stopped: 0,
      healthy: 0,
      unhealthy: 0
    },
    loading: false,
    theme: 'light' // 主题模式：light | dark
  }),

  actions: {
    async fetchConfig() {
      try {
        const response = await axios.get('/api/config')
        this.config = response.data
      } catch (error) {
        console.error('Failed to fetch config:', error)
      }
    },

    async updateEurekaConfig(config) {
      try {
        this.loading = true
        const response = await axios.post('/api/config/eureka', config)
        if (response.data.success) {
          this.config.eureka = response.data.config
          await this.fetchEurekaServices()
        }
        return response.data
      } catch (error) {
        console.error('Failed to update Eureka config:', error)
        throw error
      } finally {
        this.loading = false
      }
    },

    async fetchEurekaServices() {
      try {
        this.loading = true
        const response = await axios.get('/api/eureka/services')
        if (response.data.success) {
          this.eurekaServices = response.data.services
        }
      } catch (error) {
        console.error('Failed to fetch Eureka services:', error)
        this.eurekaServices = []
      } finally {
        this.loading = false
      }
    },

    async fetchProxyServices() {
      try {
        const response = await axios.get('/api/proxy/list')
        if (response.data.success) {
          this.proxyServices = response.data.services
        }
      } catch (error) {
        console.error('Failed to fetch proxy services:', error)
        this.proxyServices = []
      }
    },

    async createProxyService(serviceConfig) {
      try {
        this.loading = true
        const response = await axios.post('/api/proxy/create', serviceConfig)
        if (response.data.success) {
          await this.fetchProxyServices()
        }
        return response.data
      } catch (error) {
        console.error('Failed to create proxy service:', error)
        throw error
      } finally {
        this.loading = false
      }
    },

    async startProxyService(id) {
      try {
        this.loading = true
        const response = await axios.post(`/api/proxy/${id}/start`)
        if (response.data.success) {
          await this.fetchProxyServices()
        }
        return response.data
      } catch (error) {
        console.error('Failed to start proxy service:', error)
        throw error
      } finally {
        this.loading = false
      }
    },

    async stopProxyService(id) {
      try {
        this.loading = true
        const response = await axios.post(`/api/proxy/${id}/stop`)
        if (response.data.success) {
          await this.fetchProxyServices()
        }
        return response.data
      } catch (error) {
        console.error('Failed to stop proxy service:', error)
        throw error
      } finally {
        this.loading = false
      }
    },

    async switchProxyTarget(id, activeTarget) {
      try {
        this.loading = true
        const response = await axios.post(`/api/proxy/${id}/switch`, {
          activeTarget
        })
        if (response.data.success) {
          await this.fetchProxyServices()
        }
        return response.data
      } catch (error) {
        console.error('Failed to switch proxy target:', error)
        throw error
      } finally {
        this.loading = false
      }
    },

    async updateProxyService(id, updates) {
      try {
        this.loading = true
        const response = await axios.put(`/api/proxy/${id}`, updates)
        if (response.data.success) {
          await this.fetchProxyServices()
        }
        return response.data
      } catch (error) {
        console.error('Failed to update proxy service:', error)
        throw error
      } finally {
        this.loading = false
      }
    },

    async deleteProxyService(id) {
      try {
        this.loading = true
        const response = await axios.delete(`/api/proxy/${id}`)
        if (response.data.success) {
          await this.fetchProxyServices()
        }
        return response.data
      } catch (error) {
        console.error('Failed to delete proxy service:', error)
        throw error
      } finally {
        this.loading = false
      }
    },

    async fetchProxyStats() {
      try {
        const response = await axios.get('/api/proxy/stats')
        if (response.data.success) {
          // 确保统计数据为数字类型，避免Vue prop类型检查警告
          this.proxyStats = {
            total: Number(response.data.stats.total || 0),
            running: Number(response.data.stats.running || 0),
            stopped: Number(response.data.stats.stopped || 0),
            healthy: Number(response.data.stats.healthy || 0),
            unhealthy: Number(response.data.stats.unhealthy || 0)
          }
        }
        return response.data
      } catch (error) {
        console.error('Failed to fetch proxy stats:', error)
        return { success: false, stats: {} }
      }
    },

    async fetchHeartbeatStatus() {
      try {
        const response = await axios.get('/api/heartbeat/status')
        return response.data
      } catch (error) {
        console.error('Failed to fetch heartbeat status:', error)
        return { success: false, heartbeats: [] }
      }
    },

    async batchStartProxyServices(ids) {
      try {
        this.loading = true
        const response = await axios.post('/api/proxy/batch/start', { ids })
        if (response.data.success) {
          await this.fetchProxyServices()
        }
        return response.data
      } catch (error) {
        console.error('Failed to batch start proxy services:', error)
        throw error
      } finally {
        this.loading = false
      }
    },

    async batchStopProxyServices(ids) {
      try {
        this.loading = true
        const response = await axios.post('/api/proxy/batch/stop', { ids })
        if (response.data.success) {
          await this.fetchProxyServices()
        }
        return response.data
      } catch (error) {
        console.error('Failed to batch stop proxy services:', error)
        throw error
      } finally {
        this.loading = false
      }
    },

    // 设置loading状态的方法
    setLoading(loading) {
      this.loading = loading
    },

    // 主题管理
    initTheme() {
      // 从localStorage读取保存的主题
      const savedTheme = localStorage.getItem('app-theme')
      if (savedTheme && ['light', 'dark'].includes(savedTheme)) {
        this.theme = savedTheme
      }
      this.applyTheme()
    },

    setTheme(theme) {
      if (!['light', 'dark'].includes(theme)) return
      
      this.theme = theme
      localStorage.setItem('app-theme', theme)
      this.applyTheme()
    },

    toggleTheme() {
      const newTheme = this.theme === 'light' ? 'dark' : 'light'
      this.setTheme(newTheme)
    },

    applyTheme() {
      const html = document.documentElement
      if (this.theme === 'dark') {
        html.classList.add('dark')
        html.classList.remove('light')
      } else {
        html.classList.add('light')
        html.classList.remove('dark')
      }
    }
  }
}) 