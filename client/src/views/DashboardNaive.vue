<template>
  <div class="dashboard">
    <n-config-provider :theme="themeConfig" :theme-overrides="themeOverrides">
      <n-message-provider>
        <div class="dashboard-content">
          <!-- Eureka配置面板 -->
          <n-card class="config-card">
            <template #header>
              <div class="card-header">
                <div class="card-title-section">
                  <span>{{ showSystemLogs ? '系统日志' : 'Eureka配置' }}</span>
                  <n-button-group size="small" style="margin-left: 12px;">
                    <n-button 
                      :type="!showSystemLogs ? 'primary' : 'default'"
                      @click="showSystemLogs = false"
                      size="small"
                    >
                      <template #icon>
                        <n-icon><SettingsOutline /></n-icon>
                      </template>
                      配置
                    </n-button>
                    <n-button 
                      :type="showSystemLogs ? 'primary' : 'default'"
                      @click="toggleSystemLogs"
                      size="small"
                    >
                      <template #icon>
                        <n-icon><DocumentTextOutline /></n-icon>
                      </template>
                      日志
                    </n-button>
                  </n-button-group>
                </div>
                <div class="header-actions">
                  <div v-if="!showSystemLogs" class="eureka-status">
                    <n-tag 
                      :type="getEurekaAvailabilityType()" 
                      size="small"
                      style="margin-right: 10px;"
                    >
                      {{ getEurekaAvailabilityText() }}
                    </n-tag>
                    <n-button
                      type="info"
                      @click="checkEurekaAvailability"
                      size="small"
                      :loading="monitoringLoading"
                      style="margin-right: 10px;"
                    >
                      <template #icon>
                        <n-icon><RefreshOutline /></n-icon>
                      </template>
                      检查连接
                    </n-button>
                  </div>
                  <div v-if="showSystemLogs" class="system-log-actions">
                    <n-tag size="small" style="margin-right: 10px;">
                      {{ systemLogs?.length || 0 }}/500 条日志
                    </n-tag>
                    <n-button
                      type="error"
                      @click="clearSystemLogs"
                      size="small"
                      :loading="clearingSystemLogs"
                      style="margin-right: 10px;"
                    >
                      <template #icon>
                        <n-icon><TrashOutline /></n-icon>
                      </template>
                      清理日志
                    </n-button>
                  </div>
                  <n-button 
                    v-if="!showSystemLogs"
                    type="primary" 
                    @click="openEurekaServiceDrawer"
                    size="small"
                  >
                    <template #icon>
                      <n-icon><ListOutline /></n-icon>
                    </template>
                    查看服务列表 ({{ appStore.eurekaServices?.length || 0 }})
                  </n-button>
                </div>
              </div>
            </template>
            
            <!-- 系统日志视图 -->
            <div v-if="showSystemLogs" class="system-logs-container">
              <!-- 日志分类过滤器 -->
              <div class="log-category-filters">
                <div class="filter-header">
                  <span>日志分类过滤:</span>
                  <n-button 
                    size="small" 
                    type="primary" 
                    text
                    @click="toggleAllCategories"
                  >
                    {{ allCategoriesSelected ? '取消全选' : '全选' }}
                  </n-button>
                </div>
                <div class="filter-options">
                  <n-checkbox-group v-model:value="selectedLogCategories" @update:value="onCategoryChange">
                    <n-checkbox
                      v-for="category in logCategories"
                      :key="category.key"
                      :value="category.key"
                      :disabled="loadingCategories"
                    >
                      <span class="category-option">
                        <span class="category-icon">{{ category.icon }}</span>
                        <span class="category-name">{{ category.name }}</span>
                        <n-tag 
                          size="small" 
                          :style="{ 
                            backgroundColor: category.color, 
                            color: 'white', 
                            border: 'none',
                            marginLeft: '4px'
                          }"
                        >
                          {{ category.count }}
                        </n-tag>
                      </span>
                    </n-checkbox>
                  </n-checkbox-group>
                </div>
              </div>
              
              <div class="system-logs-content" ref="systemLogsContainer">
                <div v-if="(filteredSystemLogs?.length || 0) === 0" class="empty-logs">
                  <n-empty :description="(systemLogs?.length || 0) === 0 ? '暂无系统日志' : '当前分类下暂无日志'" />
                </div>
                <div v-else class="log-entries">
                  <div 
                    v-for="log in filteredSystemLogs" 
                    :key="log.id"
                    :class="['log-entry', `log-${log.level}`, `category-${log.category}`]"
                  >
                    <div class="log-content">
                      <div class="log-meta">
                        <span class="log-timestamp">{{ formatLogTimestamp(log.timestamp) }}</span>
                        <n-tag 
                          :type="getLogLevelType(log.level)" 
                          size="small"
                          class="log-level"
                        >
                          {{ log.level.toUpperCase() }}
                        </n-tag>
                        <span class="log-category" :title="getCategoryName(log.category)">
                          {{ getCategoryIcon(log.category) }}
                        </span>
                      </div>
                      <div class="log-message">
                        <div class="log-text-container">
                          <template v-if="isProxyRequestLog(log) || isProxyResponseLog(log)">
                            <n-tag 
                              :type="getServiceTagType(extractServiceNameFromMessage(log.message))"
                              size="small"
                              class="service-tag"
                            >
                              {{ extractServiceNameFromMessage(log.message) }}
                            </n-tag>
                            <span class="log-text">{{ removeServiceTagFromMessage(log.message) }}</span>
                          </template>
                          <template v-else-if="log.serviceName">
                            <n-tag 
                              :type="getServiceTagType(log.serviceName)"
                              size="small"
                              class="service-tag"
                            >
                              {{ log.serviceName }}
                            </n-tag>
                            <span class="log-text">{{ log.message }}</span>
                          </template>
                          <template v-else>
                            <span class="log-text">{{ log.message }}</span>
                          </template>
                          <div class="log-actions" v-if="isProxyRequestLog(log)">
                            <n-button 
                              type="primary" 
                              size="small" 
                              text
                              @click="showSystemLogDetails(log)"
                            >
                              <template #icon>
                                <n-icon><EyeOutline /></n-icon>
                              </template>
                              详情
                            </n-button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Eureka配置视图 -->
            <div v-else>
              <!-- 运行中服务警告 -->
              <n-alert
                v-if="hasRunningServices"
                title="注意"
                type="warning"
                :show-icon="true"
                :closable="false"
                style="margin-bottom: 16px;"
              >
                当前有 {{ runningServicesCount }} 个代理服务正在运行，修改Eureka配置可能影响服务稳定性，建议先停止所有服务再修改配置。
              </n-alert>
            
              <n-form :model="eurekaConfig" label-width="100px">
                <n-grid :cols="4" :x-gap="20">
                  <n-gi>
                    <n-form-item label="Eureka主机">
                      <n-input v-model:value="eurekaConfig.host" placeholder="localhost" size="small" />
                    </n-form-item>
                  </n-gi>
                  <n-gi>
                    <n-form-item label="Eureka端口">
                      <n-input-number v-model:value="eurekaConfig.port" :min="1" :max="65535" size="small" style="width: 100%" />
                    </n-form-item>
                  </n-gi>
                  <n-gi>
                    <n-form-item label="服务路径">
                      <n-input v-model:value="eurekaConfig.servicePath" placeholder="/eureka/apps" size="small" />
                    </n-form-item>
                  </n-gi>
                  <n-gi>
                    <n-form-item label="心跳间隔(秒)">
                      <n-input-number v-model:value="eurekaConfig.heartbeatInterval" :min="10" :max="300" size="small" style="width: 100%" />
                    </n-form-item>
                  </n-gi>
                </n-grid>
                
                <n-grid :cols="3" :x-gap="20">
                  <n-gi>
                    <n-form-item label="本机IP">
                      <n-input 
                        v-model:value="localIPConfig.localIP" 
                        placeholder="自动检测或手动输入" 
                        size="small"
                      >
                        <template #suffix>
                          <n-tooltip trigger="hover">
                            <template #trigger>
                              <n-icon style="cursor: help;"><InformationCircleOutline /></n-icon>
                            </template>
                            配置代理服务注册到Eureka时使用的本机IP地址
                          </n-tooltip>
                        </template>
                      </n-input>
                    </n-form-item>
                  </n-gi>
                  <n-gi :span="2">
                    <n-form-item label="端口管理">
                      <div class="port-management-section">
                        <!-- 端口范围信息 -->
                        <div class="port-info-row">
                          <div class="port-range-info">
                            <span class="port-label">范围:</span>
                            <n-tag type="info" size="small">{{ portRangeDisplay }}</n-tag>
                          </div>
                          <div class="port-usage-info">
                            <span class="port-label">使用率:</span>
                            <n-progress 
                              :percentage="portUsagePercentage" 
                              :color="getPortUsageColor()"
                              :height="6"
                              style="width: 120px;"
                            />
                            <n-tag :type="getPortUsageTagType()" size="small">
                              {{ portStats.usedCount }}/{{ portStats.totalPorts }}
                            </n-tag>
                          </div>
                        </div>
                        <!-- 端口管理按钮 -->
                        <div class="port-actions-row">
                          <n-button-group size="small">
                            <n-tooltip>
                              <template #trigger>
                                <n-button 
                                  @click="showPortRangeConfigDialog"
                                  secondary
                                >
                                  <template #icon>
                                    <n-icon><SettingsOutline /></n-icon>
                                  </template>
                                  配置范围
                                </n-button>
                              </template>
                              配置端口范围
                            </n-tooltip>
                            <n-tooltip>
                              <template #trigger>
                                <n-button 
                                  @click="showPortUsageDetails"
                                  secondary
                                >
                                  <template #icon>
                                    <n-icon><BarChartOutline /></n-icon>
                                  </template>
                                  使用详情
                                </n-button>
                              </template>
                              查看端口使用详情
                            </n-tooltip>
                          </n-button-group>
                          <n-tooltip trigger="hover">
                            <template #trigger>
                              <n-icon style="cursor: help; margin-left: 8px;"><InformationCircleOutline /></n-icon>
                            </template>
                            {{ portRangeTooltip }}
                          </n-tooltip>
                        </div>
                      </div>
                    </n-form-item>
                  </n-gi>
                </n-grid>
                
                <n-form-item>
                  <n-button-group>
                    <n-tooltip trigger="hover" :disabled="!hasRunningServices">
                      <template #trigger>
                        <n-button 
                          type="primary" 
                          @click="updateEurekaConfig" 
                          :loading="appStore.loading"
                          size="small"
                        >
                          更新Eureka配置
                        </n-button>
                      </template>
                      {{ hasRunningServices ? `有 ${runningServicesCount} 个服务正在运行，修改配置可能影响稳定性` : '更新Eureka配置' }}
                    </n-tooltip>
                    <n-button 
                      type="success" 
                      @click="updateLocalIPConfig" 
                      :loading="localIPLoading"
                      size="small"
                    >
                      更新本机IP
                    </n-button>
                  </n-button-group>
                </n-form-item>
              </n-form>
            </div>
          </n-card>

          <!-- 代理服务管理 -->
          <n-card class="services-card" style="margin-top: 20px;">
            <template #header>
              <div class="services-header">
                <div class="header-title">
                  <h2>代理服务管理</h2>
                </div>
              </div>
            </template>
            
            <!-- 统计信息区域 -->
            <div class="stats-overview">
              <div class="stat-card stat-total">
                <div class="stat-icon">
                  <n-icon size="24"><ServerOutline /></n-icon>
                </div>
                <div class="stat-content">
                  <div class="stat-value">{{ appStore.proxyStats.total }}</div>
                  <div class="stat-label">总数</div>
                </div>
              </div>
              <div class="stat-card stat-running">
                <div class="stat-icon">
                  <n-icon size="24"><PlayCircleOutline /></n-icon>
                </div>
                <div class="stat-content">
                  <div class="stat-value">{{ appStore.proxyStats.running }}</div>
                  <div class="stat-label">运行中</div>
                </div>
              </div>
              <div class="stat-card stat-healthy">
                <div class="stat-icon">
                  <n-icon size="24"><CheckmarkCircleOutline /></n-icon>
                </div>
                <div class="stat-content">
                  <div class="stat-value">{{ appStore.proxyStats.healthy }}</div>
                  <div class="stat-label">健康</div>
                </div>
              </div>
              <div class="stat-card stat-unhealthy">
                <div class="stat-icon">
                  <n-icon size="24"><WarningOutline /></n-icon>
                </div>
                <div class="stat-content">
                  <div class="stat-value">{{ appStore.proxyStats.unhealthy }}</div>
                  <div class="stat-label">异常</div>
                </div>
              </div>
              <div class="stat-card stat-stopped">
                <div class="stat-icon">
                  <n-icon size="24"><StopCircleOutline /></n-icon>
                </div>
                <div class="stat-content">
                  <div class="stat-value">{{ appStore.proxyStats.stopped }}</div>
                  <div class="stat-label">已停止</div>
                </div>
              </div>
            </div>
            
            <!-- 控制区域 -->
            <div class="controls-section">
              <!-- 第一行：搜索和筛选 -->
              <div class="controls-row search-row">
                <div class="search-group">
                  <n-input
                    v-model:value="searchKeyword"
                    placeholder="搜索服务名称..."
                    size="medium"
                    clearable
                    class="search-input"
                  >
                    <template #prefix>
                      <n-icon><SearchOutline /></n-icon>
                    </template>
                  </n-input>
                  <n-select
                    v-model:value="selectedTagFilter"
                    multiple
                    placeholder="按标签筛选..."
                    size="medium"
                    clearable
                    class="tag-select"
                    :options="tagFilterOptions"
                  />
                </div>
                <n-button
                  size="medium"
                  quaternary
                  @click="showTagManagerDialog = true"
                >
                  <template #icon>
                    <n-icon><PricetagsOutline /></n-icon>
                  </template>
                  标签管理
                </n-button>
              </div>
              
              <!-- 第二行：批量操作和主要操作 -->
              <div class="controls-row actions-row">
                <!-- 批量操作区域 -->
                <div class="batch-section" v-if="filteredServices.length > 0">
                  <n-checkbox
                    v-model:checked="selectAll"
                    :indeterminate="isIndeterminate"
                    @update:checked="handleSelectAll"
                    size="medium"
                  >
                    全选
                  </n-checkbox>
                  <div class="batch-buttons">
                    <n-button
                      type="success"
                      size="medium"
                      secondary
                      :disabled="selectedServices.length === 0 || !hasStoppedInSelection"
                      @click="batchStart"
                      :loading="batchLoading"
                    >
                      批量启动 ({{ getStoppedCount() }})
                    </n-button>
                    <n-button
                      type="warning"
                      size="medium"
                      secondary
                      :disabled="selectedServices.length === 0 || !hasRunningInSelection"
                      @click="batchStop"
                      :loading="batchLoading"
                    >
                      批量停止 ({{ getRunningCount() }})
                    </n-button>
                    <n-button
                      type="primary"
                      size="medium"
                      secondary
                      :disabled="selectedServices.length === 0"
                      @click="openBatchAddTagDialog"
                    >
                      <template #icon>
                        <n-icon><PricetagOutline /></n-icon>
                      </template>
                      批量添加标签 ({{ selectedServices.length }})
                    </n-button>
                  </div>
                </div>
                
                <!-- 主要操作区域 -->
                <div class="main-actions">
                  <!-- 导入导出按钮组 -->
                  <n-button-group size="medium">
                    <n-tooltip>
                      <template #trigger>
                        <n-button 
                          secondary
                          @click="exportConfig"
                          :loading="appStore.loading"
                        >
                          <template #icon>
                            <n-icon><DownloadOutline /></n-icon>
                          </template>
                          导出
                        </n-button>
                      </template>
                      导出配置文件
                    </n-tooltip>
                    
                    <n-tooltip 
                      :disabled="!hasRunningServices"
                    >
                      <template #trigger>
                        <n-button 
                          secondary
                          @click="triggerImport"
                          :loading="appStore.loading"
                          :disabled="hasRunningServices"
                        >
                          <template #icon>
                            <n-icon><CloudUploadOutline /></n-icon>
                          </template>
                          导入
                        </n-button>
                      </template>
                      {{ hasRunningServices ? `有 ${runningServicesCount} 个服务正在运行，需要先停止所有服务` : '导入配置文件' }}
                    </n-tooltip>
                  </n-button-group>

                  <!-- 隐藏的文件输入 -->
                  <input 
                    ref="fileInputRef" 
                    type="file" 
                    accept=".json" 
                    @change="handleFileImport" 
                    style="display: none;" 
                  />
                  
                  <n-button type="primary" size="medium" @click="showCreateDialog = true">
                    <template #icon>
                      <n-icon><AddOutline /></n-icon>
                    </template>
                    创建服务
                  </n-button>
                </div>
              </div>
            </div>
            
            <div class="proxy-services-container">
              <div 
                v-for="service in filteredServices" 
                :key="service.id"
                class="proxy-service-card"
              >
                <n-card 
                  class="service-item" 
                  :class="{ 
                    'selected': selectedServices.includes(service.id),
                    [getServiceHighlightClass(service.id)]: true
                  }"
                >
                  <template #header>
                    <!-- 第一行：服务名称 + 状态标签 + 操作按钮 -->
                    <div class="service-header-row">
                      <div class="service-title-section">
                        <n-checkbox
                          :checked="selectedServices.includes(service.id)"
                          @update:checked="(checked) => handleServiceSelect(service.id, checked)"
                          size="small"
                        />
                        <h3>{{ service.serviceName }}</h3>
                        <div class="service-status-tags">
                          <n-tag 
                            :type="getServiceStatusType(service)" 
                            size="small"
                          >
                            {{ getServiceStatusText(service) }}
                          </n-tag>
                          <n-tag 
                            v-if="service && service.isRunning && service.status === 'healthy'"
                            type="success" 
                            size="small"
                          >
                            <template #icon>
                              <n-icon><CheckmarkCircleOutline /></n-icon>
                            </template>
                            心跳正常
                          </n-tag>
                          <n-tag 
                            v-else-if="service && service.isRunning && service.status === 'unhealthy'"
                            type="error" 
                            size="small"
                          >
                            <template #icon>
                              <n-icon><WarningOutline /></n-icon>
                            </template>
                            心跳异常
                          </n-tag>
                        </div>
                      </div>
                      
                      <div class="service-actions">
                        <n-button
                          v-if="service && !service.isRunning"
                          type="success"
                          size="small"
                          @click="startService(service.id)"
                          :loading="isServiceLoading(service.id)"
                        >
                          启动
                        </n-button>
                        <n-button
                          v-else-if="service && service.isRunning"
                          type="warning"
                          size="small"
                          @click="stopService(service.id)"
                          :loading="isServiceLoading(service.id)"
                        >
                          停止
                        </n-button>
                        <n-button
                          type="primary"
                          size="small"
                          @click="editService(service)"
                        >
                          配置
                        </n-button>
                        <n-button 
                          type="info" 
                          size="small"
                          @click="openServiceDetails(service)"
                        >
                          详情
                        </n-button>
                        <n-popconfirm
                          @positive-click="deleteService(service.id)"
                          positive-text="确认"
                          negative-text="取消"
                        >
                          <template #trigger>
                            <n-button type="error" size="small">删除</n-button>
                          </template>
                          确定删除此代理服务吗？
                        </n-popconfirm>
                      </div>
                    </div>
                  </template>
                  
                  <div class="service-content">
                    <!-- 第二行：详细信息 + 目标切换 -->
                    <div class="service-details-row">
                      <div class="service-details-info">
                        <div class="service-detail-item">
                          <strong>端口:</strong>
                          <span>{{ service.port || '未知' }}</span>
                        </div>
                        <div class="service-detail-item">
                          <strong>当前目标:</strong>
                          <span>{{ service.activeTarget || '未知' }}</span>
                        </div>
                        <div class="service-detail-item" v-if="service.targets">
                          <strong>目标地址:</strong>
                          <span>{{ service.targets[service.activeTarget] || '未配置' }}</span>
                        </div>
                      </div>
                      
                      <div class="target-switch" v-if="service.isRunning && service.targets">
                        <label>切换目标:</label>
                        <n-select 
                          :value="service.activeTarget" 
                          @update:value="(value) => switchTarget(service.id, value)"
                          size="small"
                          style="width: 150px;"
                          :options="getTargetOptions(service.targets)"
                          :loading="isServiceLoading(service.id)"
                          :disabled="isServiceLoading(service.id)"
                        />
                      </div>
                    </div>
                    
                    <!-- 第三行：标签相关 -->
                    <div class="service-tags-row">
                      <div class="service-tags">
                        <strong>标签:</strong>
                        <!-- 已绑定的标签 -->
                        <n-tag
                          v-for="tag in service.tags"
                          :key="tag"
                          size="small"
                          closable
                          @close="removeServiceTag(service.id, tag)"
                          :type="getTagType(tag)"
                          style="margin-right: 6px;"
                        >
                          {{ getTagName(tag) }}
                        </n-tag>
                        <!-- 添加标签按钮 -->
                        <n-dropdown
                          :options="getTagDropdownOptions(service)"
                          @select="(tagId) => addServiceTag(service.id, tagId)"
                          placement="bottom-start"
                          trigger="click"
                        >
                          <n-button
                            size="small"
                            type="primary"
                            text
                            style="margin-left: 6px;"
                          >
                            <template #icon>
                              <n-icon><AddOutline /></n-icon>
                            </template>
                            添加标签
                          </n-button>
                        </n-dropdown>
                      </div>
                    </div>
                  </div>
                </n-card>
              </div>
              
              <div v-if="filteredServices.length === 0" class="empty-state">
                <n-empty :description="searchKeyword ? '未找到匹配的代理服务' : '暂无代理服务'">
                  <template #extra>
                    <n-button v-if="!searchKeyword" type="primary" @click="showCreateDialog = true">
                      创建第一个代理服务
                    </n-button>
                    <n-button v-else type="primary" @click="searchKeyword = ''">
                      清除搜索条件
                    </n-button>
                  </template>
                </n-empty>
              </div>
            </div>
          </n-card>
        </div>

        <!-- 服务详情抽屉 -->
        <n-drawer
          v-model:show="logDrawerVisible"
          :width="900"
          placement="right"
          @after-leave="closeServiceDetails"
        >
          <n-drawer-content
            :title="`${currentLogService?.serviceName} - 服务详情`"
            closable
          >
            <div class="log-drawer-content" v-if="currentLogService">
              <!-- 心跳状态图表 -->
              <div class="heartbeat-section" v-if="currentLogService && currentLogService.isRunning">
                <div class="heartbeat-header">
                  <h3>心跳状态（近5分钟）</h3>
                  <n-button 
                    text 
                    size="small"
                    @click="toggleHeartbeatCollapse"
                  >
                    {{ heartbeatCollapsed ? '展开' : '收起' }}
                  </n-button>
                </div>
                <n-collapse-transition :show="!heartbeatCollapsed">
                  <div class="heartbeat-chart-container">
                    <div class="heartbeat-chart" ref="heartbeatChartRef">
                      <canvas ref="heartbeatCanvasRef"></canvas>
                    </div>
                    <div class="heartbeat-legend">
                      <div class="legend-item">
                        <span class="legend-color success"></span>
                        <span>正常心跳</span>
                        <small>(绿色，规律QRS波)</small>
                      </div>
                      <div class="legend-item">
                        <span class="legend-color error"></span>
                        <span>异常心跳</span>
                        <small>(红色，不规则波形)</small>
                      </div>
                      <div class="legend-item">
                        <span class="legend-color timeout"></span>
                        <span>超时心跳</span>
                        <small>(橙色，微弱信号)</small>
                      </div>
                      <div class="legend-item">
                        <span class="legend-color unknown"></span>
                        <span>未知状态</span>
                        <small>(灰色，平直线)</small>
                      </div>
                    </div>
                  </div>
                </n-collapse-transition>
              </div>
              
              <n-divider />
              
              <!-- 请求日志部分 -->
              <h3>请求日志</h3>
              <div class="log-controls">
                <div class="log-info">
                  <n-statistic title="总日志数" :value="serviceLogs.length" />
                  <div class="connection-status">
                    <span class="status-label">实时连接</span>
                    <n-tag :type="logWebsocket ? 'success' : 'info'" size="small">
                      {{ logWebsocket ? '已连接' : '未连接' }}
                    </n-tag>
                  </div>
                </div>
                <div class="log-actions">
                  <n-button 
                    type="error" 
                    size="small" 
                    @click="clearLogs"
                    :disabled="serviceLogs.length === 0"
                  >
                    清空日志
                  </n-button>
                  <n-button 
                    type="primary" 
                    size="small" 
                    @click="scrollToTop"
                  >
                    滚动到顶部
                  </n-button>
                </div>
              </div>
              
              <div class="service-logs-container" ref="serviceLogsContainer">
                <div v-if="(serviceLogs?.length || 0) === 0" class="empty-logs">
                  <n-empty description="暂无请求日志" />
                </div>
                <div v-else class="log-entries">
                  <div 
                    v-for="log in serviceLogs" 
                    :key="log.id"
                    class="log-entry"
                    @click="showLogDetails(log)"
                  >
                    <div class="log-header">
                      <div class="log-basic-info">
                        <n-tag :type="getMethodTagType(log.method)" size="small">
                          {{ log.method }}
                        </n-tag>
                        <span class="log-path">{{ log.path }}</span>
                        <n-tag :type="getStatusTagType(log.status)" size="small">
                          {{ log.status }}
                        </n-tag>
                      </div>
                      <div class="log-meta-info">
                        <span class="log-duration">{{ log.duration }}ms</span>
                        <span class="log-time">{{ formatFullTime(log.timestamp) }}</span>
                      </div>
                    </div>
                    <div class="log-target" v-if="log.target">
                      <n-icon><ListOutline /></n-icon>
                      <span>{{ log.target }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </n-drawer-content>
        </n-drawer>

        <!-- 创建服务对话框 -->
        <n-modal 
          v-model:show="showCreateDialog" 
          preset="dialog"
          title="创建代理服务"
          style="width: 600px;"
        >
          <n-form
            :model="createServiceForm"
            label-placement="left"
            label-width="120px"
          >
            <n-form-item label="服务名称" required>
              <n-input 
                v-model:value="createServiceForm.serviceName" 
                placeholder="请输入服务名称"
              />
            </n-form-item>
            <n-form-item label="目标地址" required>
              <n-input 
                v-model:value="createServiceForm.targetUrl" 
                placeholder="http://localhost:8080"
              />
            </n-form-item>
            <n-form-item label="本地端口">
              <n-input-number 
                v-model:value="createServiceForm.localPort" 
                :min="1"
                :max="65535"
                placeholder="自动分配"
                style="width: 100%"
              />
            </n-form-item>
            <n-form-item label="描述">
              <n-input 
                v-model:value="createServiceForm.description" 
                type="textarea"
                placeholder="可选的服务描述"
              />
            </n-form-item>
          </n-form>
          
          <template #action>
            <n-button @click="showCreateDialog = false">取消</n-button>
            <n-button 
              type="primary" 
              @click="createService"
              :loading="appStore.loading"
            >
              创建
            </n-button>
          </template>
        </n-modal>

        <!-- 编辑服务对话框 -->
        <n-modal 
          v-model:show="showEditDialog" 
          preset="dialog"
          :title="`编辑服务配置${editServiceForm.isRunning ? ' (运行中)' : ' (已停止)'}`"
          style="width: 700px;"
        >
          <div v-if="editServiceForm.isRunning" style="margin-bottom: 16px;">
            <n-alert type="warning" title="运行中服务限制">
              运行中的服务只能添加新的目标配置，不能删除现有目标或修改描述。如需完整编辑，请先停止服务。
            </n-alert>
          </div>
          
          <n-form
            :model="editServiceForm"
            label-placement="left"
            label-width="120px"
          >
            <n-form-item label="服务名称">
              <n-input 
                v-model:value="editServiceForm.serviceName" 
                readonly
                placeholder="服务名称不可修改"
              />
            </n-form-item>
            
            <n-form-item label="目标配置">
              <div style="width: 100%;">
                <div v-if="Object.keys(editServiceForm.targets).length === 0" style="color: #999; margin-bottom: 12px;">
                  暂无目标配置
                </div>
                <div v-for="(url, name) in editServiceForm.targets" :key="name" style="display: flex; align-items: center; margin-bottom: 8px;">
                  <n-input 
                    :value="name" 
                    readonly 
                    style="width: 120px; margin-right: 8px;" 
                    size="small"
                    placeholder="目标名称"
                  />
                  <n-input 
                    :value="url" 
                    readonly 
                    style="flex: 1; margin-right: 8px;" 
                    size="small"
                    placeholder="目标地址"
                  />
                  <n-button 
                    v-if="!editServiceForm.isRunning"
                    type="error" 
                    size="small" 
                    @click="removeTarget(name)"
                    :disabled="Object.keys(editServiceForm.targets).length <= 1"
                  >
                    删除
                  </n-button>
                  <span v-else style="width: 60px; text-align: center; color: #999; font-size: 12px;">
                    运行中
                  </span>
                </div>
                
                <!-- 添加新目标 -->
                <n-divider style="margin: 16px 0;">添加新目标</n-divider>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <n-input 
                    v-model:value="editServiceForm.newTargetName"
                    placeholder="目标名称"
                    style="width: 120px;"
                    size="small"
                  />
                  <n-input 
                    v-model:value="editServiceForm.newTargetUrl"
                    placeholder="目标地址，如: http://localhost:8080"
                    style="flex: 1;"
                    size="small"
                    @keyup.enter="addTarget"
                  />
                  <n-button 
                    type="primary" 
                    size="small" 
                    @click="addTarget"
                    :disabled="!editServiceForm.newTargetName.trim() || !editServiceForm.newTargetUrl.trim()"
                  >
                    添加
                  </n-button>
                </div>
              </div>
            </n-form-item>
            
            <n-form-item label="描述" v-if="!editServiceForm.isRunning">
              <n-input 
                v-model:value="editServiceForm.description"
                type="textarea"
                placeholder="可选，输入服务描述"
                :rows="3"
                maxlength="200"
                show-count
              />
            </n-form-item>
            
            <n-form-item v-else label="描述">
              <n-input 
                :value="editServiceForm.description"
                type="textarea"
                readonly
                placeholder="运行中的服务无法修改描述"
                :rows="3"
              />
            </n-form-item>
          </n-form>
          
          <template #action>
            <n-button @click="cancelEditService">取消</n-button>
            <n-button 
              type="primary" 
              @click="saveEditService"
              :loading="appStore.loading"
            >
              {{ editServiceForm.isRunning ? '保存目标配置' : '保存配置' }}
            </n-button>
          </template>
        </n-modal>

        <!-- 标签管理对话框 -->
        <n-modal 
          v-model:show="showTagManagerDialog" 
          preset="dialog"
          title="标签管理"
          style="width: 700px;"
        >
          <div class="tag-manager">
            <n-tabs default-value="global">
              <n-tab-pane name="global" tab="全局标签管理">
                <div class="tag-manager-content">
                  <div class="tag-manager-header">
                    <h4>创建新标签</h4>
                  </div>
                  
                  <n-form 
                    :model="newTagForm" 
                    inline
                    style="margin-bottom: 20px;"
                  >
                    <n-form-item label="标签名称">
                      <n-input 
                        v-model:value="newTagForm.name" 
                        placeholder="输入标签名称"
                        style="width: 200px;"
                      />
                    </n-form-item>
                    <n-form-item label="类型">
                      <div class="tag-type-presets">
                        <div 
                          v-for="preset in tagTypePresets" 
                          :key="preset.type"
                          class="tag-type-item"
                          :class="{ active: newTagForm.type === preset.type }"
                          @click="newTagForm.type = preset.type"
                        >
                          <n-tag :type="preset.type" size="medium">
                            {{ preset.label }}
                          </n-tag>
                        </div>
                      </div>
                    </n-form-item>
                    <n-form-item>
                      <n-button 
                        type="primary" 
                        @click="createTag"
                        :disabled="!newTagForm.name"
                        :loading="savingTag"
                      >
                        创建标签
                      </n-button>
                    </n-form-item>
                  </n-form>
                  
                  <n-data-table
                    :columns="tagTableColumns"
                    :data="availableTags"
                    :pagination="false"
                    max-height="300px"
                  />
                </div>
              </n-tab-pane>
              
              <n-tab-pane name="service" tab="服务标签管理" v-if="currentTagService">
                <div class="service-tag-manager">
                  <h4>为服务 "{{ currentTagService.serviceName }}" 管理标签</h4>
                  
                  <div class="current-tags">
                    <strong>当前标签:</strong>
                    <div class="tags-container" style="margin-top: 8px;">
                      <n-tag
                        v-for="tag in currentTagService.tags"
                        :key="tag"
                        closable
                        @close="removeServiceTag(currentTagService.id, tag)"
                        :type="getTagType(tag)"
                        style="margin-right: 8px; margin-bottom: 8px;"
                      >
                        {{ getTagName(tag) }}
                      </n-tag>
                      <span v-if="!currentTagService.tags?.length" style="color: #999;">暂无标签</span>
                    </div>
                  </div>
                  
                  <div class="add-tags">
                    <strong>添加标签:</strong>
                    <div class="available-tags" style="margin-top: 8px;">
                      <n-tag
                        v-for="tag in availableTagsForService"
                        :key="tag.id"
                        checkable
                        @click="addServiceTag(currentTagService.id, tag.id)"
                        :type="tag.type"
                        style="margin-right: 8px; margin-bottom: 8px; cursor: pointer;"
                      >
                        {{ tag.name }}
                      </n-tag>
                      <span v-if="!availableTagsForService?.length" style="color: #999;">暂无可用标签</span>
                    </div>
                  </div>
                </div>
              </n-tab-pane>
            </n-tabs>
          </div>
        </n-modal>

        <!-- 批量添加标签对话框 -->
        <n-modal 
          v-model:show="showBatchAddTagDialog" 
          preset="dialog"
          title="批量添加标签"
          style="width: 600px;"
        >
          <div class="batch-add-tag-container">
            <div class="selected-services-info">
              <h4>已选择 {{ selectedServices.length }} 个服务</h4>
              <div class="selected-services-list">
                <n-tag
                  v-for="serviceId in selectedServices"
                  :key="serviceId"
                  size="small"
                  style="margin-right: 8px; margin-bottom: 4px;"
                >
                  {{ getServiceNameById(serviceId) }}
                </n-tag>
              </div>
            </div>
            
            <n-divider />
            
            <div class="tag-selection">
              <h4>选择要添加的标签</h4>
              <div class="available-tags-grid">
                <n-checkbox-group v-model:value="batchAddTagForm.selectedTags">
                  <div class="tag-checkbox-list">
                    <n-checkbox
                      v-for="tag in availableTags"
                      :key="tag.id"
                      :value="tag.id"
                      style="margin-bottom: 8px;"
                    >
                      <n-tag :type="tag.type" size="medium">
                        {{ tag.name }}
                      </n-tag>
                    </n-checkbox>
                  </div>
                </n-checkbox-group>
              </div>
              
              <div v-if="availableTags.length === 0" class="no-tags">
                <n-empty description="暂无可用标签">
                  <template #extra>
                    <n-button size="small" @click="showTagManagerDialog = true; showBatchAddTagDialog = false">
                      创建标签
                    </n-button>
                  </template>
                </n-empty>
              </div>
            </div>
          </div>
          
          <template #action>
            <n-button @click="showBatchAddTagDialog = false">取消</n-button>
            <n-button 
              type="primary" 
              @click="batchAddTags"
              :disabled="batchAddTagForm.selectedTags.length === 0"
              :loading="batchLoading"
            >
              添加标签
            </n-button>
          </template>
        </n-modal>

        <!-- 编辑标签对话框 -->
        <n-modal 
          v-model:show="showEditTagDialog" 
          preset="dialog"
          title="编辑标签"
          style="width: 500px;"
        >
          <n-form 
            :model="editingTag" 
            label-placement="left"
            label-width="80px"
            style="margin-top: 20px;"
          >
            <n-form-item label="标签名称" required>
              <n-input 
                v-model:value="editingTag.name" 
                placeholder="输入标签名称"
              />
            </n-form-item>
            <n-form-item label="类型">
              <div class="tag-type-presets">
                <div 
                  v-for="preset in tagTypePresets" 
                  :key="preset.type"
                  class="tag-type-item"
                  :class="{ active: editingTag.type === preset.type }"
                  @click="editingTag.type = preset.type"
                >
                  <n-tag :type="preset.type" size="medium">
                    {{ preset.label }}
                  </n-tag>
                </div>
              </div>
            </n-form-item>
            <n-form-item label="描述">
              <n-input 
                v-model:value="editingTag.description" 
                type="textarea"
                placeholder="输入标签描述（可选）"
                :rows="3"
              />
            </n-form-item>
          </n-form>
          
          <template #action>
            <n-button @click="showEditTagDialog = false">取消</n-button>
            <n-button 
              type="primary" 
              @click="updateTag"
              :loading="savingTag"
            >
              保存
            </n-button>
          </template>
        </n-modal>

        <!-- 端口使用详情对话框 -->
        <n-modal 
          v-model:show="showPortUsageDialog" 
          preset="dialog"
          title="端口使用详情"
          style="width: 800px;"
        >
          <div class="port-usage-container">
            <div class="port-stats-summary">
              <n-grid :cols="4" :x-gap="20">
                <n-gi>
                  <n-statistic label="总端口数" :value="portStats.totalPorts" />
                </n-gi>
                <n-gi>
                  <n-statistic label="已使用" :value="portStats.usedCount" />
                </n-gi>
                <n-gi>
                  <n-statistic label="可用端口" :value="portStats.availableCount" />
                </n-gi>
                <n-gi>
                  <n-statistic 
                    label="使用率" 
                    :value="portUsagePercentage" 
                    suffix="%" 
                  />
                </n-gi>
              </n-grid>
            </div>

            <n-divider />

            <n-tabs default-value="used">
              <n-tab-pane name="used" tab="已使用端口">
                <div class="port-list">
                  <div v-if="portStats.usedPorts?.length === 0" class="empty-ports">
                    <n-empty description="暂无使用中的端口" />
                  </div>
                  <div v-else class="used-ports-grid">
                    <n-tag 
                      v-for="port in portStats.usedPorts" 
                      :key="port" 
                      type="error" 
                      size="large"
                      style="margin: 4px;"
                    >
                      {{ port }}
                    </n-tag>
                  </div>
                </div>
              </n-tab-pane>
              
              <n-tab-pane name="available" tab="可用端口">
                <div class="port-list">
                  <div v-if="portStats.availablePorts?.length === 0" class="empty-ports">
                    <n-empty description="暂无可用端口" />
                  </div>
                  <div v-else class="available-ports-grid">
                    <n-tag 
                      v-for="port in portStats.availablePorts?.slice(0, 50)" 
                      :key="port" 
                      type="success" 
                      size="large"
                      style="margin: 4px;"
                    >
                      {{ port }}
                    </n-tag>
                    <div v-if="(portStats.availablePorts?.length || 0) > 50" class="more-ports">
                      <n-tag type="info" size="large" style="margin: 4px;">
                        ... 还有 {{ (portStats.availablePorts?.length || 0) - 50 }} 个可用端口
                      </n-tag>
                    </div>
                  </div>
                </div>
              </n-tab-pane>
            </n-tabs>
          </div>
          
          <template #action>
            <n-button @click="showPortUsageDialog = false">关闭</n-button>
            <n-button type="primary" @click="fetchPortStats">刷新数据</n-button>
          </template>
        </n-modal>

        <!-- 系统日志详情对话框 -->
        <n-modal 
          v-model:show="showSystemLogDetailsDialog" 
          preset="dialog"
          title="请求详情"
          style="width: 900px;"
        >
          <div class="system-log-details-content" v-if="currentSystemLogDetails">
            <!-- 基本信息 -->
            <div class="details-section">
              <h3>基本信息</h3>
              <n-descriptions :column="2" bordered>
                <n-descriptions-item label="请求方法">
                  <n-tag :type="getMethodTagType(currentSystemLogDetails.method)">
                    {{ currentSystemLogDetails.method }}
                  </n-tag>
                </n-descriptions-item>
                <n-descriptions-item label="状态码">
                  <n-tag :type="getStatusTagType(currentSystemLogDetails.status)">
                    {{ currentSystemLogDetails.status }}
                  </n-tag>
                </n-descriptions-item>
                <n-descriptions-item label="请求路径">
                  <code>{{ currentSystemLogDetails.path }}</code>
                </n-descriptions-item>
                <n-descriptions-item label="目标地址">
                  <code>{{ currentSystemLogDetails.target }}</code>
                </n-descriptions-item>
                <n-descriptions-item label="响应时间">
                  <span>{{ currentSystemLogDetails.duration }}ms</span>
                </n-descriptions-item>
                <n-descriptions-item label="请求时间">
                  <span>{{ formatFullTime(currentSystemLogDetails.timestamp) }}</span>
                </n-descriptions-item>
              </n-descriptions>
            </div>

            <!-- 请求头 -->
            <div class="details-section">
              <h3>请求头</h3>
              <div class="headers-container">
                <n-data-table 
                  :columns="[
                    { title: '名称', key: 'name', width: 200 },
                    { title: '值', key: 'value', ellipsis: { tooltip: true } }
                  ]"
                  :data="formatHeaders(currentSystemLogDetails.requestHeaders)" 
                  size="small"
                  max-height="200"
                />
              </div>
            </div>

            <!-- 请求体 -->
            <div class="details-section" v-if="currentSystemLogDetails.requestBody !== null">
              <div class="section-header">
                <h3>请求体</h3>
                <n-button size="small" @click="copyToClipboard(formatJson(currentSystemLogDetails.requestBody))">
                  复制
                </n-button>
              </div>
              <div class="json-container">
                <pre class="json-content">{{ formatJson(currentSystemLogDetails.requestBody) }}</pre>
              </div>
            </div>

            <!-- 响应头 -->
            <div class="details-section">
              <h3>响应头</h3>
              <div class="headers-container">
                <n-data-table 
                  :columns="[
                    { title: '名称', key: 'name', width: 200 },
                    { title: '值', key: 'value', ellipsis: { tooltip: true } }
                  ]"
                  :data="formatHeaders(currentSystemLogDetails.responseHeaders)" 
                  size="small"
                  max-height="200"
                />
              </div>
            </div>

            <!-- 响应体 -->
            <div class="details-section" v-if="currentSystemLogDetails.responseBody !== null">
              <div class="section-header">
                <h3>响应体</h3>
                <n-button size="small" @click="copyToClipboard(formatJson(currentSystemLogDetails.responseBody))">
                  复制
                </n-button>
              </div>
              <div class="json-container">
                <pre class="json-content">{{ formatJson(currentSystemLogDetails.responseBody) }}</pre>
              </div>
            </div>

            <!-- 错误信息 -->
            <div class="details-section" v-if="currentSystemLogDetails.error">
              <h3>错误信息</h3>
              <n-alert 
                :title="currentSystemLogDetails.error" 
                type="error" 
                :closable="false"
                show-icon
              />
            </div>
          </div>
          
          <template #action>
            <n-button @click="showSystemLogDetailsDialog = false">关闭</n-button>
          </template>
        </n-modal>



        <!-- 端口范围配置对话框 -->
        <n-modal 
          v-model:show="showPortRangeDialog" 
          preset="dialog"
          title="端口范围配置"
          style="width: 600px;"
        >
          <div class="port-range-config-container">
            <n-alert
              title="重要提示"
              type="warning"
              :closable="false"
              style="margin-bottom: 20px;"
            >
              修改端口范围需要确保Docker容器映射了对应的端口范围，否则服务将无法正常访问
            </n-alert>

            <n-form :model="portRangeForm" label-width="100px">
              <n-form-item label="当前配置" v-if="currentPortRange">
                <div class="current-config">
                  <n-tag type="info" size="large">
                    {{ currentPortRange.startPort }}-{{ currentPortRange.endPort }} 
                    ({{ currentPortRange.totalPorts }}个端口)
                  </n-tag>
                  <div style="margin-top: 8px; font-size: 12px; color: var(--n-text-color-3);">
                    创建时间: {{ formatDate(currentPortRange.createdAt) }}
                  </div>
                  <div v-if="currentPortRange.updatedAt" style="font-size: 12px; color: var(--n-text-color-3);">
                    更新时间: {{ formatDate(currentPortRange.updatedAt) }}
                  </div>
                </div>
              </n-form-item>

              <n-form-item label="起始端口" required>
                <n-input-number
                  v-model:value="portRangeForm.startPort"
                  :min="1"
                  :max="65535"
                  placeholder="起始端口"
                  style="width: 150px"
                />
              </n-form-item>

              <n-form-item label="结束端口" required>
                <n-input-number
                  v-model:value="portRangeForm.endPort"
                  :min="1"
                  :max="65535"
                  placeholder="结束端口"
                  style="width: 150px"
                />
                <span style="margin-left: 12px; font-size: 12px; color: var(--n-text-color-3);">
                  总计: {{ (portRangeForm.endPort - portRangeForm.startPort + 1) || 0 }} 个端口
                </span>
              </n-form-item>

              <n-form-item label="描述">
                <n-input
                  v-model:value="portRangeForm.description"
                  type="textarea"
                  :rows="2"
                  placeholder="端口范围用途描述（可选）"
                />
              </n-form-item>

              <n-form-item label="Docker命令" v-if="dockerCommand">
                <div class="docker-command">
                  <n-input
                    :value="dockerCommand"
                    readonly
                    type="textarea"
                    :rows="2"
                  />
                  <n-button 
                    type="primary" 
                    size="small" 
                    @click="copyDockerCommand"
                    style="margin-top: 8px;"
                  >
                    复制命令
                  </n-button>
                </div>
              </n-form-item>
            </n-form>

            <n-alert
              v-if="portRangeValidation.hasError"
              :title="portRangeValidation.message"
              type="error"
              :closable="false"
              style="margin-top: 16px;"
            />
          </div>
          
          <template #action>
            <n-button @click="showPortRangeDialog = false">取消</n-button>
            <n-button 
              type="primary" 
              @click="savePortRangeConfig" 
              :loading="portRangeLoading"
              :disabled="!isPortRangeFormValid"
            >
              保存配置
            </n-button>
          </template>
        </n-modal>

        <!-- Eureka服务列表抽屉 -->
        <n-drawer 
          v-model:show="showEurekaServiceDrawer" 
          width="450px" 
          placement="right"
        >
          <n-drawer-content title="Eureka服务列表">
            <template #header>
              <div class="drawer-header">
                <h3>Eureka服务列表</h3>
                <div class="drawer-actions">
                  <n-button 
                    type="primary" 
                    @click="refreshEurekaServices" 
                    :loading="appStore.loading" 
                    size="small"
                  >
                    <template #icon>
                      <n-icon><RefreshOutline /></n-icon>
                    </template>
                    刷新
                  </n-button>
                  <n-select 
                    v-model:value="refreshInterval" 
                    @update:value="setRefreshInterval" 
                    size="small" 
                    style="width: 120px; margin-left: 8px;"
                    :options="[
                      { label: '手动', value: 0 },
                      { label: '10秒', value: 10000 },
                      { label: '1分钟', value: 60000 },
                      { label: '5分钟', value: 300000 }
                    ]"
                  />
                </div>
              </div>
            </template>
            
            <div class="drawer-content">
              <div class="services-stats">
                <div class="stat-item">
                  <n-statistic title="Total" :value="appStore.eurekaServices?.length || 0">
                    <template #prefix>
                      <n-icon size="18" style="color: #18a058;">
                        <SettingsOutline />
                      </n-icon>
                    </template>
                  </n-statistic>
                </div>
                <div class="stat-item">
                  <n-statistic title="Up" :value="getTotalRunningInstances()">
                    <template #prefix>
                      <n-icon size="18" style="color: #2080f0;">
                        <CheckmarkCircleOutline />
                      </n-icon>
                    </template>
                  </n-statistic>
                </div>
              </div>
              
              <n-divider />
              
              <div class="services-list">
                <div 
                  v-for="service in appStore.eurekaServices" 
                  :key="service.name"
                  class="service-card"
                >
                  <n-card size="small" hoverable>
                    <div class="service-item-content">
                      <div class="service-title">
                        <h4>{{ service.name }}</h4>
                        <n-tag :type="getStatusType(service)" size="small">
                          {{ getStatus(service) }}
                        </n-tag>
                      </div>
                      <div class="service-details">
                        <div class="detail-item">
                          <n-icon><SettingsOutline /></n-icon>
                          <span>实例: {{ getInstanceCount(service) }}</span>
                        </div>
                        <div class="detail-item">
                          <n-icon><ListOutline /></n-icon>
                          <span>端口: {{ getPort(service) }}</span>
                        </div>
                        <div class="detail-item" v-if="getInstanceIp(service)">
                          <n-icon><DocumentTextOutline /></n-icon>
                          <span>IP: {{ getInstanceIp(service) }}</span>
                        </div>
                      </div>
                    </div>
                  </n-card>
                </div>
                
                <div v-if="(appStore.eurekaServices?.length || 0) === 0" class="empty-services">
                  <n-empty description="暂无服务" />
                </div>
              </div>
            </div>
          </n-drawer-content>
        </n-drawer>
      </n-message-provider>
    </n-config-provider>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, reactive, h, nextTick } from 'vue'
import { useAppStore } from '../stores/app'
import { 
  NConfigProvider, NMessageProvider, NCard, NButton, NButtonGroup, NTag, NAlert,
  NForm, NFormItem, NInput, NInputNumber, NGrid, NGi, NEmpty, NDataTable,
  NIcon, NStatistic, NSelect, NCheckbox, NCheckboxGroup, NPopconfirm, NTooltip,
  NProgress, NModal, NTabs, NTabPane, NDescriptions, NDescriptionsItem, NDivider,
  NDrawer, NDrawerContent, NCollapseTransition, NDropdown,
  darkTheme, useMessage, useDialog
} from 'naive-ui'
import { 
  SettingsOutline, DocumentTextOutline, RefreshOutline, ListOutline, 
  AddOutline, PlayOutline, StopOutline, TrashOutline, CreateOutline,
  SearchOutline, PricetagsOutline, PricetagOutline, DownloadOutline, CloudUploadOutline,
  CheckmarkCircleOutline, WarningOutline, EyeOutline, InformationCircleOutline,
  ServerOutline, PlayCircleOutline, StopCircleOutline, BarChartOutline
} from '@vicons/ionicons5'

const appStore = useAppStore()
const message = useMessage()
const dialog = useDialog()

// 响应式数据
const showSystemLogs = ref(false)
const monitoringLoading = ref(false)
const saving = ref(false)
const clearingSystemLogs = ref(false)
const systemLogs = ref([])
const selectedLogCategories = ref([])
const logCategories = ref([])
const loadingCategories = ref(false)
const systemLogsContainer = ref()

// 系统日志详情相关
const showSystemLogDetailsDialog = ref(false)
const currentSystemLogDetails = ref(null)



// 服务详情抽屉相关
const logDrawerVisible = ref(false)
const currentLogService = ref(null)
const serviceLogs = ref([])
const refreshingServiceLogs = ref(false)
const heartbeatCollapsed = ref(true) // 默认折叠心跳图表
const heartbeatChartRef = ref()
const heartbeatCanvasRef = ref()
const heartbeatData = ref([])
const heartbeatAnimationId = ref(null)
const heartbeatUpdateTimer = ref(null)
const serviceLogsContainer = ref()
let logWebsocket = null

// 服务操作loading状态管理
const serviceLoadingStates = ref(new Map())
// 服务高亮状态管理（用于状态变化时的视觉反馈）
const serviceHighlightStates = ref(new Map())

// 服务loading状态辅助函数
const setServiceLoading = (serviceId, loading) => {
  if (loading) {
    serviceLoadingStates.value.set(serviceId, true)
  } else {
    serviceLoadingStates.value.delete(serviceId)
  }
}

const isServiceLoading = (serviceId) => {
  return serviceLoadingStates.value.has(serviceId)
}

// 服务高亮状态辅助函数
const setServiceHighlight = (serviceId, type = 'change') => {
  serviceHighlightStates.value.set(serviceId, type)
  // 3秒后自动移除高亮
  setTimeout(() => {
    serviceHighlightStates.value.delete(serviceId)
  }, 3000)
}

const getServiceHighlightClass = (serviceId) => {
  const highlightType = serviceHighlightStates.value.get(serviceId)
  if (!highlightType) return ''
  return `service-highlight service-highlight-${highlightType}`
}

// 标签管理相关
const availableTags = ref([])
const currentTagService = ref(null)
const savingTag = ref(false)
const newTagForm = reactive({
  name: '',
  type: 'default'
})
const tagTypePresets = [
  { type: 'default', label: '默认', color: '#606266' },
  { type: 'primary', label: '主要', color: '#2080f0' },
  { type: 'info', label: '信息', color: '#2080f0' },
  { type: 'success', label: '成功', color: '#18a058' },
  { type: 'warning', label: '警告', color: '#f0a020' },
  { type: 'error', label: '错误', color: '#d03050' }
]

// 创建服务表单
const createServiceForm = reactive({
  serviceName: '',
  targetUrl: '',
  localPort: null,
  description: ''
})

// 编辑服务表单
const editServiceForm = reactive({
  id: '',
  serviceName: '',
  targets: {},
  description: '',
  newTargetName: '',
  newTargetUrl: '',
  isRunning: false
})

// Eureka服务列表抽屉相关
const showEurekaServiceDrawer = ref(false)
const refreshInterval = ref(0)
let refreshTimer = null
const searchKeyword = ref('')
const selectedTagFilter = ref([])
const selectedServices = ref([])
const selectAll = ref(false)
const batchLoading = ref(false)
const showCreateDialog = ref(false)
const showEditDialog = ref(false)
const showTagManagerDialog = ref(false)
const showBatchAddTagDialog = ref(false)
const batchAddTagForm = reactive({
  selectedTags: []
})
const showPortRangeDialog = ref(false)
const showPortUsageDialog = ref(false)

// 端口范围配置
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
const fileInputRef = ref(null)
const localIPLoading = ref(false)
const localIPConfig = ref({
  localIP: ''
})
const portStats = ref({
  usedCount: 0,
  totalPorts: 100
})
const eurekaStatus = ref({
  isAvailable: null // null=未检查, true=可用, false=不可用
})
let websocket = null

// 主题配置
const isDark = computed(() => appStore.isDark)
const themeConfig = computed(() => {
  return isDark.value ? darkTheme : null
})

const themeOverrides = computed(() => {
  if (!isDark.value) return {}
  
  return {
    common: {
      primaryColor: '#1f6feb',
      primaryColorHover: '#388bfd',
      primaryColorPressed: '#1a5bd8',
      bodyColor: '#0d1117',
      cardColor: '#161b22',
      popoverColor: '#1c2128',
      borderColor: '#30363d',
      textColorBase: '#e6edf3',
      textColor1: '#f0f6fc',
      textColor2: '#e6edf3',
      textColor3: '#8b949e'
    }
  }
})

// Eureka配置
const eurekaConfig = ref({
  host: 'localhost',
  port: 8761,
  appName: 'switch-service',
  instancePort: 3400
})

// 计算属性
const proxyServices = computed(() => appStore.proxyServices || [])
const hasRunningServices = computed(() => {
  return proxyServices.value.some(service => service.status === 'running')
})
const runningServicesCount = computed(() => {
  return proxyServices.value.filter(service => service.isRunning).length
})

// 系统日志相关计算属性
const filteredSystemLogs = computed(() => {
  if (!systemLogs.value?.length) return []
  
  if (selectedLogCategories.value.length === 0) {
    return systemLogs.value
  }
  
  return systemLogs.value.filter(log => 
    selectedLogCategories.value.includes(log.category)
  )
})

const allCategoriesSelected = computed(() => {
  return logCategories.value.length > 0 && 
         selectedLogCategories.value.length === logCategories.value.length
})

// 代理服务相关计算属性
const filteredServices = computed(() => {
  let services = proxyServices.value || []
  
  // 搜索过滤
  if (searchKeyword.value) {
    const keyword = searchKeyword.value.toLowerCase()
    services = services.filter(service => 
      service.serviceName?.toLowerCase().includes(keyword)
    )
  }
  
  // 标签过滤
  if (selectedTagFilter.value.length > 0) {
    services = services.filter(service => 
      service.tags?.some(tag => selectedTagFilter.value.includes(tag))
    )
  }
  
  // 排序：已启动的服务排在前面
  services.sort((a, b) => {
    // 首先按运行状态排序（运行中的在前）
    if (a.isRunning && !b.isRunning) return -1
    if (!a.isRunning && b.isRunning) return 1
    
    // 如果运行状态相同，按服务名称排序
    return (a.serviceName || '').localeCompare(b.serviceName || '')
  })
  
  return services
})

const availableTagsForService = computed(() => {
  if (!currentTagService.value) return []
  const serviceTags = currentTagService.value.tags || []
  return availableTags.value.filter(tag => !serviceTags.includes(tag.id))
})

const tagFilterOptions = computed(() => {
  const allTagIds = new Set()
  proxyServices.value?.forEach(service => {
    service.tags?.forEach(tagId => allTagIds.add(tagId))
  })
  
  return Array.from(allTagIds).map(tagId => {
    const tag = availableTags.value.find(t => t.id === tagId)
    return {
      label: tag?.name || tagId,
      value: tagId
    }
  }).filter(option => option.label !== option.value) // 过滤掉无效的标签
})

const isIndeterminate = computed(() => {
  return selectedServices.value.length > 0 && 
         selectedServices.value.length < filteredServices.value.length
})

const hasStoppedInSelection = computed(() => {
  return selectedServices.value.some(id => {
    const service = proxyServices.value.find(s => s.id === id)
    return service && !service.isRunning
  })
})

const hasRunningInSelection = computed(() => {
  return selectedServices.value.some(id => {
    const service = proxyServices.value.find(s => s.id === id)
    return service && service.isRunning
  })
})

// 端口相关计算属性
const portRangeDisplay = computed(() => {
  return `4000-4100 (自动分配)`
})

// 标签表格列配置
const tagTableColumns = [
  {
    title: '标签名称',
    key: 'name',
    width: 200,
    render(row) {
      return h('n-tag', {
        type: row.type || 'default'
      }, row.name)
    }
  },
  {
    title: '类型',
    key: 'type',
    width: 100,
    render(row) {
      const preset = tagTypePresets.find(p => p.type === (row.type || 'default'))
      return preset ? preset.label : '默认'
    }
  },

  {
    title: '操作',
    key: 'actions',
    width: 150,
    render(row) {
      return h('div', { class: 'action-buttons' }, [
        h(NButton, {
          size: 'small',
          type: 'primary',
          text: true,
          onClick: () => editTag(row)
        }, {
          default: () => '编辑'
        }),
        h(NButton, {
          size: 'small',
          type: 'error',
          text: true,
          onClick: () => deleteTag(row.id),
          style: { marginLeft: '8px' }
        }, {
          default: () => '删除'
        })
      ])
    }
  }
]

const portRangeTooltip = computed(() => {
  return '代理服务端口分配范围，系统会自动在此范围内分配可用端口'
})

const portUsagePercentage = computed(() => {
  if (portStats.value.totalPorts === 0) return 0
  return Math.round((portStats.value.usedCount / portStats.value.totalPorts) * 100)
})

// 服务表格列配置
const serviceColumns = [
  {
    title: '服务名称',
    key: 'serviceName',
    width: 200
  },
  {
    title: '目标地址',
    key: 'targetUrl',
    width: 300
  },
  {
    title: '本地端口',
    key: 'localPort',
    width: 120
  },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render(row) {
      const statusMap = {
        running: { type: 'success', text: '运行中' },
        stopped: { type: 'default', text: '已停止' },
        error: { type: 'error', text: '错误' }
      }
      const status = statusMap[row.status] || statusMap.stopped
      return h(NTag, { type: status.type }, { default: () => status.text })
    }
  },
  {
    title: '操作',
    key: 'actions',
    width: 200,
    render(row) {
      return h('div', { class: 'action-buttons' }, [
        h(NButton, {
          size: 'small',
          type: row.status === 'running' ? 'error' : 'success',
          onClick: () => toggleService(row)
        }, {
          icon: () => h(NIcon, null, { 
            default: () => h(row.status === 'running' ? StopOutline : PlayOutline) 
          }),
          default: () => row.status === 'running' ? '停止' : '启动'
        }),
        h(NButton, {
          size: 'small',
          type: 'info',
          onClick: () => editService(row),
          style: { marginLeft: '8px' }
        }, {
          icon: () => h(NIcon, null, { default: () => h(CreateOutline) }),
          default: () => '编辑'
        }),
        h(NButton, {
          size: 'small',
          type: 'error',
          onClick: () => deleteService(row),
          style: { marginLeft: '8px' }
        }, {
          icon: () => h(NIcon, null, { default: () => h(TrashOutline) }),
          default: () => '删除'
        })
      ])
    }
  }
]

// 方法
const toggleSystemLogs = async () => {
  showSystemLogs.value = true
  if (showSystemLogs.value) {
    // 加载日志分类
    await loadLogCategories()
    
    // 订阅系统日志
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify({
        type: 'subscribe_system_logs',
        categories: selectedLogCategories.value.length > 0 ? selectedLogCategories.value : null
      }))
    }
  }
}

const getEurekaAvailabilityType = () => {
  if (eurekaStatus.value.isAvailable === null) return 'info'
  return eurekaStatus.value.isAvailable ? 'success' : 'error'
}

const getEurekaAvailabilityText = () => {
  if (eurekaStatus.value.isAvailable === null) return 'Eureka状态未知'
  return eurekaStatus.value.isAvailable ? 'Eureka可用' : 'Eureka不可用'
}

const checkEurekaAvailability = async () => {
  if (monitoringLoading.value) return
  
  monitoringLoading.value = true
  
  try {
    const response = await fetch('/api/eureka/check', { method: 'POST' })
    const data = await response.json()
    
    if (data.success) {
      // 更新Eureka状态
      eurekaStatus.value.isAvailable = data.isAvailable
      message.success(data.message)
      
      if (data.isAvailable) {
        // 如果Eureka变为可用，重新获取服务列表
        try {
          await appStore.fetchEurekaServices()
        } catch (error) {
          console.error('获取Eureka服务列表失败:', error)
        }
      } else {
        // 如果Eureka不可用，清空服务列表
        appStore.eurekaServices = []
      }
    } else {
      message.error(data.message || '检查失败')
    }
  } catch (error) {
    message.error('检查Eureka连接失败: ' + error.message)
  } finally {
    monitoringLoading.value = false
  }
}

const openEurekaServiceDrawer = async () => {
  console.log('🔍 打开Eureka服务列表，当前有', appStore.eurekaServices?.length || 0, '个服务')
  
  try {
    // 每次打开抽屉时重新获取服务列表
    await appStore.fetchEurekaServices()
    console.log('📝 刷新后有', appStore.eurekaServices?.length || 0, '个服务')
  } catch (error) {
    console.error('获取Eureka服务列表失败:', error)
    message.error('获取服务列表失败: ' + error.message)
  }
  
  showEurekaServiceDrawer.value = true
}

const saveEurekaConfig = async () => {
  saving.value = true
  try {
    await appStore.saveConfig(eurekaConfig.value)
    message.success('Eureka配置保存成功')
  } catch (error) {
    message.error('保存配置失败')
  } finally {
    saving.value = false
  }
}

const resetEurekaConfig = () => {
  eurekaConfig.value = {
    host: 'localhost',
    port: 8761,
    appName: 'switch-service',
    instancePort: 3400
  }
  message.info('配置已重置')
}

const openAddServiceDialog = () => {
  message.info('打开添加服务对话框')
}

const toggleService = async (service) => {
  try {
    if (service.status === 'running') {
      await appStore.stopService(service.id)
      message.success(`服务 ${service.serviceName} 已停止`)
    } else {
      await appStore.startService(service.id)
      message.success(`服务 ${service.serviceName} 已启动`)
    }
  } catch (error) {
    message.error(`操作失败: ${error.message}`)
  }
}

const deleteService = async (serviceId) => {
  try {
    await appStore.deleteProxyService(serviceId)
    message.success('服务已删除')
  } catch (error) {
    message.error(`删除失败: ${error.message}`)
  }
}

// 系统日志相关方法
const clearSystemLogs = async () => {
  try {
    clearingSystemLogs.value = true
    
    const response = await fetch('/api/system/logs', {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      throw new Error('清理失败')
    }
    
    const result = await response.json()
    if (!result.success) {
      throw new Error(result.error)
    }
    
    // 清理成功的消息会通过WebSocket广播
  } catch (error) {
    console.error('清理系统日志失败:', error)
    message.error(`清理系统日志失败: ${error.message}`)
  } finally {
    clearingSystemLogs.value = false
  }
}

const toggleAllCategories = () => {
  if (allCategoriesSelected.value) {
    selectedLogCategories.value = []
  } else {
    selectedLogCategories.value = logCategories.value.map(cat => cat.key)
  }
}

const onCategoryChange = () => {
  // 更新WebSocket订阅
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.send(JSON.stringify({
      type: 'update_log_categories',
      categories: selectedLogCategories.value.length > 0 ? selectedLogCategories.value : null
    }))
  }
}

// 日志分类相关方法
const loadLogCategories = async () => {
  try {
    loadingCategories.value = true
    const response = await fetch('/api/system/logs/categories')
    if (response.ok) {
      const result = await response.json()
      if (result.success) {
        logCategories.value = result.categories
        // 默认只选中"服务"分类
        if (selectedLogCategories.value.length === 0) {
          const serviceCategory = result.categories.find(c => c.key === 'service')
          if (serviceCategory) {
            selectedLogCategories.value = ['service']
          } else {
            selectedLogCategories.value = result.categories.map(c => c.key)
          }
        }
      }
    }
  } catch (error) {
    console.error('加载日志分类失败:', error)
  } finally {
    loadingCategories.value = false
  }
}

const scrollSystemLogsToBottom = () => {
  if (systemLogsContainer.value) {
    systemLogsContainer.value.scrollTop = systemLogsContainer.value.scrollHeight
  }
}

const getCategoryName = (category) => {
  const cat = logCategories.value.find(c => c.key === category)
  return cat?.name || category
}

const getCategoryIcon = (category) => {
  const cat = logCategories.value.find(c => c.key === category)
  return cat?.icon || '📝'
}

const isProxyRequestLog = (log) => {
  return log.category === 'proxy-request' || (log.category === 'service' && log.message && log.message.includes('Proxying'))
}

const isProxyResponseLog = (log) => {
  return log.category === 'proxy-response' || (log.category === 'service' && log.message && log.message.includes('Proxy response'))
}

const extractServiceNameFromMessage = (message) => {
  const match = message.match(/\[([^\]]+)\]/)
  return match ? match[1] : 'unknown'
}

const removeServiceTagFromMessage = (message) => {
  return message.replace(/\[[^\]]+\]\s*/, '')
}

const getServiceTagType = (serviceName) => {
  if (!serviceName) return 'error'
  
  // 所有服务名标签都使用统一的红色主题，突出显示服务名
  return 'error'
}

// 系统日志详情相关辅助函数
const getMethodTagType = (method) => {
  const methodMap = {
    'GET': 'info',
    'POST': 'success',
    'PUT': 'warning',
    'DELETE': 'error',
    'PATCH': 'warning'
  }
  return methodMap[method] || 'default'
}

const getStatusTagType = (status) => {
  if (status >= 200 && status < 300) return 'success'
  if (status >= 300 && status < 400) return 'info'
  if (status >= 400 && status < 500) return 'warning'
  if (status >= 500) return 'error'
  return 'default'
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
  return 'error'
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

// 刷新Eureka服务列表
const refreshEurekaServices = async () => {
  try {
    await appStore.fetchEurekaServices()
    message.success('服务列表已刷新')
  } catch (error) {
    message.error('刷新失败: ' + error.message)
  }
}

// 设置自动刷新间隔
const setRefreshInterval = (interval) => {
  // 清除之前的定时器
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
  
  // 设置新的定时器
  if (interval > 0) {
    refreshTimer = setInterval(async () => {
      if (showEurekaServiceDrawer.value) {
        try {
          await appStore.fetchEurekaServices()
        } catch (error) {
          console.error('自动刷新服务列表失败:', error)
        }
      }
    }, interval)
  }
  
  refreshInterval.value = interval
}

const formatFullTime = (timestamp) => {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleString('zh-CN')
}

const formatHeaders = (headers) => {
  if (!headers || typeof headers !== 'object') return []
  return Object.entries(headers).map(([name, value]) => ({ name, value }))
}

const formatJson = (data) => {
  if (data === null || data === undefined) return ''
  if (typeof data === 'string') return data
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}

const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    message.success('已复制到剪贴板')
  } catch (error) {
    // 降级方案
    const textArea = document.createElement('textarea')
    textArea.value = text
    document.body.appendChild(textArea)
    textArea.select()
    try {
      document.execCommand('copy')
      message.success('已复制到剪贴板')
    } catch (e) {
      message.error('复制失败')
    }
    document.body.removeChild(textArea)
  }
}

const showSystemLogDetails = async (log) => {
  if (!log) return
  
  // 从日志参数中提取request UUID
  let requestUuid = null
  
  // 方法1: 从日志参数中提取（对于请求日志，requestUuid在第三个参数中）
  if (log.args && log.args.length > 0) {
    for (const arg of log.args) {
      // 检查是否直接是UUID格式
      if (typeof arg === 'string' && arg.startsWith('req_')) {
        requestUuid = arg
        break
      }
      
      // 尝试解析JSON参数
      try {
        const parsedArg = typeof arg === 'string' ? JSON.parse(arg) : arg
        if (parsedArg && parsedArg.requestUuid) {
          requestUuid = parsedArg.requestUuid
          break
        }
      } catch (e) {
        // 忽略解析错误
      }
    }
  }
  
  // 方法2: 从日志消息中提取UUID（如果参数中没有找到）
  if (!requestUuid && log.message) {
    const uuidMatch = log.message.match(/req_[a-zA-Z0-9_-]+/)
    if (uuidMatch) {
      requestUuid = uuidMatch[0]
    }
  }
  
  // 方法3: 从日志的requestUuid字段直接获取
  if (!requestUuid && log.requestUuid) {
    requestUuid = log.requestUuid
  }
  
  if (!requestUuid) {
    message.warning('无法找到请求UUID，无法显示详情')
    console.log('日志详情:', log)
    return
  }
  
  try {
    appStore.setLoading(true)
    // 使用API根据UUID获取请求详情
    const response = await fetch(`/api/request/${requestUuid}/details`)
    if (response.ok) {
      const data = await response.json()
      if (data.success) {
        currentSystemLogDetails.value = data.details
        showSystemLogDetailsDialog.value = true
        return
      } else {
        message.error(data.error || '获取请求详情失败')
      }
    } else {
      message.error(`服务器错误: ${response.status}`)
    }
  } catch (error) {
    console.error('获取请求详情失败:', error)
    message.error('获取请求详情失败')
  } finally {
    appStore.setLoading(false)
  }
}

// 代理服务相关方法
const startService = async (serviceId) => {
  try {
    setServiceLoading(serviceId, true)
    await appStore.startProxyService(serviceId, false) // 不使用全局loading
    message.success('服务启动成功')
    // 添加启动高亮效果，延迟让数据先更新
    setTimeout(() => {
      setServiceHighlight(serviceId, 'started')
    }, 800)
  } catch (error) {
    message.error(`启动失败: ${error.message}`)
  } finally {
    setServiceLoading(serviceId, false)
  }
}

const stopService = async (serviceId) => {
  try {
    setServiceLoading(serviceId, true)
    await appStore.stopProxyService(serviceId, false) // 不使用全局loading
    message.success('服务停止成功')
    // 添加停止高亮效果，延迟让数据先更新
    setTimeout(() => {
      setServiceHighlight(serviceId, 'stopped')
    }, 800)
  } catch (error) {
    message.error(`停止失败: ${error.message}`)
  } finally {
    setServiceLoading(serviceId, false)
  }
}

const editService = (service) => {
  // 填充编辑表单数据
  editServiceForm.id = service.id
  editServiceForm.serviceName = service.serviceName
  editServiceForm.targets = { ...service.targets }
  editServiceForm.description = service.description || ''
  editServiceForm.newTargetName = ''
  editServiceForm.newTargetUrl = ''
  editServiceForm.isRunning = service.isRunning
  
  showEditDialog.value = true
}

const addTarget = () => {
  const name = editServiceForm.newTargetName.trim()
  const url = editServiceForm.newTargetUrl.trim()
  
  if (!name || !url) {
    message.warning('请输入目标名称和地址')
    return
  }
  
  if (editServiceForm.targets[name]) {
    message.warning('目标名称已存在')
    return
  }
  
  // 简单的URL格式验证
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    message.warning('目标地址必须以 http:// 或 https:// 开头')
    return
  }
  
  editServiceForm.targets[name] = url
  editServiceForm.newTargetName = ''
  editServiceForm.newTargetUrl = ''
  
  message.success('目标已添加')
}

const removeTarget = (targetName) => {
  if (editServiceForm.isRunning) {
    message.warning('运行中的服务不能删除目标')
    return
  }
  
  if (Object.keys(editServiceForm.targets).length <= 1) {
    message.warning('至少需要保留一个目标')
    return
  }
  
  delete editServiceForm.targets[targetName]
  message.success('目标已删除')
}

const saveEditService = async () => {
  if (!editServiceForm.id) {
    message.error('服务ID无效')
    return
  }
  
  if (Object.keys(editServiceForm.targets).length === 0) {
    message.warning('至少需要配置一个目标')
    return
  }
  
  try {
    const updates = {
      targets: editServiceForm.targets
    }
    
    // 如果服务已停止，可以修改描述
    if (!editServiceForm.isRunning) {
      updates.description = editServiceForm.description.trim() || null
    }
    
    await appStore.updateProxyService(editServiceForm.id, updates)
    
    showEditDialog.value = false
    message.success('服务配置已更新')
    
    // 重置表单
    Object.assign(editServiceForm, {
      id: '',
      serviceName: '',
      targets: {},
      description: '',
      newTargetName: '',
      newTargetUrl: '',
      isRunning: false
    })
  } catch (error) {
    message.error('更新服务配置失败: ' + error.message)
  }
}

const cancelEditService = () => {
  showEditDialog.value = false
  
  // 重置表单
  Object.assign(editServiceForm, {
    id: '',
    serviceName: '',
    targets: {},
    description: '',
    newTargetName: '',
    newTargetUrl: '',
    isRunning: false
  })
}

const openServiceDetails = (service) => {
  if (!service) {
    console.warn('openServiceDetails: service 参数为空')
    return
  }
  
  currentLogService.value = service
  serviceLogs.value = []
  logDrawerVisible.value = true
  
  // 如果服务在运行，延迟连接日志WebSocket
  if (service.isRunning) {
    // 延迟执行，确保抽屉动画完成后再连接WebSocket
    setTimeout(() => {
      // 清空心跳数据，等待WebSocket推送
      heartbeatData.value = []
      connectLogWebSocket(service.serviceName)
      // 启动心跳动画
      setTimeout(() => {
        startHeartbeatAnimation()
      }, 100)
    }, 300)
  } else {
    // 如果服务未运行，清空心跳数据
    heartbeatData.value = []
    setTimeout(() => {
      startHeartbeatAnimation()
    }, 100)
  }
}

const closeServiceDetails = () => {
  logDrawerVisible.value = false
  disconnectLogWebSocket()
  currentLogService.value = null
  serviceLogs.value = []
  heartbeatData.value = []
  heartbeatCollapsed.value = true // 关闭详情时重置为折叠状态
  
  // 停止动画
  stopHeartbeatAnimation()
}

const clearLogs = () => {
  serviceLogs.value = []
  message.success('日志已清空')
}

const refreshServiceLogs = () => {
  if (currentLogService.value && logWebsocket && logWebsocket.readyState === WebSocket.OPEN) {
    // 重新订阅日志
    logWebsocket.send(JSON.stringify({
      type: 'subscribe_logs',
      serviceName: currentLogService.value.serviceName
    }))
  }
}

const toggleHeartbeatCollapse = () => {
  heartbeatCollapsed.value = !heartbeatCollapsed.value
  
  // 如果展开心跳图表，需要重新绘制
  if (!heartbeatCollapsed.value) {
    // 延迟更长时间确保DOM完全更新
    setTimeout(() => {
      startHeartbeatAnimation()
    }, 100)
  }
}

const connectLogWebSocket = (serviceName) => {
  // 通过端口号区分开发环境和生产环境
  let wsUrl
  if (window.location.port === '5176') {
    // 开发环境：前端运行在5176端口，后端在5175端口
    wsUrl = `ws://${window.location.hostname}:5175`
  } else {
    // 生产环境：使用当前页面的协议和端口
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const port = window.location.port ? `:${window.location.port}` : ''
    wsUrl = `${protocol}//${window.location.hostname}${port}`
  }
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

const handleLogMessage = (message) => {
  switch (message.type) {
    case 'logs_history':
      serviceLogs.value = message.logs
      nextTick(() => scrollToTop())
      break
    case 'new_log':
      // 将新日志添加到数组开头，保持最新的在最上面
      serviceLogs.value.unshift(message.log)
      // 保持最多1000条日志，从末尾删除旧日志
      if (serviceLogs.value.length > 1000) {
        serviceLogs.value.splice(1000)
      }
      nextTick(() => scrollToTop())
      break
  }
}

const scrollToTop = () => {
  if (serviceLogsContainer.value) {
    serviceLogsContainer.value.scrollTop = 0
  }
}

// 启动心跳动画定时器
const startHeartbeatAnimation = () => {
  // 清除现有定时器
  if (heartbeatUpdateTimer.value) {
    clearInterval(heartbeatUpdateTimer.value)
    heartbeatUpdateTimer.value = null
  }
  
  // 立即绘制一次
  drawHeartbeatChart()
  
  // 每5秒更新一次画布（让画布移动看起来更自然）
  heartbeatUpdateTimer.value = setInterval(() => {
    drawHeartbeatChart()
  }, 5000)
}

// 停止心跳动画定时器
const stopHeartbeatAnimation = () => {
  if (heartbeatUpdateTimer.value) {
    clearInterval(heartbeatUpdateTimer.value)
    heartbeatUpdateTimer.value = null
  }
}



const drawHeartbeatChart = () => {
  console.log('开始绘制心电图，当前心跳数据:', heartbeatData.value)
  
  if (!heartbeatCanvasRef.value) {
    console.log('Canvas引用不存在，跳过绘制')
    return
  }
  
  const canvas = heartbeatCanvasRef.value
  const ctx = canvas.getContext('2d')
  
  // 设置Canvas的实际尺寸和显示尺寸
  const containerWidth = canvas.parentElement?.clientWidth || 800
  const displayWidth = Math.min(containerWidth - 40, 800)
  const displayHeight = 200
  
  // 设置Canvas的实际像素尺寸（考虑设备像素比）
  const devicePixelRatio = window.devicePixelRatio || 1
  canvas.width = displayWidth * devicePixelRatio
  canvas.height = displayHeight * devicePixelRatio
  
  // 设置Canvas的CSS显示尺寸
  canvas.style.width = displayWidth + 'px'
  canvas.style.height = displayHeight + 'px'
  
  // 缩放绘图上下文以匹配设备像素比
  ctx.scale(devicePixelRatio, devicePixelRatio)
  
  const width = displayWidth
  const height = displayHeight
  
  // 清空画布
  ctx.clearRect(0, 0, width, height)
  
  // 绘制背景网格和基线（无论是否有数据都显示）
  const timeWindow = 2 * 60 * 1000 // 2分钟
  const totalSeconds = timeWindow / 1000 // 总秒数
  const fiveSecondIntervals = totalSeconds / 5 // 5秒间隔数
  const thirtySecondIntervals = totalSeconds / 30 // 30秒间隔数
  
  // 绘制细网格（每5秒一条线）
  for (let i = 0; i <= fiveSecondIntervals; i++) {
    const x = (i / fiveSecondIntervals) * (width - 80) + 40
    ctx.strokeStyle = '#f0f0f0'
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(x, 20)
    ctx.lineTo(x, height - 40)
    ctx.stroke()
  }
  
  // 绘制粗网格（每30秒一条粗线）
  ctx.strokeStyle = '#e0e0e0'
  ctx.lineWidth = 1
  for (let i = 0; i <= thirtySecondIntervals; i++) {
    const x = (i / thirtySecondIntervals) * (width - 80) + 40
    ctx.beginPath()
    ctx.moveTo(x, 20)
    ctx.lineTo(x, height - 40)
    ctx.stroke()
  }
  
  // 水平网格线
  for (let i = 0; i <= 4; i++) {
    const y = 20 + (i / 4) * (height - 60)
    ctx.beginPath()
    ctx.moveTo(40, y)
    ctx.lineTo(width - 40, y)
    ctx.stroke()
  }
  
  // 绘制基线（心电图的基准线）
  const baselineY = height / 2
  ctx.strokeStyle = '#18a058'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(40, baselineY)
  ctx.lineTo(width - 40, baselineY)
  ctx.stroke()
  
  // 绘制时间标签（每30秒一个标签）
  ctx.fillStyle = '#666'
  ctx.font = '10px Arial'
  ctx.textAlign = 'center'
  
  for (let i = 0; i <= thirtySecondIntervals; i++) {
    const x = (i / thirtySecondIntervals) * (width - 80) + 40
    const secondsAgo = (thirtySecondIntervals - i) * 30
    let timeLabel
    if (secondsAgo === 0) {
      timeLabel = '现在'
    } else if (secondsAgo < 60) {
      timeLabel = `${secondsAgo}s前`
    } else {
      const minutesAgo = Math.floor(secondsAgo / 60)
      const remainingSeconds = secondsAgo % 60
      timeLabel = remainingSeconds === 0 ? `${minutesAgo}m前` : `${minutesAgo}m${remainingSeconds}s前`
    }
    ctx.fillText(timeLabel, x, height - 10)
  }

  if (!heartbeatData.value || heartbeatData.value.length === 0) {
    // 如果没有数据，显示提示信息
    ctx.fillStyle = '#999'
    ctx.font = '14px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('暂无心跳数据，等待服务推送...', width / 2, height / 2 + 20)
    return
  }
  
  console.log(`开始绘制心电图，数据量: ${heartbeatData.value.length}`)
  
  // 计算时间范围（最近2分钟，让心跳显示更密集）
  const now = Date.now()
  const twoMinutesAgo = now - timeWindow
  
  // 重新绘制基线（心电图的基准线），为心跳波形做准备
  ctx.strokeStyle = '#18a058'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(40, baselineY)
  
  // 处理心跳数据，按时间排序
  const validHeartbeats = []
  heartbeatData.value.forEach((heartbeat) => {
    // 处理时间戳格式
    let timestamp
    if (typeof heartbeat.timestamp === 'string') {
      const parsed = parseInt(heartbeat.timestamp)
      if (!isNaN(parsed)) {
        timestamp = parsed < 1e12 ? parsed * 1000 : parsed
      } else {
        if (heartbeat.timestamp.includes('T')) {
          timestamp = new Date(heartbeat.timestamp).getTime()
        } else {
          const isoStr = heartbeat.timestamp.replace(' ', 'T')
          timestamp = new Date(isoStr).getTime()
        }
      }
    } else {
      timestamp = heartbeat.timestamp < 1e12 ? heartbeat.timestamp * 1000 : heartbeat.timestamp
    }
    
    // 只处理最近2分钟内的心跳
    if (timestamp >= twoMinutesAgo && timestamp <= now) {
      validHeartbeats.push({
        ...heartbeat,
        timestamp,
        x: ((timestamp - twoMinutesAgo) / timeWindow) * (width - 80) + 40
      })
    }
  })
  
  // 按时间排序
  validHeartbeats.sort((a, b) => a.timestamp - b.timestamp)
  
  console.log(`处理了 ${validHeartbeats.length} 个有效心跳点`)
  
  // 绘制心电图波形
  let currentX = 40
  validHeartbeats.forEach((heartbeat, index) => {
    const x = heartbeat.x
    
    // 绘制到心跳点的基线
    ctx.lineTo(x - 15, baselineY)
    
    // 根据状态设置不同的颜色和样式
    const originalStrokeStyle = ctx.strokeStyle
    const originalLineWidth = ctx.lineWidth
    
    if (heartbeat.status === 'success') {
      // 正常心跳 - 绿色，经典QRS波形
      ctx.strokeStyle = '#18a058'
      ctx.lineWidth = 2
      
      // P波
      ctx.lineTo(x - 8, baselineY - 3)
      ctx.lineTo(x - 6, baselineY)
      
      // QRS复合波
      ctx.lineTo(x - 2, baselineY - 8)   // Q波
      ctx.lineTo(x, baselineY + 35)      // R波（主峰）
      ctx.lineTo(x + 2, baselineY - 12)  // S波
      ctx.lineTo(x + 4, baselineY)       // 回到基线
      
      // T波
      ctx.lineTo(x + 8, baselineY + 6)
      ctx.lineTo(x + 12, baselineY)
      
    } else if (heartbeat.status === 'error') {
      // 异常心跳 - 红色，不规则波形
      ctx.strokeStyle = '#f56c6c'
      ctx.lineWidth = 2.5
      
      // 异常的锯齿状波形
      ctx.lineTo(x - 6, baselineY - 12)
      ctx.lineTo(x - 4, baselineY + 8)
      ctx.lineTo(x - 2, baselineY - 15)
      ctx.lineTo(x, baselineY + 25)      // 异常峰值
      ctx.lineTo(x + 2, baselineY - 20)
      ctx.lineTo(x + 4, baselineY + 10)
      ctx.lineTo(x + 6, baselineY - 8)
      ctx.lineTo(x + 8, baselineY)
      
      // 添加异常标记点
      ctx.stroke()
      ctx.fillStyle = '#f56c6c'
      ctx.beginPath()
      ctx.arc(x, baselineY - 30, 3, 0, 2 * Math.PI)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(x + 8, baselineY)
      
    } else if (heartbeat.status === 'timeout') {
      // 超时心跳 - 橙色，平缓波形
      ctx.strokeStyle = '#e6a23c'
      ctx.lineWidth = 1.5
      
      // 平缓的波形，表示信号微弱
      ctx.lineTo(x - 4, baselineY - 3)
      ctx.lineTo(x - 2, baselineY + 2)
      ctx.lineTo(x, baselineY + 12)      // 较小的峰值
      ctx.lineTo(x + 2, baselineY - 2)
      ctx.lineTo(x + 4, baselineY + 3)
      ctx.lineTo(x + 6, baselineY)
      
      // 添加超时标记（虚线）
      ctx.stroke()
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(x, baselineY - 20)
      ctx.lineTo(x, baselineY + 20)
      ctx.stroke()
      ctx.setLineDash([]) // 重置虚线
      ctx.beginPath()
      ctx.moveTo(x + 6, baselineY)
      
    } else {
      // 未知状态 - 灰色，平直线
      ctx.strokeStyle = '#909399'
      ctx.lineWidth = 1
      
      ctx.lineTo(x + 10, baselineY)
    }
    
    // 恢复原来的样式
    ctx.strokeStyle = originalStrokeStyle
    ctx.lineWidth = originalLineWidth
    
    currentX = x + 15
  })
  
  // 绘制到终点的基线
  ctx.lineTo(width - 40, baselineY)
  ctx.stroke()
}



const showLogDetails = async (log) => {
  if (!log?.id || !currentLogService.value) return
  
  try {
    appStore.setLoading(true)
    
    // 使用API根据日志ID获取请求详情
    const response = await fetch(`/api/proxy/${currentLogService.value.serviceName}/logs/${log.id}/details`)
    const data = await response.json()
    
    if (data.success) {
      // 复用系统日志详情功能显示请求详情
      currentSystemLogDetails.value = data.data
      showSystemLogDetailsDialog.value = true
    } else {
      message.error(data.error || '获取请求详情失败')
    }
  } catch (error) {
    console.error('获取请求详情失败:', error)
    message.error('获取请求详情失败: ' + error.message)
  } finally {
    appStore.setLoading(false)
  }
}

const getServiceStatusType = (service) => {
  if (!service.isRunning) return 'default'
  if (service.status === 'healthy') return 'success'
  if (service.status === 'unhealthy') return 'error'
  return 'warning'
}

const getServiceStatusText = (service) => {
  if (!service.isRunning) return '已停止'
  if (service.status === 'healthy') return '运行中'
  if (service.status === 'unhealthy') return '异常'
  return '运行中'
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
}

const handleSelectAll = (checked) => {
  if (checked) {
    selectedServices.value = filteredServices.value.map(s => s.id)
  } else {
    selectedServices.value = []
  }
}

const getStoppedCount = () => {
  return selectedServices.value.filter(id => {
    const service = proxyServices.value.find(s => s.id === id)
    return service && !service.isRunning
  }).length
}

const getRunningCount = () => {
  return selectedServices.value.filter(id => {
    const service = proxyServices.value.find(s => s.id === id)
    return service && service.isRunning
  }).length
}

const batchStart = async () => {
  const stoppedIds = selectedServices.value.filter(id => {
    const service = proxyServices.value.find(s => s.id === id)
    return service && !service.isRunning
  })
  
  if (stoppedIds.length === 0) return
  
  batchLoading.value = true
  try {
    await appStore.batchStartProxyServices(stoppedIds)
    message.success(`批量启动 ${stoppedIds.length} 个服务成功`)
  } catch (error) {
    message.error(`批量启动失败: ${error.message}`)
  } finally {
    batchLoading.value = false
  }
}

const batchStop = async () => {
  const runningIds = selectedServices.value.filter(id => {
    const service = proxyServices.value.find(s => s.id === id)
    return service && service.isRunning
  })
  
  if (runningIds.length === 0) return
  
  batchLoading.value = true
  try {
    await appStore.batchStopProxyServices(runningIds)
    message.success(`批量停止 ${runningIds.length} 个服务成功`)
  } catch (error) {
    message.error(`批量停止失败: ${error.message}`)
  } finally {
    batchLoading.value = false
  }
}

// 显示批量添加标签对话框
const openBatchAddTagDialog = async () => {
  if (selectedServices.value.length === 0) {
    message.warning('请先选择要添加标签的服务')
    return
  }
  
  // 加载标签数据
  await fetchTags()
  
  // 重置表单
  batchAddTagForm.selectedTags = []
  
  showBatchAddTagDialog.value = true
}

// 批量添加标签
const batchAddTags = async () => {
  if (selectedServices.value.length === 0 || batchAddTagForm.selectedTags.length === 0) {
    message.warning('请选择服务和标签')
    return
  }
  
  batchLoading.value = true
  try {
    // 使用新的批量API，一次性处理所有服务
    const result = await appStore.batchAddTagsToServices(
      selectedServices.value, 
      batchAddTagForm.selectedTags
    )
    
    // 显示详细的结果信息
    if (result.stats) {
      const { addedRelations, skippedRelations, servicesCount, tagsCount } = result.stats
      
      if (addedRelations > 0 && skippedRelations > 0) {
        message.success(
          `批量添加完成：为 ${servicesCount} 个服务添加了 ${addedRelations} 个新的标签关联，跳过 ${skippedRelations} 个已存在的关联`
        )
      } else if (addedRelations > 0) {
        message.success(`成功为 ${servicesCount} 个服务添加了 ${addedRelations} 个标签关联`)
      } else if (skippedRelations > 0) {
        message.info(`所有 ${skippedRelations} 个标签关联都已存在，无需添加`)
      }
    } else {
      // 兼容旧的响应格式
      if (result.succeeded > 0) {
        message.success(`成功为 ${result.succeeded} 个服务添加标签`)
      }
      
      if (result.failed > 0) {
        message.warning(`${result.failed} 个服务添加失败`)
        console.warn('批量添加标签部分失败:', result.errors)
      }
    }
    
    // 关闭对话框
    showBatchAddTagDialog.value = false
    
    // 清空选择
    selectedServices.value = []
    selectAll.value = false
    
  } catch (error) {
    message.error(`批量添加标签失败: ${error.message}`)
  } finally {
    batchLoading.value = false
  }
}

// 根据服务ID获取服务名称
const getServiceNameById = (serviceId) => {
  const service = proxyServices.value.find(s => s.id === serviceId)
  return service ? service.serviceName : `服务-${serviceId}`
}

const exportConfig = async () => {
  try {
    const response = await fetch('/api/config/export')
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `proxy-config-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
    message.success('配置导出成功')
  } catch (error) {
    message.error('导出失败')
  }
}

const triggerImport = () => {
  fileInputRef.value?.click()
}

const handleFileImport = async (event) => {
  const file = event.target.files[0]
  if (!file) return
  
  try {
    // 先预览导入，检查冲突
    const previewResult = await appStore.previewImportConfig(file)
    
    if (!previewResult.success) {
      message.error(previewResult.error || '预览导入失败')
      event.target.value = ''
      return
    }
    
    const { summary, conflicts, newItems } = previewResult
    
    // 如果没有冲突，直接导入
    if (!summary.hasConflicts) {
      const result = await appStore.importConfig(file, { conflictResolution: 'skip' })
      showImportResult(result)
      event.target.value = ''
      return
    }
    
    // 显示冲突处理对话框
    showConflictDialog(file, conflicts, newItems, summary)
    event.target.value = ''
    
  } catch (error) {
    console.error('导入配置失败:', error)
    let errorMessage = '导入配置失败'
    
    if (error.message) {
      errorMessage += `：${error.message}`
    }
    
    message.error(errorMessage)
    event.target.value = ''
  }
}

const showImportResult = (result) => {
  if (result.success) {
    // 显示成功消息和详细统计
    const { summary } = result
    let messageText = result.message || '配置导入完成'
    
    if (summary && (summary.totalImported > 0 || summary.totalReplaced > 0)) {
      messageText += `\n\n详细统计：`
      if (summary.details.services && !summary.details.services.includes('导入 0，替换 0，跳过 0，失败 0')) {
        messageText += `\n• 服务：${summary.details.services}`
      }
      if (summary.details.tags && !summary.details.tags.includes('导入 0，替换 0，跳过 0，失败 0')) {
        messageText += `\n• 标签：${summary.details.tags}`
      }
      if (summary.details.serviceTags && !summary.details.serviceTags.includes('导入 0，跳过 0，失败 0')) {
        messageText += `\n• 服务标签关联：${summary.details.serviceTags}`
      }
      if (summary.details.debugApis && !summary.details.debugApis.includes('导入 0，替换 0，跳过 0，失败 0')) {
        messageText += `\n• API调试配置：${summary.details.debugApis}`
      }
    }
    
    message.success(messageText)
  } else {
    message.error(result.message || '导入配置失败')
  }
}

const showConflictDialog = (file, conflicts, newItems, summary) => {
  // 构建冲突信息
  let conflictMessage = `发现 ${summary.totalConflicts} 项数据冲突，${summary.totalNew} 项新数据。\n\n`
  
  if (conflicts.services.length > 0) {
    conflictMessage += `服务冲突 (${conflicts.services.length}项)：\n`
    conflicts.services.forEach(conflict => {
      conflictMessage += `• ${conflict.name}\n`
    })
    conflictMessage += '\n'
  }
  
  if (conflicts.tags.length > 0) {
    conflictMessage += `标签冲突 (${conflicts.tags.length}项)：\n`
    conflicts.tags.forEach(conflict => {
      conflictMessage += `• ${conflict.name}\n`
    })
    conflictMessage += '\n'
  }
  
  if (conflicts.debugApis.length > 0) {
    conflictMessage += `API调试配置冲突 (${conflicts.debugApis.length}项)：\n`
    conflicts.debugApis.forEach(conflict => {
      conflictMessage += `• ${conflict.serviceName}\n`
    })
  }
  
  conflictMessage += '\n请选择冲突处理方式：'
  
  dialog.warning({
    title: '导入冲突处理',
    content: conflictMessage,
    positiveText: '替换现有数据',
    negativeText: '跳过冲突项',
    onPositiveClick: async () => {
      try {
        const result = await appStore.importConfig(file, { conflictResolution: 'replace' })
        showImportResult(result)
      } catch (error) {
        message.error(`导入失败：${error.message}`)
      }
    },
    onNegativeClick: async () => {
      try {
        const result = await appStore.importConfig(file, { conflictResolution: 'skip' })
        showImportResult(result)
      } catch (error) {
        message.error(`导入失败：${error.message}`)
      }
    }
  })
}

const removeServiceTag = async (serviceId, tag) => {
  try {
    const service = proxyServices.value.find(s => s.id === serviceId)
    if (service) {
      const updatedTags = service.tags.filter(t => t !== tag)
      await appStore.updateProxyService(serviceId, { tags: updatedTags })
      
      // WebSocket会自动更新数据，无需手动调用
      message.success('标签移除成功')
    }
  } catch (error) {
    message.error('移除标签失败')
  }
}

// 标签相关方法
const getTagType = (tagId) => {
  const tag = availableTags.value.find(t => t.id === tagId)
  return tag?.type || 'default'
}

const getTagName = (tagId) => {
  const tag = availableTags.value.find(t => t.id === tagId)
  return tag?.name || tagId
}



const getTagColor = (tagId) => {
  const tag = availableTags.value.find(t => t.id === tagId)
  const preset = tagTypePresets.find(p => p.type === tag?.type)
  return preset?.color || '#606266'
}

// 获取可添加的标签下拉选项
const getTagDropdownOptions = (service) => {
  const serviceTags = service.tags || []
  const availableTagsForAdd = availableTags.value.filter(tag => !serviceTags.includes(tag.id))
  
  if (availableTagsForAdd.length === 0) {
    return [{
      label: '暂无可添加的标签',
      key: 'no-tags',
      disabled: true
    }]
  }
  
  return availableTagsForAdd.map(tag => ({
    label: tag.name,
    key: tag.id
  }))
}



// 创建服务相关方法
const createService = async () => {
  if (!createServiceForm.serviceName.trim()) {
    message.warning('请输入服务名称')
    return
  }
  
  if (!createServiceForm.targetUrl.trim()) {
    message.warning('请输入目标地址')
    return
  }
  
  try {
    const serviceData = {
      serviceName: createServiceForm.serviceName.trim(),
      targetUrl: createServiceForm.targetUrl.trim(),
      localPort: createServiceForm.localPort || null,
      description: createServiceForm.description.trim() || null
    }
    
    await appStore.createProxyService(serviceData)
    
    // 重置表单
    Object.assign(createServiceForm, {
      serviceName: '',
      targetUrl: '',
      localPort: null,
      description: ''
    })
    
    showCreateDialog.value = false
    message.success('服务创建成功')
    
    // 刷新服务列表
    await appStore.fetchProxyServices()
    await appStore.fetchProxyStats()
  } catch (error) {
    message.error('创建服务失败: ' + error.message)
  }
}

const showTagManagementDialog = async (service) => {
  try {
    currentTagService.value = service
    showTagManagerDialog.value = true
    
    // 加载可用标签
    await fetchTags()
  } catch (error) {
    message.error('打开标签管理失败')
  }
}

// 标签管理相关方法
const fetchTags = async () => {
  try {
    const response = await fetch('/api/tags')
    const data = await response.json()
    if (data.success) {
      availableTags.value = data.data || []
    }
  } catch (error) {
    console.error('获取标签列表失败:', error)
  }
}

const createTag = async () => {
  if (!newTagForm.name.trim()) {
    message.warning('请输入标签名称')
    return
  }
  
  savingTag.value = true
  try {
    const preset = tagTypePresets.find(p => p.type === newTagForm.type)
    const response = await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newTagForm.name.trim(),
        color: preset?.color || '#606266',
        type: newTagForm.type
      })
    })
    
    const data = await response.json()
    if (data.success) {
      message.success('标签创建成功')
      newTagForm.name = ''
      newTagForm.type = 'default'
      await Promise.all([
        fetchTags(),
        appStore.fetchProxyServices() // 刷新服务列表
      ])
      
      // 使用nextTick确保DOM更新
      await nextTick()
    } else {
      message.error(data.error || '创建标签失败')
    }
  } catch (error) {
    message.error('创建标签失败')
  } finally {
    savingTag.value = false
  }
}

const showEditTagDialog = ref(false)
const editingTag = reactive({
  id: '',
  name: '',
  type: 'default',
  description: ''
})

const editTag = (tag) => {
  Object.assign(editingTag, {
    id: tag.id,
    name: tag.name,
    type: tag.type || 'default',
    description: tag.description || ''
  })
  showEditTagDialog.value = true
}

const updateTag = async () => {
  if (!editingTag.name.trim()) {
    message.warning('请输入标签名称')
    return
  }
  
  savingTag.value = true
  try {
    const preset = tagTypePresets.find(p => p.type === editingTag.type)
    const response = await fetch(`/api/tags/${editingTag.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editingTag.name.trim(),
        color: preset?.color || '#606266',
        type: editingTag.type,
        description: editingTag.description.trim()
      })
    })
    
    const data = await response.json()
    if (data.success) {
      message.success('标签更新成功')
      showEditTagDialog.value = false
      resetEditingTag()
      await Promise.all([
        fetchTags(),
        appStore.fetchProxyServices() // 刷新服务列表以更新标签显示
      ])
      
      // 使用nextTick确保DOM更新
      await nextTick()
      
      // 强制更新当前标签服务的引用以触发重新渲染
      if (currentTagService.value) {
        const updatedService = proxyServices.value.find(s => s.id === currentTagService.value.id)
        if (updatedService) {
          currentTagService.value = { ...updatedService }
        }
      }
    } else {
      message.error(data.error || '更新标签失败')
    }
  } catch (error) {
    message.error('更新标签失败')
  } finally {
    savingTag.value = false
  }
}

const resetEditingTag = () => {
  Object.assign(editingTag, {
    id: '',
    name: '',
    type: 'default',
    description: ''
  })
}

// 监听编辑对话框关闭事件
watch(showEditTagDialog, (newVal) => {
  if (!newVal) {
    resetEditingTag()
  }
})

// 监听标签管理对话框打开事件，自动加载标签数据
watch(showTagManagerDialog, async (newVal) => {
  if (newVal) {
    await fetchTags()
  }
})

const deleteTag = async (tagId) => {
  try {
    const response = await fetch(`/api/tags/${tagId}`, {
      method: 'DELETE'
    })
    
    if (response.ok) {
      message.success('标签删除成功')
      await Promise.all([
        fetchTags(),
        appStore.fetchProxyServices() // 刷新服务列表以更新标签显示
      ])
    } else {
      message.error('删除标签失败')
    }
  } catch (error) {
    message.error('删除标签失败')
  }
}

const addServiceTag = async (serviceId, tagId) => {
  try {
    const service = proxyServices.value.find(s => s.id === serviceId)
    if (service) {
      const updatedTags = [...(service.tags || []), tagId]
      await appStore.updateProxyService(serviceId, { tags: updatedTags })
      
      // WebSocket会自动更新数据，无需手动调用
      message.success('标签添加成功')
    }
  } catch (error) {
    message.error('添加标签失败')
  }
}



const switchTarget = async (serviceId, target) => {
  try {
    setServiceLoading(serviceId, true)
    await appStore.switchProxyTarget(serviceId, target)
    message.success('目标切换成功')
  } catch (error) {
    message.error('切换失败')
  } finally {
    setServiceLoading(serviceId, false)
  }
}

const getTargetOptions = (targets) => {
  return Object.keys(targets || {}).map(key => ({
    label: key,
    value: key
  }))
}

// Eureka配置相关方法
const updateEurekaConfig = async () => {
  if (appStore.loading) return
  
  try {
    const response = await fetch('/api/config/eureka', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eurekaConfig.value)
    })
    
    const data = await response.json()
    if (data.success) {
      message.success(data.message || 'Eureka配置更新成功')
      // 重新获取配置
      await appStore.fetchConfig()
    } else {
      message.error(data.error || '配置更新失败')
    }
  } catch (error) {
    message.error('配置更新失败: ' + error.message)
  }
}

const updateLocalIPConfig = async () => {
  if (localIPLoading.value) return
  
  if (!localIPConfig.value.localIP) {
    message.warning('请输入有效的本机IP地址')
    return
  }
  
  localIPLoading.value = true
  
  try {
    const response = await fetch('/api/config/local-ip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(localIPConfig.value)
    })
    
    const data = await response.json()
    if (data.success) {
      message.success(data.message)
    } else {
      message.error(data.error || '更新失败')
    }
  } catch (error) {
    message.error('更新本机IP配置失败: ' + error.message)
  } finally {
    localIPLoading.value = false
  }
}

// 端口相关方法
const getPortUsageColor = () => {
  const percentage = portUsagePercentage.value
  if (percentage < 50) return '#67c23a'
  if (percentage < 80) return '#e6a23c'
  return '#f56c6c'
}

const getPortUsageTagType = () => {
  const percentage = portUsagePercentage.value
  if (percentage < 50) return 'success'
  if (percentage < 80) return 'warning'
  return 'error'
}

// 获取端口使用统计
const fetchPortStats = async () => {
  try {
    const response = await fetch('/api/ports/usage')
    const data = await response.json()
    if (data.success) {
      portStats.value = {
        ...data.stats,
        startPort: Number(data.stats.startPort),
        endPort: Number(data.stats.endPort),
        totalPorts: Number(data.stats.totalPorts),
        usedCount: Number(data.stats.usedCount),
        availableCount: Number(data.stats.availableCount),
        usedPorts: data.stats.usedPorts?.map(port => Number(port)) || [],
        availablePorts: data.stats.availablePorts?.map(port => Number(port)) || []
      }
    }
  } catch (error) {
    console.error('获取端口使用统计失败:', error)
  }
}

const formatLogTimestamp = (timestamp) => {
  return new Date(timestamp).toLocaleString()
}

const getLogLevelType = (level) => {
  switch (level) {
    case 'error': return 'error'
    case 'warn': return 'warning'  
    case 'info': return 'info'
    default: return 'info'
  }
}

// 端口范围和详情对话框方法
const showPortRangeConfigDialog = () => {
  showPortRangeDialog.value = true
}

const showPortUsageDetails = () => {
  showPortUsageDialog.value = true
  // 获取最新的端口使用情况
  fetchPortStats()
}

// 端口范围配置相关方法
const fetchPortRangeConfig = async () => {
  try {
    const response = await fetch('/api/config/port-range')
    const data = await response.json()
    if (data.success && data.data) {
      // 确保数字类型正确
      currentPortRange.value = {
        ...data.data,
        startPort: Number(data.data.startPort),
        endPort: Number(data.data.endPort),
        totalPorts: Number(data.data.totalPorts)
      }
      // 同步表单数据，确保数字类型
      portRangeForm.startPort = Number(data.data.startPort)
      portRangeForm.endPort = Number(data.data.endPort)
      portRangeForm.description = data.data.description || ''
    }
  } catch (error) {
    console.error('获取端口范围配置失败:', error)
  }
}

const savePortRangeConfig = async () => {
  if (!isPortRangeFormValid.value) {
    message.warning('请检查端口范围配置')
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
      message.success(data.message)
      showPortRangeDialog.value = false
      
      // 刷新配置和端口统计
      await fetchPortRangeConfig()
      await fetchPortStats()
      
      // 显示Docker命令提示
      if (data.dockerCommand) {
        message.info(`请使用以下命令启动容器:\n${data.dockerCommand}`)
      }
    } else {
      message.error(data.error || '保存端口范围配置失败')
    }
  } catch (error) {
    console.error('保存端口范围配置失败:', error)
    message.error('保存端口范围配置失败: ' + error.message)
  } finally {
    portRangeLoading.value = false
  }
}

const copyDockerCommand = async () => {
  if (!dockerCommand.value) return
  
  try {
    await navigator.clipboard.writeText(dockerCommand.value)
    message.success('Docker命令已复制到剪贴板')
  } catch (error) {
    // 降级方案：使用临时文本区域
    const textArea = document.createElement('textarea')
    textArea.value = dockerCommand.value
    document.body.appendChild(textArea)
    textArea.select()
    try {
      document.execCommand('copy')
      message.success('Docker命令已复制到剪贴板')
    } catch (e) {
      message.error('复制失败，请手动复制')
    }
    document.body.removeChild(textArea)
  }
}

const formatDate = (dateString) => {
  if (!dateString) return ''
  return new Date(dateString).toLocaleString('zh-CN')
}

// 计算属性
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

// 生命周期函数已合并到下方，删除此重复定义

  // 获取初始Eureka状态
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

  

  // 获取本机IP配置
  const fetchLocalIPConfig = async () => {
  try {
    const response = await fetch('/api/config/local-ip')
    const data = await response.json()
    if (data.success && data.config) {
      const configLocalIP = data.config.localIP
      if (typeof configLocalIP === 'string' && configLocalIP.trim()) {
        localIPConfig.value.localIP = configLocalIP
      } else {
        localIPConfig.value.localIP = '127.0.0.1'
      }
    }
  } catch (error) {
    console.error('获取本机IP配置失败:', error)
  }
}



onMounted(async () => {
  // 初始化数据
  await Promise.all([
    appStore.fetchConfig(),
    appStore.fetchProxyServices(),
    appStore.fetchProxyStats(),
    fetchTags(), // 加载标签数据
    fetchLocalIPConfig(),
    fetchPortStats(),
    fetchPortRangeConfig(),
    fetchEurekaStatus()
  ])
  
  // 只有在Eureka可用时才获取服务列表
  if (eurekaStatus.value.isAvailable) {
    try {
      await appStore.fetchEurekaServices()
    } catch (error) {
      console.error('获取Eureka服务列表失败:', error)
    }
  }
  
  // 设置Eureka配置
  if (appStore.config?.eureka) {
    eurekaConfig.value = { 
      host: appStore.config.eureka.host || 'localhost',
      port: appStore.config.eureka.port || 8761,
      servicePath: appStore.config.eureka.servicePath || '/eureka/apps',
      heartbeatInterval: appStore.config.eureka.heartbeatInterval || 30
    }
  } else {
    // 默认配置
    eurekaConfig.value = {
      host: 'localhost',
      port: 8761,
      servicePath: '/eureka/apps',
      heartbeatInterval: 30
    }
  }
  
  // 初始化日志分类
  logCategories.value = [
    { key: 'system', name: '系统', icon: '⚙️', color: '#409eff', count: 0 },
    { key: 'proxy-request', name: '请求', icon: '📤', color: '#67c23a', count: 0 },
    { key: 'proxy-response', name: '响应', icon: '📥', color: '#e6a23c', count: 0 },
    { key: 'error', name: '错误', icon: '❌', color: '#f56c6c', count: 0 },
    { key: 'service', name: '服务', icon: '🔧', color: '#909399', count: 0 }
  ]
  
  // 默认只选中"服务"分类
  selectedLogCategories.value = ['service']
  
  // 初始化WebSocket连接
  initWebSocket()
})

onUnmounted(() => {
  // 清理定时器
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
  
  // 清理Eureka更新防抖定时器
  if (eurekaUpdateTimer) {
    clearTimeout(eurekaUpdateTimer)
    eurekaUpdateTimer = null
  }
  
  // 清理心跳动画定时器
  stopHeartbeatAnimation()
  
  // 关闭WebSocket连接
  if (websocket) {
    // 取消系统日志订阅
    if (websocket.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify({
        type: 'unsubscribe_system_logs'
      }))
    }
    websocket.close()
    websocket = null
  }
  
  // 关闭日志WebSocket连接
  disconnectLogWebSocket()
})



// Eureka服务更新防抖
let eurekaUpdateTimer = null
const debouncedFetchEurekaServices = () => {
  if (eurekaUpdateTimer) {
    clearTimeout(eurekaUpdateTimer)
  }
  eurekaUpdateTimer = setTimeout(async () => {
    if (eurekaStatus.value.isAvailable) {
      try {
        console.log('防抖后更新Eureka服务列表')
        await appStore.fetchEurekaServices()
      } catch (error) {
        console.error('更新Eureka服务列表失败:', error)
      }
    }
    eurekaUpdateTimer = null
  }, 3000) // 3秒防抖
}

// WebSocket连接管理
const initWebSocket = () => {
  // 通过端口号区分开发环境和生产环境
  let wsUrl
  if (window.location.port === '5176') {
    // 开发环境：前端运行在5176端口，后端在5175端口
    wsUrl = `ws://${window.location.hostname}:5175`
  } else {
    // 生产环境：使用当前页面的协议和端口
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const port = window.location.port ? `:${window.location.port}` : ''
    wsUrl = `${protocol}//${window.location.hostname}${port}`
  }
  websocket = new WebSocket(wsUrl)
  
  websocket.onopen = () => {
    console.log('WebSocket连接已建立')
  }
  
  websocket.onmessage = (event) => {
    try {
      const messageData = JSON.parse(event.data)
      handleWebSocketMessage(messageData)
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

const handleWebSocketMessage = async (messageData) => {
  console.log('收到WebSocket消息:', messageData)
  
  switch (messageData.type) {
    case 'service_status_synced':
      // 服务状态同步更新 - 静默处理，不显示提示
      appStore.fetchProxyServices()
      appStore.fetchProxyStats()
      console.log('服务状态已同步:', messageData.message)
      break
    case 'heartbeat_failed':
      // 心跳失败
      appStore.fetchProxyServices()
      appStore.fetchProxyStats()
      message.warning(`服务 ${messageData.serviceName} 心跳失败`)
      break
    case 'heartbeat_recovered':
      // 心跳恢复
      appStore.fetchProxyServices()
      appStore.fetchProxyStats()
      message.success(`服务 ${messageData.serviceName} 心跳已恢复`)
      break
    case 'eureka_unavailable_shutdown':
      // Eureka不可用，自动关闭所有代理服务
      appStore.fetchProxyServices()
      appStore.fetchProxyStats()
      message.error(`检测到Eureka服务器不可用，已自动关闭所有代理服务！总服务数：${messageData.details?.totalServices}，成功关闭：${messageData.details?.successCount}`)
      break
    case 'eureka_unavailable_shutdown_error':
      // Eureka不可用但关闭服务时出错
      appStore.fetchProxyServices()
      appStore.fetchProxyStats()
      message.error(`检测到Eureka服务器不可用，但自动关闭代理服务时发生错误：${messageData.error}`)
      break
    case 'eureka_monitoring_started':
      // Eureka监听已启动
      message.success(messageData.message)
      break
    case 'eureka_monitoring_stopped':
      // Eureka监听已停止
      message.info(messageData.message)
      break
    case 'eureka_availability_updated':
      // Eureka可用性状态更新 - 这是关键的状态更新
      eurekaStatus.value.isAvailable = messageData.isAvailable
      if (messageData.isAvailable) {
        message.success(messageData.message)
        // 如果Eureka变为可用，使用防抖获取服务列表
        debouncedFetchEurekaServices()
      } else {
        message.error(messageData.message)
        // 如果Eureka不可用，清空服务列表
        appStore.eurekaServices = []
      }
      break
    case 'system_log':
      // 系统日志更新
      systemLogs.value.push(messageData.log)
      // 保持最大500条日志
      if (systemLogs.value.length > 500) {
        systemLogs.value.shift()
      }
      // 滚动到底部
      scrollSystemLogsToBottom()
      break
    case 'system_logs_history':
      // 系统日志历史记录
      systemLogs.value = messageData.logs || []
      // 滚动到底部
      scrollSystemLogsToBottom()
      break
    case 'system_logs_cleared':
      // 系统日志已清理
      systemLogs.value = []
      message.success('系统日志已清理')
      break
    case 'heartbeat_update':
      // 处理心跳更新
      console.log('收到心跳更新消息:', messageData)
      if (currentLogService.value && logDrawerVisible.value) {
        const currentService = currentLogService.value
        console.log('当前服务:', currentService)
        console.log('消息数据:', messageData.data)
        
        // 检查服务名称和端口匹配
        const messageServiceName = messageData.data?.serviceName || messageData.serviceName
        const messagePort = messageData.data?.port || messageData.port
        
        console.log('匹配检查:', {
          messageServiceName,
          messagePort,
          currentServiceName: currentService.serviceName,
          currentPort: currentService.port
        })
        
        if (messageServiceName === currentService.serviceName && 
            messagePort === currentService.port) {
          // 更新心跳数据 - 修正数据路径
          const historyData = messageData.data?.history || []
          console.log('更新心跳数据，数量:', historyData.length)
          console.log('心跳历史数据:', historyData)
          heartbeatData.value = historyData
          nextTick(() => {
            console.log('准备绘制心电图')
            // 如果动画定时器正在运行，只需要立即更新一次图表
            // 否则启动动画定时器
            if (heartbeatUpdateTimer.value) {
              drawHeartbeatChart()
            } else {
              startHeartbeatAnimation()
            }
          })
        } else {
          console.log('服务不匹配，跳过心跳更新')
        }
      } else {
        console.log('没有当前服务或抽屉未打开，跳过心跳更新')
      }
      break
    case 'batch_tags_updated':
      // 批量标签更新 - 增量更新多个服务
      console.log('收到批量标签更新消息:', messageData)
      if (messageData.data?.services) {
        appStore.updateMultipleProxyServices(messageData.data.services)
      }
      break
    case 'batch_services_started':
      // 批量启动服务 - 增量更新多个服务
      console.log('收到批量启动服务消息:', messageData)
      if (messageData.data?.services) {
        appStore.updateMultipleProxyServices(messageData.data.services)
        // 批量启动可能影响Eureka服务列表，使用防抖更新
        debouncedFetchEurekaServices()
      }
      break
    case 'batch_services_stopped':
      // 批量停止服务 - 增量更新多个服务
      console.log('收到批量停止服务消息:', messageData)
      if (messageData.data?.services) {
        appStore.updateMultipleProxyServices(messageData.data.services)
        // 批量停止可能影响Eureka服务列表，使用防抖更新
        debouncedFetchEurekaServices()
      }
      break
    case 'proxy_started':
      // 服务启动 - 增量更新单个服务
      console.log('收到服务启动消息:', messageData)
      if (messageData.data) {
        appStore.updateSingleProxyService(messageData.data)
        // 服务启动影响Eureka服务列表，使用防抖更新
        debouncedFetchEurekaServices()
      }
      break
    case 'proxy_stopped':
      // 服务停止 - 增量更新单个服务
      console.log('收到服务停止消息:', messageData)
      if (messageData.data) {
        appStore.updateSingleProxyService(messageData.data)
        // 服务停止影响Eureka服务列表，使用防抖更新
        debouncedFetchEurekaServices()
      }
      break
    case 'proxy_updated':
    case 'proxy_switched':
      // 服务配置更新/目标切换 - 增量更新单个服务，不影响Eureka
      console.log('收到服务配置更新消息:', messageData)
      if (messageData.data) {
        appStore.updateSingleProxyService(messageData.data)
        // 配置更新和目标切换不影响Eureka服务列表，无需调用fetchEurekaServices
      }
      break
    case 'proxy_created':
      // 创建服务 - 增量添加服务
      console.log('收到创建服务消息:', messageData)
      if (messageData.data) {
        appStore.updateSingleProxyService(messageData.data)
      }
      break
    case 'proxy_deleted':
      // 删除服务 - 增量删除服务
      console.log('收到删除服务消息:', messageData)
      if (messageData.data?.id) {
        appStore.removeProxyService(messageData.data.id)
      }
      break
    default:
      console.log('未处理的WebSocket消息类型:', messageData.type)
  }
}
</script>

<style scoped>
.dashboard {
  padding: 24px;
  min-height: 100vh;
  background: var(--n-body-color);
}

.dashboard-content {
  max-width: 1600px;
  margin: 0 auto;
  padding: 0 20px;
}



.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  width: 100%;
  gap: 20px;
}

/* 服务头部样式 */
.services-header {
  margin-bottom: 0;
}

.header-title h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--n-text-color-1);
}

/* 统计信息区域 */
.stats-overview {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.stat-card {
  display: flex;
  align-items: center;
  padding: 16px;
  border-radius: var(--n-border-radius);
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  transition: border-color 0.2s var(--n-bezier);
  position: relative;
}

.stat-card:hover {
  border-color: var(--n-border-color-hover);
}

.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  border-radius: var(--n-border-radius) var(--n-border-radius) 0 0;
}

.stat-card.stat-total::before {
  background: var(--n-color-info);
}

.stat-card.stat-running::before {
  background: var(--n-color-primary);
}

.stat-card.stat-healthy::before {
  background: var(--n-color-success);
}

.stat-card.stat-unhealthy::before {
  background: var(--n-color-error);
}

.stat-card.stat-stopped::before {
  background: var(--n-color-warning);
}

.stat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--n-border-radius);
  margin-right: 12px;
}

.stat-card.stat-total .stat-icon {
  background: var(--n-color-info-suppl);
  color: var(--n-color-info);
}

.stat-card.stat-running .stat-icon {
  background: var(--n-color-primary-suppl);
  color: var(--n-color-primary);
}

.stat-card.stat-healthy .stat-icon {
  background: var(--n-color-success-suppl);
  color: var(--n-color-success);
}

.stat-card.stat-unhealthy .stat-icon {
  background: var(--n-color-error-suppl);
  color: var(--n-color-error);
}

.stat-card.stat-stopped .stat-icon {
  background: var(--n-color-warning-suppl);
  color: var(--n-color-warning);
}

.stat-content {
  flex: 1;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--n-text-color-1);
  line-height: 1.2;
  margin-bottom: 2px;
}

.stat-label {
  font-size: 13px;
  color: var(--n-text-color-2);
  font-weight: 400;
}

/* 控制区域 */
.controls-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 20px;
  padding: 16px;
  background: var(--n-card-color);
  border-radius: var(--n-border-radius);
  border: 1px solid var(--n-border-color);
}

.controls-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.search-row {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--n-divider-color);
}

.search-group {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.search-input {
  width: 260px;
  min-width: 200px;
}

.tag-select {
  width: 240px;
  min-width: 180px;
}

.actions-row {
  align-items: flex-start;
}

.batch-section {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
}

.batch-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.main-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* 响应式设计 */
@media (max-width: 1200px) {
  .controls-row {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  
  .search-row {
    padding-bottom: 12px;
    border-bottom: 1px solid var(--n-divider-color);
  }
  
  .search-group {
    justify-content: flex-start;
  }
  
  .batch-section {
    justify-content: flex-start;
  }
  
  .main-actions {
    justify-content: flex-start;
  }
}

@media (max-width: 768px) {
  .search-input {
    width: 200px;
    min-width: 150px;
  }
  
  .tag-select {
    width: 180px;
    min-width: 140px;
  }
  
  .batch-buttons {
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
  }
  
  .main-actions {
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
  }
}

.card-title-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card-title-section > span {
  font-size: 16px;
  font-weight: 600;
  color: var(--n-text-color-1);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.eureka-status {
  display: flex;
  align-items: center;
}

.form-actions {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--n-border-color);
}

.system-logs-container {
  height: 500px;
  border: 1px solid var(--n-border-color);
  border-radius: 6px;
  background: var(--n-card-color);
  display: flex;
  flex-direction: column;
}

/* 系统日志详情对话框样式 */
.system-log-details-content {
  padding: 16px;
}

.details-section {
  margin-bottom: 24px;
}

.details-section h3 {
  margin: 0 0 12px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--n-text-color-1);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.section-header h3 {
  margin: 0;
}

.headers-container {
  border-radius: 6px;
  overflow: hidden;
}

.json-container {
  border: 1px solid var(--n-border-color);
  border-radius: 6px;
  overflow: hidden;
}

.json-content {
  margin: 0;
  padding: 12px;
  background: var(--n-code-color);
  color: var(--n-text-color-1);
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 300px;
  overflow-y: auto;
}

.log-entries {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log-entry {
  padding: 12px;
  border: 1px solid var(--n-border-color);
  border-radius: 6px;
  background: var(--n-card-color);
}

.log-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.log-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  opacity: 0.8;
}

.log-timestamp {
  color: var(--n-text-color-3);
}

.log-message {
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.4;
}

.log-text-container {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.service-tag {
  margin-right: 8px;
  flex-shrink: 0;
  font-weight: 500;
  font-size: 12px;
  white-space: nowrap;
}

.log-text {
  flex: 1;
  word-break: break-word;
}

.log-actions {
  margin-left: auto;
  flex-shrink: 0;
}

.services-list {
  margin-top: 16px;
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.empty-services {
  padding: 40px 0;
  text-align: center;
}

/* 日志分类过滤器样式 */
.log-category-filters {
  padding: 12px;
  border-bottom: 1px solid var(--n-border-color);
  background: var(--n-card-color);
}

.filter-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-weight: 500;
}

.filter-options {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.category-option {
  display: flex;
  align-items: center;
  gap: 4px;
}

.category-icon {
  font-size: 14px;
}

.category-name {
  margin-right: 4px;
}

/* 统计信息样式 - 符合NaiveUI设计风格 */
.stats-section {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: 24px;
}

.stat-card {
  min-width: 72px;
  padding: 12px 16px;
  border-radius: var(--n-border-radius);
  text-align: center;
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  transition: all 0.3s var(--n-bezier);
  position: relative;
  overflow: hidden;
}

.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  transition: all 0.3s var(--n-bezier);
}

.stat-card:hover {
  border-color: var(--n-color-primary-hover);
  box-shadow: var(--n-box-shadow);
}

.stat-label {
  font-size: 12px;
  color: var(--n-text-color-3);
  margin-bottom: 4px;
  font-weight: var(--n-font-weight);
  line-height: var(--n-line-height);
}

.stat-value {
  font-size: 18px;
  font-weight: var(--n-font-weight-strong);
  line-height: 1.2;
  color: var(--n-text-color-1);
}

/* 不同状态的顶部装饰条颜色 - 使用NaiveUI颜色系统 */
.stat-total::before {
  background: var(--n-color-info);
}

.stat-running::before {
  background: var(--n-color-success);
}

.stat-running .stat-value {
  color: var(--n-color-success);
}

.stat-healthy::before {
  background: var(--n-color-success);
}

.stat-healthy .stat-value {
  color: var(--n-color-success);
}

.stat-unhealthy::before {
  background: var(--n-color-error);
}

.stat-unhealthy .stat-value {
  color: var(--n-color-error);
}

.stat-stopped::before {
  background: var(--n-color-warning);
}

.stat-stopped .stat-value {
  color: var(--n-text-color-3);
}

.services-stats {
  display: flex;
  justify-content: space-around;
  margin-bottom: 16px;
  gap: 24px;
}

.services-stats .stat-item {
  flex: 1;
  text-align: center;
}

.service-info h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.service-actions {
  display: flex;
  gap: 8px;
}

.service-content {
  margin-top: 16px;
}

.service-detail {
  margin-bottom: 16px;
}

.service-detail p {
  margin: 6px 0;
  font-size: 14px;
  color: var(--n-text-color-2);
  line-height: 1.5;
}

.service-detail strong {
  color: var(--n-text-color-1);
  font-weight: 500;
  min-width: 80px;
  display: inline-block;
}

.service-tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 12px;
}

.service-tags strong {
  margin-right: 8px;
  font-size: 13px;
  color: var(--n-text-color-secondary);
  font-weight: 500;
}

/* 编辑服务对话框样式 */
.service-config-section {
  margin-bottom: 20px;
}

.service-config-section h5 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--n-text-color-1);
}

.target-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  padding: 8px;
  border: 1px solid var(--n-border-color);
  border-radius: var(--n-border-radius);
  background: var(--n-color-target);
}

.add-target-form {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border: 1px dashed var(--n-border-color);
  border-radius: var(--n-border-radius);
  background: var(--n-color-target);
}



.target-switch {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--n-border-color);
}

.target-switch label {
  font-size: 14px;
  font-weight: 500;
  color: var(--n-text-color-1);
  min-width: 80px;
}

/* 空状态样式 */
.empty-state {
  text-align: center;
  padding: 60px 20px;
  grid-column: 1 / -1;
}

.empty-state :deep(.n-empty) {
  margin: 0;
}

/* 日志条目样式 */
.log-entry {
  padding: 12px;
  border: 1px solid var(--n-border-color);
  border-radius: 6px;
  background: var(--n-card-color);
  transition: all 0.2s ease;
}

.log-entry:hover {
  border-color: var(--n-color-primary);
  box-shadow: 0 2px 8px var(--n-box-shadow-color);
}

.log-entry.log-error {
  border-left: 4px solid #f56c6c;
}

.log-entry.log-warn {
  border-left: 4px solid #e6a23c;
}

.log-entry.log-info {
  border-left: 4px solid #409eff;
}

.log-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.log-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  opacity: 0.8;
}

.log-timestamp {
  color: var(--n-text-color-3);
  font-family: 'JetBrains Mono', monospace;
}

.log-category {
  font-size: 14px;
}

.log-message {
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.4;
  word-break: break-word;
}

.log-actions {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
}

.system-logs-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
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
  color: var(--n-text-color-1);
}

.drawer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.drawer-content {
  padding: 0;
}

/* 服务卡片样式 */
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
  color: var(--n-text-color-1);
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
  color: var(--n-text-color-2);
  font-size: 14px;
}

.empty-services {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
}

/* 服务详情抽屉样式 */
.log-drawer-content {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.heartbeat-section {
  margin-bottom: 20px;
}

.heartbeat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.heartbeat-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.heartbeat-chart-container {
  border: 1px solid var(--n-border-color);
  border-radius: 6px;
  padding: 16px;
  background: var(--n-card-color);
}

.heartbeat-chart {
  width: 100%;
  overflow-x: auto;
}

.heartbeat-chart canvas {
  display: block;
  max-width: 100%;
}

.heartbeat-legend {
  display: flex;
  justify-content: center;
  gap: 24px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.legend-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  text-align: center;
  min-width: 80px;
}

.legend-item span {
  font-weight: 500;
}

.legend-item small {
  color: var(--n-text-color-2);
  font-size: 10px;
  line-height: 1.2;
}

.legend-color {
  width: 16px;
  height: 3px;
  border-radius: 2px;
  margin-bottom: 2px;
}

.legend-color.success {
  background-color: #18a058;
}

.legend-color.error {
  background-color: #f56c6c;
}

.legend-color.timeout {
  background-color: #e6a23c;
}

.legend-color.unknown {
  background-color: #909399;
}



.log-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding: 12px;
  background: var(--n-card-color);
  border-radius: 6px;
  border: 1px solid var(--n-border-color);
}

.log-info {
  display: flex;
  align-items: center;
  gap: 20px;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-label {
  font-size: 14px;
  color: var(--n-text-color-2);
}

.log-actions {
  display: flex;
  gap: 8px;
}

.service-logs-container {
  flex: 1;
  overflow-y: auto;
  max-height: 400px;
}

.log-entries {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log-entry {
  padding: 12px;
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.log-entry:hover {
  border-color: var(--n-color-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
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
  font-family: 'Courier New', monospace;
  font-size: 13px;
  color: var(--n-text-color-1);
  font-weight: 500;
}

.log-meta-info {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--n-text-color-2);
}

.log-duration {
  font-weight: 500;
}

.log-target {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--n-text-color-3);
  font-family: 'Courier New', monospace;
}

.log-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.log-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.service-logs-container {
  flex: 1;
  overflow-y: auto;
  border: 1px solid var(--n-border-color);
  border-radius: 6px;
  background: var(--n-card-color);
  padding: 8px;
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
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', 'Monaco', 'Courier New', monospace;
  background: var(--n-code-color);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
}

.log-meta-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--n-text-color-3);
}

.log-duration {
  font-family: 'JetBrains Mono', monospace;
}

.log-time {
  font-family: 'JetBrains Mono', monospace;
}

.log-target {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--n-text-color-2);
  font-size: 14px;
  margin-bottom: 8px;
  padding: 8px;
  background: var(--n-modal-color);
  border-radius: 6px;
}

/* 标签管理样式 */
.tag-manager {
  max-height: 500px;
  overflow-y: auto;
}

.tag-manager-header {
  margin-bottom: 16px;
}

.tag-manager-header h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--n-text-color-1);
}

.service-tag-manager h4 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--n-text-color-1);
}

.current-tags, .add-tags {
  margin-bottom: 20px;
}

.current-tags strong, .add-tags strong {
  display: block;
  margin-bottom: 8px;
  color: var(--n-text-color-2);
  font-size: 14px;
}

.available-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* 标签类型预设选择器样式 */
.tag-type-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.tag-type-item {
  cursor: pointer;
  transition: all 0.2s ease;
  border-radius: 6px;
  padding: 2px;
  border: 2px solid transparent;
}

.tag-type-item:hover {
  border-color: var(--n-color-primary-suppl);
}

.tag-type-item.active {
  border-color: var(--n-color-primary);
  background-color: var(--n-color-primary-suppl);
}

/* 批量添加标签对话框样式 */
.batch-add-tag-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.selected-services-info h4 {
  margin: 0 0 12px 0;
  color: var(--n-text-color-1);
  font-size: 16px;
}

.selected-services-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 120px;
  overflow-y: auto;
  padding: 12px;
  background: var(--n-color-target);
  border-radius: var(--n-border-radius);
  border: 1px solid var(--n-border-color);
}

.tag-selection h4 {
  margin: 0 0 12px 0;
  color: var(--n-text-color-1);
  font-size: 16px;
}

.tag-checkbox-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  max-height: 200px;
  overflow-y: auto;
  padding: 16px;
  background: var(--n-color-target);
  border-radius: var(--n-border-radius);
  border: 1px solid var(--n-border-color);
}

.no-tags {
  padding: 20px;
  text-align: center;
}

/* 颜色预设选项样式 */
.color-presets {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
  padding: 16px;
  background: var(--n-card-color);
  border-radius: 8px;
  border: 1px solid var(--n-border-color);
  max-width: 280px;
}

.color-preset-item {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  cursor: pointer;
  border: 3px solid transparent;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  box-shadow: 
    0 1px 3px rgba(0, 0, 0, 0.12),
    0 1px 2px rgba(0, 0, 0, 0.24);
}

.color-preset-item:hover {
  transform: scale(1.15);
  box-shadow: 
    0 4px 12px rgba(0, 0, 0, 0.15),
    0 2px 6px rgba(0, 0, 0, 0.1);
  border-color: var(--n-color-primary-suppl);
}

.color-preset-item.active {
  border-color: var(--n-color-primary);
  transform: scale(1.15);
  box-shadow: 
    0 0 0 2px var(--n-color-primary-suppl),
    0 4px 12px rgba(0, 0, 0, 0.15),
    0 2px 6px rgba(0, 0, 0, 0.1);
}

.color-preset-item.active::after {
  content: '✓';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: white;
  font-size: 14px;
  font-weight: bold;
  text-shadow: 
    0 1px 2px rgba(0, 0, 0, 0.6),
    0 0 4px rgba(0, 0, 0, 0.3);
  line-height: 1;
}

/* 批量控制样式 - 已移动到 .batch-operations */

/* 代理服务容器样式 */
.proxy-services-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 16px;
}

.proxy-service-card {
  width: 100%;
  transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.service-item {
  width: 100%;
  transition: all 0.2s ease;
  box-shadow: 
    0 2px 8px rgba(0, 0, 0, 0.12), 
    0 1px 4px rgba(0, 0, 0, 0.08),
    0 0 1px rgba(0, 0, 0, 0.04);
  border-radius: var(--n-border-radius);
}

.service-item:hover {
  box-shadow: 
    0 6px 20px rgba(0, 0, 0, 0.15), 
    0 3px 12px rgba(0, 0, 0, 0.12),
    0 1px 6px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
}

.service-item.selected {
  border-color: var(--n-color-primary);
  box-shadow: 
    0 0 0 2px var(--n-color-primary-suppl), 
    0 6px 20px rgba(0, 0, 0, 0.15), 
    0 3px 12px rgba(0, 0, 0, 0.12),
    0 1px 6px rgba(0, 0, 0, 0.08);
}

/* 服务状态变化高亮效果 */
.service-item.service-highlight {
  position: relative;
  overflow: hidden;
}

.service-item.service-highlight::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(24, 160, 88, 0.2), transparent);
  animation: highlightSweep 0.8s ease-out;
  z-index: 1;
}

.service-item.service-highlight-started {
  animation: pulseSuccess 2s ease-in-out;
  border-color: var(--n-color-success);
}

.service-item.service-highlight-stopped {
  animation: pulseWarning 2s ease-in-out;
  border-color: var(--n-color-warning);
}

@keyframes highlightSweep {
  0% {
    left: -100%;
  }
  100% {
    left: 100%;
  }
}

@keyframes pulseSuccess {
  0%, 100% {
    box-shadow: 
      0 2px 8px rgba(0, 0, 0, 0.12), 
      0 1px 4px rgba(0, 0, 0, 0.08),
      0 0 1px rgba(0, 0, 0, 0.04);
  }
  20%, 40%, 60%, 80% {
    box-shadow: 
      0 0 0 3px rgba(24, 160, 88, 0.3),
      0 6px 20px rgba(0, 0, 0, 0.15), 
      0 3px 12px rgba(0, 0, 0, 0.12),
      0 1px 6px rgba(0, 0, 0, 0.08);
    transform: translateY(-2px);
  }
}

@keyframes pulseWarning {
  0%, 100% {
    box-shadow: 
      0 2px 8px rgba(0, 0, 0, 0.12), 
      0 1px 4px rgba(0, 0, 0, 0.08),
      0 0 1px rgba(0, 0, 0, 0.04);
  }
  20%, 40%, 60%, 80% {
    box-shadow: 
      0 0 0 3px rgba(240, 160, 32, 0.3),
      0 6px 20px rgba(0, 0, 0, 0.15), 
      0 3px 12px rgba(0, 0, 0, 0.12),
      0 1px 6px rgba(0, 0, 0, 0.08);
    transform: translateY(-2px);
  }
}

/* 第一行：服务名称和操作按钮 */
.service-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  width: 100%;
}

.service-title-section {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.service-title-section h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--n-text-color-1);
  line-height: 1.4;
  flex-shrink: 0;
}

.service-status-tags {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.service-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/* 第二行：详细信息和目标切换 */
.service-details-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0 8px 0;
  gap: 16px;
}

.service-details-info {
  display: flex;
  align-items: center;
  gap: 24px;
  flex: 1;
  min-width: 0;
}

.service-detail-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  color: var(--n-text-color-2);
  white-space: nowrap;
}

.service-detail-item strong {
  color: var(--n-text-color-1);
  font-weight: 500;
}

/* 第三行：标签相关 */
.service-tags-row {
  padding-top: 0;
}



.target-switch {
  display: flex;
  align-items: center;
  gap: 8px;
}

.target-switch label {
  font-size: 14px;
  color: var(--n-text-color-2);
  white-space: nowrap;
}

/* 端口管理区域样式 */
.port-management-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.port-info-row {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}

.port-range-info,
.port-usage-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.port-label {
  font-size: 14px;
  color: var(--n-text-color-2);
  font-weight: 500;
  min-width: 60px;
}

.port-actions-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 响应式布局调整 */
@media (max-width: 1200px) {
  .stats-overview {
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
  }
  
  .stat-card {
    padding: 16px;
  }
  
  .stat-icon {
    width: 40px;
    height: 40px;
    margin-right: 12px;
  }
  
  .stat-value {
    font-size: 24px;
  }
  
  .service-details-info {
    gap: 16px;
  }
  
  .service-detail-item {
    font-size: 13px;
  }
}

@media (max-width: 768px) {
  .dashboard {
    padding: 16px;
  }
  
  .dashboard-content {
    padding: 0 10px;
  }
  
  .port-info-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  
  .port-actions-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  
  .stats-overview {
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px;
  }
  
  .stat-card {
    padding: 12px;
  }
  
  .stat-icon {
    width: 36px;
    height: 36px;
    margin-right: 10px;
  }
  
  .stat-value {
    font-size: 20px;
  }
  
  .stat-label {
    font-size: 12px;
  }
  
  .controls-section {
    padding: 16px;
    gap: 12px;
  }
  
  .search-filters {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  
  .search-filters .n-input,
  .search-filters .n-select {
    width: 100% !important;
  }
  
  .batch-operations {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  
  .main-actions {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
}

/* 主要操作区域样式 */
.main-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.main-actions .n-button-group {
  flex-shrink: 0;
}

/* 导入导出按钮样式优化 */
.main-actions .n-button-group .n-button {
  transition: all 0.3s ease;
}

.main-actions .n-button-group .n-button:hover {
  transform: translateY(-1px);
}

/* 控制区域样式 */
.controls-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  background: var(--n-card-color);
  border-radius: var(--n-border-radius);
  border: 1px solid var(--n-border-color);
  margin-bottom: 16px;
}

.controls-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.search-row .search-group {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  max-width: 600px;
}

.search-input {
  min-width: 250px;
  flex: 1;
}

.tag-select {
  min-width: 200px;
}

.actions-row .batch-section {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
}

.batch-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 16px;
  
  .card-header {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }
  
  .service-header-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  
  .service-title-section {
    width: 100%;
    flex-wrap: wrap;
    gap: 8px;
  }
  
  .service-details-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  
  .service-details-info {
    width: 100%;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  
  .service-actions {
    width: 100%;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  
  .target-switch {
    width: 100%;
    justify-content: flex-start;
  }
}
</style> 