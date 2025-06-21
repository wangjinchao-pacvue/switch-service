<template>
  <div class="api-debugger">
    <el-row :gutter="24">
      <!-- 左侧：服务和接口管理 -->
      <el-col :span="8">
        <el-card class="service-panel">
          <template #header>
            <div class="card-header">
              <span>服务和接口管理</span>
            </div>
          </template>
          
          <!-- 代理服务选择 -->
          <div class="section">
            <label class="section-label">选择代理服务</label>
            <el-select 
              v-model="selectedService" 
              placeholder="请选择代理服务"
              @change="onServiceChange"
              class="full-width"
            >
              <el-option
                v-for="service in proxyServices"
                :key="service.id"
                :label="service.serviceName"
                :value="service.serviceName"
              />
            </el-select>
          </div>

          <!-- 环境配置 -->
          <div class="section" v-if="selectedService">
            <label class="section-label">目标环境</label>
            <el-select 
              v-model="selectedEnvironment" 
              placeholder="请选择环境"
              class="full-width"
            >
              <el-option
                v-for="env in environments"
                :key="env.key"
                :label="env.label"
                :value="env.key"
              >
                <div class="env-option">
                  <span>{{ env.label }}</span>
                  <span v-if="env.isActive" class="active-badge">正在使用</span>
                </div>
              </el-option>
            </el-select>
            
            <!-- 显示当前环境地址 -->
            <div v-if="currentEnvironmentUrl" class="environment-url">
              <small>当前环境地址: {{ currentEnvironmentUrl }}</small>
            </div>
            
            <!-- 自定义环境地址 -->
            <div v-if="selectedEnvironment === 'custom'" class="mt-2">
              <el-input
                v-model="customEnvironmentUrl"
                placeholder="请输入自定义环境地址，例如：http://localhost:8080"
              />
              <small class="custom-url-hint">
                自定义地址将优先于其他环境配置使用
              </small>
            </div>
          </div>

          <!-- 接口列表 -->
          <div class="section" v-if="selectedService">
            <div class="section-header">
              <label class="section-label">接口列表</label>
              <el-button 
                type="primary" 
                size="small" 
                @click="showAddApiDialog = true"
                :icon="Plus"
              >
                添加接口
              </el-button>
            </div>
            
            <div class="api-list">
              <div 
                v-for="api in currentServiceApis" 
                :key="api.id"
                class="api-item"
                :class="{ active: selectedApi?.id === api.id }"
                @click="selectApi(api)"
              >
                <div class="api-info">
                  <span class="api-method" :class="api.method.toLowerCase()">
                    {{ api.method }}
                  </span>
                  <span class="api-path">{{ api.path }}</span>
                </div>
                <el-button 
                  type="danger" 
                  size="small" 
                  text
                  @click.stop="deleteApi(api)"
                  :icon="Delete"
                />
              </div>
              
              <div v-if="currentServiceApis.length === 0" class="empty-apis">
                暂无接口，点击上方按钮添加
              </div>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- 右侧：请求配置和响应 -->
      <el-col :span="16">
        <el-card class="request-panel" v-if="selectedApi">
          <template #header>
            <div class="card-header">
              <span>{{ selectedApi.name || selectedApi.path }}</span>
              <div class="header-actions">
                <el-button 
                  type="info" 
                  @click="copyCurlCommand"
                  :icon="CopyDocument"
                  plain
                >
                  复制cURL
                </el-button>
                <el-button 
                  type="primary" 
                  @click="sendRequest"
                  :loading="requesting"
                  :icon="Position"
                >
                  发送请求
                </el-button>
              </div>
            </div>
          </template>

          <el-tabs v-model="activeTab">
            <!-- 请求配置 -->
            <el-tab-pane label="请求配置" name="request">
              <!-- 请求头 -->
              <div class="section">
                <label class="section-label">请求头</label>
                <div class="headers-container">
                  <div 
                    v-for="(header, index) in selectedApi.headers" 
                    :key="index"
                    class="header-row"
                  >
                    <el-input
                      v-model="header.key"
                      placeholder="Header名称"
                      class="header-key"
                    />
                    <el-input
                      v-model="header.value"
                      placeholder="Header值"
                      class="header-value"
                    />
                    <el-button 
                      type="danger" 
                      text
                      @click="removeHeader(index)"
                      :icon="Delete"
                    />
                  </div>
                  <el-button 
                    type="primary" 
                    text 
                    @click="addHeader"
                    :icon="Plus"
                  >
                    添加请求头
                  </el-button>
                </div>
              </div>

              <!-- 查询参数 -->
              <div class="section">
                <label class="section-label">查询参数</label>
                <div class="params-container">
                  <div 
                    v-for="(param, index) in selectedApi.params" 
                    :key="index"
                    class="param-row"
                  >
                    <el-input
                      v-model="param.key"
                      placeholder="参数名"
                      class="param-key"
                    />
                    <el-input
                      v-model="param.value"
                      placeholder="参数值"
                      class="param-value"
                    />
                    <el-button 
                      type="danger" 
                      text
                      @click="removeParam(index)"
                      :icon="Delete"
                    />
                  </div>
                  <el-button 
                    type="primary" 
                    text 
                    @click="addParam"
                    :icon="Plus"
                  >
                    添加参数
                  </el-button>
                </div>
              </div>

              <!-- 请求体 -->
              <div class="section" v-if="['POST', 'PUT', 'PATCH'].includes(selectedApi.method)">
                <label class="section-label">请求体 (JSON)</label>
                <div class="monaco-editor-container">
                  <vue-monaco-editor
                    v-model:value="selectedApi.body"
                    language="json"
                    theme="vs-dark"
                    :options="editorOptions"
                    @change="onBodyChange"
                    style="height: 200px;"
                  />
                </div>
              </div>
            </el-tab-pane>

            <!-- 响应结果 -->
            <el-tab-pane label="响应结果" name="response">
              <div v-if="response" class="response-container">
                <!-- 响应状态 -->
                <div class="response-status">
                  <el-tag 
                    :type="getStatusType(response.status)" 
                    size="large"
                  >
                    {{ response.status }} {{ response.statusText }}
                  </el-tag>
                  <span class="response-time">{{ response.duration }}ms</span>
                </div>

                <!-- 响应头 -->
                <div class="section">
                  <label class="section-label">响应头</label>
                  <div class="response-headers">
                    <div 
                      v-for="(value, key) in response.headers" 
                      :key="key"
                      class="header-item"
                    >
                      <strong>{{ key }}:</strong> {{ value }}
                    </div>
                  </div>
                </div>

                <!-- 响应体 -->
                <div class="section">
                  <label class="section-label">响应体</label>
                  <div class="monaco-editor-container">
                    <vue-monaco-editor
                      :value="formatResponseBody(response.data)"
                      language="json"
                      theme="vs-dark"
                      :options="{ ...editorOptions, readOnly: true }"
                      style="height: 300px;"
                    />
                  </div>
                </div>
              </div>
              
              <div v-else class="no-response">
                <el-empty description="暂无响应数据，请先发送请求" />
              </div>
            </el-tab-pane>
          </el-tabs>
        </el-card>

        <!-- 未选择接口时的提示 -->
        <el-card v-else class="empty-panel">
          <el-empty description="请先选择一个代理服务和接口" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 添加接口对话框 -->
    <el-dialog
      v-model="showAddApiDialog"
      title="添加接口"
      width="500px"
    >
      <el-form :model="newApi" label-width="80px">
        <el-form-item label="接口名称">
          <el-input v-model="newApi.name" placeholder="可选，接口的描述名称" />
        </el-form-item>
        <el-form-item label="请求方法">
          <el-select v-model="newApi.method" class="full-width">
            <el-option label="GET" value="GET" />
            <el-option label="POST" value="POST" />
            <el-option label="PUT" value="PUT" />
            <el-option label="DELETE" value="DELETE" />
            <el-option label="PATCH" value="PATCH" />
          </el-select>
        </el-form-item>
        <el-form-item label="接口路径">
          <el-input 
            v-model="newApi.path" 
            placeholder="例如: /getProfileList"
          />
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="showAddApiDialog = false">取消</el-button>
        <el-button type="primary" @click="addApi">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAppStore } from '../stores/app'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete, Position, CopyDocument } from '@element-plus/icons-vue'
import { VueMonacoEditor } from '@guolao/vue-monaco-editor'

const appStore = useAppStore()

// 响应式数据
const selectedService = ref('')
const selectedEnvironment = ref('target')
const customEnvironmentUrl = ref('')
const selectedApi = ref(null)
const activeTab = ref('request')
const showAddApiDialog = ref(false)
const requesting = ref(false)
const response = ref(null)

// Monaco Editor 配置
const editorOptions = {
  automaticLayout: true,
  formatOnType: true,
  formatOnPaste: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  wordWrap: 'on',
  lineNumbers: 'on',
  glyphMargin: false,
  folding: true,
  lineDecorationsWidth: 0,
  lineNumbersMinChars: 3,
  tabSize: 2,
  insertSpaces: true,
  detectIndentation: false,
  fontSize: 14,
  fontFamily: 'Consolas, Monaco, "Courier New", monospace'
}

// 代理服务列表
const proxyServices = computed(() => appStore.proxyServices || [])

// 环境配置 - 动态生成
const environments = computed(() => {
  if (!selectedService.value) return []
  
  const service = proxyServices.value.find(s => s.serviceName === selectedService.value)
  if (!service) return []
  
  const envs = []
  
  // 添加代理服务配置的环境
  if (service.targetUrl) {
    envs.push({
      key: 'target',
      label: `目标地址 ${service.isRunning ? '(当前使用)' : ''}`,
      url: service.targetUrl,
      isActive: service.isRunning
    })
  }
  
  if (service.testUrl) {
    envs.push({
      key: 'test',
      label: `测试地址`,
      url: service.testUrl,
      isActive: false
    })
  }
  
  if (service.devUrl) {
    envs.push({
      key: 'dev',
      label: `开发地址`,
      url: service.devUrl,
      isActive: false
    })
  }
  
  // 添加自定义地址选项
  envs.push({
    key: 'custom',
    label: '自定义地址',
    url: '',
    isActive: false
  })
  
  return envs
})

// 接口数据存储
const apiData = ref({})

// 当前服务的接口列表
const currentServiceApis = computed(() => {
  if (!selectedService.value) return []
  return apiData.value[selectedService.value] || []
})

// 当前环境地址
const currentEnvironmentUrl = computed(() => {
  if (!selectedService.value || !selectedEnvironment.value) return ''
  
  // 优先使用自定义地址
  if (selectedEnvironment.value === 'custom' && customEnvironmentUrl.value) {
    return customEnvironmentUrl.value
  }
  
  // 从环境配置中获取地址
  const env = environments.value.find(e => e.key === selectedEnvironment.value)
  return env?.url || ''
})

// 新接口表单
const newApi = ref({
  name: '',
  method: 'GET',
  path: ''
})

// 监听服务变化
const onServiceChange = () => {
  selectedApi.value = null
  response.value = null
  
  // 自动选择默认环境（优先选择正在使用的环境）
  const activeEnv = environments.value.find(env => env.isActive)
  if (activeEnv) {
    selectedEnvironment.value = activeEnv.key
  } else if (environments.value.length > 0) {
    selectedEnvironment.value = environments.value[0].key
  } else {
    selectedEnvironment.value = ''
  }
  
  // 清空自定义地址
  customEnvironmentUrl.value = ''
  
  loadServiceApis()
}

// 选择接口
const selectApi = (api) => {
  selectedApi.value = api
  response.value = null
  activeTab.value = 'request'
}

// 添加接口
const addApi = async () => {
  if (!newApi.value.path) {
    ElMessage.warning('请输入接口路径')
    return
  }

  const api = {
    id: Date.now(),
    name: newApi.value.name,
    method: newApi.value.method,
    path: newApi.value.path,
    headers: [
      { key: 'Content-Type', value: 'application/json' },
      { key: 'Accept', value: 'application/json' }
    ],
    params: [],
    body: ['POST', 'PUT', 'PATCH'].includes(newApi.value.method) ? '{\n  \n}' : ''
  }

  if (!apiData.value[selectedService.value]) {
    apiData.value[selectedService.value] = []
  }
  
  apiData.value[selectedService.value].push(api)
  await saveApiData()
  
  // 重置表单
  newApi.value = {
    name: '',
    method: 'GET',
    path: ''
  }
  
  showAddApiDialog.value = false
  ElMessage.success('接口添加成功')
}

// 删除接口
const deleteApi = async (api) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除接口 "${api.name || api.path}" 吗？`,
      '确认删除',
      {
        type: 'warning',
      }
    )
    
    // 从本地数据中删除
    const index = apiData.value[selectedService.value].findIndex(item => item.id === api.id)
    if (index > -1) {
      apiData.value[selectedService.value].splice(index, 1)
      
      // 保存到后端
      await saveApiData()
      
      // 如果删除的是当前选中的接口，清空选择
      if (selectedApi.value?.id === api.id) {
        selectedApi.value = null
        response.value = null
      }
      
      ElMessage.success('接口删除成功')
    }
  } catch {
    // 用户取消删除
  }
}

// 添加请求头
const addHeader = async () => {
  selectedApi.value.headers.push({ key: '', value: '' })
  await saveApiData()
}

// 删除请求头
const removeHeader = async (index) => {
  selectedApi.value.headers.splice(index, 1)
  await saveApiData()
}

// 添加参数
const addParam = async () => {
  selectedApi.value.params.push({ key: '', value: '' })
  await saveApiData()
}

// 删除参数
const removeParam = async (index) => {
  selectedApi.value.params.splice(index, 1)
  await saveApiData()
}

// 请求体变化处理
const onBodyChange = async () => {
  await saveApiData()
}

// 复制cURL命令
const copyCurlCommand = () => {
  if (!selectedApi.value || !selectedService.value) {
    ElMessage.warning('请选择代理服务和接口')
    return
  }

  // 构建URL
  const baseUrl = currentEnvironmentUrl.value
  if (!baseUrl) {
    ElMessage.warning('请先配置环境地址')
    return
  }
  
  const fullUrl = new URL(selectedApi.value.path, baseUrl)
  
  // 添加查询参数
  selectedApi.value.params.forEach(param => {
    if (param.key && param.value) {
      fullUrl.searchParams.append(param.key, param.value)
    }
  })

  // 构建cURL命令
  let curlCommand = `curl -X ${selectedApi.value.method}`
  
  // 添加请求头
  selectedApi.value.headers.forEach(header => {
    if (header.key && header.value) {
      curlCommand += ` \\\n  -H "${header.key}: ${header.value}"`
    }
  })
  
  // 添加请求体
  if (['POST', 'PUT', 'PATCH'].includes(selectedApi.value.method) && selectedApi.value.body) {
    const body = selectedApi.value.body.replace(/"/g, '\\"')
    curlCommand += ` \\\n  -d "${body}"`
  }
  
  // 添加URL
  curlCommand += ` \\\n  "${fullUrl.toString()}"`
  
  // 复制到剪贴板
  navigator.clipboard.writeText(curlCommand).then(() => {
    ElMessage.success('cURL命令已复制到剪贴板')
  }).catch(() => {
    ElMessage.error('复制失败，请手动复制')
    console.log('cURL命令:', curlCommand)
  })
}

// 发送请求
const sendRequest = async () => {
  if (!selectedApi.value || !selectedService.value) {
    ElMessage.warning('请选择代理服务和接口')
    return
  }

  requesting.value = true

  try {
    // 获取当前环境地址
    const baseUrl = currentEnvironmentUrl.value
    if (!baseUrl) {
      ElMessage.warning('请先配置环境地址')
      return
    }

    const fullUrl = new URL(selectedApi.value.path, baseUrl).toString()
    
    // 构建请求头
    const headers = {}
    selectedApi.value.headers.forEach(header => {
      if (header.key && header.value) {
        headers[header.key] = header.value
      }
    })

    // 构建查询参数
    const params = {}
    selectedApi.value.params.forEach(param => {
      if (param.key && param.value) {
        params[param.key] = param.value
      }
    })

    // 构建请求数据
    const requestData = {
      url: fullUrl,
      method: selectedApi.value.method,
      headers,
      params,
      body: ['POST', 'PUT', 'PATCH'].includes(selectedApi.value.method) ? selectedApi.value.body : undefined
    }

    // 通过后端代理发送请求
    const res = await fetch('/api/debug/proxy-request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    })

    const result = await res.json()
    
    if (result.success) {
      response.value = result.data
      activeTab.value = 'response'
      ElMessage.success('请求发送成功')
    } else {
      response.value = result.data
      activeTab.value = 'response'
      ElMessage.error('请求发送失败: ' + result.error)
    }

  } catch (error) {
    response.value = {
      status: 0,
      statusText: 'Network Error',
      headers: {},
      data: error.message,
      duration: 0
    }
    
    activeTab.value = 'response'
    ElMessage.error('请求发送失败: ' + error.message)
  } finally {
    requesting.value = false
  }
}

// 获取状态类型
const getStatusType = (status) => {
  if (status >= 200 && status < 300) return 'success'
  if (status >= 300 && status < 400) return 'warning'
  if (status >= 400) return 'danger'
  return 'info'
}

// 格式化响应体
const formatResponseBody = (data) => {
  if (typeof data === 'object') {
    return JSON.stringify(data, null, 2)
  }
  return data
}

// 保存接口数据
const saveApiData = async () => {
  if (!selectedService.value) return
  
  try {
    await fetch('/api/debug/apis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        serviceName: selectedService.value,
        apis: apiData.value[selectedService.value] || []
      })
    })
  } catch (error) {
    console.error('保存接口数据失败:', error)
  }
}

// 加载接口数据
const loadApiData = async () => {
  try {
    const res = await fetch('/api/debug/apis')
    const result = await res.json()
    if (result.success) {
      apiData.value = result.data
    }
  } catch (error) {
    console.error('加载接口数据失败:', error)
  }
}

// 加载服务的接口
const loadServiceApis = () => {
  if (!selectedService.value) return
  
  if (!apiData.value[selectedService.value]) {
    apiData.value[selectedService.value] = []
  }
}

onMounted(async () => {
  await appStore.fetchProxyServices()
  await loadApiData()
})
</script>

<style scoped>
.api-debugger {
  height: 100%;
}

.service-panel,
.request-panel,
.empty-panel {
  height: calc(100vh - 120px);
  overflow-y: auto;
}

.section {
  margin-bottom: 20px;
}

.section-label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: var(--text-color);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.full-width {
  width: 100%;
}

.mt-2 {
  margin-top: 8px;
}

.environment-url {
  margin-top: 8px;
  padding: 8px;
  background-color: var(--bg-color-secondary);
  border-radius: 4px;
  color: var(--text-color-secondary);
  font-family: 'Courier New', monospace;
}

.env-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.active-badge {
  background-color: #67c23a;
  color: white;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: bold;
}

.custom-url-hint {
  display: block;
  margin-top: 4px;
  color: var(--text-color-secondary);
  font-size: 12px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-actions {
  display: flex;
  gap: 8px;
}

/* 接口列表样式 */
.api-list {
  max-height: 400px;
  overflow-y: auto;
}

.api-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.api-item:hover {
  border-color: #409eff;
  background-color: var(--hover-bg);
}

.api-item.active {
  border-color: #409eff;
  background-color: var(--active-bg);
}

.api-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.api-method {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
  color: white;
}

.api-method.get { background-color: #67c23a; }
.api-method.post { background-color: #409eff; }
.api-method.put { background-color: #e6a23c; }
.api-method.delete { background-color: #f56c6c; }
.api-method.patch { background-color: #909399; }

.api-path {
  font-family: 'Courier New', monospace;
  color: var(--text-color);
}

.empty-apis {
  text-align: center;
  color: var(--text-color-secondary);
  padding: 20px;
}

/* 请求头和参数样式 */
.headers-container,
.params-container {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 12px;
}

.header-row,
.param-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  align-items: center;
}

.header-key,
.param-key {
  flex: 1;
}

.header-value,
.param-value {
  flex: 2;
}

/* JSON编辑器样式 */
.json-editor-container {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
}

.json-editor {
  width: 100%;
  border: none;
  outline: none;
  padding: 12px;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  background-color: var(--input-bg);
  color: var(--text-color);
  resize: vertical;
}

/* Monaco Editor 样式 */
.monaco-editor-container {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
}

/* 响应样式 */
.response-container {
  padding: 16px;
}

.response-status {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.response-time {
  color: var(--text-color-secondary);
  font-size: 14px;
}

.response-headers {
  background-color: var(--bg-color-secondary);
  border-radius: 6px;
  padding: 12px;
  max-height: 200px;
  overflow-y: auto;
}

.header-item {
  margin-bottom: 4px;
  font-family: 'Courier New', monospace;
  font-size: 14px;
}

.response-body {
  background-color: var(--bg-color-secondary);
  border-radius: 6px;
  padding: 12px;
  max-height: 400px;
  overflow: auto;
}

.response-body pre {
  margin: 0;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  color: var(--text-color);
  white-space: pre-wrap;
  word-break: break-all;
}

.no-response {
  padding: 40px;
}
</style> 