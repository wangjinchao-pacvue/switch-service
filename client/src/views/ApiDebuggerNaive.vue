<template>
  <div class="api-debugger">
    <!-- 顶部工具栏 -->
    <n-card class="toolbar-card" size="small">
      <div class="toolbar">
        <div class="toolbar-left">
          <!-- 服务选择 -->
          <div class="toolbar-item">
            <span class="toolbar-label">代理服务</span>
            <n-select 
              v-model:value="selectedService" 
              placeholder="选择代理服务"
              @update:value="onServiceChange"
              style="width: 180px;"
              :options="proxyServiceOptions"
            />
          </div>

          <!-- 环境选择 -->
          <div class="toolbar-item" v-if="selectedService">
            <span class="toolbar-label">环境</span>
            <n-select 
              v-model:value="selectedEnvironment" 
              placeholder="选择环境"
              @update:value="onEnvironmentChange"
              style="width: 140px;"
              :options="environmentOptions"
            />
          </div>
          
          <!-- 环境URL显示 -->
          <div class="toolbar-item environment-url-item" v-if="selectedService">
            <n-tooltip v-if="currentEnvironmentUrl" trigger="hover">
              <template #trigger>
                <div class="environment-url-display">
                  <span class="environment-url">{{ currentEnvironmentUrl }}</span>
                </div>
              </template>
              环境地址: {{ currentEnvironmentUrl }}
            </n-tooltip>
            <span v-else class="environment-url text-muted">未配置环境地址</span>
          </div>

          <!-- 接口选择 -->
          <div class="toolbar-item" v-if="selectedService">
            <span class="toolbar-label">接口</span>
            <n-select 
              v-model:value="selectedApiId" 
              placeholder="选择接口"
              @update:value="onApiChange"
              style="width: 350px;"
              clearable
              :options="apiSelectOptions"
            />
          </div>
        </div>

        <div class="toolbar-right">
          <!-- 变量管理按钮 -->
          <n-button 
            type="primary" 
            @click="showVariablesDialog = true"
            secondary
          >
            <template #icon>
              <n-icon><SettingsIcon /></n-icon>
            </template>
            变量管理
          </n-button>
        </div>
      </div>
    </n-card>

    <!-- 主要内容区域 -->
    <div class="main-content" v-if="selectedApi">
      <div class="debugger-container">
        <!-- 左侧：请求配置 -->
        <div class="left-panel">
          <n-card class="request-panel" size="small">
            <template #header>
              <div class="card-header">
                <span class="card-title">请求配置</span>
                <div class="header-actions">
                  <n-button 
                    @click="copyCurlCommand"
                    secondary
                  >
                    <template #icon>
                      <n-icon><CopyIcon /></n-icon>
                    </template>
                    复制cURL
                  </n-button>
                  <n-button 
                    type="primary" 
                    @click="sendRequest"
                    :loading="requesting"
                  >
                    <template #icon>
                      <n-icon><SendIcon /></n-icon>
                    </template>
                    发送请求
                  </n-button>
                </div>
              </div>
            </template>

            <div class="request-content">
              <n-tabs v-model:value="requestActiveTab" type="line">
                <!-- 请求头 -->
                <n-tab-pane name="headers" tab="Headers">
                  <div class="tab-content">
                    <div class="input-group-container">
                      <div 
                        v-for="(header, index) in selectedApi.headers" 
                        :key="index"
                        class="input-group-row"
                      >
                        <n-input
                          v-model:value="header.key"
                          placeholder="Header名称"
                          class="input-key"
                        />
                        <div class="input-value-container">
                          <n-select
                            v-model:value="header.valueType"
                            class="value-type-select"
                            @update:value="() => onHeaderValueTypeChange(header)"
                            :options="valueTypeOptions"
                          />
                          <n-input
                            v-if="header.valueType === 'custom'"
                            v-model:value="header.value"
                            placeholder="Header值"
                            class="input-value"
                          />
                          <n-select
                            v-else
                            v-model:value="header.value"
                            placeholder="选择变量"
                            class="input-value"
                            :options="variableOptions"
                          />
                        </div>
                        <n-button 
                          type="error" 
                          text
                          @click="removeHeader(index)"
                        >
                          <template #icon>
                            <n-icon><DeleteIcon /></n-icon>
                          </template>
                        </n-button>
                      </div>
                      <div class="add-button-container">
                        <n-button 
                          type="primary" 
                          text 
                          @click="addHeader"
                          size="small"
                        >
                          <template #icon>
                            <n-icon><AddIcon /></n-icon>
                          </template>
                          添加请求头
                        </n-button>
                        
                        <!-- 快速添加常用请求头 -->
                        <n-dropdown
                          trigger="click"
                          :options="headerPresetOptions"
                          @select="addPresetHeader"
                        >
                          <n-button 
                            text 
                            size="small"
                            type="info"
                          >
                            <template #icon>
                              <n-icon><SettingsIcon /></n-icon>
                            </template>
                            快速添加
                          </n-button>
                        </n-dropdown>
                      </div>
                    </div>
                  </div>
                </n-tab-pane>

                <!-- 查询参数 -->
                <n-tab-pane name="params" tab="Params">
                  <div class="tab-content">
                    <div class="input-group-container">
                      <div 
                        v-for="(param, index) in selectedApi.params" 
                        :key="index"
                        class="input-group-row"
                      >
                        <n-input
                          v-model:value="param.key"
                          placeholder="参数名"
                          class="input-key"
                        />
                        <div class="input-value-container">
                          <n-select
                            v-model:value="param.valueType"
                            class="value-type-select"
                            @update:value="() => onParamValueTypeChange(param)"
                            :options="valueTypeOptions"
                          />
                          <n-input
                            v-if="param.valueType === 'custom'"
                            v-model:value="param.value"
                            placeholder="参数值"
                            class="input-value"
                          />
                          <n-select
                            v-else
                            v-model:value="param.value"
                            placeholder="选择变量"
                            class="input-value"
                            :options="variableOptions"
                          />
                        </div>
                        <n-button 
                          type="error" 
                          text
                          @click="removeParam(index)"
                        >
                          <template #icon>
                            <n-icon><DeleteIcon /></n-icon>
                          </template>
                        </n-button>
                      </div>
                      <div class="add-button-container">
                        <n-button 
                          type="primary" 
                          text 
                          @click="addParam"
                          size="small"
                        >
                          <template #icon>
                            <n-icon><AddIcon /></n-icon>
                          </template>
                          添加参数
                        </n-button>
                        
                        <!-- 快速添加常用参数 -->
                        <n-dropdown
                          trigger="click"
                          :options="paramPresetOptions"
                          @select="addPresetParam"
                        >
                          <n-button 
                            text 
                            size="small"
                            type="info"
                          >
                            <template #icon>
                              <n-icon><SettingsIcon /></n-icon>
                            </template>
                            快速添加
                          </n-button>
                        </n-dropdown>
                      </div>
                    </div>
                  </div>
                </n-tab-pane>

                <!-- 请求体 -->
                <n-tab-pane 
                  name="body" 
                  tab="Body" 
                  v-if="['POST', 'PUT', 'PATCH'].includes(selectedApi.method)"
                >
                  <div class="tab-content">
                    <div class="request-body-header">
                      <div class="body-status">
                        <n-tag 
                          :type="getJsonValidityType()" 
                          size="small"
                          v-if="selectedApi.body"
                        >
                          {{ getJsonValidityText() }}
                        </n-tag>
                        <span class="body-size" v-if="selectedApi.body">
                          {{ getRequestBodySize() }}
                        </span>
                      </div>
                      <div class="body-actions">
                        <n-button-group size="small">
                          <n-button 
                            @click="formatRequestBody"
                            :disabled="!selectedApi.body"
                            secondary
                          >
                            <template #icon>
                              <n-icon><CodeIcon /></n-icon>
                            </template>
                            格式化
                          </n-button>
                          <n-button 
                            @click="copyRequestBody"
                            :disabled="!selectedApi.body"
                            secondary
                          >
                            <template #icon>
                              <n-icon><CopyIcon /></n-icon>
                            </template>
                            复制
                          </n-button>
                          <n-button 
                            @click="minifyRequestBody"
                            :disabled="!selectedApi.body"
                            secondary
                          >
                            <template #icon>
                              <n-icon><CompressIcon /></n-icon>
                            </template>
                            压缩
                          </n-button>
                        </n-button-group>
                      </div>
                    </div>
                    <div class="monaco-editor-container">
                      <vue-monaco-editor
                        v-model:value="selectedApi.body"
                        language="json"
                        :theme="appStore.theme === 'dark' ? 'vs-dark' : 'vs'"
                        :options="editorOptions"
                        @change="onBodyChange"
                        style="height: 300px;"
                      />
                    </div>
                  </div>
                </n-tab-pane>
              </n-tabs>
            </div>
          </n-card>
        </div>

        <!-- 右侧：响应结果 -->
        <div class="right-panel">
          <n-card class="response-panel" size="small">
            <template #header>
              <div class="card-header">
                <span class="card-title">响应结果</span>
                <div class="header-actions" v-if="response">
                  <n-tag 
                    :type="getStatusType(response.status)" 
                    size="large"
                  >
                    {{ response.status }} {{ response.statusText }}
                  </n-tag>
                  <span class="response-time">{{ response.duration }}ms</span>
                </div>
              </div>
            </template>

            <div class="response-content">
              <div v-if="response" class="response-container">
                <n-tabs v-model:value="responseActiveTab" type="line">
                  <!-- 响应头 -->
                  <n-tab-pane name="headers" tab="Headers">
                    <div class="tab-content">
                      <div class="response-headers-header">
                        <div class="headers-info">
                          <span class="headers-count">{{ Object.keys(response.headers || {}).length }} 个响应头</span>
                        </div>
                        <div class="headers-actions">
                          <n-button 
                            @click="copyResponseHeaders"
                            secondary
                            size="small"
                          >
                            <template #icon>
                              <n-icon><CopyIcon /></n-icon>
                            </template>
                            复制全部
                          </n-button>
                        </div>
                      </div>
                      <div class="response-headers-container">
                        <div 
                          v-for="(value, key) in response.headers" 
                          :key="key"
                          class="header-item"
                        >
                          <span class="header-key">{{ key }}:</span>
                          <span class="header-value">{{ value }}</span>
                        </div>
                      </div>
                    </div>
                  </n-tab-pane>

                  <!-- 响应体 -->
                  <n-tab-pane name="body" tab="Body">
                    <div class="tab-content">
                      <div class="response-body-header">
                        <div class="body-status">
                          <n-tag size="small" type="info">{{ getResponseLanguage().toUpperCase() }}</n-tag>
                          <span class="body-size">{{ getResponseSize() }}</span>
                        </div>
                        <div class="body-actions">
                          <n-button-group size="small">
                            <n-button 
                              :type="responseViewMode === 'formatted' ? 'primary' : 'default'"
                              @click="responseViewMode = 'formatted'"
                            >
                              <template #icon>
                                <n-icon><DocumentIcon /></n-icon>
                              </template>
                              格式化
                            </n-button>
                            <n-button 
                              :type="responseViewMode === 'raw' ? 'primary' : 'default'"
                              @click="responseViewMode = 'raw'"
                            >
                              <template #icon>
                                <n-icon><DocumentTextIcon /></n-icon>
                              </template>
                              原始
                            </n-button>
                          </n-button-group>
                          <n-button 
                            @click="copyResponseBody"
                            secondary
                            size="small"
                          >
                            <template #icon>
                              <n-icon><CopyIcon /></n-icon>
                            </template>
                            复制
                          </n-button>
                          <n-button 
                            v-if="isJsonResponse(response.data)"
                            @click="formatJsonResponse"
                            secondary
                            size="small"
                          >
                            <template #icon>
                              <n-icon><CodeIcon /></n-icon>
                            </template>
                            美化JSON
                          </n-button>
                        </div>
                      </div>
                      <div class="monaco-editor-container">
                        <vue-monaco-editor
                          :value="getFormattedResponseBody()"
                          :language="getResponseLanguage()"
                          :theme="appStore.theme === 'dark' ? 'vs-dark' : 'vs'"
                          :options="{ ...editorOptions, readOnly: true }"
                          style="height: 400px;"
                        />
                      </div>
                    </div>
                  </n-tab-pane>
                </n-tabs>
              </div>
              
              <div v-else class="no-response">
                <n-empty description="暂无响应数据">
                  <template #icon>
                    <n-icon size="48">
                      <RocketIcon />
                    </n-icon>
                  </template>
                  <template #extra>
                    <span>点击发送请求按钮开始调试</span>
                  </template>
                </n-empty>
              </div>
            </div>
          </n-card>
        </div>
      </div>
    </div>

    <!-- 未选择接口时的提示 -->
    <div v-else class="empty-main">
      <n-card class="empty-panel">
        <n-empty description="请选择代理服务和接口开始调试">
          <template #icon>
            <n-icon size="48">
              <ToolIcon />
            </n-icon>
          </template>
          <template #extra>
            <span>在上方工具栏中选择要调试的服务和接口</span>
          </template>
        </n-empty>
      </n-card>
    </div>

    <!-- 添加接口对话框 -->
    <n-modal
      v-model:show="showAddApiDialog"
      preset="dialog"
      title="添加接口"
      style="width: 500px;"
    >
      <n-form :model="newApi" label-width="80px">
        <n-form-item label="接口名称">
          <n-input v-model:value="newApi.name" placeholder="可选，接口的描述名称" />
        </n-form-item>
        <n-form-item label="请求方法">
          <n-select v-model:value="newApi.method" :options="methodOptions" />
        </n-form-item>
        <n-form-item label="接口路径">
          <n-input 
            v-model:value="newApi.path" 
            placeholder="例如: /getProfileList"
          />
        </n-form-item>
      </n-form>
      
      <template #action>
        <n-button @click="showAddApiDialog = false">取消</n-button>
        <n-button type="primary" @click="addApi">确定</n-button>
      </template>
    </n-modal>

    <!-- 编辑接口对话框 -->
    <n-modal
      v-model:show="showEditApiDialog"
      preset="dialog"
      title="编辑接口"
      style="width: 500px;"
    >
      <n-form :model="editingApi" label-width="80px">
        <n-form-item label="接口名称">
          <n-input v-model:value="editingApi.name" placeholder="可选，接口的描述名称" />
        </n-form-item>
        <n-form-item label="请求方法">
          <n-select v-model:value="editingApi.method" :options="methodOptions" />
        </n-form-item>
        <n-form-item label="接口路径">
          <n-input 
            v-model:value="editingApi.path" 
            placeholder="例如: /getProfileList"
          />
        </n-form-item>
      </n-form>
      
      <template #action>
        <n-button @click="showEditApiDialog = false">取消</n-button>
        <n-button type="primary" @click="updateApi">确定</n-button>
      </template>
    </n-modal>

    <!-- 变量管理对话框 -->
    <n-modal
      v-model:show="showVariablesDialog"
      preset="dialog"
      title="全局变量管理"
      style="width: 700px;"
    >
      <div class="variables-container">
        <!-- 变量列表 -->
        <div class="variables-list">
          <n-data-table 
            :columns="variableColumns" 
            :data="globalVariables"
            :pagination="false"
          />
        </div>

        <!-- 添加新变量 -->
        <div class="add-variable-form">
          <n-divider>添加新变量</n-divider>
          <n-form :model="newVariable" label-width="80px">
            <n-grid :cols="3" :x-gap="16">
              <n-gi>
                <n-form-item label="变量名">
                  <n-input v-model:value="newVariable.key" placeholder="变量名" />
                </n-form-item>
              </n-gi>
              <n-gi>
                <n-form-item label="变量值">
                  <n-input v-model:value="newVariable.value" placeholder="变量值" />
                </n-form-item>
              </n-gi>
              <n-gi>
                <n-form-item label="描述">
                  <n-input v-model:value="newVariable.description" placeholder="描述" />
                </n-form-item>
              </n-gi>
            </n-grid>
            <n-form-item>
              <n-button type="primary" @click="addVariable">
                <template #icon>
                  <n-icon><AddIcon /></n-icon>
                </template>
                添加变量
              </n-button>
            </n-form-item>
          </n-form>
        </div>
      </div>
      
      <template #action>
        <n-button @click="showVariablesDialog = false">关闭</n-button>
      </template>
    </n-modal>


  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick, h } from 'vue'
import { useAppStore } from '../stores/app'
import { useMessage } from 'naive-ui'
import { 
  NCard, NSelect, NButton, NIcon, NTooltip, NTabs, NTabPane, NInput, 
  NEmpty, NModal, NForm, NFormItem, NDataTable, NDivider, NGrid, NGi,
  NButtonGroup, NTag, NDropdown
} from 'naive-ui'
import { 
  SettingsOutline, CopyOutline, SendOutline, AddOutline, TrashOutline,
  CodeOutline, DocumentOutline, DocumentTextOutline, RocketOutline,
  ConstructOutline, ContractOutline
} from '@vicons/ionicons5'
import { VueMonacoEditor } from '@guolao/vue-monaco-editor'

// 创建图标组件
const SettingsIcon = () => h(SettingsOutline)
const CopyIcon = () => h(CopyOutline)
const SendIcon = () => h(SendOutline)
const AddIcon = () => h(AddOutline)
const DeleteIcon = () => h(TrashOutline)
const CodeIcon = () => h(CodeOutline)
const DocumentIcon = () => h(DocumentOutline)
const DocumentTextIcon = () => h(DocumentTextOutline)
const RocketIcon = () => h(RocketOutline)
const ToolIcon = () => h(ConstructOutline)
const CompressIcon = () => h(ContractOutline)

const appStore = useAppStore()
const message = useMessage()

// 响应式数据
const selectedService = ref('')
const selectedEnvironment = ref('target')
const selectedApi = ref(null)
const selectedApiId = ref('')
const requestActiveTab = ref('headers')
const responseActiveTab = ref('headers')
const showAddApiDialog = ref(false)
const showEditApiDialog = ref(false)
const showVariablesDialog = ref(false)

const requesting = ref(false)
const response = ref(null)
const responseViewMode = ref('formatted') // 'formatted' | 'raw'

// 全局变量池
const globalVariables = ref([
  { key: 'token', value: '', description: '认证令牌' },
  { key: 'baseUrl', value: '', description: '基础URL' },
  { key: 'userId', value: '', description: '用户ID' }
])

// 新增变量表单
const newVariable = ref({
  key: '',
  value: '',
  description: ''
})

// 接口数据存储
const apiData = ref({})

// 新接口表单
const newApi = ref({
  name: '',
  method: 'GET',
  path: ''
})

// 编辑接口表单
const editingApi = ref({
  id: null,
  name: '',
  method: 'GET',
  path: ''
})

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
  tabSize: 4,
  insertSpaces: true,
  detectIndentation: false,
  fontSize: 14,
  fontFamily: 'JetBrains Mono, Fira Code, Consolas, Monaco, "Courier New", monospace',
  padding: { top: 16, bottom: 16 },
  contextmenu: true,
  quickSuggestions: true
}

// 计算属性
const proxyServices = computed(() => appStore.proxyServices || [])

const proxyServiceOptions = computed(() => 
  proxyServices.value.map(service => ({
    label: service.serviceName,
    value: service.serviceName
  }))
)

const environments = computed(() => {
  if (!selectedService.value) return []
  
  const service = proxyServices.value.find(s => s.serviceName === selectedService.value)
  if (!service) return []
  
  const envs = []
  
  if (service.targets && typeof service.targets === 'object') {
    Object.entries(service.targets).forEach(([envName, envUrl]) => {
      const isActive = service.isRunning && service.activeTarget === envName
      envs.push({
        key: envName,
        label: `${envName} ${isActive ? '(当前使用)' : ''}`,
        url: envUrl,
        isActive: isActive
      })
    })
  }
  
  return envs
})

const environmentOptions = computed(() =>
  environments.value.map(env => ({
    label: env.label,
    value: env.key
  }))
)

const currentServiceApis = computed(() => {
  if (!selectedService.value) return []
  return apiData.value[selectedService.value] || []
})

const currentEnvironmentUrl = computed(() => {
  if (!selectedService.value || !selectedEnvironment.value) return ''
  
  const env = environments.value.find(e => e.key === selectedEnvironment.value)
  return env?.url || ''
})

const apiSelectOptions = computed(() => {
  const options = [
    {
      type: 'group',
      label: '接口管理',
      key: 'management',
      children: [
        {
          label: '+ 添加新接口',
          value: '__ADD_NEW__'
        }
      ]
    }
  ]
  
  if (selectedApi.value) {
    options[0].children.push({
      label: '✏️ 编辑当前接口',
      value: '__EDIT_CURRENT__'
    })
  }
  
  if (currentServiceApis.value.length > 0) {
    options.push({
      type: 'group',
      label: '接口列表',
      key: 'apis',
      children: currentServiceApis.value.map(api => {
        const displayName = api.name || api.path
        const label = api.name ? `${api.name} (${api.method}) - ${api.path}` : `${api.path} (${api.method})`
        
        return {
          label: label,
          value: api.id
        }
      })
    })
  }
  
  return options
})

const valueTypeOptions = [
  { label: '自定义', value: 'custom' },
  { label: '变量池', value: 'variable' }
]

// 请求头预设选项
const headerPresetOptions = [
  {
    label: '认证相关',
    key: 'auth',
    children: [
      { label: 'Authorization Bearer', key: 'auth-bearer' },
      { label: 'Authorization Basic', key: 'auth-basic' },
      { label: 'client 参数', key: 'client' },
      { label: 'user 参数', key: 'user' }
    ]
  },
  {
    label: '内容类型',
    key: 'content',
    children: [
      { label: 'Content-Type: application/json', key: 'content-json' },
      { label: 'Content-Type: application/xml', key: 'content-xml' },
      { label: 'Content-Type: application/x-www-form-urlencoded', key: 'content-form' },
      { label: 'Accept: application/json', key: 'accept-json' }
    ]
  },
  {
    label: '常用请求头',
    key: 'common',
    children: [
      { label: 'User-Agent', key: 'user-agent' },
      { label: 'X-Requested-With', key: 'x-requested-with' },
      { label: 'Cache-Control', key: 'cache-control' },
      { label: 'Pragma', key: 'pragma' }
    ]
  }
]

// 查询参数预设选项
const paramPresetOptions = [
  {
    label: '认证参数',
    key: 'auth-params',
    children: [
      { label: 'client 参数', key: 'client' },
      { label: 'user 参数', key: 'user' },
      { label: 'token 参数', key: 'token' },
      { label: 'api_key 参数', key: 'api_key' }
    ]
  },
  {
    label: '分页参数',
    key: 'pagination',
    children: [
      { label: 'page 页码', key: 'page' },
      { label: 'size 页大小', key: 'size' },
      { label: 'limit 限制数量', key: 'limit' },
      { label: 'offset 偏移量', key: 'offset' }
    ]
  },
  {
    label: '常用参数',
    key: 'common-params',
    children: [
      { label: 'timestamp 时间戳', key: 'timestamp' },
      { label: 'version 版本', key: 'version' },
      { label: 'format 格式', key: 'format' },
      { label: 'callback 回调', key: 'callback' }
    ]
  }
]

const variableOptions = computed(() =>
  globalVariables.value.map(variable => ({
    label: `${variable.key} (${variable.description})`,
    value: variable.key
  }))
)

const methodOptions = [
  { label: 'GET', value: 'GET' },
  { label: 'POST', value: 'POST' },
  { label: 'PUT', value: 'PUT' },
  { label: 'DELETE', value: 'DELETE' },
  { label: 'PATCH', value: 'PATCH' }
]

// 变量表格列定义
const variableColumns = [
  {
    title: '变量名',
    key: 'key',
    width: 150
  },
  {
    title: '变量值',
    key: 'value',
    width: 200,
    render(row, index) {
      return h(NInput, {
        value: row.value,
        placeholder: '请输入变量值',
        onUpdateValue(value) {
          globalVariables.value[index].value = value
          saveGlobalVariables()
        }
      })
    }
  },
  {
    title: '描述',
    key: 'description',
    width: 150,
    render(row, index) {
      return h(NInput, {
        value: row.description,
        placeholder: '请输入描述',
        onUpdateValue(value) {
          globalVariables.value[index].description = value
          saveGlobalVariables()
        }
      })
    }
  },
  {
    title: '操作',
    key: 'actions',
    width: 100,
    render(row, index) {
      return h(NButton, {
        type: 'error',
        text: true,
        size: 'small',
        onClick: () => removeVariable(index)
      }, {
        icon: () => h(NIcon, null, { default: () => h(DeleteIcon) }),
        default: () => '删除'
      })
    }
  }
]

// 方法实现
const onServiceChange = () => {
  selectedApi.value = null
  selectedApiId.value = ''
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
  
  loadServiceApis()
  saveSelectionToStorage()
}

const onEnvironmentChange = () => {
  saveSelectionToStorage()
}

const onApiChange = (apiId) => {
  if (apiId === '__ADD_NEW__') {
    nextTick(() => {
      selectedApiId.value = selectedApi.value?.id || ''
    })
    showAddApiDialog.value = true
    return
  }
  
  if (apiId === '__EDIT_CURRENT__') {
    nextTick(() => {
      selectedApiId.value = selectedApi.value?.id || ''
    })
    if (selectedApi.value) {
      editApi(selectedApi.value)
    }
    return
  }
  
  if (apiId) {
    const api = currentServiceApis.value.find(item => item.id === apiId)
    if (api) {
      selectedApi.value = api
      response.value = null
      saveSelectionToStorage()
    }
  } else {
    selectedApi.value = null
    response.value = null
  }
}

const addHeader = async () => {
  selectedApi.value.headers.push({ 
    key: '', 
    value: '', 
    valueType: 'custom' 
  })
  await saveApiData()
}

const removeHeader = async (index) => {
  selectedApi.value.headers.splice(index, 1)
  await saveApiData()
}

const addPresetHeader = async (key) => {
  const presets = {
    'auth-bearer': { key: 'Authorization', value: 'Bearer YOUR_TOKEN_HERE' },
    'auth-basic': { key: 'Authorization', value: 'Basic YOUR_CREDENTIALS_HERE' },
    'client': { key: 'client', value: 'your_client_id' },
    'user': { key: 'user', value: 'your_user_id' },
    'content-json': { key: 'Content-Type', value: 'application/json' },
    'content-xml': { key: 'Content-Type', value: 'application/xml' },
    'content-form': { key: 'Content-Type', value: 'application/x-www-form-urlencoded' },
    'accept-json': { key: 'Accept', value: 'application/json' },
    'user-agent': { key: 'User-Agent', value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    'x-requested-with': { key: 'X-Requested-With', value: 'XMLHttpRequest' },
    'cache-control': { key: 'Cache-Control', value: 'no-cache' },
    'pragma': { key: 'Pragma', value: 'no-cache' }
  }
  
  const preset = presets[key]
  if (preset) {
    // 检查是否已存在相同的请求头
    const existingIndex = selectedApi.value.headers.findIndex(h => h.key === preset.key)
    if (existingIndex >= 0) {
      // 如果已存在，更新值
      selectedApi.value.headers[existingIndex].value = preset.value
      selectedApi.value.headers[existingIndex].valueType = 'custom'
      message.info(`已更新现有的 ${preset.key} 请求头`)
    } else {
      // 如果不存在，添加新的
      selectedApi.value.headers.push({ 
        key: preset.key, 
        value: preset.value, 
        valueType: 'custom' 
      })
      message.success(`已添加 ${preset.key} 请求头`)
    }
    await saveApiData()
  }
}

const addParam = async () => {
  selectedApi.value.params.push({ 
    key: '', 
    value: '', 
    valueType: 'custom' 
  })
  await saveApiData()
}

const removeParam = async (index) => {
  selectedApi.value.params.splice(index, 1)
  await saveApiData()
}

const addPresetParam = async (key) => {
  const presets = {
    'client': { key: 'client', value: 'your_client_id' },
    'user': { key: 'user', value: 'your_user_id' },
    'token': { key: 'token', value: 'your_access_token' },
    'api_key': { key: 'api_key', value: 'your_api_key' },
    'page': { key: 'page', value: '1' },
    'size': { key: 'size', value: '10' },
    'limit': { key: 'limit', value: '10' },
    'offset': { key: 'offset', value: '0' },
    'timestamp': { key: 'timestamp', value: new Date().getTime().toString() },
    'version': { key: 'version', value: '1.0' },
    'format': { key: 'format', value: 'json' },
    'callback': { key: 'callback', value: 'callback' }
  }
  
  const preset = presets[key]
  if (preset) {
    // 检查是否已存在相同的参数
    const existingIndex = selectedApi.value.params.findIndex(p => p.key === preset.key)
    if (existingIndex >= 0) {
      // 如果已存在，更新值
      selectedApi.value.params[existingIndex].value = preset.value
      selectedApi.value.params[existingIndex].valueType = 'custom'
      message.info(`已更新现有的 ${preset.key} 参数`)
    } else {
      // 如果不存在，添加新的
      selectedApi.value.params.push({ 
        key: preset.key, 
        value: preset.value, 
        valueType: 'custom' 
      })
      message.success(`已添加 ${preset.key} 参数`)
    }
    await saveApiData()
  }
}

const onHeaderValueTypeChange = async (header) => {
  if (header.valueType === 'variable') {
    header.value = ''
  }
  await saveApiData()
}

const onParamValueTypeChange = async (param) => {
  if (param.valueType === 'variable') {
    param.value = ''
  }
  await saveApiData()
}

const onBodyChange = async () => {
  await saveApiData()
}

const addVariable = () => {
  if (!newVariable.value.key) {
    message.warning('请输入变量名')
    return
  }
  
  if (globalVariables.value.find(v => v.key === newVariable.value.key)) {
    message.warning('变量名已存在')
    return
  }
  
  globalVariables.value.push({ ...newVariable.value })
  
  newVariable.value = {
    key: '',
    value: '',
    description: ''
  }
  
  saveGlobalVariables()
  message.success('变量添加成功')
}

const removeVariable = (index) => {
  globalVariables.value.splice(index, 1)
  saveGlobalVariables()
  message.success('变量删除成功')
}

const saveGlobalVariables = () => {
  localStorage.setItem('api-debugger-global-variables', JSON.stringify(globalVariables.value))
}

const loadGlobalVariables = () => {
  const saved = localStorage.getItem('api-debugger-global-variables')
  if (saved) {
    try {
      globalVariables.value = JSON.parse(saved)
    } catch (error) {
      console.error('Failed to load global variables:', error)
    }
  }
}

const formatRequestBody = async () => {
  if (!selectedApi.value || !selectedApi.value.body) {
    message.warning('请求体为空')
    return
  }
  
  try {
    const jsonData = JSON.parse(selectedApi.value.body)
    selectedApi.value.body = JSON.stringify(jsonData, null, 4)
    await saveApiData()
    message.success('请求体JSON已格式化')
  } catch (error) {
    message.error('JSON格式化失败：请检查JSON语法')
  }
}

const copyRequestBody = async () => {
  if (!selectedApi.value || !selectedApi.value.body) {
    message.warning('请求体为空')
    return
  }
  
  try {
    await navigator.clipboard.writeText(selectedApi.value.body)
    message.success('请求体已复制到剪贴板')
  } catch (error) {
    message.error('复制失败')
  }
}

const minifyRequestBody = async () => {
  if (!selectedApi.value || !selectedApi.value.body) {
    message.warning('请求体为空')
    return
  }
  
  try {
    const jsonData = JSON.parse(selectedApi.value.body)
    selectedApi.value.body = JSON.stringify(jsonData)
    await saveApiData()
    message.success('请求体JSON已压缩')
  } catch (error) {
    message.error('JSON压缩失败：请检查JSON语法')
  }
}

const addApi = async () => {
  if (!newApi.value.path) {
    message.warning('请输入接口路径')
    return
  }

  const api = {
    id: Date.now(),
    name: newApi.value.name,
    method: newApi.value.method,
    path: newApi.value.path,
    headers: [
      { key: 'Content-Type', value: 'application/json', valueType: 'custom' },
      { key: 'Accept', value: 'application/json', valueType: 'custom' }
    ],
    params: [],
    body: ['POST', 'PUT', 'PATCH'].includes(newApi.value.method) ? '{\n  \n}' : ''
  }

  if (!apiData.value[selectedService.value]) {
    apiData.value[selectedService.value] = []
  }
  
  apiData.value[selectedService.value].push(api)
  await saveApiData()
  
  newApi.value = {
    name: '',
    method: 'GET',
    path: ''
  }
  
  showAddApiDialog.value = false
  message.success('接口添加成功')
  
  selectedApi.value = api
  selectedApiId.value = api.id
  saveSelectionToStorage()
}

const editApi = (api) => {
  editingApi.value = {
    id: api.id,
    name: api.name,
    method: api.method,
    path: api.path
  }
  showEditApiDialog.value = true
}

const updateApi = async () => {
  if (!editingApi.value.path) {
    message.warning('请输入接口路径')
    return
  }

  const index = apiData.value[selectedService.value].findIndex(item => item.id === editingApi.value.id)
  if (index > -1) {
    const originalApi = apiData.value[selectedService.value][index]
    apiData.value[selectedService.value][index] = {
      ...originalApi,
      name: editingApi.value.name,
      method: editingApi.value.method,
      path: editingApi.value.path
    }
    
    if (selectedApi.value?.id === editingApi.value.id) {
      selectedApi.value = apiData.value[selectedService.value][index]
    }
    
    await saveApiData()
    
    showEditApiDialog.value = false
    message.success('接口更新成功')
    
    saveSelectionToStorage()
  } else {
    message.error('接口更新失败：找不到要更新的接口')
  }
}

const getJsonValidityType = () => {
  if (!selectedApi.value || !selectedApi.value.body) return 'info'
  
  try {
    JSON.parse(selectedApi.value.body)
    return 'success'
  } catch {
    return 'error'
  }
}

const getJsonValidityText = () => {
  if (!selectedApi.value || !selectedApi.value.body) return 'Empty'
  
  try {
    JSON.parse(selectedApi.value.body)
    return 'Valid JSON'
  } catch {
    return 'Invalid JSON'
  }
}

const getRequestBodySize = () => {
  if (!selectedApi.value || !selectedApi.value.body) return ''
  
  const bytes = new Blob([selectedApi.value.body]).size
  
  if (bytes < 1024) {
    return `${bytes} B`
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
}

const getStatusType = (status) => {
  if (status >= 200 && status < 300) return 'success'
  if (status >= 300 && status < 400) return 'warning'
  if (status >= 400) return 'error'
  return 'info'
}

const getResponseLanguage = () => {
  if (!response.value) return 'text'
  
  const contentType = response.value.headers?.['content-type'] || ''
  
  if (contentType.includes('application/json') || isJsonResponse(response.value.data)) {
    return 'json'
  } else if (contentType.includes('text/html')) {
    return 'html'
  } else if (contentType.includes('text/xml') || contentType.includes('application/xml')) {
    return 'xml'
  } else if (contentType.includes('text/css')) {
    return 'css'
  } else if (contentType.includes('text/javascript') || contentType.includes('application/javascript')) {
    return 'javascript'
  }
  
  return 'text'
}

const getFormattedResponseBody = () => {
  if (!response.value) return ''
  
  const data = response.value.data
  
  if (responseViewMode.value === 'raw') {
    if (typeof data === 'string') return data
    return JSON.stringify(data)
  } else {
    if (isJsonResponse(data)) {
      try {
        const jsonData = typeof data === 'string' ? JSON.parse(data) : data
        return JSON.stringify(jsonData, null, 4)
      } catch {
        return typeof data === 'string' ? data : JSON.stringify(data)
      }
    }
    return typeof data === 'string' ? data : JSON.stringify(data, null, 4)
  }
}

const getResponseSize = () => {
  if (!response.value) return ''
  
  const content = getFormattedResponseBody()
  const bytes = new Blob([content]).size
  
  if (bytes < 1024) {
    return `${bytes} B`
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
}

const copyResponseBody = async () => {
  try {
    const content = getFormattedResponseBody()
    await navigator.clipboard.writeText(content)
    message.success('响应体已复制到剪贴板')
  } catch (error) {
    message.error('复制失败')
  }
}

const copyResponseHeaders = async () => {
  if (!response.value || !response.value.headers) {
    message.warning('没有响应头可复制')
    return
  }
  
  try {
    const headersText = Object.entries(response.value.headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n')
    
    await navigator.clipboard.writeText(headersText)
    message.success('响应头已复制到剪贴板')
  } catch (error) {
    message.error('复制失败')
  }
}

const formatJsonResponse = () => {
  if (!response.value || !isJsonResponse(response.value.data)) return
  
  try {
    const data = response.value.data
    const jsonData = typeof data === 'string' ? JSON.parse(data) : data
    
    responseViewMode.value = 'formatted'
    response.value.data = jsonData
    
    message.success('JSON已格式化')
  } catch (error) {
    message.error('JSON格式化失败：数据格式不正确')
  }
}

const isJsonResponse = (data) => {
  if (typeof data === 'object') return true
  if (typeof data === 'string') {
    try {
      JSON.parse(data)
      return true
    } catch {
      return false
    }
  }
  return false
}

const copyCurlCommand = () => {
  if (!selectedApi.value || !selectedService.value) {
    message.warning('请选择代理服务和接口')
    return
  }

  const baseUrl = currentEnvironmentUrl.value
  if (!baseUrl) {
    message.warning('请先配置环境地址')
    return
  }
  
  const fullUrl = new URL(selectedApi.value.path, baseUrl)
  
  selectedApi.value.params.forEach(param => {
    if (param.key && param.value) {
      const resolvedValue = resolveVariableValue(param.valueType, param.value)
      if (resolvedValue) {
        fullUrl.searchParams.append(param.key, resolvedValue)
      }
    }
  })

  let curlCommand = `curl -X ${selectedApi.value.method}`
  
  selectedApi.value.headers.forEach(header => {
    if (header.key && header.value) {
      const resolvedValue = resolveVariableValue(header.valueType, header.value)
      if (resolvedValue) {
        curlCommand += ` \\\n  -H "${header.key}: ${resolvedValue}"`
      }
    }
  })
  
  if (['POST', 'PUT', 'PATCH'].includes(selectedApi.value.method) && selectedApi.value.body) {
    const body = selectedApi.value.body.replace(/"/g, '\\"')
    curlCommand += ` \\\n  -d "${body}"`
  }
  
  curlCommand += ` \\\n  "${fullUrl.toString()}"`
  
  navigator.clipboard.writeText(curlCommand).then(() => {
    message.success('cURL命令已复制到剪贴板')
  }).catch(() => {
    message.error('复制失败，请手动复制')
    console.log('cURL命令:', curlCommand)
  })
}



const resolveVariableValue = (valueType, value) => {
  if (valueType === 'variable' && value) {
    const variable = globalVariables.value.find(v => v.key === value)
    return variable ? variable.value : value
  }
  return value
}

const sendRequest = async () => {
  if (!selectedApi.value || !selectedService.value) {
    message.warning('请选择代理服务和接口')
    return
  }

  requesting.value = true
  response.value = null

  try {
    const baseUrl = currentEnvironmentUrl.value
    if (!baseUrl) {
      message.warning('请先配置环境地址')
      return
    }

    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
    const cleanPath = selectedApi.value.path.startsWith('/') ? selectedApi.value.path.slice(1) : selectedApi.value.path
    const targetUrl = `${cleanBaseUrl}/${cleanPath}`
    
    const params = {}
    selectedApi.value.params.forEach(param => {
      if (param.key && param.value) {
        const resolvedValue = resolveVariableValue(param.valueType, param.value)
        if (resolvedValue) {
          params[param.key] = resolvedValue
        }
      }
    })

    const headers = {}
    selectedApi.value.headers.forEach(header => {
      if (header.key && header.value) {
        const resolvedValue = resolveVariableValue(header.valueType, header.value)
        if (resolvedValue) {
          headers[header.key] = resolvedValue
        }
      }
    })

    const proxyRequestData = {
      url: targetUrl,
      method: selectedApi.value.method,
      headers: headers,
      params: params
    }

    if (['POST', 'PUT', 'PATCH'].includes(selectedApi.value.method) && selectedApi.value.body) {
      proxyRequestData.body = selectedApi.value.body
    }

    const res = await fetch('/api/debug/proxy-request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(proxyRequestData)
    })

    const result = await res.json()
    
    if (result.success) {
      response.value = result.data
      message.success('请求发送成功')
    } else {
      throw new Error(result.error || '请求失败')
    }

  } catch (error) {
    console.error('Request failed:', error)
    message.error(`请求失败: ${error.message}`)
    response.value = {
      status: 0,
      statusText: 'Network Error',
      headers: {},
      data: { error: error.message },
      duration: 0
    }
  } finally {
    requesting.value = false
  }
}

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

const loadServiceApis = () => {
  if (!selectedService.value) return
  
  if (!apiData.value[selectedService.value]) {
    apiData.value[selectedService.value] = []
  }
}

const saveSelectionToStorage = () => {
  const selectionState = {
    selectedService: selectedService.value,
    selectedEnvironment: selectedEnvironment.value,
    selectedApiId: selectedApi.value?.id || null
  }
  localStorage.setItem('apiDebuggerSelection', JSON.stringify(selectionState))
}

const restoreSelectionFromStorage = () => {
  try {
    const savedState = localStorage.getItem('apiDebuggerSelection')
    if (savedState) {
      const state = JSON.parse(savedState)
      
      if (state.selectedService && proxyServices.value.find(s => s.serviceName === state.selectedService)) {
        selectedService.value = state.selectedService
        
        nextTick(() => {
          if (state.selectedEnvironment && environments.value.find(e => e.key === state.selectedEnvironment)) {
            selectedEnvironment.value = state.selectedEnvironment
          } else if (environments.value.length > 0) {
            selectedEnvironment.value = environments.value[0].key
          }
          
          loadServiceApis()
          nextTick(() => {
            if (state.selectedApiId) {
              const savedApi = currentServiceApis.value.find(api => api.id === state.selectedApiId)
              if (savedApi) {
                selectedApi.value = savedApi
                selectedApiId.value = savedApi.id
              }
            }
          })
        })
      }
    }
  } catch (error) {
    console.error('恢复选择状态失败:', error)
  }
}

// 组件挂载
onMounted(async () => {
  await appStore.fetchProxyServices()
  await loadApiData()
  loadGlobalVariables()
  restoreSelectionFromStorage()
})
</script>

<style scoped>
.api-debugger {
  padding: 12px;
  min-height: calc(100vh - 120px);
  background-color: var(--bg-color-page);
  max-width: 100%;
  margin: 0 auto;
}

.toolbar-card {
  margin-bottom: 16px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toolbar-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
  white-space: nowrap;
}

.environment-url-item {
  flex: 1;
  min-width: 0;
}

.environment-url-display {
  display: flex;
  align-items: center;
  min-width: 0;
}

.environment-url {
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 12px;
  color: var(--text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 4px 8px;
  background-color: var(--bg-color-secondary);
  border-radius: 4px;
  border: 1px solid var(--border-color);
  min-width: 0;
  flex: 1;
}

.text-muted {
  color: var(--text-color-secondary);
}

.main-content {
  height: calc(100vh - 120px);
  min-height: 600px;
}

.debugger-container {
  display: flex;
  gap: 16px;
  height: 100%;
  max-width: 100%;
  margin: 0 auto;
}

.left-panel,
.right-panel {
  flex: 1;
  min-width: 0;
  max-width: 50%;
}

.request-panel,
.response-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color);
}

.header-actions {
  display: flex;
  gap: 8px;
}

.request-content,
.response-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.tab-content {
  padding: 16px;
  height: calc(100% - 60px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.input-group-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.input-group-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.input-key {
  width: 200px;
  flex-shrink: 0;
}

.input-value-container {
  display: flex;
  gap: 8px;
  flex: 1;
}

.value-type-select {
  width: 100px;
  flex-shrink: 0;
}

.input-value {
  flex: 1;
}

.add-button-container {
  margin-top: 8px;
}

.request-body-header,
.response-body-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color-light);
}

.body-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.body-size {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.body-actions {
  display: flex;
  gap: 8px;
}

.monaco-editor-container {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
  flex: 1;
  min-height: 200px;
}

.empty-main {
  height: calc(100vh - 220px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-panel {
  width: 100%;
  max-width: 600px;
}

.response-container {
  padding: 16px;
  height: 100%;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.response-status {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background-color: var(--bg-color-secondary);
  border-radius: 6px;
  border: 1px solid var(--border-color-light);
}

.response-time {
  font-size: 14px;
  color: var(--text-color-secondary);
  font-weight: 500;
}

.form-section {
  background-color: var(--bg-color);
  border-radius: 6px;
  padding: 16px;
  border: 1px solid var(--border-color-light);
}

.form-label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: var(--text-color);
  font-size: 14px;
}

.response-headers-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color-light);
}

.headers-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.headers-count {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.headers-actions {
  display: flex;
  gap: 8px;
}

.response-headers-container {
  height: calc(100% - 60px);
  overflow-y: auto;
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  padding: 8px 0;
}

.header-item {
  display: flex;
  padding: 6px 0;
  border-bottom: 1px solid var(--border-color-lighter);
  color: var(--text-color-secondary);
  line-height: 1.4;
}

.header-item:last-child {
  border-bottom: none;
}

.header-key {
  color: var(--text-color);
  font-weight: 600;
  min-width: 200px;
  flex-shrink: 0;
  margin-right: 8px;
}

.header-value {
  color: var(--text-color-secondary);
  flex: 1;
  word-break: break-all;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.section-title-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.response-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.response-size {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.response-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.no-response {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

.variables-container {
  max-height: 500px;
  overflow-y: auto;
}

.variables-list {
  margin-bottom: 24px;
}

.add-variable-form {
  border-top: 1px solid var(--border-color-light);
  padding-top: 16px;
}



/* 响应式设计 */
@media (max-width: 1200px) {
  .debugger-container {
    flex-direction: column;
    height: auto;
  }
  
  .left-panel,
  .right-panel {
    height: auto;
    min-height: 500px;
    max-width: 100%;
  }
  
  .main-content {
    height: auto;
    min-height: 1000px;
  }
}

@media (max-width: 768px) {
  .api-debugger {
    padding: 8px;
  }
  
  .toolbar {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  
  .toolbar-left {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  
  .toolbar-item {
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
  }
  
  .input-group-row {
    flex-direction: column;
    align-items: stretch;
  }
  
  .input-key,
  .value-type-select {
    width: 100%;
  }
  
  .input-value-container {
    flex-direction: column;
  }
}

/* 暗色主题优化 */
html.dark .api-debugger {
  background: linear-gradient(135deg, #010409, #0d1117);
}

html.dark .toolbar-card {
  background: linear-gradient(135deg, #161b22, #21262d);
  border: 1px solid var(--border-color);
}

html.dark .monaco-editor-container {
  border-color: var(--border-color);
}

html.dark .form-section {
  background: linear-gradient(135deg, #161b22, #1c2128);
  border-color: var(--border-color);
}

html.dark .response-status {
  background: linear-gradient(135deg, #21262d, #30363d);
  border-color: var(--border-color);
}
</style> 