<template>
  <div class="dashboard">
    
    
    <!-- Eureka配置面板 -->
    <el-card class="config-card">
      <template #header>
        <div class="card-header">
          <span>Eureka配置</span>
          <div class="header-actions">
            <el-button 
              type="primary" 
              @click="drawerVisible = true"
              size="small"
            >
              <el-icon><List /></el-icon>
              查看服务列表 ({{ appStore.eurekaServices.length }})
            </el-button>
          </div>
        </div>
      </template>
      <el-form :model="eurekaConfig" inline>
        <el-form-item label="主机地址">
          <el-input v-model="eurekaConfig.host" placeholder="localhost" />
        </el-form-item>
        <el-form-item label="端口">
          <el-input-number v-model="eurekaConfig.port" :min="1" :max="65535" />
        </el-form-item>
        <el-form-item label="服务路径">
          <el-input v-model="eurekaConfig.servicePath" placeholder="/eureka/apps" />
        </el-form-item>
        <el-form-item label="心跳间隔(秒)">
          <el-input-number v-model="eurekaConfig.heartbeatInterval" :min="10" :max="300" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="updateEurekaConfig" :loading="appStore.loading">
            更新配置
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 代理服务管理（占用全屏宽度） -->
    <el-row>
      <el-col :span="24">
        <el-card>
          <template #header>
            <div class="card-header">
              <div class="card-title-section">
                <span>代理服务管理</span>
                <div class="stats-section">
                  <el-statistic 
                    title="总数" 
                    :value="appStore.proxyStats.total" 
                    class="stat-item"
                  />
                  <el-statistic 
                    title="运行中" 
                    :value="appStore.proxyStats.running" 
                    class="stat-item stat-running"
                  />
                  <el-statistic 
                    title="健康" 
                    :value="appStore.proxyStats.healthy" 
                    class="stat-item stat-healthy"
                  />
                  <el-statistic 
                    title="异常" 
                    :value="appStore.proxyStats.unhealthy" 
                    class="stat-item stat-unhealthy"
                  />
                  <el-statistic 
                    title="已停止" 
                    :value="appStore.proxyStats.stopped" 
                    class="stat-item stat-stopped"
                  />
                </div>
              </div>
              <div class="header-controls">
                <el-input
                  v-model="searchKeyword"
                  placeholder="搜索服务名称..."
                  size="small"
                  style="width: 200px;"
                  clearable
                >
                  <template #prefix>
                    <el-icon><Search /></el-icon>
                  </template>
                </el-input>
                <el-select
                  v-model="selectedTagFilter"
                  multiple
                  placeholder="按标签筛选..."
                  size="small"
                  style="width: 200px; margin-left: 10px;"
                  clearable
                  collapse-tags
                  collapse-tags-tooltip
                >
                  <el-option
                    v-for="tag in availableTags"
                    :key="tag.name"
                    :label="tag.name"
                    :value="tag.name"
                  >
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <div 
                        :style="{ 
                          width: '12px', 
                          height: '12px', 
                          backgroundColor: tag.color,
                          borderRadius: '2px',
                          border: '1px solid #ddd'
                        }"
                      ></div>
                      <span>{{ tag.name }}</span>
                    </div>
                  </el-option>
                </el-select>
                <el-button
                  size="small"
                  type="default"
                  @click="showTagManagerDialog = true"
                  style="margin-left: 10px;"
                >
                  <el-icon><Management /></el-icon>
                  标签管理
                </el-button>
                <el-button
                  size="small"
                  type="info"
                  @click="showAutoStartDialog = true"
                  style="margin-left: 10px;"
                >
                  <el-icon><Setting /></el-icon>
                  自动启动
                </el-button>
                <div class="batch-controls" v-if="filteredServices.length > 0">
                  <el-checkbox
                    v-model="selectAll"
                    :indeterminate="isIndeterminate"
                    @change="handleSelectAll"
                    size="small"
                  >
                    全选
                  </el-checkbox>
                  <el-button-group size="small">
                    <el-button
                      type="success"
                      :disabled="selectedServices.length === 0 || !hasStoppedInSelection"
                      @click="batchStart"
                      :loading="batchLoading"
                    >
                      批量启动 ({{ getStoppedCount() }})
                    </el-button>
                    <el-button
                      type="warning"
                      :disabled="selectedServices.length === 0 || !hasRunningInSelection"
                      @click="batchStop"
                      :loading="batchLoading"
                    >
                      批量停止 ({{ getRunningCount() }})
                    </el-button>
                  </el-button-group>
                  <el-button-group size="small" style="margin-left: 12px;">
                    <el-button
                      type="info"
                      :disabled="selectedServicesNotInAutoStart.length === 0"
                      @click="batchAddToAutoStart"
                      :loading="batchLoading"
                    >
                      <el-icon><Setting /></el-icon>
                      添加自启动 ({{ selectedServicesNotInAutoStart.length }})
                    </el-button>
                    <el-button
                      type="default"
                      :disabled="selectedServicesInAutoStart.length === 0"
                      @click="batchRemoveFromAutoStart"
                      :loading="batchLoading"
                    >
                      移除自启动 ({{ selectedServicesInAutoStart.length }})
                    </el-button>
                  </el-button-group>
                </div>
                <el-button type="primary" size="small" @click="showCreateDialog = true">
                  <el-icon><Plus /></el-icon>
                  创建服务
                </el-button>
                <el-button 
                  type="info" 
                  size="small" 
                  @click="exportConfig"
                  :loading="appStore.loading"
                >
                  <el-icon><Download /></el-icon>
                  导出配置
                </el-button>
                <el-tooltip 
                  :content="hasRunningServices ? `有 ${runningServicesCount} 个服务正在运行，需要先停止所有服务` : '导入配置文件'"
                  placement="top"
                >
                  <el-button 
                    type="success" 
                    size="small" 
                    @click="triggerImport"
                    :loading="appStore.loading"
                    :disabled="hasRunningServices"
                  >
                    <el-icon><Upload /></el-icon>
                    导入配置
                  </el-button>
                </el-tooltip>
                <input 
                  ref="fileInputRef" 
                  type="file" 
                  accept=".json" 
                  @change="handleFileImport" 
                  style="display: none;" 
                />
              </div>
            </div>
          </template>
          
          <div class="proxy-services-container">
            <div 
              v-for="service in filteredServices" 
              :key="service.id"
              class="proxy-service-card"
            >
              <el-card class="service-item" :class="{ 'selected': selectedServices.includes(service.id) }">
                <template #header>
                  <div class="service-header">
                    <div class="service-info">
                      <el-checkbox
                        :model-value="selectedServices.includes(service.id)"
                        @change="(checked) => handleServiceSelect(service.id, checked)"
                        size="small"
                        style="margin-right: 8px;"
                      />
                      <h3>{{ service.serviceName }}</h3>
                      <el-tag 
                        :type="getServiceStatusType(service)" 
                        size="small"
                      >
                        {{ getServiceStatusText(service) }}
                      </el-tag>
                      <el-tag 
                        v-if="service.isRunning && service.status === 'healthy'"
                        type="success" 
                        size="small"
                        style="margin-left: 5px;"
                      >
                        <el-icon><Connection /></el-icon>
                        心跳正常
                      </el-tag>
                      <el-tag 
                        v-else-if="service.isRunning && service.status === 'unhealthy'"
                        type="danger" 
                        size="small"
                        style="margin-left: 5px;"
                        :title="service.heartbeatErrorMessage"
                      >
                        <el-icon><WarningFilled /></el-icon>
                        心跳异常
                      </el-tag>
                    </div>
                    <div class="service-actions">
                      <el-button
                        v-if="!service.isRunning"
                        type="success"
                        size="small"
                        @click="startService(service.id)"
                        :loading="appStore.loading"
                      >
                        启动
                      </el-button>
                      <el-button
                        v-else
                        type="warning"
                        size="small"
                        @click="stopService(service.id)"
                        :loading="appStore.loading"
                      >
                        停止
                      </el-button>
                      <el-button
                        type="primary"
                        size="small"
                        @click="editService(service)"
                      >
                        配置
                      </el-button>
                                            <el-button 
                        type="info" 
                        size="small"
                        @click="openServiceDetails(service)"
                      >
                        详情
                      </el-button>
                      <el-popconfirm
                        title="确定删除此代理服务吗？"
                        @confirm="deleteService(service.id)"
                      >
                        <template #reference>
                          <el-button type="danger" size="small">删除</el-button>
                        </template>
                      </el-popconfirm>
                    </div>
                  </div>
                </template>
                
                <div class="service-content">
                  <div class="service-detail">
                    <p><strong>端口:</strong> {{ service.port }}</p>
                    <p><strong>当前目标:</strong> {{ service.activeTarget }}</p>
                    <p><strong>目标地址:</strong> {{ service.targets[service.activeTarget] }}</p>
                    <div class="auto-start-config">
                      <strong>自动启动:</strong>
                      <el-switch
                        :model-value="autoStartServices.has(service.id)"
                        @change="(value) => toggleAutoStart(service.id, value)"
                        size="small"
                        style="margin-left: 8px;"
                        :loading="appStore.loading"
                      />
                      <span style="margin-left: 8px; font-size: 12px; color: #909399;">
                        {{ autoStartServices.has(service.id) ? '已启用' : '已禁用' }}
                      </span>
                    </div>
                    <div class="service-tags" v-if="service.tags && service.tags.length > 0">
                      <strong>标签:</strong>
                      <div class="tags-container">
                        <el-tag
                          v-for="tag in service.tags"
                          :key="tag"
                          size="small"
                          closable
                          @close="removeServiceTag(service.id, tag)"
                          :style="{ 
                            backgroundColor: getTagColor(tag), 
                            borderColor: getTagColor(tag),
                            color: 'white'
                          }"
                          style="margin-right: 5px; margin-bottom: 5px;"
                        >
                          {{ tag }}
                        </el-tag>
                        <el-button
                          size="small"
                          type="primary"
                          link
                          @click="showTagManagementDialog(service)"
                        >
                          <el-icon><Plus /></el-icon>
                          添加标签
                        </el-button>
                      </div>
                    </div>
                    <div class="service-tags" v-else>
                      <el-button
                        size="small"
                        type="primary"
                        link
                        @click="showTagManagementDialog(service)"
                      >
                        <el-icon><Plus /></el-icon>
                        添加标签
                      </el-button>
                    </div>
                  </div>
                  
                  <div class="target-switch" v-if="service.isRunning">
                    <label>切换目标:</label>
                    <el-select 
                      :model-value="service.activeTarget" 
                      @change="(value) => switchTarget(service.id, value)"
                      size="small"
                      style="width: 150px;"
                    >
                      <el-option 
                        v-for="(target, key) in service.targets" 
                        :key="key"
                        :label="key"
                        :value="key"
                      />
                    </el-select>
                  </div>
                </div>
              </el-card>
            </div>
            
            <div v-if="filteredServices.length === 0" class="empty-state">
              <el-empty :description="searchKeyword ? '未找到匹配的代理服务' : '暂无代理服务'">
                <el-button v-if="!searchKeyword" type="primary" @click="showCreateDialog = true">
                  创建第一个代理服务
                </el-button>
                <el-button v-else type="primary" @click="searchKeyword = ''">
                  清除搜索条件
                </el-button>
              </el-empty>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 服务详情抽屉 -->
    <el-drawer
      v-model="logDrawerVisible"
      :title="`${currentLogService?.serviceName} - 服务详情`"
      direction="rtl"
      size="900px"
      @close="closeServiceDetails"
    >
      <div class="log-drawer-content" v-if="currentLogService">
        <!-- 心跳状态图表 -->
        <div class="heartbeat-section" v-if="currentLogService.isRunning">
          <h3>心跳状态（近5分钟）</h3>
          <div class="heartbeat-chart-container">
            <div class="heartbeat-chart" ref="heartbeatChartRef">
              <canvas ref="heartbeatCanvasRef" width="800" height="200"></canvas>
            </div>
            <div class="heartbeat-legend">
              <div class="legend-item">
                <span class="legend-color success"></span>
                <span>成功</span>
              </div>
              <div class="legend-item">
                <span class="legend-color error"></span>
                <span>失败</span>
              </div>
              <div class="legend-item">
                <span class="legend-color timeout"></span>
                <span>超时</span>
              </div>
            </div>
          </div>
        </div>
        
        <el-divider />
        
        <!-- 请求日志部分 -->
        <h3>请求日志</h3>
        <div class="log-controls">
          <div class="log-info">
            <el-statistic title="总日志数" :value="serviceLogs.length" />
            <el-statistic title="实时连接" :value="logWebsocket ? '已连接' : '未连接'" />
          </div>
          <div class="log-actions">
            <el-button 
              type="danger" 
              size="small" 
              @click="clearLogs"
              :disabled="serviceLogs.length === 0"
            >
              清空日志
            </el-button>
                         <el-button 
               type="primary" 
               size="small" 
               @click="scrollToTop"
             >
               滚动到顶部
             </el-button>
          </div>
        </div>
        
        <el-divider />
        
                 <div class="log-list" ref="logListRef">
           <div 
             v-for="log in [...serviceLogs].reverse()" 
             :key="log.id"
             class="log-item"
             :class="getLogItemClass(log)"
           >
            <div class="log-header">
              <div class="log-basic-info">
                                 <el-tag 
                   :type="getLogStatusType(log.status)" 
                   size="small"
                 >
                   {{ log.method }} {{ log.status }}
                 </el-tag>
                <span class="log-path">{{ log.path }}</span>
                <span class="log-duration" v-if="log.duration">
                  {{ log.duration }}ms
                </span>
              </div>
              <div class="log-time">
                {{ formatTime(log.timestamp) }}
              </div>
            </div>
            
            <div class="log-target">
              <el-icon><Link /></el-icon>
              <span>{{ log.target }}</span>
            </div>
            
            <div class="log-body" v-if="log.requestBody || log.responseBody">
              <div class="log-section" v-if="log.requestBody">
                <div class="section-header">
                  <h4>请求体</h4>
                  <el-button 
                    link 
                    size="small"
                    @click="toggleSection(log.id, 'request')"
                  >
                    {{ getExpandedState(log.id, 'request') ? 'Show Less' : 'Show More' }}
                  </el-button>
                </div>
                <div class="section-content" v-show="getExpandedState(log.id, 'request')">
                  <pre class="code-block">{{ formatJson(log.requestBody) }}</pre>
                </div>
              </div>
              
              <div class="log-section" v-if="log.responseBody">
                <div class="section-header">
                  <h4>响应体</h4>
                  <el-button 
                    link 
                    size="small"
                    @click="toggleSection(log.id, 'response')"
                  >
                    {{ getExpandedState(log.id, 'response') ? 'Show Less' : 'Show More' }}
                  </el-button>
                </div>
                <div class="section-content" v-show="getExpandedState(log.id, 'response')">
                  <pre class="code-block">{{ formatJson(log.responseBody) }}</pre>
                </div>
              </div>
            </div>
            
            <div class="log-error" v-if="log.error">
              <el-alert 
                :title="log.error" 
                type="error" 
                :closable="false"
                show-icon
              />
            </div>
          </div>
          
          <div v-if="serviceLogs.length === 0" class="empty-logs">
            <el-empty description="暂无请求日志">
              <p>当有请求通过此代理服务时，日志将实时显示在这里</p>
            </el-empty>
          </div>
        </div>
      </div>
    </el-drawer>

    <!-- Eureka服务列表抽屉 -->
    <el-drawer
      v-model="drawerVisible"
      title="Eureka服务列表"
      direction="rtl"
      size="450px"
    >
      <template #header>
        <div class="drawer-header">
          <h3>Eureka服务列表</h3>
          <div class="drawer-actions">
            <el-button type="primary" @click="refreshEurekaServices" :loading="appStore.loading" size="small">
              <el-icon><Refresh /></el-icon>
              刷新
            </el-button>
            <el-select v-model="refreshInterval" @change="setRefreshInterval" size="small" style="width: 120px; margin-left: 8px;">
              <el-option label="手动" :value="0" />
              <el-option label="10秒" :value="10000" />
              <el-option label="1分钟" :value="60000" />
              <el-option label="5分钟" :value="300000" />
            </el-select>
          </div>
        </div>
      </template>
      
      <div class="drawer-content">
        <div class="services-stats">
          <el-statistic title="总服务数" :value="appStore.eurekaServices.length" />
          <el-statistic title="运行实例" :value="getTotalRunningInstances()" />
        </div>
        
        <el-divider />
        
        <div class="services-list">
          <div 
            v-for="service in appStore.eurekaServices" 
            :key="service.name"
            class="service-card"
          >
            <el-card shadow="hover">
              <div class="service-item-content">
                <div class="service-title">
                  <h4>{{ service.name }}</h4>
                  <el-tag :type="getStatusType(service)" size="small">
                    {{ getStatus(service) }}
                  </el-tag>
                </div>
                <div class="service-details">
                  <div class="detail-item">
                    <el-icon><Monitor /></el-icon>
                    <span>实例: {{ getInstanceCount(service) }}</span>
                  </div>
                  <div class="detail-item">
                    <el-icon><Connection /></el-icon>
                    <span>端口: {{ getPort(service) }}</span>
                  </div>
                  <div class="detail-item" v-if="getInstanceIp(service)">
                    <el-icon><Location /></el-icon>
                    <span>IP: {{ getInstanceIp(service) }}</span>
                  </div>
                </div>
              </div>
            </el-card>
          </div>
          
          <div v-if="appStore.eurekaServices.length === 0" class="empty-services">
            <el-empty description="暂无服务" />
          </div>
        </div>
      </div>
    </el-drawer>

    <!-- 创建代理服务对话框 -->
    <el-dialog v-model="showCreateDialog" title="创建代理服务" width="700px">
      <el-form :model="newService" label-width="100px" :rules="createRules" ref="createFormRef">
        <el-form-item label="服务名称" prop="serviceName">
          <el-input 
            v-model="newService.serviceName" 
            placeholder="例如: user-service"
            style="width: 100%;" 
          />
        </el-form-item>
        <el-form-item label="服务端口" prop="port">
          <div class="port-input-group">
            <el-input-number 
              v-model="newService.port" 
              :min="1001" 
              :max="65535"
              style="width: 200px;"
            />
            <el-button 
              @click="generateRandomPort"
              size="default"
              style="margin-left: 8px;"
              title="生成随机端口 (20000-30000)"
              class="dice-button"
            >
              🎲
            </el-button>
          </div>
          <div class="form-help">点击骰子生成 20000-30000 范围内的随机端口</div>
        </el-form-item>
        <el-form-item label="代理目标" prop="targetList">
          <div class="targets-container">
            <div v-for="(target, index) in newService.targetList" :key="index" class="target-item">
              <div class="target-row">
                <el-input 
                  v-model="target.name" 
                  placeholder="环境名称（如：生产环境）" 
                  style="width: 180px;"
                />
                <el-input 
                  v-model="target.url" 
                  placeholder="目标URL（如：http://prod.example.com）" 
                  style="width: 350px; margin-left: 12px;"
                />
                <el-button 
                  type="danger" 
                  size="default" 
                  @click="removeTarget(index)"
                  :disabled="newService.targetList.length <= 1"
                  style="margin-left: 12px;"
                >
                  删除
                </el-button>
              </div>
            </div>
            <el-button type="text" @click="addTarget" style="margin-top: 8px;">
              <el-icon><Plus /></el-icon>
              添加目标
            </el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="createService" :loading="appStore.loading">
          创建
        </el-button>
      </template>
    </el-dialog>

    <!-- 编辑代理服务对话框 -->
    <el-dialog v-model="showEditDialog" title="编辑代理服务" width="700px">
      <el-form :model="editingService" label-width="100px" ref="editFormRef">
        <el-form-item label="服务名称">
          <el-input v-model="editingService.serviceName" :disabled="true" style="width: 100%;" />
          <div class="form-help">服务名称不可修改</div>
        </el-form-item>
        <el-form-item label="服务端口">
          <div class="port-input-group">
            <el-input-number 
              v-model="editingService.port" 
              :min="1001" 
              :max="65535"
              :disabled="editingService.isRunning"
              style="width: 200px;"
            />
                                      <el-button 
               v-if="!editingService.isRunning"
               @click="generateRandomPortForEdit"
               size="default"
               style="margin-left: 8px;"
               title="生成随机端口 (20000-30000)"
               class="dice-button"
             >
                🎲
             </el-button>
          </div>
          <div class="form-help" v-if="editingService.isRunning">
            运行中的服务无法修改端口
          </div>
        </el-form-item>
        <el-form-item label="代理目标">
          <div class="targets-container">
            <div v-for="(target, key) in editingService.targets" :key="key" class="target-item">
              <div class="target-row">
                <el-input 
                  :value="key"
                  placeholder="环境名称" 
                  style="width: 180px;"
                  @input="(value) => updateTargetKey(key, value)"
                  :disabled="editingService.isRunning && key === editingService.activeTarget"
                />
                <el-input 
                  v-model="editingService.targets[key]" 
                  placeholder="目标URL" 
                  style="width: 350px; margin-left: 12px;"
                />
                <el-button 
                  type="danger" 
                  size="default" 
                  @click="removeEditTarget(key)"
                  :disabled="editingService.isRunning && key === editingService.activeTarget"
                  style="margin-left: 12px;"
                >
                  删除
                </el-button>
              </div>
            </div>
            <el-button type="text" @click="addEditTarget" style="margin-top: 8px;">
              <el-icon><Plus /></el-icon>
              添加目标
            </el-button>
            <div class="form-help" v-if="editingService.isRunning">
              运行中的服务可以添加新目标，但不能删除当前使用的目标
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button type="primary" @click="updateService" :loading="appStore.loading">
          保存
        </el-button>
      </template>
    </el-dialog>

    <!-- 标签管理对话框 -->
    <el-dialog v-model="showTagManagerDialog" title="标签管理" width="800px">
      <div class="tag-manager">
        <div class="tag-manager-header">
          <el-button type="primary" @click="showCreateTagDialog = true">
            <el-icon><Plus /></el-icon>
            创建标签
          </el-button>
        </div>
        
        <el-table :data="availableTags" style="width: 100%; margin-top: 20px;">
          <el-table-column prop="name" label="标签名称" width="150">
            <template #default="{ row }">
              <el-tag 
                :style="{ 
                  backgroundColor: row.color, 
                  borderColor: row.color, 
                  color: 'white' 
                }"
              >
                {{ row.name }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="color" label="颜色" width="100">
            <template #default="{ row }">
              <div :style="{ 
                width: '20px', 
                height: '20px', 
                backgroundColor: row.color,
                borderRadius: '3px'
              }"></div>
            </template>
          </el-table-column>
          <el-table-column prop="description" label="描述" />
          <el-table-column label="操作" width="150">
            <template #default="{ row }">
              <el-button size="small" @click="editTag(row)">编辑</el-button>
              <el-popconfirm title="确定删除此标签吗？" @confirm="deleteTag(row.id)">
                <template #reference>
                  <el-button size="small" type="danger">删除</el-button>
                </template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-dialog>

    <!-- 创建/编辑标签对话框 -->
    <el-dialog v-model="showCreateTagDialog" :title="editingTag.id ? '编辑标签' : '创建标签'" width="500px">
      <el-form :model="editingTag" label-width="80px">
        <el-form-item label="标签名称" required>
          <el-input v-model="editingTag.name" placeholder="请输入标签名称" />
        </el-form-item>
        <el-form-item label="颜色">
          <div style="display: flex; align-items: center; gap: 12px;">
            <el-color-picker v-model="editingTag.color" />
            <div class="color-presets">
              <span style="font-size: 14px; color: #606266; margin-right: 8px;">快速选择：</span>
              <div 
                v-for="color in defaultColors"
                :key="color.value"
                class="color-preset-item"
                :class="{ active: editingTag.color === color.value }"
                :style="{ backgroundColor: color.value }"
                :title="color.name"
                @click="editingTag.color = color.value"
              ></div>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="editingTag.description"
            type="textarea"
            rows="3"
            placeholder="请输入标签描述（可选）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateTagDialog = false">取消</el-button>
        <el-button type="primary" @click="saveTag" :loading="appStore.loading">
          {{ editingTag.id ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 服务标签管理对话框 -->
    <el-dialog v-model="showServiceTagDialog" title="管理服务标签" width="600px">
      <div class="service-tag-manager" v-if="currentTagService">
        <h4>{{ currentTagService.serviceName }} - 标签管理</h4>
        
        <div class="current-tags" style="margin-bottom: 20px;">
          <strong>当前标签：</strong>
          <div style="margin-top: 10px;">
            <el-tag
              v-for="tag in currentTagService.tags || []"
              :key="tag"
              closable
              @close="removeServiceTag(currentTagService.id, tag)"
              :style="{ 
                backgroundColor: getTagColor(tag), 
                borderColor: getTagColor(tag),
                color: 'white'
              }"
              style="margin-right: 8px; margin-bottom: 8px;"
            >
              {{ tag }}
            </el-tag>
            <span v-if="!currentTagService.tags || currentTagService.tags.length === 0" style="color: #999;">
              暂无标签
            </span>
          </div>
        </div>
        
        <div class="add-tags">
          <strong>添加标签：</strong>
          <div style="margin-top: 10px;">
            <el-tag
              v-for="tag in availableTagsForService"
              :key="tag.name"
              :style="{ 
                backgroundColor: tag.color, 
                borderColor: tag.color,
                color: 'white',
                cursor: 'pointer'
              }"
              style="margin-right: 8px; margin-bottom: 8px;"
              @click="addServiceTag(currentTagService.id, tag.name)"
            >
              <el-icon><Plus /></el-icon>
              {{ tag.name }}
            </el-tag>
            <div v-if="availableTagsForService.length === 0" style="color: #999; margin-top: 10px;">
              所有可用标签都已添加
            </div>
          </div>
        </div>
      </div>
    </el-dialog>

    <!-- 自动启动配置对话框 -->
    <el-dialog v-model="showAutoStartDialog" title="自动启动配置" width="700px">
      <div class="auto-start-manager">
        <div class="auto-start-header">
          <el-alert
            title="自动启动说明"
            description="添加到此列表的服务将在服务器启动时自动启动。当删除服务时，会自动从此列表中移除。"
            type="info"
            :closable="false"
            style="margin-bottom: 20px;"
          />
          <div class="auto-start-actions">
            <el-button 
              type="primary" 
              @click="executeAutoStart"
              :loading="appStore.loading"
            >
              <el-icon><Refresh /></el-icon>
              立即执行自动启动
            </el-button>
            <el-button 
              type="success" 
              @click="showAddServicesDialog = true"
              style="margin-left: 12px;"
            >
              <el-icon><Plus /></el-icon>
              添加更多服务
            </el-button>
          </div>
        </div>
        
        <el-table 
          :data="autoStartServicesList" 
          style="width: 100%; margin-top: 20px;"
          empty-text="暂无自动启动服务"
        >
          <el-table-column prop="serviceName" label="服务名称" width="200" />
          <el-table-column prop="port" label="端口" width="100" />
          <el-table-column label="状态" width="120">
            <template #default="{ row }">
              <el-tag 
                :type="getServiceStatusType(row)" 
                size="small"
              >
                {{ getServiceStatusText(row) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="标签">
            <template #default="{ row }">
              <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                <el-tag
                  v-for="tag in row.tags || []"
                  :key="tag"
                  size="small"
                  :style="{ 
                    backgroundColor: getTagColor(tag), 
                    borderColor: getTagColor(tag),
                    color: 'white'
                  }"
                >
                  {{ tag }}
                </el-tag>
                <span v-if="!row.tags || row.tags.length === 0" style="color: #999; font-size: 12px;">
                  无标签
                </span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button 
                size="small" 
                type="danger"
                @click="removeFromAutoStart(row.id)"
                :loading="appStore.loading"
              >
                移除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-dialog>

    <!-- 添加更多服务到自启动对话框 -->
    <el-dialog v-model="showAddServicesDialog" title="添加服务到自启动列表" width="800px">
      <div class="add-services-dialog">
        <el-alert
          title="选择要添加到自启动列表的服务"
          description="选择的服务将在服务器启动时自动启动"
          type="info"
          :closable="false"
          style="margin-bottom: 20px;"
        />
        
        <el-table 
          :data="availableServicesForAutoStart" 
          style="width: 100%;"
          @selection-change="handleSelectionChange"
        >
          <el-table-column type="selection" width="55" />
          <el-table-column prop="serviceName" label="服务名称" width="200" />
          <el-table-column prop="port" label="端口" width="100" />
          <el-table-column label="状态" width="120">
            <template #default="{ row }">
              <el-tag 
                :type="getServiceStatusType(row)" 
                size="small"
              >
                {{ getServiceStatusText(row) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="标签">
            <template #default="{ row }">
              <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                <el-tag
                  v-for="tag in row.tags || []"
                  :key="tag"
                  size="small"
                  :style="{ 
                    backgroundColor: getTagColor(tag), 
                    borderColor: getTagColor(tag),
                    color: 'white'
                  }"
                >
                  {{ tag }}
                </el-tag>
                <span v-if="!row.tags || row.tags.length === 0" style="color: #999; font-size: 12px;">
                  无标签
                </span>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>
      
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="showAddServicesDialog = false">取消</el-button>
          <el-button 
            type="primary" 
            @click="addSelectedServicesToAutoStart"
            :disabled="selectedServicesToAdd.length === 0"
            :loading="appStore.loading"
          >
            添加选中的服务 ({{ selectedServicesToAdd.length }})
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { useAppStore } from '../stores/app'
import { ElMessage, ElMessageBox } from 'element-plus'
import { List, Plus, Search, Connection, WarningFilled, Refresh, Setting, Link, Management, Download, Upload } from '@element-plus/icons-vue'

const appStore = useAppStore()

const eurekaConfig = reactive({
  host: 'localhost',
  port: 8761,
  servicePath: '/eureka/apps',
  heartbeatInterval: 30
})

const drawerVisible = ref(false)
const showCreateDialog = ref(false)
const showEditDialog = ref(false)
const createFormRef = ref()
const editFormRef = ref()
const refreshInterval = ref(0)
let refreshTimer = null
let websocket = null

// 服务详情相关状态
const logDrawerVisible = ref(false)
const currentLogService = ref(null)
const serviceLogs = ref([])
const logListRef = ref()
let logWebsocket = null
const expandedSections = ref(new Map()) // 存储展开状态

// 心跳相关状态
const heartbeatData = ref([])
const heartbeatChartRef = ref()
const heartbeatCanvasRef = ref()

// 导入导出相关状态
const fileInputRef = ref()

// 搜索和批量操作
const searchKeyword = ref('')
const selectedServices = ref([])
const selectAll = ref(false)
const batchLoading = ref(false)
const selectedTagFilter = ref([])

// 标签管理
const availableTags = ref([])
const showTagManagerDialog = ref(false)
const showCreateTagDialog = ref(false)
const showServiceTagDialog = ref(false)
const currentTagService = ref(null)
const editingTag = reactive({
  id: '',
  name: '',
  color: '#409eff',
  description: ''
})

// 自动启动管理
const autoStartServices = ref(new Set())
const showAutoStartDialog = ref(false)
const showAddServicesDialog = ref(false)
const selectedServicesToAdd = ref([])

// 默认颜色选项
const defaultColors = [
  { name: '主题蓝', value: '#409eff' },
  { name: '成功绿', value: '#67c23a' },
  { name: '警告橙', value: '#e6a23c' },
  { name: '危险红', value: '#f56c6c' },
  { name: '信息灰', value: '#909399' },
  { name: '紫色', value: '#722ed1' },
  { name: '青色', value: '#13c2c2' },
  { name: '粉色', value: '#eb2f96' },
  { name: '深蓝', value: '#1890ff' },
  { name: '深绿', value: '#52c41a' },
  { name: '深橙', value: '#fa8c16' },
  { name: '深红', value: '#ff4d4f' }
]

const newService = reactive({
  serviceName: '',
  port: 8080,
  targetList: [
    { name: '测试环境', url: '' },
    { name: '生产环境', url: '' }
  ]
})

const editingService = reactive({
  id: '',
  serviceName: '',
  port: 8080,
  targets: {},
  activeTarget: '',
  isRunning: false
})

const createRules = {
  serviceName: [
    { required: true, message: '请输入服务名称', trigger: 'blur' }
  ],
  port: [
    { required: true, message: '请输入端口号', trigger: 'blur' }
  ]
}

const updateEurekaConfig = async () => {
  try {
    await appStore.updateEurekaConfig(eurekaConfig)
    ElMessage.success('Eureka配置更新成功')
    // 配置更新后自动刷新服务列表
    await refreshEurekaServices()
  } catch (error) {
    ElMessage.error('Eureka配置更新失败')
  }
}

const refreshEurekaServices = async () => {
  try {
    await appStore.fetchEurekaServices()
    ElMessage.success('服务列表已刷新')
  } catch (error) {
    ElMessage.error('刷新失败')
  }
}

const setRefreshInterval = (interval) => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
  
  if (interval > 0) {
    refreshTimer = setInterval(refreshEurekaServices, interval)
    ElMessage.info(`已设置${interval === 10000 ? '10秒' : interval === 60000 ? '1分钟' : '5分钟'}自动刷新`)
  }
}

const createService = async () => {
  try {
    await createFormRef.value.validate()
    
    // 验证targets
    const validTargets = newService.targetList.filter(t => t.name && t.url)
    if (validTargets.length === 0) {
      ElMessage.warning('请至少配置一个有效的代理目标')
      return
    }

    const targets = {}
    validTargets.forEach(t => {
      targets[t.name] = t.url
    })

    await appStore.createProxyService({
      serviceName: newService.serviceName,
      port: newService.port,
      targets,
      activeTarget: validTargets[0].name
    })
    
    ElMessage.success('代理服务创建成功')
    showCreateDialog.value = false
    resetCreateForm()
  } catch (error) {
    if (error.response?.data?.error) {
      ElMessage.error(error.response.data.error)
    } else {
      ElMessage.error('代理服务创建失败')
    }
  }
}

const startService = async (id) => {
  try {
    await appStore.startProxyService(id)
    ElMessage.success('代理服务启动成功')
  } catch (error) {
    ElMessage.error('代理服务启动失败')
  }
}

const stopService = async (id) => {
  try {
    await appStore.stopProxyService(id)
    ElMessage.success('代理服务停止成功')
  } catch (error) {
    ElMessage.error('代理服务停止失败')
  }
}

const switchTarget = async (id, activeTarget) => {
  try {
    await appStore.switchProxyTarget(id, activeTarget)
    ElMessage.success(`代理目标已切换到 ${activeTarget}`)
  } catch (error) {
    ElMessage.error('切换失败')
  }
}

const editService = (service) => {
  Object.assign(editingService, {
    id: service.id,
    serviceName: service.serviceName,
    port: service.port,
    targets: { ...service.targets },
    activeTarget: service.activeTarget,
    isRunning: service.isRunning
  })
  showEditDialog.value = true
}

const updateService = async () => {
  try {
    const updates = {
      port: editingService.port,
      targets: editingService.targets
    }

    await appStore.updateProxyService(editingService.id, updates)
    ElMessage.success('代理服务配置更新成功')
    showEditDialog.value = false
  } catch (error) {
    if (error.response?.data?.error) {
      ElMessage.error(error.response.data.error)
    } else {
      ElMessage.error('配置更新失败')
    }
  }
}

const deleteService = async (id) => {
  try {
    await appStore.deleteProxyService(id)
    ElMessage.success('代理服务已删除')
  } catch (error) {
    ElMessage.error('删除失败')
  }
}

// 标签管理相关方法
const fetchTags = async () => {
  try {
    const response = await fetch('http://localhost:3000/api/tags')
    const result = await response.json()
    if (result.success) {
      availableTags.value = result.data
    }
  } catch (error) {
    console.error('获取标签失败:', error)
  }
}

const saveTag = async () => {
  try {
    if (!editingTag.name.trim()) {
      ElMessage.warning('请输入标签名称')
      return
    }
    
    const tagData = {
      name: editingTag.name.trim(),
      color: editingTag.color,
      description: editingTag.description.trim()
    }
    
    let response
    if (editingTag.id) {
      // 更新标签
      response = await fetch(`http://localhost:3000/api/tags/${editingTag.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tagData)
      })
    } else {
      // 创建标签
      response = await fetch('http://localhost:3000/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tagData)
      })
    }
    
    const result = await response.json()
    if (result.success) {
      ElMessage.success(result.message)
      showCreateTagDialog.value = false
      resetTagForm()
      await fetchTags()
    } else {
      ElMessage.error(result.error)
    }
  } catch (error) {
    ElMessage.error('保存标签失败')
  }
}

const editTag = (tag) => {
  Object.assign(editingTag, {
    id: tag.id,
    name: tag.name,
    color: tag.color,
    description: tag.description || ''
  })
  showCreateTagDialog.value = true
}

const deleteTag = async (tagId) => {
  try {
    const response = await fetch(`http://localhost:3000/api/tags/${tagId}`, {
      method: 'DELETE'
    })
    
    const result = await response.json()
    if (result.success) {
      ElMessage.success(result.message)
      await fetchTags()
      await appStore.fetchProxyServices() // 刷新服务列表以更新标签
    } else {
      ElMessage.error(result.error)
    }
  } catch (error) {
    ElMessage.error('删除标签失败')
  }
}

const resetTagForm = () => {
  Object.assign(editingTag, {
    id: '',
    name: '',
    color: '#409eff',
    description: ''
  })
}

const showTagManagementDialog = (service) => {
  currentTagService.value = service
  showServiceTagDialog.value = true
}

const addServiceTag = async (serviceId, tagName) => {
  try {
    const response = await fetch(`http://localhost:3000/api/proxy/${serviceId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: [tagName] })
    })
    
    const result = await response.json()
    if (result.success) {
      ElMessage.success(result.message)
      // 更新当前标签服务的数据
      currentTagService.value = result.data
      // 刷新服务列表
      await appStore.fetchProxyServices()
    } else {
      ElMessage.error(result.error)
    }
  } catch (error) {
    ElMessage.error('添加标签失败')
  }
}

const removeServiceTag = async (serviceId, tagName) => {
  try {
    const response = await fetch(`http://localhost:3000/api/proxy/${serviceId}/tags/${encodeURIComponent(tagName)}`, {
      method: 'DELETE'
    })
    
    const result = await response.json()
    if (result.success) {
      ElMessage.success(result.message)
      // 如果在标签管理对话框中，更新当前标签服务的数据
      if (currentTagService.value && currentTagService.value.id === serviceId) {
        currentTagService.value = result.data
      }
      // 刷新服务列表
      await appStore.fetchProxyServices()
    } else {
      ElMessage.error(result.error)
    }
  } catch (error) {
    ElMessage.error('移除标签失败')
  }
}

const getTagColor = (tagName) => {
  const tag = availableTags.value.find(t => t.name === tagName)
  return tag ? tag.color : '#409eff'
}

// 自动启动相关方法
const fetchAutoStartConfig = async () => {
  try {
    const response = await fetch('http://localhost:3000/api/autostart/config')
    const result = await response.json()
    if (result.success) {
      autoStartServices.value = new Set(result.data.serviceIds)
    }
  } catch (error) {
    console.error('获取自动启动配置失败:', error)
  }
}

const toggleAutoStart = async (serviceId, enabled) => {
  try {
    const url = enabled 
      ? `http://localhost:3000/api/autostart/add/${serviceId}`
      : `http://localhost:3000/api/autostart/remove/${serviceId}`
    
    const method = enabled ? 'POST' : 'DELETE'
    
    const response = await fetch(url, { method })
    const result = await response.json()
    
    if (result.success) {
      if (enabled) {
        autoStartServices.value.add(serviceId)
      } else {
        autoStartServices.value.delete(serviceId)
      }
      ElMessage.success(result.message)
    } else {
      ElMessage.error(result.error)
    }
  } catch (error) {
    ElMessage.error('操作失败')
  }
}

const removeFromAutoStart = async (serviceId) => {
  await toggleAutoStart(serviceId, false)
}

const executeAutoStart = async () => {
  try {
    const response = await fetch('http://localhost:3000/api/autostart/execute', {
      method: 'POST'
    })
    
    const result = await response.json()
    if (result.success) {
      ElMessage.success(result.message)
      // 刷新服务列表
      await appStore.fetchProxyServices()
    } else {
      ElMessage.error(result.error)
    }
  } catch (error) {
    ElMessage.error('执行自动启动失败')
  }
}

// 批量自动启动管理方法
const batchAddToAutoStart = async () => {
  const servicesToAdd = selectedServicesNotInAutoStart.value
  if (servicesToAdd.length === 0) {
    ElMessage.warning('选中的服务都已在自启动列表中')
    return
  }
  
  try {
    batchLoading.value = true
    
    const response = await fetch('http://localhost:3000/api/autostart/batch/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        serviceIds: servicesToAdd
      })
    })
    
    const result = await response.json()
    if (result.success) {
      ElMessage.success(result.message)
      // 更新本地自动启动状态
      await fetchAutoStartConfig()
      // 清空选择
      selectedServices.value = []
    } else {
      ElMessage.error(result.error)
    }
  } catch (error) {
    ElMessage.error('批量添加到自启动失败')
  } finally {
    batchLoading.value = false
  }
}

const batchRemoveFromAutoStart = async () => {
  const servicesToRemove = selectedServicesInAutoStart.value
  if (servicesToRemove.length === 0) {
    ElMessage.warning('选中的服务都不在自启动列表中')
    return
  }
  
  try {
    batchLoading.value = true
    
    const response = await fetch('http://localhost:3000/api/autostart/batch/remove', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        serviceIds: servicesToRemove
      })
    })
    
    const result = await response.json()
    if (result.success) {
      ElMessage.success(result.message)
      // 更新本地自动启动状态
      await fetchAutoStartConfig()
      // 清空选择
      selectedServices.value = []
    } else {
      ElMessage.error(result.error)
    }
  } catch (error) {
    ElMessage.error('批量移除自启动失败')
  } finally {
    batchLoading.value = false
  }
}

// 添加更多服务对话框相关方法
const handleSelectionChange = (selection) => {
  selectedServicesToAdd.value = selection.map(service => service.id)
}

const addSelectedServicesToAutoStart = async () => {
  if (selectedServicesToAdd.value.length === 0) {
    ElMessage.warning('请先选择要添加的服务')
    return
  }
  
  try {
    const response = await fetch('http://localhost:3000/api/autostart/batch/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        serviceIds: selectedServicesToAdd.value
      })
    })
    
    const result = await response.json()
    if (result.success) {
      ElMessage.success(result.message)
      // 更新本地自动启动状态
      await fetchAutoStartConfig()
      // 关闭对话框并清空选择
      showAddServicesDialog.value = false
      selectedServicesToAdd.value = []
    } else {
      ElMessage.error(result.error)
    }
  } catch (error) {
    ElMessage.error('添加服务到自启动失败')
  }
}

const addTarget = () => {
  newService.targetList.push({ name: '', url: '' })
}

const removeTarget = (index) => {
  newService.targetList.splice(index, 1)
}

const addEditTarget = () => {
  const newKey = `新环境${Object.keys(editingService.targets).length + 1}`
  editingService.targets[newKey] = ''
}

const removeEditTarget = (key) => {
  delete editingService.targets[key]
}

const updateTargetKey = (oldKey, newKey) => {
  if (newKey && newKey !== oldKey && !editingService.targets[newKey]) {
    editingService.targets[newKey] = editingService.targets[oldKey]
    delete editingService.targets[oldKey]
    if (editingService.activeTarget === oldKey) {
      editingService.activeTarget = newKey
    }
  }
}

const resetCreateForm = () => {
  Object.assign(newService, {
    serviceName: '',
    port: 8080,
    targetList: [
      { name: '测试环境', url: '' },
      { name: '生产环境', url: '' }
    ]
  })
}

// Eureka服务信息解析辅助函数
const getInstanceCount = (service) => {
  if (Array.isArray(service.instance)) {
    return service.instance.length
  } else if (service.instance) {
    return 1
  }
  return 0
}

const getStatus = (service) => {
  const instances = Array.isArray(service.instance) ? service.instance : [service.instance]
  const upCount = instances?.filter(i => i?.status === 'UP').length || 0
  return `${upCount}/${instances?.length || 0}`
}

const getStatusType = (service) => {
  const instances = Array.isArray(service.instance) ? service.instance : [service.instance]
  const upCount = instances?.filter(i => i?.status === 'UP').length || 0
  const total = instances?.length || 0
  
  if (upCount === total && total > 0) return 'success'
  if (upCount > 0) return 'warning'
  return 'danger'
}

const getPort = (service) => {
  const instance = Array.isArray(service.instance) ? service.instance[0] : service.instance
  return instance?.port?.['$'] || '-'
}

const getInstanceIp = (service) => {
  const instance = Array.isArray(service.instance) ? service.instance[0] : service.instance
  return instance?.ipAddr || ''
}

const getTotalRunningInstances = () => {
  return appStore.eurekaServices.reduce((total, service) => {
    const instances = Array.isArray(service.instance) ? service.instance : [service.instance]
    const upCount = instances?.filter(i => i?.status === 'UP').length || 0
    return total + upCount
  }, 0)
}

const generateRandomPort = () => {
  newService.port = Math.floor(Math.random() * (30000 - 20000 + 1)) + 20000
}

const generateRandomPortForEdit = () => {
  editingService.port = Math.floor(Math.random() * (30000 - 20000 + 1)) + 20000
}

// 搜索和批量操作逻辑
const filteredServices = computed(() => {
  let services = appStore.proxyServices
  
  // 按关键字搜索
  if (searchKeyword.value) {
    services = services.filter(service => 
      service.serviceName.toLowerCase().includes(searchKeyword.value.toLowerCase())
    )
  }
  
  // 按标签筛选
  if (selectedTagFilter.value.length > 0) {
    services = services.filter(service => {
      const serviceTags = service.tags || []
      return selectedTagFilter.value.some(tag => serviceTags.includes(tag))
    })
  }
  
  return services
})

// 标签相关计算属性
const availableTagsForService = computed(() => {
  if (!currentTagService.value) return []
  const serviceTags = currentTagService.value.tags || []
  return availableTags.value.filter(tag => !serviceTags.includes(tag.name))
})

// 自动启动相关计算属性
const autoStartServicesList = computed(() => {
  return appStore.proxyServices.filter(service => autoStartServices.value.has(service.id))
})

// 可添加到自启动的服务列表（排除已在自启动列表中的服务）
const availableServicesForAutoStart = computed(() => {
  return appStore.proxyServices.filter(service => !autoStartServices.value.has(service.id))
})

// 选中的服务中不在自启动列表的服务
const selectedServicesNotInAutoStart = computed(() => {
  return selectedServices.value.filter(serviceId => !autoStartServices.value.has(serviceId))
})

// 选中的服务中在自启动列表的服务
const selectedServicesInAutoStart = computed(() => {
  return selectedServices.value.filter(serviceId => autoStartServices.value.has(serviceId))
})

const isIndeterminate = computed(() => {
  const selected = selectedServices.value.length
  const total = filteredServices.value.length
  return selected > 0 && selected < total
})

const hasRunningInSelection = computed(() => {
  return selectedServices.value.some(id => {
    const service = appStore.proxyServices.find(s => s.id === id)
    return service?.isRunning
  })
})

const hasStoppedInSelection = computed(() => {
  return selectedServices.value.some(id => {
    const service = appStore.proxyServices.find(s => s.id === id)
    return !service?.isRunning
  })
})

// 检查是否有任何服务正在运行
const hasRunningServices = computed(() => {
  return appStore.proxyServices.some(service => service.isRunning)
})

// 获取运行中的服务数量
const runningServicesCount = computed(() => {
  return appStore.proxyServices.filter(service => service.isRunning).length
})

const getRunningCount = () => {
  return selectedServices.value.filter(id => {
    const service = appStore.proxyServices.find(s => s.id === id)
    return service?.isRunning
  }).length
}

const getStoppedCount = () => {
  return selectedServices.value.filter(id => {
    const service = appStore.proxyServices.find(s => s.id === id)
    return !service?.isRunning
  }).length
}

const handleSelectAll = (checked) => {
  if (checked) {
    selectedServices.value = filteredServices.value.map(s => s.id)
  } else {
    selectedServices.value = []
  }
  selectAll.value = checked
}

const handleServiceSelect = (serviceId, checked) => {
  if (checked) {
    if (!selectedServices.value.includes(serviceId)) {
      selectedServices.value.push(serviceId)
    }
  } else {
    const index = selectedServices.value.indexOf(serviceId)
    if (index > -1) {
      selectedServices.value.splice(index, 1)
    }
  }
  
  // 更新全选状态
  const totalFiltered = filteredServices.value.length
  const selected = selectedServices.value.length
  selectAll.value = selected === totalFiltered && totalFiltered > 0
}

const batchStart = async () => {
  batchLoading.value = true
  try {
    const stoppedServices = selectedServices.value.filter(id => {
      const service = appStore.proxyServices.find(s => s.id === id)
      return !service?.isRunning
    })
    
    if (stoppedServices.length === 0) {
      ElMessage.warning('没有需要启动的服务')
      return
    }
    
    const result = await appStore.batchStartProxyServices(stoppedServices)
    
    if (result.succeeded > 0) {
      ElMessage.success(`成功启动 ${result.succeeded} 个代理服务`)
    }
    
    if (result.failed > 0) {
      ElMessage.warning(`${result.failed} 个服务启动失败`)
    }
    
    // 清空选择
    selectedServices.value = []
    selectAll.value = false
  } catch (error) {
    ElMessage.error('批量启动失败')
  } finally {
    batchLoading.value = false
  }
}

const batchStop = async () => {
  batchLoading.value = true
  try {
    const runningServices = selectedServices.value.filter(id => {
      const service = appStore.proxyServices.find(s => s.id === id)
      return service?.isRunning
    })
    
    if (runningServices.length === 0) {
      ElMessage.warning('没有需要停止的服务')
      return
    }
    
    const result = await appStore.batchStopProxyServices(runningServices)
    
    if (result.succeeded > 0) {
      ElMessage.success(`成功停止 ${result.succeeded} 个代理服务`)
    }
    
    if (result.failed > 0) {
      ElMessage.warning(`${result.failed} 个服务停止失败`)
    }
    
    // 清空选择
    selectedServices.value = []
    selectAll.value = false
  } catch (error) {
    ElMessage.error('批量停止失败')
  } finally {
    batchLoading.value = false
  }
}

// 监听搜索关键字变化，清空选择
watch(searchKeyword, () => {
  selectedServices.value = []
  selectAll.value = false
})

// 服务详情相关功能
const openServiceDetails = (service) => {
  currentLogService.value = service
  serviceLogs.value = []
  expandedSections.value.clear()
  logDrawerVisible.value = true
  
  // 如果服务在运行，加载心跳数据和连接日志
  if (service.isRunning) {
    loadHeartbeatData(service)
    connectLogWebSocket(service.serviceName)
  }
}

const closeServiceDetails = () => {
  logDrawerVisible.value = false
  disconnectLogWebSocket()
  currentLogService.value = null
  serviceLogs.value = []
  expandedSections.value.clear()
  heartbeatData.value = []
}

const connectLogWebSocket = (serviceName) => {
  const wsUrl = `ws://localhost:3000`
  logWebsocket = new WebSocket(wsUrl)
  
  logWebsocket.onopen = () => {
    console.log('日志WebSocket连接已建立')
    // 订阅指定服务的日志
    logWebsocket.send(JSON.stringify({
      type: 'subscribe_logs',
      serviceName
    }))
  }
  
  logWebsocket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data)
      handleLogMessage(message)
    } catch (error) {
      console.error('日志WebSocket消息解析失败:', error)
    }
  }
  
  logWebsocket.onclose = () => {
    console.log('日志WebSocket连接已关闭')
  }
  
  logWebsocket.onerror = (error) => {
    console.error('日志WebSocket连接错误:', error)
  }
}

const disconnectLogWebSocket = () => {
  if (logWebsocket) {
    if (currentLogService.value) {
      // 取消订阅
      logWebsocket.send(JSON.stringify({
        type: 'unsubscribe_logs',
        serviceName: currentLogService.value.serviceName
      }))
    }
    logWebsocket.close()
    logWebsocket = null
  }
}

// 心跳数据相关功能
const loadHeartbeatData = async (service) => {
  try {
    const response = await fetch(`http://localhost:3000/api/heartbeat/history/${service.serviceName}/${service.port}`)
    const result = await response.json()
    
    if (result.success) {
      heartbeatData.value = result.data.history || []
      nextTick(() => {
        drawHeartbeatChart()
      })
    }
  } catch (error) {
    console.error('Failed to load heartbeat data:', error)
  }
}

const drawHeartbeatChart = () => {
  const canvas = heartbeatCanvasRef.value
  if (!canvas) return
  
  const ctx = canvas.getContext('2d')
  const width = canvas.width
  const height = canvas.height
  
  // 清空画布
  ctx.clearRect(0, 0, width, height)
  
  if (heartbeatData.value.length === 0) {
    // 显示无数据提示
    ctx.fillStyle = '#999'
    ctx.font = '16px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('暂无心跳数据', width / 2, height / 2)
    return
  }
  
  // 设置时间范围（近5分钟）
  const now = Date.now()
  const fiveMinutesAgo = now - 5 * 60 * 1000
  
  // 绘制时间轴
  const timeStep = 30000 // 30秒间隔
  const timeLabels = []
  for (let time = fiveMinutesAgo; time <= now; time += timeStep) {
    timeLabels.push(time)
  }
  
  // 绘制背景网格
  ctx.strokeStyle = '#f0f0f0'
  ctx.lineWidth = 1
  
  // 垂直网格线（时间）
  timeLabels.forEach((time, index) => {
    const x = (index / (timeLabels.length - 1)) * (width - 80) + 40
    ctx.beginPath()
    ctx.moveTo(x, 20)
    ctx.lineTo(x, height - 40)
    ctx.stroke()
  })
  
  // 水平网格线
  for (let i = 0; i <= 4; i++) {
    const y = 20 + (i / 4) * (height - 60)
    ctx.beginPath()
    ctx.moveTo(40, y)
    ctx.lineTo(width - 40, y)
    ctx.stroke()
  }
  
  // 绘制心跳点
  heartbeatData.value.forEach(heartbeat => {
    const x = ((heartbeat.timestamp - fiveMinutesAgo) / (5 * 60 * 1000)) * (width - 80) + 40
    const y = height / 2 // 固定在中间高度
    
    // 根据状态设置颜色
    let color = '#67c23a' // 成功 - 绿色
    if (heartbeat.status === 'error') {
      color = '#f56c6c' // 失败 - 红色
    } else if (heartbeat.status === 'timeout') {
      color = '#e6a23c' // 超时 - 橙色
    }
    
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, 4, 0, 2 * Math.PI)
    ctx.fill()
  })
  
  // 绘制时间标签
  ctx.fillStyle = '#666'
  ctx.font = '12px Arial'
  ctx.textAlign = 'center'
  
  timeLabels.forEach((time, index) => {
    if (index % 2 === 0) { // 只显示偶数索引的标签，避免过于密集
      const x = (index / (timeLabels.length - 1)) * (width - 80) + 40
      const timeStr = new Date(time).toLocaleTimeString('zh-CN', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      })
      ctx.fillText(timeStr, x, height - 10)
    }
  })
}

const handleLogMessage = (message) => {
  switch (message.type) {
    case 'logs_history':
      serviceLogs.value = message.logs
      nextTick(() => scrollToTop())
      break
    case 'new_log':
      serviceLogs.value.push(message.log)
      // 保持最多1000条日志
      if (serviceLogs.value.length > 1000) {
        serviceLogs.value.splice(0, serviceLogs.value.length - 1000)
      }
      nextTick(() => scrollToTop())
      break
  }
}

const clearLogs = async () => {
  try {
    const response = await fetch(`http://localhost:3000/api/proxy/${currentLogService.value.serviceName}/logs`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    
    if (response.ok) {
      serviceLogs.value = []
      ElMessage.success('日志已清空')
    } else {
      const errorText = await response.text()
      throw new Error(`删除请求失败: ${response.status} - ${errorText}`)
    }
  } catch (error) {
    console.error('清空日志失败:', error)
    ElMessage.error(`清空日志失败: ${error.message}`)
  }
}

const scrollToTop = () => {
  if (logListRef.value) {
    logListRef.value.scrollTop = 0
  }
}

const toggleSection = (logId, section) => {
  const key = `${logId}-${section}`
  const currentState = expandedSections.value.get(key) || false
  expandedSections.value.set(key, !currentState)
}

const getExpandedState = (logId, section) => {
  const key = `${logId}-${section}`
  return expandedSections.value.get(key) || false
}

const getLogItemClass = (log) => {
  if (log.status === 'ERROR' || (log.status >= 400 && log.status < 600)) {
    return 'log-error-item'
  } else if (log.status >= 200 && log.status < 300) {
    return 'log-success-item'
  } else {
    return 'log-info-item'
  }
}

const getLogStatusType = (status) => {
  if (status === 'ERROR' || (status >= 400 && status < 600)) {
    return 'danger'
  } else if (status >= 200 && status < 300) {
    return 'success'
  } else if (status >= 300 && status < 400) {
    return 'warning'
  } else {
    return 'info'
  }
}

const formatTime = (timestamp) => {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3
  })
}

const formatJson = (data) => {
  if (typeof data === 'string') {
    try {
      return JSON.stringify(JSON.parse(data), null, 2)
    } catch {
      return data
    }
  }
  return JSON.stringify(data, null, 2)
}

// WebSocket连接管理
const initWebSocket = () => {
  const wsUrl = `ws://localhost:3000`
  websocket = new WebSocket(wsUrl)
  
  websocket.onopen = () => {
    console.log('WebSocket连接已建立')
  }
  
  websocket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data)
      handleWebSocketMessage(message)
    } catch (error) {
      console.error('WebSocket消息解析失败:', error)
    }
  }
  
  websocket.onclose = () => {
    console.log('WebSocket连接已关闭')
    // 5秒后重连
    setTimeout(() => {
      console.log('正在重连WebSocket...')
      initWebSocket()
    }, 5000)
  }
  
  websocket.onerror = (error) => {
    console.error('WebSocket连接错误:', error)
  }
}

const handleWebSocketMessage = (message) => {
  console.log('收到WebSocket消息:', message)
  
  switch (message.type) {
    case 'service_status_synced':
      // 服务状态同步更新 - 静默处理，不显示提示
      appStore.fetchProxyServices()
      appStore.fetchProxyStats()
      console.log('服务状态已同步:', message.message)
      break
    case 'heartbeat_failed':
      // 心跳失败
      appStore.fetchProxyServices()
      appStore.fetchProxyStats()
      ElMessage.warning(`服务 ${message.serviceName} 心跳失败`)
      break
    case 'heartbeat_recovered':
      // 心跳恢复
      appStore.fetchProxyServices()
      appStore.fetchProxyStats()
      ElMessage.success(`服务 ${message.serviceName} 心跳已恢复`)
      break
    case 'eureka_unavailable_shutdown':
      // Eureka不可用，自动关闭所有代理服务
      appStore.fetchProxyServices()
      appStore.fetchProxyStats()
      ElMessageBox.alert(
        `检测到Eureka服务器不可用，已自动关闭所有代理服务！\n\n详情：\n- 总服务数：${message.details.totalServices}\n- 成功关闭：${message.details.successCount}\n- 失败：${message.details.failCount}\n\n请检查Eureka服务器状态后再重新启动代理服务。`,
        '⚠️ Eureka服务器不可用',
        {
          type: 'warning',
          confirmButtonText: '我知道了'
        }
      )
      break
    case 'eureka_unavailable_shutdown_error':
      // Eureka不可用但关闭服务时出错
      appStore.fetchProxyServices()
      appStore.fetchProxyStats()
      ElMessageBox.alert(
        `检测到Eureka服务器不可用，但自动关闭代理服务时发生错误：\n\n${message.error}\n\n请手动检查并关闭代理服务。`,
        '❌ 自动关闭失败',
        {
          type: 'error',
          confirmButtonText: '我知道了'
        }
      )
      break
    case 'heartbeat_update':
      // 处理心跳更新
      if (currentLogService.value && logDrawerVisible.value) {
        const currentService = currentLogService.value
        if (message.data.serviceName === currentService.serviceName && 
            message.data.port === currentService.port) {
          // 更新心跳数据
          heartbeatData.value = message.data.history || []
          nextTick(() => {
            drawHeartbeatChart()
          })
        }
      }
      break
    case 'proxy_started':
    case 'proxy_stopped':
    case 'proxy_created':
    case 'proxy_deleted':
    case 'proxy_updated':
    case 'proxy_switched':
      // 其他服务状态变更
      appStore.fetchProxyServices()
      appStore.fetchProxyStats()
      break
    default:
      console.log('未处理的WebSocket消息类型:', message.type)
  }
}

// 获取服务状态类型
const getServiceStatusType = (service) => {
  if (!service.isRunning) return 'info'
  if (service.status === 'healthy') return 'success'
  if (service.status === 'unhealthy') return 'danger'
  return 'warning'
}

// 获取服务状态文本
const getServiceStatusText = (service) => {
  if (!service.isRunning) return '已停止'
  if (service.status === 'healthy') return '运行中'
  if (service.status === 'unhealthy') return '异常'
  return '运行中'
}

// 导入导出功能
const exportConfig = async () => {
  try {
    appStore.setLoading(true)
    
    const response = await fetch('http://localhost:3000/api/config/export')
    
    if (!response.ok) {
      throw new Error(`导出失败: ${response.statusText}`)
    }
    
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    
    // 从响应头获取文件名，如果没有则使用默认名称
    const disposition = response.headers.get('Content-Disposition')
    let filename = `proxy-config-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    
    if (disposition && disposition.includes('filename=')) {
      const matches = disposition.match(/filename="([^"]+)"/)
      if (matches) {
        filename = matches[1]
      }
    }
    
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
    
    ElMessage.success('配置导出成功')
  } catch (error) {
    console.error('导出配置失败:', error)
    ElMessage.error(`导出配置失败: ${error.message}`)
  } finally {
    appStore.setLoading(false)
  }
}

const triggerImport = () => {
  // 如果有服务正在运行，不允许导入
  if (hasRunningServices.value) {
    ElMessage.warning(`有 ${runningServicesCount.value} 个服务正在运行，请先停止所有服务再导入配置`)
    return
  }
  
  fileInputRef.value?.click()
}

const handleFileImport = async (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  
  try {
    appStore.setLoading(true)
    
    // 验证文件类型
    if (!file.name.endsWith('.json')) {
      throw new Error('请选择JSON格式的配置文件')
    }
    
    // 读取文件内容
    const text = await file.text()
    let importData
    
    try {
      importData = JSON.parse(text)
    } catch (e) {
      throw new Error('配置文件格式无效，请检查JSON格式')
    }
    
    // 验证配置文件结构
    if (!importData.data || !importData.version) {
      throw new Error('无效的配置文件格式')
    }
    
    // 显示确认对话框
    const confirmResult = await ElMessageBox.confirm(
      `确定要导入配置吗？\n\n导入信息：\n• 版本：${importData.version}\n• 导出时间：${new Date(importData.exportTime).toLocaleString()}\n• 服务数量：${importData.data.proxyServices?.length || 0}\n• 标签数量：${importData.data.tags?.length || 0}\n\n注意：重复的服务和标签将被跳过`,
      '确认导入配置',
      {
        type: 'warning',
        confirmButtonText: '确定导入',
        cancelButtonText: '取消'
      }
    )
    
    if (confirmResult === 'confirm') {
      await importConfig(importData)
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('导入配置失败:', error)
      ElMessage.error(`导入配置失败: ${error.message}`)
    }
  } finally {
    appStore.setLoading(false)
    // 清空文件输入
    if (fileInputRef.value) {
      fileInputRef.value.value = ''
    }
  }
}

const importConfig = async (importData) => {
  try {
    const response = await fetch('http://localhost:3000/api/config/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(importData)
    })
    
    const result = await response.json()
    
    if (!result.success) {
      throw new Error(result.error)
    }
    
    // 显示详细的导入结果
    const stats = result.stats
    const messages = []
    
    if (stats.services.imported > 0) {
      messages.push(`• 成功导入 ${stats.services.imported} 个服务`)
    }
    if (stats.services.skipped > 0) {
      messages.push(`• 跳过 ${stats.services.skipped} 个重复服务`)
    }
    if (stats.services.errors > 0) {
      messages.push(`• ${stats.services.errors} 个服务导入失败`)
    }
    
    if (stats.tags.imported > 0) {
      messages.push(`• 成功导入 ${stats.tags.imported} 个标签`)
    }
    if (stats.tags.skipped > 0) {
      messages.push(`• 跳过 ${stats.tags.skipped} 个重复标签`)
    }
    if (stats.tags.errors > 0) {
      messages.push(`• ${stats.tags.errors} 个标签导入失败`)
    }
    
    if (stats.autoStart.imported > 0) {
      messages.push(`• 成功导入 ${stats.autoStart.imported} 个自动启动配置`)
    }
    
    ElMessageBox.alert(
      `配置导入完成！\n\n${messages.join('\n')}`,
      '导入成功',
      {
        type: 'success',
        confirmButtonText: '确定'
      }
    )
    
    // 刷新所有数据
    await Promise.all([
      appStore.fetchProxyServices(),
      appStore.fetchProxyStats(),
      fetchTags(),
      fetchAutoStartConfig()
    ])
    
  } catch (error) {
    throw error
  }
}

onMounted(async () => {
  await appStore.fetchConfig()
  Object.assign(eurekaConfig, appStore.config.eureka)
  await Promise.all([
    appStore.fetchEurekaServices(),
    appStore.fetchProxyServices(),
    appStore.fetchProxyStats(),
    fetchTags(), // 加载标签数据
    fetchAutoStartConfig() // 加载自动启动配置
  ])
  
  // 初始化WebSocket连接
  initWebSocket()
})

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
  }
  
  // 关闭WebSocket连接
  if (websocket) {
    websocket.close()
    websocket = null
  }
})
</script>

<style scoped>
.dashboard {
  padding: 20px;
}



.config-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-title-section {
  display: flex;
  align-items: center;
  gap: 24px;
}

.stats-section {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-item {
  padding: 8px 12px;
  border-radius: 6px;
  background: #f5f7fa;
  min-width: 60px;
}

.stat-running {
  background: #e8f5e8;
  color: #67c23a;
}

.stat-healthy {
  background: #e8f5e8;
  color: #67c23a;
}

.stat-unhealthy {
  background: #fef0f0;
  color: #f56c6c;
}

.stat-stopped {
  background: #f0f9ff;
  color: #909399;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.batch-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.proxy-services-container {
  min-height: 400px;
}

.proxy-service-card {
  margin-bottom: 16px;
}

.service-item {
  transition: all 0.3s ease;
}

.service-item:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.service-item.selected {
  border: 2px solid #409eff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.2);
}

.service-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.service-info h3 {
  margin: 0 0 8px 0;
  color: #303133;
}

.service-actions {
  display: flex;
  gap: 8px;
}

.service-content {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.service-detail p {
  margin: 0 0 8px 0;
  color: #606266;
  font-size: 14px;
}

.target-switch {
  display: flex;
  align-items: center;
  gap: 8px;
}

.target-switch label {
  font-size: 14px;
  color: #606266;
}

.form-help {
  color: #909399;
  font-size: 12px;
  margin-top: 4px;
  display: block;
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 300px;
}

/* 抽屉样式 */
.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.drawer-header h3 {
  margin: 0;
  color: #303133;
}

.drawer-actions {
  display: flex;
  align-items: center;
}

.drawer-content {
  padding: 0 16px;
}

/* 自动启动配置样式 */
.auto-start-config {
  display: flex;
  align-items: center;
  margin-top: 8px;
}

.auto-start-manager {
  min-height: 400px;
}

.auto-start-header {
  margin-bottom: 20px;
}

.auto-start-actions {
  margin-top: 16px;
  text-align: center;
}

.services-stats {
  display: flex;
  justify-content: space-around;
  margin-bottom: 16px;
}

.services-list {
  max-height: calc(100vh - 300px);
  overflow-y: auto;
}

.service-card {
  margin-bottom: 12px;
}

.service-item-content {
  padding: 8px 0;
}

.service-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.service-title h4 {
  margin: 0;
  color: #303133;
  font-size: 16px;
}

.service-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #606266;
  font-size: 14px;
}

.empty-services {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
}

.port-input-group {
  display: flex;
  align-items: center;
}

.targets-container {
  width: 100%;
}

.target-item {
  margin-bottom: 12px;
}

.target-row {
  display: flex;
  align-items: center;
  width: 100%;
}

.target-item:last-child {
  margin-bottom: 8px;
}

.dice-button {
  font-size: 16px;
}

.dice-button:hover {
  transform: scale(1.1);
  transition: transform 0.2s;
}

/* 服务详情抽屉样式 */
.log-drawer-content {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 心跳图表样式 */
.heartbeat-section {
  margin-bottom: 20px;
}

.heartbeat-section h3 {
  margin: 0 0 16px 0;
  color: #303133;
  font-size: 18px;
}

.heartbeat-chart-container {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
  border: 1px solid #e4e7ed;
}

.heartbeat-chart {
  margin-bottom: 16px;
  display: flex;
  justify-content: center;
}

.heartbeat-chart canvas {
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background: white;
}

.heartbeat-legend {
  display: flex;
  justify-content: center;
  gap: 24px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #606266;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.legend-color.success {
  background-color: #67c23a;
}

.legend-color.error {
  background-color: #f56c6c;
}

.legend-color.timeout {
  background-color: #e6a23c;
}

.log-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  background: #f5f7fa;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.log-info {
  display: flex;
  gap: 20px;
}

.log-actions {
  display: flex;
  gap: 8px;
}

.log-list {
  flex: 1;
  overflow-y: auto;
  max-height: calc(100vh - 200px);
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 12px;
  background: #fff;
}

.log-item {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  margin-bottom: 12px;
  padding: 16px;
  background: #fff;
  transition: all 0.3s ease;
}

.log-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.log-success-item {
  border-left: 4px solid #67c23a;
}

.log-error-item {
  border-left: 4px solid #f56c6c;
  background: #fef0f0;
}

.log-info-item {
  border-left: 4px solid #409eff;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.log-basic-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.log-path {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  background: #f1f2f3;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
  color: #333;
}

.log-duration {
  color: #909399;
  font-size: 12px;
}

.log-time {
  font-size: 12px;
  color: #909399;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
}

.log-target {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #606266;
  font-size: 14px;
  margin-bottom: 12px;
  padding: 8px;
  background: #f8f9fa;
  border-radius: 6px;
}

.log-body {
  margin-top: 12px;
}

.log-section {
  margin-bottom: 16px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.section-header h4 {
  margin: 0;
  font-size: 14px;
  color: #303133;
  font-weight: 600;
}

.section-content {
  background: #f8f9fa;
  border-radius: 6px;
  overflow: hidden;
}

.code-block {
  margin: 0;
  padding: 12px;
  background: #2d3748;
  color: #e2e8f0;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  line-height: 1.5;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.log-error {
  margin-top: 12px;
}

.empty-logs {
  text-align: center;
  padding: 40px 20px;
  color: #909399;
}

.empty-logs p {
  margin-top: 16px;
  font-size: 14px;
  color: #c0c4cc;
}

/* 标签相关样式 */
.service-tags {
  margin-top: 12px;
}

.tags-container {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
}

.tag-manager {
  max-height: 400px;
  overflow-y: auto;
}

.tag-manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.service-tag-manager h4 {
  margin: 0 0 16px 0;
  color: #303133;
  font-size: 16px;
}

.current-tags, .add-tags {
  margin-bottom: 20px;
}

.current-tags strong, .add-tags strong {
  display: block;
  margin-bottom: 8px;
  color: #606266;
  font-size: 14px;
}

/* 自定义标签样式 */
.el-tag {
  border-radius: 4px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.el-tag:hover {
  opacity: 0.8;
  transform: translateY(-1px);
}

/* 标签选择器选项样式 */
.el-select-dropdown__item {
  padding: 8px 12px;
}

/* 可点击标签的悬停效果 */
.add-tags .el-tag {
  transition: all 0.2s ease;
}

.add-tags .el-tag:hover {
  transform: scale(1.05);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

/* 颜色预设选项样式 */
.color-presets {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.color-preset-item {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s ease;
  position: relative;
}

.color-preset-item:hover {
  transform: scale(1.1);
  border-color: #ddd;
}

.color-preset-item.active {
  border-color: #409eff;
  transform: scale(1.1);
}

.color-preset-item.active::after {
  content: '✓';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: white;
  font-size: 12px;
  font-weight: bold;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
}

/* 响应式调整 */
@media (max-width: 768px) {
  .log-controls {
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }
  
  .log-info {
    justify-content: space-around;
  }
  
  .log-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  
  .log-basic-info {
    flex-wrap: wrap;
  }
  
  .header-controls {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  
  .service-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  
  .service-actions {
    align-self: stretch;
    justify-content: flex-start;
  }
}
</style> 