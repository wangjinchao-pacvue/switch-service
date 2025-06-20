<template>
  <div class="dashboard">
    
    
    <!-- Eureka配置面板 -->
    <el-card class="config-card">
      <template #header>
        <div class="card-header">
          <span>Eureka配置</span>
          <div class="header-actions">
            <div class="eureka-status">
              <el-tag 
                :type="getEurekaAvailabilityType()" 
                size="small"
                style="margin-right: 10px;"
              >
                {{ getEurekaAvailabilityText() }}
              </el-tag>
              <el-button
                type="info"
                @click="checkEurekaAvailability"
                size="small"
                :loading="monitoringLoading"
                style="margin-right: 10px;"
              >
                <el-icon><Refresh /></el-icon>
                检查连接
              </el-button>
            </div>
                          <el-button 
                type="primary" 
                @click="openEurekaServiceDrawer"
                size="small"
              >
                <el-icon><List /></el-icon>
                查看服务列表 ({{ appStore.eurekaServices.length }})
              </el-button>
          </div>
        </div>
      </template>
      <!-- 运行中服务警告 -->
      <el-alert
        v-if="hasRunningServices"
        title="注意"
        :description="`当前有 ${runningServicesCount} 个代理服务正在运行，修改Eureka配置可能影响服务稳定性，建议先停止所有服务再修改配置。`"
        type="warning"
        :closable="false"
        style="margin-bottom: 16px;"
      />
      
      <el-form :model="eurekaConfig" label-width="100px">
        <el-row :gutter="20">
          <el-col :span="6">
            <el-form-item label="Eureka主机">
              <el-input v-model="eurekaConfig.host" placeholder="localhost" size="small" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="Eureka端口">
              <el-input-number v-model="eurekaConfig.port" :min="1" :max="65535" size="small" style="width: 100%;" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="服务路径">
              <el-input v-model="eurekaConfig.servicePath" placeholder="/eureka/apps" size="small" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="心跳间隔(秒)">
              <el-input-number v-model="eurekaConfig.heartbeatInterval" :min="10" :max="300" size="small" style="width: 100%;" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="本机IP">
              <el-input 
                v-model="localIPConfig.localIP" 
                placeholder="自动检测或手动输入" 
                size="small"
              >
                <template #suffix>
                  <el-tooltip content="配置代理服务注册到Eureka时使用的本机IP地址" placement="top">
                    <el-icon><InfoFilled /></el-icon>
                  </el-tooltip>
                </template>
              </el-input>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="端口范围">
              <div style="display: flex; align-items: center; gap: 8px;">
                <el-tag type="info" size="small">
                  {{ portRangeDisplay }}
                </el-tag>
                <el-button 
                  type="primary" 
                  size="small" 
                  @click="showPortRangeDialog = true"
                  link
                >
                  配置
                </el-button>
                <el-tooltip :content="portRangeTooltip" placement="top">
                  <el-icon><InfoFilled /></el-icon>
                </el-tooltip>
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="端口使用率">
              <div style="display: flex; align-items: center; gap: 10px;">
                <el-progress 
                  :percentage="portUsagePercentage" 
                  :color="getPortUsageColor()"
                  :stroke-width="8"
                  style="flex: 1;"
                />
                <el-tag :type="getPortUsageTagType()" size="small">
                  {{ portStats.usedCount }}/{{ portStats.totalPorts }}
                </el-tag>
              </div>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item>
          <el-button-group>
            <el-tooltip 
              :content="hasRunningServices ? `有 ${runningServicesCount} 个服务正在运行，修改配置可能影响稳定性` : '更新Eureka配置'"
              placement="top"
            >
              <el-button 
                type="primary" 
                @click="updateEurekaConfig" 
                :loading="appStore.loading"
                :disabled="false"
                size="small"
              >
                更新Eureka配置
              </el-button>
            </el-tooltip>
            <el-button 
              type="success" 
              @click="updateLocalIPConfig" 
              :loading="localIPLoading"
              size="small"
            >
              更新本机IP
            </el-button>
            <el-button 
              type="info" 
              @click="showPortUsageDialog = true"
              size="small"
            >
              端口详情
            </el-button>
          </el-button-group>
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
                        v-if="service && service.isRunning && service.status === 'healthy'"
                        type="success" 
                        size="small"
                        style="margin-left: 5px;"
                      >
                        <el-icon><Connection /></el-icon>
                        心跳正常
                      </el-tag>
                      <el-tag 
                        v-else-if="service && service.isRunning && service.status === 'unhealthy'"
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
                        v-if="service && !service.isRunning"
                        type="success"
                        size="small"
                        @click="startService(service.id)"
                        :loading="appStore.loading"
                      >
                        启动
                      </el-button>
                      <el-button
                        v-else-if="service && service.isRunning"
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
                    <p><strong>端口:</strong> {{ service.port || '未知' }}</p>
                    <p><strong>当前目标:</strong> {{ service.activeTarget || '未知' }}</p>
                    <p><strong>目标地址:</strong> {{ service.targets?.[service.activeTarget] || '未配置' }}</p>

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
                  
                  <div class="target-switch" v-if="service.isRunning && service.targets">
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
        <div class="heartbeat-section" v-if="currentLogService && currentLogService.isRunning">
          <div class="heartbeat-header" @click="toggleHeartbeatCollapse">
            <h3>心跳状态（近5分钟）</h3>
            <el-button 
              type="text" 
              size="small"
            >
              <el-icon>
                <ArrowDown v-if="heartbeatCollapsed" />
                <ArrowUp v-else />
              </el-icon>
              {{ heartbeatCollapsed ? '展开' : '收起' }}
            </el-button>
          </div>
          <el-collapse-transition>
            <div v-show="!heartbeatCollapsed" class="heartbeat-chart-container">
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
          </el-collapse-transition>
        </div>
        
        <el-divider />
        
        <!-- 请求日志部分 -->
        <h3>请求日志</h3>
        <div class="log-controls">
          <div class="log-info">
            <el-statistic title="总日志数" :value="serviceLogs.length" />
            <div class="connection-status">
              <span class="status-label">实时连接</span>
              <el-tag :type="logWebsocket ? 'success' : 'info'" size="small">
                {{ logWebsocket ? '已连接' : '未连接' }}
              </el-tag>
            </div>
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
             :key="log?.id || Math.random()"
             class="log-item"
             :class="getLogItemClass(log)"
           >
            <div class="log-header">
              <div class="log-basic-info">
                                 <el-tag 
                   :type="getLogStatusType(log?.status)" 
                   size="small"
                 >
                   {{ log?.method || '--' }} {{ log?.status || '--' }}
                 </el-tag>
                <span class="log-path">{{ log?.path || '--' }}</span>
                <span class="log-duration" v-if="log?.duration">
                  {{ log.duration }}ms
                </span>
              </div>
              <div class="log-time">
                {{ formatTime(log?.timestamp) }}
              </div>
            </div>
            
            <div class="log-target">
              <el-icon><Link /></el-icon>
              <span>{{ log?.target || '--' }}</span>
            </div>
            
            <div class="log-body" v-if="log?.requestBody || log?.responseBody">
              <div class="log-section" v-if="log?.requestBody">
                <div class="section-header">
                  <h4>请求体</h4>
                  <el-button 
                    link 
                    size="small"
                    @click="toggleSection(log?.id, 'request')"
                  >
                    {{ getExpandedState(log?.id, 'request') ? 'Show Less' : 'Show More' }}
                  </el-button>
                </div>
                <div class="section-content" v-show="getExpandedState(log?.id, 'request')">
                  <pre class="code-block">{{ formatJson(log?.requestBody) }}</pre>
                </div>
              </div>
              
              <div class="log-section" v-if="log?.responseBody">
                <div class="section-header">
                  <h4>响应体</h4>
                  <el-button 
                    link 
                    size="small"
                    @click="toggleSection(log?.id, 'response')"
                  >
                    {{ getExpandedState(log?.id, 'response') ? 'Show Less' : 'Show More' }}
                  </el-button>
                </div>
                <div class="section-content" v-show="getExpandedState(log?.id, 'response')">
                  <pre class="code-block">{{ formatJson(log?.responseBody) }}</pre>
                </div>
              </div>
            </div>
            
            <div class="log-error" v-if="log?.error">
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
        <el-form-item label="服务端口">
          <el-alert
            title="端口自动分配"
            description="系统将自动从4000-4100端口范围内分配可用端口，无需手动指定"
            type="info"
            :closable="false"
            show-icon
          />
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

    <!-- 端口使用详情对话框 -->
    <el-dialog v-model="showPortUsageDialog" title="端口使用详情" width="800px">
      <div class="port-usage-container">
        <div class="port-stats-summary">
          <el-row :gutter="20">
            <el-col :span="6">
              <el-statistic title="总端口数" :value="portStats.totalPorts" />
            </el-col>
            <el-col :span="6">
              <el-statistic title="已使用" :value="portStats.usedCount" />
            </el-col>
            <el-col :span="6">
              <el-statistic title="可用端口" :value="portStats.availableCount" />
            </el-col>
            <el-col :span="6">
              <el-statistic 
                title="使用率" 
                :value="portUsagePercentage" 
                suffix="%" 
                :value-style="{ color: getPortUsageColor() }"
              />
            </el-col>
          </el-row>
        </div>

        <el-divider />

        <el-tabs model-value="used">
          <el-tab-pane label="已使用端口" name="used">
            <div class="port-list">
              <div v-if="portStats.usedPorts.length === 0" class="empty-ports">
                <el-empty description="暂无使用中的端口" />
              </div>
              <div v-else class="used-ports-grid">
                <el-tag 
                  v-for="port in portStats.usedPorts" 
                  :key="port" 
                  type="danger" 
                  size="large"
                  style="margin: 4px;"
                >
                  {{ port }}
                </el-tag>
              </div>
            </div>
          </el-tab-pane>
          
          <el-tab-pane label="可用端口" name="available">
            <div class="port-list">
              <div v-if="portStats.availablePorts.length === 0" class="empty-ports">
                <el-empty description="暂无可用端口" />
              </div>
              <div v-else class="available-ports-grid">
                <el-tag 
                  v-for="port in portStats.availablePorts.slice(0, 50)" 
                  :key="port" 
                  type="success" 
                  size="large"
                  style="margin: 4px;"
                >
                  {{ port }}
                </el-tag>
                <div v-if="portStats.availablePorts.length > 50" class="more-ports">
                  <el-tag type="info" size="large" style="margin: 4px;">
                    ... 还有 {{ portStats.availablePorts.length - 50 }} 个可用端口
                  </el-tag>
                </div>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
      
      <template #footer>
        <el-button @click="showPortUsageDialog = false">关闭</el-button>
        <el-button type="primary" @click="fetchPortStats">刷新数据</el-button>
      </template>
    </el-dialog>

    <!-- 端口范围配置对话框 -->
    <el-dialog v-model="showPortRangeDialog" title="端口范围配置" width="600px">
      <div class="port-range-config-container">
        <el-alert
          title="重要提示"
          type="warning"
          description="修改端口范围需要确保Docker容器映射了对应的端口范围，否则服务将无法正常访问"
          :closable="false"
          style="margin-bottom: 20px;"
        />

        <el-form :model="portRangeForm" label-width="100px">
          <el-form-item label="当前配置" v-if="currentPortRange">
            <div class="current-config">
              <el-tag type="info" size="large">
                {{ currentPortRange.startPort }}-{{ currentPortRange.endPort }} 
                ({{ currentPortRange.totalPorts }}个端口)
              </el-tag>
              <el-text type="info" size="small" style="display: block; margin-top: 8px;">
                创建时间: {{ formatDate(currentPortRange.createdAt) }}
              </el-text>
              <el-text type="info" size="small" style="display: block;" v-if="currentPortRange.updatedAt">
                更新时间: {{ formatDate(currentPortRange.updatedAt) }}
              </el-text>
            </div>
          </el-form-item>

          <el-form-item label="起始端口" required>
            <el-input-number
              v-model="portRangeForm.startPort"
              :min="1"
              :max="65535"
              placeholder="起始端口"
              style="width: 150px"
            />
          </el-form-item>

          <el-form-item label="结束端口" required>
            <el-input-number
              v-model="portRangeForm.endPort"
              :min="1"
              :max="65535"
              placeholder="结束端口"
              style="width: 150px"
            />
            <el-text type="info" size="small" style="margin-left: 12px;">
              总计: {{ (portRangeForm.endPort - portRangeForm.startPort + 1) || 0 }} 个端口
            </el-text>
          </el-form-item>

          <el-form-item label="描述">
            <el-input
              v-model="portRangeForm.description"
              type="textarea"
              rows="2"
              placeholder="端口范围用途描述（可选）"
            />
          </el-form-item>

          <el-form-item label="Docker命令" v-if="dockerCommand">
            <div class="docker-command">
              <el-input
                :value="dockerCommand"
                readonly
                type="textarea"
                rows="2"
              />
              <el-button 
                type="primary" 
                size="small" 
                @click="copyDockerCommand"
                style="margin-top: 8px;"
              >
                复制命令
              </el-button>
            </div>
          </el-form-item>
        </el-form>

        <el-alert
          v-if="portRangeValidation.hasError"
          :title="portRangeValidation.message"
          type="error"
          :closable="false"
          style="margin-top: 16px;"
        />
      </div>
      
      <template #footer>
        <el-button @click="showPortRangeDialog = false">取消</el-button>
        <el-button 
          type="primary" 
          @click="savePortRangeConfig" 
          :loading="portRangeLoading"
          :disabled="!isPortRangeFormValid"
        >
          保存配置
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


  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { useAppStore } from '../stores/app'
import { ElMessage, ElMessageBox } from 'element-plus'
import { List, Plus, Search, Connection, WarningFilled, Refresh, Setting, Link, Management, Download, Upload, InfoFilled, ArrowDown, ArrowUp } from '@element-plus/icons-vue'

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
const heartbeatCollapsed = ref(true) // 默认折叠心跳图表

// 导入导出相关状态
const fileInputRef = ref()

// Eureka状态
const eurekaStatus = ref({
  isAvailable: null // null=未检查, true=可用, false=不可用
})
const monitoringLoading = ref(false)

// 本机IP配置
const localIPConfig = reactive({
  localIP: ''
})
const localIPLoading = ref(false)

// 端口使用统计
const portStats = ref({
  startPort: 4000,
  endPort: 4100,
  totalPorts: 101,
  usedCount: 0,
  availableCount: 101,
  usedPorts: [],
  availablePorts: []
})
const showPortUsageDialog = ref(false)

// 端口范围配置
const showPortRangeDialog = ref(false)
const portRangeLoading = ref(false)
const currentPortRange = ref(null)
const portRangeForm = reactive({
  startPort: 4000,
  endPort: 4100,
  description: ''
})
const dockerCommand = ref('')
const portRangeValidation = reactive({
  hasError: false,
  message: ''
})

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
  targetList: [
    { required: true, message: '请至少配置一个代理目标', trigger: 'blur' }
  ]
}

const updateEurekaConfig = async () => {
  try {
    // 检查是否有运行中的代理服务
    const runningServices = appStore.proxyServices.filter(service => service.isRunning)
    if (runningServices.length > 0) {
      const runningServiceNames = runningServices
        .map(service => service.serviceName)
        .slice(0, 3)
        .join('、')
      
      await ElMessageBox.confirm(
        `检测到有 ${runningServices.length} 个代理服务正在运行（${runningServiceNames}${runningServices.length > 3 ? ' 等' : ''}），修改Eureka配置可能影响服务稳定性。建议先停止所有运行中的代理服务再修改配置。是否继续？`,
        '确认修改Eureka配置',
        {
          confirmButtonText: '继续修改',
          cancelButtonText: '取消',
          type: 'warning',
          dangerouslyUseHTMLString: false
        }
      )
    }
    
    await appStore.updateEurekaConfig(eurekaConfig)
    ElMessage.success('Eureka配置更新成功')
    // 配置更新后自动刷新服务列表
    await refreshEurekaServices()
  } catch (error) {
    if (error === 'cancel') {
      return // 用户取消操作
    }
    
    if (error.response?.data?.error) {
      ElMessage.error(error.response.data.error)
    } else {
      ElMessage.error('Eureka配置更新失败')
    }
  }
}

const refreshEurekaServices = async () => {
  try {
    await appStore.fetchEurekaServices()
  } catch (error) {
    ElMessage.error('刷新失败')
  }
}

// Eureka相关方法
const fetchEurekaStatus = async () => {
  try {
    const response = await fetch('/api/eureka/status')
    const data = await response.json()
    if (data.success) {
      eurekaStatus.value.isAvailable = data.isAvailable
    }
  } catch (error) {
    console.error('获取Eureka状态失败:', error)
  }
}

const checkEurekaAvailability = async () => {
  if (monitoringLoading.value) return
  
  monitoringLoading.value = true
  
  try {
    const response = await fetch('/api/eureka/check', { method: 'POST' })
    const data = await response.json()
    
    if (data.success) {
      eurekaStatus.value.isAvailable = data.isAvailable
      ElMessage.success(data.message)
      
      // 如果Eureka不可用，清空服务列表
      if (!data.isAvailable) {
        appStore.eurekaServices = []
      }
    } else {
      ElMessage.error(data.message || '检查失败')
    }
  } catch (error) {
    ElMessage.error('检查Eureka连接失败: ' + error.message)
  } finally {
    monitoringLoading.value = false
  }
}

const openEurekaServiceDrawer = async () => {
  console.log('🔍 打开Eureka服务列表，当前有', appStore.eurekaServices.length, '个服务')
  
  try {
    // 每次打开抽屉时重新获取服务列表
    await appStore.fetchEurekaServices()
    console.log('📝 刷新后有', appStore.eurekaServices.length, '个服务')
  } catch (error) {
    console.error('获取Eureka服务列表失败:', error)
    ElMessage.error('获取服务列表失败: ' + error.message)
  }
  
  drawerVisible.value = true
}

const getEurekaAvailabilityType = () => {
  if (eurekaStatus.value.isAvailable === null) return 'info'
  return eurekaStatus.value.isAvailable ? 'success' : 'danger'
}

const getEurekaAvailabilityText = () => {
  if (eurekaStatus.value.isAvailable === null) return 'Eureka状态未知'
  return eurekaStatus.value.isAvailable ? 'Eureka可用' : 'Eureka不可用'
}

// 本机IP配置相关方法
const fetchLocalIPConfig = async () => {
  try {
    const response = await fetch('/api/config/local-ip')
    const data = await response.json()
    if (data.success && data.config) {
      // 确保localIP是字符串类型
      const configLocalIP = data.config.localIP
      if (typeof configLocalIP === 'string' && configLocalIP.trim()) {
        localIPConfig.localIP = configLocalIP
      } else {
        localIPConfig.localIP = ''
        console.warn('本机IP配置格式异常，已重置为空')
      }
    }
  } catch (error) {
    console.error('获取本机IP配置失败:', error)
  }
}

const updateLocalIPConfig = async () => {
  if (localIPLoading.value) return
  
  if (!localIPConfig.localIP) {
    ElMessage.warning('请输入有效的本机IP地址')
    return
  }
  
  localIPLoading.value = true
  
  try {
    const response = await fetch('/api/config/local-ip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(localIPConfig)
    })
    
    const data = await response.json()
    if (data.success) {
      ElMessage.success(data.message)
    } else {
      ElMessage.error(data.error || '更新失败')
    }
  } catch (error) {
    ElMessage.error('更新本机IP配置失败: ' + error.message)
  } finally {
    localIPLoading.value = false
  }
}

// 端口使用统计相关方法
const fetchPortStats = async () => {
  try {
    const response = await fetch('/api/ports/usage')
    const data = await response.json()
    if (data.success) {
      portStats.value = data.stats
    }
  } catch (error) {
    console.error('获取端口使用统计失败:', error)
  }
}

// 端口范围配置相关方法
const fetchPortRangeConfig = async () => {
  try {
    const response = await fetch('/api/config/port-range')
    const data = await response.json()
    if (data.success && data.data) {
      currentPortRange.value = data.data
      // 同步表单数据
      portRangeForm.startPort = data.data.startPort
      portRangeForm.endPort = data.data.endPort
      portRangeForm.description = data.data.description || ''
    }
  } catch (error) {
    console.error('获取端口范围配置失败:', error)
  }
}

const savePortRangeConfig = async () => {
  if (!isPortRangeFormValid.value) {
    ElMessage.warning('请检查端口范围配置')
    return
  }
  
  portRangeLoading.value = true
  
  try {
    const response = await fetch('/api/config/port-range', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        startPort: portRangeForm.startPort,
        endPort: portRangeForm.endPort,
        description: portRangeForm.description
      })
    })
    
    const data = await response.json()
    
    if (data.success) {
      ElMessage.success(data.message)
      showPortRangeDialog.value = false
      
      // 刷新配置和端口统计
      await fetchPortRangeConfig()
      await fetchPortStats()
      
      // 显示Docker命令提示
      if (data.dockerCommand) {
        ElNotification({
          title: 'Docker命令提示',
          message: `请使用以下命令启动容器:\n${data.dockerCommand}`,
          type: 'info',
          duration: 8000,
          position: 'bottom-right'
        })
      }
    } else {
      ElMessage.error(data.error || '保存端口范围配置失败')
    }
  } catch (error) {
    console.error('保存端口范围配置失败:', error)
    ElMessage.error('保存端口范围配置失败: ' + error.message)
  } finally {
    portRangeLoading.value = false
  }
}

const copyDockerCommand = async () => {
  if (!dockerCommand.value) return
  
  try {
    await navigator.clipboard.writeText(dockerCommand.value)
    ElMessage.success('Docker命令已复制到剪贴板')
  } catch (error) {
    // 降级方案：使用临时文本区域
    const textArea = document.createElement('textarea')
    textArea.value = dockerCommand.value
    document.body.appendChild(textArea)
    textArea.select()
    try {
      document.execCommand('copy')
      ElMessage.success('Docker命令已复制到剪贴板')
    } catch (e) {
      ElMessage.error('复制失败，请手动复制')
    }
    document.body.removeChild(textArea)
  }
}

const formatDate = (dateString) => {
  if (!dateString) return ''
  return new Date(dateString).toLocaleString('zh-CN')
}

const portUsagePercentage = computed(() => {
  if (portStats.value.totalPorts === 0) return 0
  return Math.round((portStats.value.usedCount / portStats.value.totalPorts) * 100)
})

// 端口范围相关计算属性
const portRangeDisplay = computed(() => {
  if (currentPortRange.value) {
    return `${currentPortRange.value.startPort}-${currentPortRange.value.endPort} (自动分配)`
  }
  return `${portStats.value.startPort}-${portStats.value.endPort} (自动分配)`
})

const portRangeTooltip = computed(() => {
  if (currentPortRange.value) {
    return `代理服务将自动从${currentPortRange.value.startPort}-${currentPortRange.value.endPort}端口范围内分配可用端口`
  }
  return `代理服务将自动从${portStats.value.startPort}-${portStats.value.endPort}端口范围内分配可用端口`
})

const isPortRangeFormValid = computed(() => {
  return portRangeForm.startPort && 
         portRangeForm.endPort && 
         portRangeForm.startPort < portRangeForm.endPort &&
         portRangeForm.startPort >= 1 &&
         portRangeForm.endPort <= 65535 &&
         !portRangeValidation.hasError
})

// 监听端口范围表单变化
watch([() => portRangeForm.startPort, () => portRangeForm.endPort], () => {
  if (portRangeForm.startPort && portRangeForm.endPort) {
    portRangeForm.totalPorts = portRangeForm.endPort - portRangeForm.startPort + 1
    
    // 生成Docker命令预览
    dockerCommand.value = `docker run -p 3400:3400 -p ${portRangeForm.startPort}-${portRangeForm.endPort}:${portRangeForm.startPort}-${portRangeForm.endPort} your-image`
    
    // 验证端口范围
    validatePortRange()
  }
})

const validatePortRange = async () => {
  portRangeValidation.hasError = false
  portRangeValidation.message = ''
  
  if (portRangeForm.startPort >= portRangeForm.endPort) {
    portRangeValidation.hasError = true
    portRangeValidation.message = '起始端口必须小于结束端口'
    return
  }
  
  if (portRangeForm.startPort < 1 || portRangeForm.endPort > 65535) {
    portRangeValidation.hasError = true
    portRangeValidation.message = '端口范围必须在1-65535之间'
    return
  }
  
  // 检查是否有服务使用了范围外的端口
  try {
    const invalidPorts = portStats.value.usedPorts.filter(port => 
      port < portRangeForm.startPort || port > portRangeForm.endPort
    )
    if (invalidPorts.length > 0) {
      portRangeValidation.hasError = true
      portRangeValidation.message = `有${invalidPorts.length}个服务使用了新范围外的端口: ${invalidPorts.join(', ')}，请先停止这些服务`
    }
  } catch (error) {
    console.error('验证端口范围失败:', error)
  }
}

const getPortUsageColor = () => {
  const percentage = portUsagePercentage.value
  if (percentage < 50) return '#67c23a' // 绿色
  if (percentage < 80) return '#e6a23c' // 橙色
  return '#f56c6c' // 红色
}

const getPortUsageTagType = () => {
  const percentage = portUsagePercentage.value
  if (percentage < 50) return 'success'
  if (percentage < 80) return 'warning'
  return 'danger'
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
    // 检查Eureka可用性
    if (eurekaStatus.value.isAvailable === false) {
      ElMessage.warning('Eureka服务不可用，无法创建代理服务')
      return
    }
    
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
    const response = await fetch('/api/tags')
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
      response = await fetch(`/api/tags/${editingTag.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tagData)
      })
    } else {
      // 创建标签
              response = await fetch('/api/tags', {
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
    const response = await fetch(`/api/tags/${tagId}`, {
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
    const response = await fetch(`/api/proxy/${serviceId}/tags`, {
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
    const response = await fetch(`/api/proxy/${serviceId}/tags/${encodeURIComponent(tagName)}`, {
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
  if (!appStore.eurekaServices || !Array.isArray(appStore.eurekaServices)) {
    return 0
  }
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
  
  // 按运行状态排序：运行中的服务在前面
  return services.sort((a, b) => {
    // 首先按运行状态排序（运行中的在前）
    if (a.isRunning && !b.isRunning) return -1
    if (!a.isRunning && b.isRunning) return 1
    
    // 如果运行状态相同，再按服务名称排序
    return a.serviceName.localeCompare(b.serviceName)
  })
})

// 标签相关计算属性
const availableTagsForService = computed(() => {
  if (!currentTagService.value) return []
  const serviceTags = currentTagService.value.tags || []
  return availableTags.value.filter(tag => !serviceTags.includes(tag.name))
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
  if (!service) {
    console.warn('openServiceDetails: service 参数为空')
    return
  }
  
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
  heartbeatCollapsed.value = true // 关闭详情时重置为折叠状态
}

const toggleHeartbeatCollapse = () => {
  heartbeatCollapsed.value = !heartbeatCollapsed.value
  
  // 如果展开心跳图表，需要重新绘制
  if (!heartbeatCollapsed.value) {
    nextTick(() => {
      drawHeartbeatChart()
    })
  }
}

const connectLogWebSocket = (serviceName) => {
  const wsUrl = `ws://${window.location.hostname}:3400`
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
    console.log(`加载心跳数据: ${service.serviceName}:${service.port}`)
    const response = await fetch(`/api/heartbeat/history/${service.serviceName}/${service.port}`)
    const result = await response.json()
    
    console.log('心跳数据响应:', result)
    
    if (result.success) {
      heartbeatData.value = result.data.history || []
      console.log(`设置心跳数据，数量: ${heartbeatData.value.length}`)
      nextTick(() => {
        drawHeartbeatChart()
      })
    } else {
      console.error('心跳数据加载失败:', result.error)
    }
  } catch (error) {
    console.error('Failed to load heartbeat data:', error)
  }
}

const drawHeartbeatChart = () => {
  const canvas = heartbeatCanvasRef.value
  if (!canvas) {
    console.warn('心跳图表canvas元素未找到')
    return
  }
  
  const ctx = canvas.getContext('2d')
  const width = canvas.width
  const height = canvas.height
  
  // 清空画布
  ctx.clearRect(0, 0, width, height)
  
  // console.log('绘制心跳图表，数据数量:', heartbeatData.value.length)
  
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
  
  // console.log('时间范围:', {
  //   now: new Date(now).toLocaleString(),
  //   fiveMinutesAgo: new Date(fiveMinutesAgo).toLocaleString(),
  //   nowTimestamp: now,
  //   fiveMinutesAgoTimestamp: fiveMinutesAgo
  // })
  
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
  let validHeartbeats = 0
  heartbeatData.value.forEach((heartbeat, index) => {
    // 处理时间戳格式，统一使用秒级时间戳
    let timestamp
    if (typeof heartbeat.timestamp === 'string') {
      // 如果是字符串，尝试解析为数字（可能是秒级时间戳字符串）
      const parsed = parseInt(heartbeat.timestamp)
      if (!isNaN(parsed)) {
        // 如果是秒级时间戳，转换为毫秒
        timestamp = parsed < 1e12 ? parsed * 1000 : parsed
      } else {
        // 如果是日期字符串，解析为毫秒时间戳
        if (heartbeat.timestamp.includes('T')) {
          timestamp = new Date(heartbeat.timestamp).getTime()
        } else {
          const isoStr = heartbeat.timestamp.replace(' ', 'T')
          timestamp = new Date(isoStr).getTime()
        }
      }
    } else {
      // 如果是数字，检查是秒级还是毫秒级
      timestamp = heartbeat.timestamp < 1e12 ? heartbeat.timestamp * 1000 : heartbeat.timestamp
    }
    
          // 调试信息（已注释）
      // if (index < 3) {
      //   console.log(`心跳点 ${index}:`, {
      //     originalTimestamp: heartbeat.timestamp,
      //     parsedTimestamp: timestamp,
      //     timestampDate: new Date(timestamp).toLocaleString(),
      //     inRange: timestamp >= fiveMinutesAgo && timestamp <= now,
      //     status: heartbeat.status
      //   })
      // }
    
    // 只绘制在时间范围内的心跳点
    if (timestamp >= fiveMinutesAgo && timestamp <= now) {
      const x = ((timestamp - fiveMinutesAgo) / (5 * 60 * 1000)) * (width - 80) + 40
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
      
      validHeartbeats++
    }
  })
  
  // console.log(`绘制了 ${validHeartbeats} 个有效心跳点（5分钟内）`)
  
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
    const response = await fetch(`/api/proxy/${currentLogService.value.serviceName}/logs`, {
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
  if (!logId || !section) return
  
  const key = `${logId}-${section}`
  const currentState = expandedSections.value.get(key) || false
  expandedSections.value.set(key, !currentState)
}

const getExpandedState = (logId, section) => {
  if (!logId || !section) return false
  
  const key = `${logId}-${section}`
  return expandedSections.value.get(key) || false
}

const getLogItemClass = (log) => {
  if (!log || !log.status) return 'log-info-item'
  
  if (log.status === 'ERROR' || (log.status >= 400 && log.status < 600)) {
    return 'log-error-item'
  } else if (log.status >= 200 && log.status < 300) {
    return 'log-success-item'
  } else {
    return 'log-info-item'
  }
}

const getLogStatusType = (status) => {
  if (!status && status !== 0) return 'info'
  
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
  if (!timestamp) return '--'
  
  try {
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    })
  } catch (error) {
    return timestamp.toString()
  }
}

const formatJson = (data) => {
  if (!data && data !== 0 && data !== false) return ''
  
  if (typeof data === 'string') {
    try {
      return JSON.stringify(JSON.parse(data), null, 2)
    } catch {
      return data
    }
  }
  
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return data.toString()
  }
}

// WebSocket连接管理
const initWebSocket = () => {
  const wsUrl = `ws://${window.location.hostname}:3400`
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
    case 'eureka_monitoring_started':
      // Eureka监听已启动（已移除监听功能，仅保留消息处理）
      ElMessage.success(message.message)
      break
    case 'eureka_monitoring_stopped':
      // Eureka监听已停止（已移除监听功能，仅保留消息处理）
      ElMessage.info(message.message)
      break
    case 'eureka_availability_updated':
      // Eureka可用性状态更新
      eurekaStatus.value.isAvailable = message.isAvailable
      if (message.isAvailable) {
        ElMessage.success(message.message)
      } else {
        ElMessage.error(message.message)
        // 如果Eureka不可用，清空服务列表
        appStore.eurekaServices = []
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
  if (!service) return 'info'
  if (!service.isRunning) return 'info'
  if (service.status === 'healthy') return 'success'
  if (service.status === 'unhealthy') return 'danger'
  return 'warning'
}

// 获取服务状态文本
const getServiceStatusText = (service) => {
  if (!service) return '未知'
  if (!service.isRunning) return '已停止'
  if (service.status === 'healthy') return '运行中'
  if (service.status === 'unhealthy') return '异常'
  return '运行中'
}

// 导入导出功能
const exportConfig = async () => {
  try {
    appStore.setLoading(true)
    
    const response = await fetch('/api/config/export')
    
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
    const response = await fetch('/api/config/import', {
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
      fetchTags()
    ])
    
  } catch (error) {
    throw error
  }
}

onMounted(async () => {
  await appStore.fetchConfig()
  Object.assign(eurekaConfig, appStore.config.eureka)
  
  // 获取Eureka状态
  await fetchEurekaStatus()
  
  await Promise.all([
    appStore.fetchEurekaServices(),
    appStore.fetchProxyServices(),
    appStore.fetchProxyStats(),
    fetchTags(), // 加载标签数据
    fetchLocalIPConfig(), // 加载本机IP配置
    fetchPortStats(), // 加载端口使用统计
    fetchPortRangeConfig() // 加载端口范围配置
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

.eureka-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.port-usage-container {
  padding: 0;
}

.port-stats-summary {
  background: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.port-list {
  min-height: 200px;
}

.used-ports-grid,
.available-ports-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 16px;
}

.empty-ports {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
}

.port-range-config-container {
  padding: 0;
}

.current-config {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.docker-command {
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  padding: 12px;
  background: #f8f9fa;
}

.port-range-tip {
  margin-top: 8px;
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

.heartbeat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  padding: 8px 0;
  border-radius: 4px;
  transition: background-color 0.2s ease;
}

.heartbeat-header:hover {
  background-color: #f5f7fa;
}

.heartbeat-header h3 {
  margin: 0;
  color: #303133;
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

.connection-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.status-label {
  font-size: 12px;
  color: #666;
  font-weight: 500;
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