const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { createProxyMiddleware } = require('http-proxy-middleware');
const WebSocket = require('ws');
const http = require('http');
const os = require('os');
const database = require('./database');
const processManager = require('./process-manager');
const serviceEventManager = require('./serviceEventManager');



const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

// 存储配置和状态
let config = {
  eureka: {
    host: 'localhost',
    port: 8761,
    servicePath: '/eureka/apps',
    heartbeatInterval: 30 // 心跳间隔（秒）
  }
};

let proxyServers = new Map(); // 存储运行中的代理服务器实例（仅运行时状态）
let heartbeatTimers = new Map(); // 存储Eureka心跳定时器（仅运行时状态）
let heartbeatErrors = new Map(); // 存储心跳错误信息（运行时状态，用于即时通知）
let statusSyncTimer = null; // 状态同步定时器
let logSubscribers = new Map(); // 存储日志订阅者（WebSocket连接状态）
let eurekaUnavailableCount = 0; // Eureka不可用计数器
let isEurekaShutdownTriggered = false; // 是否已触发Eureka关闭
let isEurekaMonitoringActive = false; // Eureka监听是否活跃
let isEurekaAvailable = null; // Eureka服务可用性状态: null=未检查, true=可用, false=不可用
let eurekaHealthCheckTimer = null; // Eureka健康检查定时器
let eurekaUnavailableStartTime = null; // Eureka开始不可用的时间

// 初始化数据库
database.init().then(async () => {
  console.log('数据库初始化完成');
  
  // 初始化端口范围配置
  await initializePortRangeConfig();
  
  // 加载Eureka配置
  try {
    const savedEurekaConfig = await database.getEurekaConfig();
    if (savedEurekaConfig) {
      config.eureka = { ...config.eureka, ...savedEurekaConfig };
      console.log('已加载Eureka配置:', config.eureka);
    } else {
      console.log('使用默认Eureka配置:', config.eureka);
    }
  } catch (error) {
    console.error('加载Eureka配置失败:', error);
  }
  
  // 检查Eureka服务可用性
  const eurekaAvailable = await checkEurekaAvailability();
  
  // 如果Eureka不可用，关闭所有运行中的代理服务
  if (!eurekaAvailable) {
    console.log('🚨 Eureka服务不可用，开始关闭所有运行中的代理服务...');
    await shutdownAllProxyServicesForEureka();
  } else {
    // Eureka可用时，恢复运行中的代理服务
    await restoreRunningServices();
  }
  
  console.log('🚀 服务初始化完成');
  
  // 启动定期清理任务
  startDataCleanupTask();
  
  // 启动Eureka健康检查
  startEurekaHealthCheck();
}).catch(err => {
  console.error('数据库初始化失败:', err);
  process.exit(1);
});

// WebSocket连接处理
wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      await handleWebSocketMessage(ws, data);
    } catch (error) {
      console.error('WebSocket message parse error:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    // 清理日志订阅
    cleanupLogSubscriptions(ws);
  });
});

// 处理WebSocket消息
async function handleWebSocketMessage(ws, data) {
  const { type, serviceName } = data;
  
  switch (type) {
    case 'subscribe_logs':
      await subscribeToLogs(ws, serviceName);
      break;
    case 'unsubscribe_logs':
      unsubscribeFromLogs(ws, serviceName);
      break;
    default:
      console.log('Unknown WebSocket message type:', type);
  }
}

// 订阅日志
async function subscribeToLogs(ws, serviceName) {
  if (!logSubscribers.has(serviceName)) {
    logSubscribers.set(serviceName, new Set());
  }
  
  logSubscribers.get(serviceName).add(ws);
  console.log(`Client subscribed to logs for service: ${serviceName}`);
  
  // 从数据库获取历史日志
  try {
    const logs = await database.getServiceLogs(serviceName, 100);
    ws.send(JSON.stringify({
      type: 'logs_history',
      serviceName,
      logs: logs
    }));
  } catch (error) {
    console.error('获取历史日志失败:', error);
    ws.send(JSON.stringify({
      type: 'logs_history',
      serviceName,
      logs: []
    }));
  }
}

// 取消订阅日志
function unsubscribeFromLogs(ws, serviceName) {
  if (logSubscribers.has(serviceName)) {
    logSubscribers.get(serviceName).delete(ws);
    console.log(`Client unsubscribed from logs for service: ${serviceName}`);
  }
}

// 清理日志订阅
function cleanupLogSubscriptions(ws) {
  for (const [serviceName, subscribers] of logSubscribers) {
    subscribers.delete(ws);
  }
}

// 广播消息给所有WebSocket客户端
function broadcast(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// 检查是否有正在运行的代理服务
async function hasRunningProxyServices() {
  try {
    const services = await database.getAllProxyServices();
    return services.some(service => service.isRunning);
  } catch (error) {
    console.error('检查运行服务失败:', error);
    return false;
  }
}

// 检查Eureka服务可用性
async function checkEurekaAvailability() {
  try {
    console.log('🔍 检查Eureka服务可用性...');
    const url = `http://${config.eureka.host}:${config.eureka.port}${config.eureka.servicePath}`;
    const response = await axios.get(url, {
      headers: {
        'Accept': 'application/json'
      },
      timeout: 5000 // 5秒超时
    });
    
    isEurekaAvailable = true;
    console.log('✅ Eureka服务可用');
    
    // 广播Eureka可用状态
    broadcast({
      type: 'eureka_availability_updated',
      isAvailable: true,
      message: 'Eureka服务连接成功'
    });
    
    return true;
  } catch (error) {
    isEurekaAvailable = false;
    console.error('❌ Eureka服务不可用:', error.message);
    
    // 广播Eureka不可用状态
    broadcast({
      type: 'eureka_availability_updated',
      isAvailable: false,
      message: `Eureka服务不可用: ${error.message}`,
      error: error.message
    });
    
    return false;
  }
}

// 启动Eureka监听（如果还没启动的话）
async function ensureEurekaMonitoringStarted() {
  if (!isEurekaMonitoringActive && await hasRunningProxyServices()) {
    console.log('🚀 启动Eureka状态监听...');
    await startStatusSync();
    isEurekaMonitoringActive = true;
  }
}

// 停止Eureka监听（如果没有服务运行的话）
async function ensureEurekaMonitoringStopped() {
  if (isEurekaMonitoringActive && !(await hasRunningProxyServices())) {
    console.log('🛑 停止Eureka状态监听...');
    stopStatusSync();
    isEurekaMonitoringActive = false;
  }
}

// 获取Eureka服务列表
async function getEurekaServices() {
  try {
    const url = `http://${config.eureka.host}:${config.eureka.port}${config.eureka.servicePath}`;
    const response = await axios.get(url, {
      headers: {
        'Accept': 'application/json'
      },
      timeout: 5000 // 5秒超时
    });
    
    if (response.data && response.data.applications && response.data.applications.application) {
      return response.data.applications.application;
    }
    return [];
  } catch (error) {
    console.error('Failed to fetch Eureka services:', error.message);
    return [];
  }
}

// 恢复运行中的代理服务
async function restoreRunningServices() {
  try {
    const services = await database.getAllProxyServices();
    const runningServices = services.filter(service => service.isRunning);
    
    if (runningServices.length === 0) {
      console.log('没有运行中的服务需要恢复');
      return;
    }
    
    console.log(`开始恢复 ${runningServices.length} 个运行中的代理服务...`);
    
    for (const service of runningServices) {
      try {
        console.log(`恢复代理服务: ${service.serviceName}:${service.port}`);
        await startProxyService(service, { skipEurekaCheck: true });
        console.log(`✅ ${service.serviceName} 恢复成功`);
      } catch (error) {
        console.error(`❌ 恢复服务 ${service.serviceName} 失败:`, error.message);
        // 更新数据库状态为停止
        await database.updateProxyService(service.id, { isRunning: false });
      }
    }
    
    console.log('代理服务恢复完成');
  } catch (error) {
    console.error('恢复代理服务失败:', error);
  }
}

// API路由

// 获取当前配置
app.get('/api/config', (req, res) => {
  res.json(config);
});

// 更新Eureka配置
app.post('/api/config/eureka', async (req, res) => {
  try {
    // 检查是否有运行中的代理服务
    const runningServices = await database.getAllProxyServices();
    const runningCount = runningServices.filter(service => service.isRunning).length;
    
    if (runningCount > 0) {
      const runningServiceNames = runningServices
        .filter(service => service.isRunning)
        .map(service => service.serviceName)
        .slice(0, 5)
        .join('、');
      
      return res.status(400).json({ 
        success: false, 
        error: `检测到有 ${runningCount} 个代理服务正在运行（${runningServiceNames}${runningCount > 5 ? ' 等' : ''}），为了确保服务稳定性，请先停止所有运行中的代理服务再修改Eureka配置。`,
        runningCount: runningCount,
        runningServices: runningServices.filter(service => service.isRunning).map(s => s.serviceName)
      });
    }
    
    const { host, port, servicePath, heartbeatInterval } = req.body;
    
    // 保存旧配置用于比较
    const oldConfig = { ...config.eureka };
    
    // 构建新配置
    const newEurekaConfig = { 
      host, 
      port, 
      servicePath: servicePath || '/eureka/apps',
      heartbeatInterval: heartbeatInterval || 30
    };
    
    // 保存到数据库
    await database.setEurekaConfig(newEurekaConfig);
    
    // 更新内存配置
    config.eureka = newEurekaConfig;
    
    console.log('Eureka配置已更新并保存到数据库:', config.eureka);
    
    // 如果配置发生变化，重启状态同步
    const configChanged = 
      oldConfig.host !== config.eureka.host ||
      oldConfig.port !== config.eureka.port ||
      oldConfig.servicePath !== config.eureka.servicePath;
      
    if (configChanged) {
      console.log('检测到Eureka连接配置变更，重启状态同步...');
      
      // 停止现有的状态同步
      stopStatusSync();
      
      // 清理内存缓存
      clearAllMemoryCaches();
      
      // 启动新的状态同步（使用新配置）
      await startStatusSync();
      
      console.log('状态同步已重启，开始使用新的Eureka配置');
      
      // 广播配置变更通知
      broadcast({
        type: 'eureka_config_updated',
        data: config.eureka,
        message: '✅ Eureka配置已更新并重新连接'
      });
    }
    
    res.json({ 
      success: true, 
      config: config.eureka,
      message: configChanged ? 'Eureka配置已更新、保存到数据库并重新连接' : 'Eureka配置已更新并保存到数据库'
    });
  } catch (error) {
    console.error('更新Eureka配置失败:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 获取Eureka服务列表
app.get('/api/eureka/services', async (req, res) => {
  try {
    const services = await getEurekaServices();
    console.log('🔍 获取Eureka服务列表:', services?.length || 0, '个服务');
    if (services?.length > 0) {
      console.log('服务详情:', services.map(s => ({ name: s.name, instances: s.instance?.length || 0 })));
    }
    res.json({ success: true, services });
  } catch (error) {
    console.error('获取Eureka服务列表失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取Eureka状态
app.get('/api/eureka/status', (req, res) => {
  res.json({ 
    success: true, 
    isAvailable: isEurekaAvailable,
    config: config.eureka
  });
});

// 获取本地网络信息（调试用）
app.get('/api/network/info', (req, res) => {
  try {
    const localIP = getLocalIP();
    const interfaces = os.networkInterfaces();
    
    // 只返回非内部IPv4接口信息
    const networkInfo = {};
    for (const [name, interfaceList] of Object.entries(interfaces)) {
      const ipv4Interfaces = interfaceList.filter(iface => 
        iface.family === 'IPv4' && !iface.internal
      );
      if (ipv4Interfaces.length > 0) {
        networkInfo[name] = ipv4Interfaces.map(iface => ({
          address: iface.address,
          netmask: iface.netmask,
          mac: iface.mac
        }));
      }
    }
    
    res.json({
      success: true,
      detectedIP: localIP,
      environmentVariables: {
        LOCAL_IP: process.env.LOCAL_IP || null,
        HOST_IP: process.env.HOST_IP || null
      },
      availableInterfaces: networkInfo,
      platform: os.platform(),
      hostname: os.hostname()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 手动检查Eureka可用性
app.post('/api/eureka/check', async (req, res) => {
  try {
    console.log('🔍 手动检查Eureka可用性...');
    const available = await checkEurekaAvailability();
    
    res.json({ 
      success: true, 
      isAvailable: available,
      message: available ? 'Eureka服务可用' : 'Eureka服务不可用'
    });
  } catch (error) {
    console.error('检查Eureka可用性失败:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 获取Eureka健康检查状态
app.get('/api/eureka/health-status', (req, res) => {
  const currentTime = Date.now();
  let healthStatus = {
    isMonitoring: !!eurekaHealthCheckTimer,
    isAvailable: isEurekaAvailable,
    unavailableStartTime: eurekaUnavailableStartTime,
    unavailableDuration: eurekaUnavailableStartTime ? (currentTime - eurekaUnavailableStartTime) / 1000 : 0,
    maxAllowedTime: 3 * 60, // 3分钟
    isShutdownTriggered: isEurekaShutdownTriggered
  };
  
  if (healthStatus.unavailableDuration > 0) {
    healthStatus.remainingTime = Math.max(0, healthStatus.maxAllowedTime - healthStatus.unavailableDuration);
  }
  
  res.json({ 
    success: true, 
    healthStatus
  });
});

// 启动Eureka健康检查
app.post('/api/eureka/health-check/start', (req, res) => {
  try {
    if (eurekaHealthCheckTimer) {
      return res.json({ success: false, message: 'Eureka健康检查已在运行中' });
    }
    
    startEurekaHealthCheck();
    res.json({ success: true, message: 'Eureka健康检查已启动' });
  } catch (error) {
    console.error('启动Eureka健康检查失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 停止Eureka健康检查
app.post('/api/eureka/health-check/stop', (req, res) => {
  try {
    if (!eurekaHealthCheckTimer) {
      return res.json({ success: false, message: 'Eureka健康检查未在运行' });
    }
    
    stopEurekaHealthCheck();
    res.json({ success: true, message: 'Eureka健康检查已停止' });
  } catch (error) {
    console.error('停止Eureka健康检查失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取心跳状态
app.get('/api/heartbeat/status', (req, res) => {
  const heartbeatStatus = [];
  for (const [key, timer] of heartbeatTimers) {
    const [serviceName, port] = key.split(':');
    heartbeatStatus.push({
      serviceName,
      port: parseInt(port),
      isActive: true,
      interval: config.eureka.heartbeatInterval
    });
  }
  res.json({ success: true, heartbeats: heartbeatStatus });
});

// 获取服务心跳历史
app.get('/api/heartbeat/history/:serviceName/:port', async (req, res) => {
  try {
    const { serviceName, port } = req.params;
    const history = await getHeartbeatHistory(serviceName, parseInt(port));
    
    res.json({ 
      success: true, 
      data: {
        serviceName,
        port: parseInt(port),
        history
      }
    });
  } catch (error) {
    console.error('Failed to get heartbeat history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 测试端点：手动触发Eureka不可用自动关闭
app.post('/api/test/trigger-eureka-shutdown', async (req, res) => {
  try {
    console.log('🧪 手动触发Eureka不可用自动关闭测试...');
    eurekaUnavailableCount = 2; // 设置为触发阈值
    isEurekaShutdownTriggered = false; // 重置标志
    await shutdownAllProxyServicesForEureka();
    res.json({ success: true, message: '已手动触发Eureka不可用自动关闭' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 导出配置数据
app.get('/api/config/export', async (req, res) => {
  try {
    console.log('开始导出配置数据...')
    
    // 获取所有静态配置数据
    const [proxyServices, tags] = await Promise.all([
      database.getAllProxyServices(),
      database.getAllTags()
    ])
    
    // 清理运行时状态，只保留配置数据
    const cleanedServices = proxyServices.map(service => ({
      ...service,
      isRunning: false, // 重置运行状态
      status: null,     // 清除状态
      activeTarget: Object.keys(service.targets)[0] || 'default' // 重置为第一个目标
    }))
    
    const exportData = {
      version: '1.0.0',
      exportTime: new Date().toISOString(),
      data: {
        proxyServices: cleanedServices,
        tags: tags,
        eurekaConfig: config.eureka // 包含Eureka配置
      }
    }
    
    console.log(`导出完成: ${cleanedServices.length} 个服务, ${tags.length} 个标签`)
    
    // 设置下载头
    const filename = `proxy-config-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    
    res.json(exportData)
  } catch (error) {
    console.error('导出配置失败:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// 导入配置数据
app.post('/api/config/import', async (req, res) => {
  try {
    const importData = req.body
    
    console.log('开始导入配置数据...')
    
    // 检查是否有服务正在运行
    const runningServices = await database.getAllProxyServices()
    const runningCount = runningServices.filter(service => service.isRunning).length
    
    if (runningCount > 0) {
      const runningServiceNames = runningServices
        .filter(service => service.isRunning)
        .map(service => service.serviceName)
        .slice(0, 5)
        .join('、')
      
      return res.status(400).json({ 
        success: false, 
        error: `检测到有 ${runningCount} 个服务正在运行（${runningServiceNames}${runningCount > 5 ? ' 等' : ''}），为了确保数据安全，请先停止所有运行中的服务再进行导入配置操作。`,
        runningCount: runningCount,
        runningServices: runningServices.filter(service => service.isRunning).map(s => s.serviceName)
      })
    }
    
    // 验证导入数据格式
    if (!importData.data || !importData.version) {
      return res.status(400).json({ 
        success: false, 
        error: '无效的配置文件格式' 
      })
    }
    
    const { proxyServices, tags, eurekaConfig } = importData.data
    
    // 统计信息
    const stats = {
      services: { imported: 0, skipped: 0, errors: 0 },
      tags: { imported: 0, skipped: 0, errors: 0 }
    }
    
    // 导入标签数据
    if (tags && Array.isArray(tags)) {
      for (const tag of tags) {
        try {
          // 检查标签是否已存在
          const existingTags = await database.getAllTags()
          const exists = existingTags.some(t => t.name === tag.name)
          
          if (!exists) {
            await database.createTag(tag.name, tag.color, tag.description)
            stats.tags.imported++
          } else {
            stats.tags.skipped++
          }
        } catch (error) {
          console.error(`导入标签失败: ${tag.name}`, error)
          stats.tags.errors++
        }
      }
    }
    
    // 导入代理服务
    if (proxyServices && Array.isArray(proxyServices)) {
      for (const service of proxyServices) {
        try {
          // 检查服务是否已存在（根据serviceName+port）
          const existingServices = await database.getAllProxyServices()
          const exists = existingServices.some(s => 
            s.serviceName === service.serviceName && s.port === service.port
          )
          
          if (!exists) {
            // 创建新服务（去除id字段让数据库自动生成）
            const { id, ...serviceData } = service
            await database.createProxyService(serviceData)
            stats.services.imported++
          } else {
            stats.services.skipped++
          }
        } catch (error) {
          console.error(`导入服务失败: ${service.serviceName}`, error)
          stats.services.errors++
        }
      }
    }
    

    
    // 导入Eureka配置
    if (eurekaConfig) {
      try {
        // 保存到数据库
        await database.setEurekaConfig(eurekaConfig);
        
        // 更新内存配置
        config.eureka = { ...config.eureka, ...eurekaConfig };
        
        console.log('Eureka配置已导入并保存到数据库:', config.eureka);
        stats.eureka = { imported: 1 };
      } catch (error) {
        console.error('导入Eureka配置失败:', error);
        stats.eureka = { imported: 0, error: error.message };
      }
    }
    
    console.log('导入完成:', stats)
    
    // 重建代理服务器映射
    await rebuildProxyServersMap()
    

    
    // 清理所有内存缓存（因为导入时所有服务都是停止状态）
    clearAllMemoryCaches()
    
    res.json({ 
      success: true, 
      message: '配置导入完成',
      stats: stats
    })
    
  } catch (error) {
    console.error('导入配置失败:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// 清理状态不一致的服务
app.post('/api/cleanup/inconsistent-services', async (req, res) => {
  try {
    console.log('🧹 开始清理状态不一致的服务...');
    
    const services = await database.getAllProxyServices();
    const cleanupResults = [];
    
    for (const service of services) {
      const serverKey = `${service.serviceName}:${service.port}`;
      const hasLocalServer = proxyServers.has(serverKey);
      
      // 如果数据库显示运行中但本地没有服务器实例
      if (service.isRunning && !hasLocalServer) {
        console.log(`发现不一致服务: ${service.serviceName} - 数据库:运行中, 本地:未找到`);
        
        // 更新数据库状态为停止
        await database.updateProxyService(service.id, { isRunning: false });
        
        // 清理心跳定时器和错误记录
        if (heartbeatTimers.has(serverKey)) {
          clearInterval(heartbeatTimers.get(serverKey));
          heartbeatTimers.delete(serverKey);
        }
        
        if (heartbeatErrors.has(serverKey)) {
          heartbeatErrors.delete(serverKey);
        }
        
        cleanupResults.push({
          serviceName: service.serviceName,
          action: 'updated_to_stopped',
          port: service.port
        });
      }
    }
    
    console.log(`✅ 清理完成，处理了 ${cleanupResults.length} 个不一致的服务`);
    
    // 广播状态更新
    broadcast({
      type: 'services_cleanup_completed',
      message: '已清理状态不一致的服务',
      cleanupCount: cleanupResults.length
    });
    
    res.json({ 
      success: true, 
      message: `已清理 ${cleanupResults.length} 个状态不一致的服务`,
      details: cleanupResults
    });
  } catch (error) {
    console.error('清理服务状态失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取端口占用状态
app.get('/api/ports/status', async (req, res) => {
  try {
    const portStatus = await processManager.getTrackedPortsStatus();
    res.json({ success: true, ports: portStatus });
  } catch (error) {
    console.error('获取端口状态失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 强制清理指定端口
app.post('/api/ports/:port/kill', async (req, res) => {
  try {
    const port = parseInt(req.params.port);
    const result = await processManager.killProcessByPort(port);
    
    if (result) {
      res.json({ success: true, message: `端口 ${port} 进程已被终止` });
    } else {
      res.json({ success: false, message: `端口 ${port} 没有运行的进程` });
    }
  } catch (error) {
    console.error('强制清理端口失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取代理服务日志
app.get('/api/proxy/:serviceName/logs', async (req, res) => {
  try {
    const { serviceName } = req.params;
    const { limit = 100 } = req.query;
    
    const logs = await getServiceLogs(serviceName, parseInt(limit));
    res.json({ success: true, logs, total: logs.length });
  } catch (error) {
    console.error('获取服务日志失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 清理代理服务日志
app.delete('/api/proxy/:serviceName/logs', async (req, res) => {
  try {
    const { serviceName } = req.params;
    await clearServiceLogs(serviceName);
    res.json({ success: true, message: `服务 ${serviceName} 的日志已清理` });
  } catch (error) {
    console.error('清理服务日志失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 批量启动代理服务
app.post('/api/proxy/batch/start', async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: '请提供有效的服务ID列表' });
    }

    const results = [];
    const errors = [];

    for (const id of ids) {
      try {
        const service = await database.getProxyServiceById(id);
        
        if (!service) {
          errors.push({ id, error: '服务不存在' });
          continue;
        }

        if (service.isRunning) {
          errors.push({ id, error: '服务已在运行中' });
          continue;
        }

        await startProxyService(service);
        
        // 获取更新后的服务状态
        const updatedService = await database.getProxyServiceById(id);
        results.push(updatedService);
        broadcast({ type: 'proxy_started', data: updatedService });
        
        console.log(`批量启动成功: ${service.serviceName}`);
      } catch (error) {
        console.error(`批量启动失败 ${id}:`, error);
        errors.push({ id, error: error.message });
      }
    }

    res.json({ 
      success: true, 
      message: `成功启动 ${results.length} 个服务`,
      results,
      errors,
      total: ids.length,
      succeeded: results.length,
      failed: errors.length
    });
  } catch (error) {
    console.error('批量启动代理服务失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 批量停止代理服务
app.post('/api/proxy/batch/stop', async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: '请提供有效的服务ID列表' });
    }

    const results = [];
    const errors = [];

    for (const id of ids) {
      try {
        const service = await database.getProxyServiceById(id);
        
        if (!service) {
          errors.push({ id, error: '服务不存在' });
          continue;
        }

        if (!service.isRunning) {
          errors.push({ id, error: '服务未在运行' });
          continue;
        }

        await stopProxyService(service);
        
        // 获取更新后的服务状态
        const updatedService = await database.getProxyServiceById(id);
        results.push(updatedService);
        broadcast({ type: 'proxy_stopped', data: updatedService });
        
        console.log(`批量停止成功: ${service.serviceName}`);
      } catch (error) {
        console.error(`批量停止失败 ${id}:`, error);
        errors.push({ id, error: error.message });
      }
    }

    res.json({ 
      success: true, 
      message: `成功停止 ${results.length} 个服务`,
      results,
      errors,
      total: ids.length,
      succeeded: results.length,
      failed: errors.length
    });
  } catch (error) {
    console.error('批量停止代理服务失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取代理服务统计信息
app.get('/api/proxy/stats', async (req, res) => {
  try {
    const services = await database.getAllProxyServices();
    
    const stats = {
      total: services.length,
      running: 0,
      stopped: 0,
      healthy: 0,
      unhealthy: 0
    };
    
    // 计算各种状态的统计
    services.forEach(service => {
      if (service.isRunning) {
        stats.running++;
        const serverKey = `${service.serviceName}:${service.port}`;
        const hasHeartbeat = heartbeatTimers.has(serverKey);
        const hasHeartbeatError = heartbeatErrors.has(serverKey);
        
        if (hasHeartbeat && !hasHeartbeatError) {
          stats.healthy++;
        } else {
          stats.unhealthy++;
        }
      } else {
        stats.stopped++;
      }
    });
    
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取所有代理服务
app.get('/api/proxy/list', async (req, res) => {
  try {
    const services = await database.getAllProxyServices();
    
    // 添加心跳状态信息
    const servicesWithHeartbeat = services.map(service => {
      const serverKey = `${service.serviceName}:${service.port}`;
      const hasHeartbeat = service.isRunning && heartbeatTimers.has(serverKey);
      const heartbeatError = heartbeatErrors.get(serverKey);
      
      return {
        ...service,
        hasHeartbeat,
        heartbeatError: !!heartbeatError,
        heartbeatErrorMessage: heartbeatError?.message || null,
        status: service.isRunning ? (hasHeartbeat && !heartbeatError ? 'healthy' : 'unhealthy') : 'stopped'
      };
    });
    
    res.json({ success: true, services: servicesWithHeartbeat });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 创建代理服务
app.post('/api/proxy/create', async (req, res) => {
  try {
    const { serviceName, targets, activeTarget } = req.body;
    
    // 检查服务名是否已存在
    const existingService = await database.getProxyServiceByName(serviceName);
    if (existingService) {
      return res.status(400).json({ success: false, error: '服务名称已存在' });
    }

    // 自动分配端口（4000-4100范围）
    const port = await database.getAvailablePort();

    const serviceConfig = { serviceName, port, targets, activeTarget };
    const createdService = await database.createProxyService(serviceConfig);

    console.log(`✅ 创建代理服务成功: ${serviceName} -> 端口 ${port}`);
    broadcast({ type: 'proxy_created', data: createdService });
    res.json({ success: true, service: createdService });
  } catch (error) {
    console.error('Failed to create proxy service:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 启动代理服务
app.post('/api/proxy/:id/start', async (req, res) => {
  try {
    const { id } = req.params;
    const service = await database.getProxyServiceById(id);
    
    if (!service) {
      return res.status(404).json({ success: false, error: '服务不存在' });
    }

    if (service.isRunning) {
      return res.status(400).json({ success: false, error: '服务已在运行中' });
    }

    await startProxyService(service);
    
    // 获取更新后的服务状态
    const updatedService = await database.getProxyServiceById(id);
    broadcast({ type: 'proxy_started', data: updatedService });
    
    res.json({ success: true, message: `代理服务 ${service.serviceName} 已启动` });
  } catch (error) {
    console.error('Failed to start proxy service:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 停止代理服务
app.post('/api/proxy/:id/stop', async (req, res) => {
  try {
    const { id } = req.params;
    const service = await database.getProxyServiceById(id);
    
    if (!service) {
      return res.status(404).json({ success: false, error: '服务不存在' });
    }

    if (!service.isRunning) {
      return res.status(400).json({ success: false, error: '服务未在运行' });
    }

    console.log(`开始停止代理服务: ${service.serviceName} (ID: ${id})`);
    
    // 先停止代理服务
    await stopProxyService(service);
    
    // 然后更新数据库状态
    await database.updateProxyService(id, { isRunning: false });
    console.log(`数据库状态已更新: ${service.serviceName} -> isRunning: false`);

    const updatedService = await database.getProxyServiceById(id);
    broadcast({ type: 'proxy_stopped', data: updatedService });
    
    console.log(`代理服务 ${service.serviceName} 已成功停止`);
    res.json({ success: true, message: `代理服务 ${service.serviceName} 已停止` });
  } catch (error) {
    console.error(`停止代理服务失败 (ID: ${req.params.id}):`, error);
    
    // 即使停止失败，也要尝试更新数据库状态
    try {
      await database.updateProxyService(req.params.id, { isRunning: false });
      console.log(`数据库状态已强制更新为停止状态`);
    } catch (dbError) {
      console.error('数据库状态更新也失败:', dbError);
    }
    
    res.status(500).json({ success: false, error: error.message });
  }
});

// 切换代理目标
app.post('/api/proxy/:id/switch', async (req, res) => {
  try {
    const { id } = req.params;
    const { activeTarget } = req.body;
    
    const service = await database.getProxyServiceById(id);
    if (!service) {
      return res.status(404).json({ success: false, error: '服务不存在' });
    }

    // 更新数据库
    await database.updateProxyService(id, { activeTarget });

    // 如果服务正在运行，需要重启以应用新的目标
    if (service.isRunning) {
      await stopProxyService(service);
      const updatedService = await database.getProxyServiceById(id);
      await startProxyService(updatedService);
    }

    const updatedService = await database.getProxyServiceById(id);
    broadcast({ type: 'proxy_switched', data: updatedService });

    res.json({ success: true, message: `代理目标已切换到 ${activeTarget}` });
  } catch (error) {
    console.error('Failed to switch proxy target:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新代理服务配置
app.put('/api/proxy/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const service = await database.getProxyServiceById(id);
    if (!service) {
      return res.status(404).json({ success: false, error: '服务不存在' });
    }

    // 如果服务正在运行，只能更新targets（添加新路由）
    if (service.isRunning) {
      const allowedUpdates = {};
      if (updates.targets) {
        allowedUpdates.targets = updates.targets;
      }
      if (Object.keys(allowedUpdates).length === 0) {
        return res.status(400).json({ success: false, error: '运行中的服务只能添加新的路由目标' });
      }
      await database.updateProxyService(id, allowedUpdates);
    } else {
      // 服务未运行时可以更新所有配置
      await database.updateProxyService(id, updates);
    }

    const updatedService = await database.getProxyServiceById(id);
    broadcast({ type: 'proxy_updated', data: updatedService });

    res.json({ success: true, service: updatedService });
  } catch (error) {
    console.error('Failed to update proxy service:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除代理服务
app.delete('/api/proxy/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const service = await database.getProxyServiceById(id);
    
    if (!service) {
      return res.status(404).json({ success: false, error: '服务不存在' });
    }

    // 如果服务正在运行，先停止它
    if (service.isRunning) {
      await stopProxyService(service);
    }

    // 清理服务日志
    clearServiceLogs(service.serviceName);

    await database.deleteProxyService(id);
    
    // 通知观察者服务已被删除
    serviceEventManager.notify('service_deleted', { 
      serviceId: id, 
      serviceName: service.serviceName 
    });
    
    broadcast({ type: 'proxy_deleted', data: { id, serviceName: service.serviceName } });
    
    res.json({ success: true, message: `代理服务 ${service.serviceName} 已删除` });
  } catch (error) {
    console.error('Failed to delete proxy service:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== 标签管理API =====

// 获取所有标签
app.get('/api/tags', async (req, res) => {
  try {
    const tags = await database.getAllTags();
    res.json({ success: true, data: tags });
  } catch (error) {
    console.error('Failed to get tags:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 创建新标签
app.post('/api/tags', async (req, res) => {
  try {
    const { name, color, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, error: '标签名称不能为空' });
    }
    
    const tag = await database.createTag({ name, color, description });
    broadcast({ type: 'tag_created', data: tag });
    
    res.json({ success: true, data: tag, message: `标签 ${name} 创建成功` });
  } catch (error) {
    console.error('Failed to create tag:', error);
    if (error.message.includes('UNIQUE constraint failed')) {
      res.status(400).json({ success: false, error: '标签名称已存在' });
    } else {
      res.status(500).json({ success: false, error: error.message });
    }
  }
});

// 更新标签
app.put('/api/tags/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, color, description } = req.body;
    
    const result = await database.updateTag(id, { name, color, description });
    
    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: '标签不存在' });
    }
    
    broadcast({ type: 'tag_updated', data: { id, name, color, description } });
    
    res.json({ success: true, message: `标签更新成功` });
  } catch (error) {
    console.error('Failed to update tag:', error);
    if (error.message.includes('UNIQUE constraint failed')) {
      res.status(400).json({ success: false, error: '标签名称已存在' });
    } else {
      res.status(500).json({ success: false, error: error.message });
    }
  }
});

// 删除标签
app.delete('/api/tags/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await database.deleteTag(id);
    
    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: '标签不存在' });
    }
    
    // 从所有服务中移除该标签
    const services = await database.getAllProxyServices();
    for (const service of services) {
      if (service.tags && service.tags.length > 0) {
        const tagName = await getTagNameById(id); // 需要实现这个辅助函数
        if (tagName && service.tags.includes(tagName)) {
          const updatedTags = service.tags.filter(tag => tag !== tagName);
          await database.updateProxyService(service.id, { tags: updatedTags });
        }
      }
    }
    
    broadcast({ type: 'tag_deleted', data: { id } });
    
    res.json({ success: true, message: `标签已删除` });
  } catch (error) {
    console.error('Failed to delete tag:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 为服务添加标签
app.post('/api/proxy/:id/tags', async (req, res) => {
  try {
    const { id } = req.params;
    const { tags } = req.body;
    
    if (!Array.isArray(tags)) {
      return res.status(400).json({ success: false, error: '标签必须是数组格式' });
    }
    
    const service = await database.getProxyServiceById(id);
    if (!service) {
      return res.status(404).json({ success: false, error: '服务不存在' });
    }
    
    // 合并标签，去重
    const currentTags = service.tags || [];
    const newTags = [...new Set([...currentTags, ...tags])];
    
    await database.updateProxyService(id, { tags: newTags });
    
    const updatedService = await database.getProxyServiceById(id);
    broadcast({ type: 'service_tags_updated', data: updatedService });
    
    res.json({ success: true, data: updatedService, message: `标签添加成功` });
  } catch (error) {
    console.error('Failed to add tags to service:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 从服务移除标签
app.delete('/api/proxy/:id/tags/:tagName', async (req, res) => {
  try {
    const { id, tagName } = req.params;
    
    const service = await database.getProxyServiceById(id);
    if (!service) {
      return res.status(404).json({ success: false, error: '服务不存在' });
    }
    
    const currentTags = service.tags || [];
    const newTags = currentTags.filter(tag => tag !== tagName);
    
    await database.updateProxyService(id, { tags: newTags });
    
    const updatedService = await database.getProxyServiceById(id);
    broadcast({ type: 'service_tags_updated', data: updatedService });
    
    res.json({ success: true, data: updatedService, message: `标签移除成功` });
  } catch (error) {
    console.error('Failed to remove tag from service:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 根据标签筛选服务
app.get('/api/proxy/filter/tags', async (req, res) => {
  try {
    const { tags } = req.query;
    let tagNames = [];
    
    if (tags) {
      tagNames = Array.isArray(tags) ? tags : tags.split(',');
    }
    
    const services = await database.getProxyServicesByTags(tagNames);
    res.json({ success: true, data: services });
  } catch (error) {
    console.error('Failed to filter services by tags:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 辅助函数

// 记录心跳数据（使用数据库存储）
async function recordHeartbeat(serviceName, port, status, message = null) {
  try {
    await database.recordHeartbeat(serviceName, port, status, message);
    
    // 获取最近的心跳历史用于广播
    const recentHistory = await database.getHeartbeatHistory(serviceName, port, 10);
    
    // 广播心跳数据更新
    broadcast({
      type: 'heartbeat_update',
      data: {
        serviceName,
        port,
        timestamp: new Date().toISOString(),
        status,
        message,
        history: recentHistory
      }
    });
  } catch (error) {
    console.error('记录心跳失败:', error);
  }
}

// 获取服务心跳历史（从数据库）
async function getHeartbeatHistory(serviceName, port) {
  try {
    return await database.getHeartbeatHistory(serviceName, port, 100);
  } catch (error) {
    console.error('获取心跳历史失败:', error);
    return [];
  }
}

// 清理服务心跳历史（从数据库）
async function clearHeartbeatHistory(serviceName, port) {
  try {
    await database.clearHeartbeatHistory(serviceName, port);
  } catch (error) {
    console.error('清理心跳历史失败:', error);
  }
}

// 清理所有内存缓存
function clearAllMemoryCaches() {
  console.log('🧹 清理运行时内存缓存...')
  
  // 清理心跳定时器
  for (const [key, timer] of heartbeatTimers) {
    clearInterval(timer)
  }
  heartbeatTimers.clear()
  
  // 清理心跳错误记录（这个仍然保留在内存中用于即时通知）
  heartbeatErrors.clear()
  
  // 清理WebSocket日志订阅者
  logSubscribers.clear()
  
  console.log('✅ 运行时缓存已清理完成')
}

// 重新构建proxyServers Map以同步数据库状态
async function rebuildProxyServersMap() {
  try {
    const services = await database.getAllProxyServices();
    
    // 获取当前运行中的服务器信息
    const currentServers = new Map(proxyServers);
    
    // 清空并重建 Map
    proxyServers.clear();
    
    for (const service of services) {
      if (service.isRunning) {
        const serverKey = `${service.serviceName}:${service.port}`;
        const existingServerInfo = currentServers.get(serverKey);
        
        if (existingServerInfo) {
          // 如果服务器仍在运行，保持原有的服务器实例，但更新服务对象
          proxyServers.set(serverKey, {
            ...existingServerInfo,
            service: service // 使用数据库中的最新服务状态
          });
        }
        // 如果数据库显示运行中但Map中没有，说明有不一致，这里暂不处理
        // 这种情况应该通过其他机制（如状态同步）来解决
      }
    }
    
    console.log(`Rebuilt proxyServers map with ${proxyServers.size} running services`);
  } catch (error) {
    console.error('Failed to rebuild proxyServers map:', error);
  }
}

// 根据标签ID获取标签名称
async function getTagNameById(tagId) {
  try {
    const tags = await database.getAllTags();
    const tag = tags.find(t => t.id === tagId);
    return tag ? tag.name : null;
  } catch (error) {
    console.error('Failed to get tag name by ID:', error);
    return null;
  }
}



// 获取本地IP地址（支持数据库配置覆盖）
async function getLocalIP() {
  try {
    // 1. 首先检查数据库中的配置
    const localIPConfig = await database.getLocalIPConfig();
    if (localIPConfig && localIPConfig.localIP) {
      console.log(`使用数据库配置的本机IP: ${localIPConfig.localIP}`);
      return localIPConfig.localIP;
    }
  } catch (error) {
    console.warn('获取数据库中的本机IP配置失败:', error.message);
  }

  // 2. 检查环境变量（优先级次高）
  if (process.env.LOCAL_IP) {
    console.log(`使用环境变量 LOCAL_IP: ${process.env.LOCAL_IP}`);
    return process.env.LOCAL_IP;
  }
  
  if (process.env.HOST_IP) {
    console.log(`使用环境变量 HOST_IP: ${process.env.HOST_IP}`);
    return process.env.HOST_IP;
  }
  
  const interfaces = os.networkInterfaces();
  
  // 3. 在容器环境中，优先查找以下网络接口
  const preferredInterfaces = ['eth0', 'ens3', 'ens4', 'ens5', 'enp0s3', 'enp0s8'];
  
  // 首先尝试查找首选的网络接口
  for (const interfaceName of preferredInterfaces) {
    const networkInterface = interfaces[interfaceName];
    if (networkInterface) {
      for (const iface of networkInterface) {
        if (iface.family === 'IPv4' && !iface.internal) {
          console.log(`使用首选网络接口 ${interfaceName} 的IP: ${iface.address}`);
          return iface.address;
        }
      }
    }
  }
  
  // 4. 如果没有找到首选接口，则查找所有非内部IPv4地址
  // 排除一些已知的内部网络接口
  const excludeInterfaces = ['lo', 'lo0', 'docker0', 'virbr0'];
  
  for (const name of Object.keys(interfaces)) {
    if (excludeInterfaces.includes(name)) {
      continue;
    }
    
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`使用备选网络接口 ${name} 的IP: ${iface.address}`);
        return iface.address;
      }
    }
  }
  
  // 5. 最后的fallback：查看Docker bridge网络（通常是172.17.0.x）
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && 
          (iface.address.startsWith('172.') || iface.address.startsWith('192.168.'))) {
        console.log(`使用Docker/私有网络接口 ${name} 的IP: ${iface.address}`);
        return iface.address;
      }
    }
  }
  
  // 6. 如果还是没有找到，返回localhost作为最终fallback
  console.warn('未找到可用的外部IP地址，使用 127.0.0.1 作为fallback');
  console.warn('建议在系统配置中设置本机IP地址');
  return '127.0.0.1';
}

// 统一生成实例ID的函数
async function generateInstanceId(serviceName, port) {
  const localIP = await getLocalIP();
  return `${localIP}:${serviceName}:${port}`;
}

async function registerToEureka(serviceName, port) {
  try {
    // 确保使用最新的Eureka配置
    const latestEurekaConfig = await database.getEurekaConfig();
    if (latestEurekaConfig) {
      config.eureka = { ...config.eureka, ...latestEurekaConfig };
    }
    
    const localIP = await getLocalIP();
    const instanceId = await generateInstanceId(serviceName, port);
    const eurekaUrl = `http://${config.eureka.host}:${config.eureka.port}/eureka/apps/${serviceName.toUpperCase()}`;
    
    const instance = {
      instance: {
        instanceId: instanceId,
        hostName: localIP,
        app: serviceName.toUpperCase(),
        ipAddr: localIP,
        vipAddress: serviceName,
        status: 'UP',
        port: {
          '$': port,
          '@enabled': true
        },
        dataCenterInfo: {
          '@class': 'com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo',
          name: 'MyOwn'
        }
      }
    };

    await axios.post(eurekaUrl, instance, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log(`Service ${serviceName} registered to Eureka with local IP ${localIP}:${port} via Eureka server ${config.eureka.host}:${config.eureka.port}`);
  } catch (error) {
    console.error(`Failed to register ${serviceName} to Eureka:`, error.message);
  }
}

async function startProxyService(service, options = {}) {
  const { serviceName, port, targets, activeTarget } = service;
  const serverKey = `${serviceName}:${port}`;
  const { skipEurekaCheck = false } = options;
  
  if (proxyServers.has(serverKey)) {
    throw new Error('服务已在运行中');
  }
  
  // 检查Eureka是否可用（除非跳过检查）
  if (!skipEurekaCheck && isEurekaAvailable === false) {
    throw new Error('Eureka服务不可用，无法启动代理服务');
  }

  const proxyApp = express();
  
  // 添加请求体解析中间件
  proxyApp.use(express.json({ limit: '50mb' }));
  proxyApp.use(express.urlencoded({ extended: true, limit: '50mb' }));
  
  const proxyConfig = {
    target: targets[activeTarget],
    changeOrigin: true,
    pathRewrite: {
      '^/': '/'
    },
    timeout: 30000, // 30秒超时
    proxyTimeout: 30000, // 代理超时
    secure: true, // 支持HTTPS
    followRedirects: true,
    logLevel: 'debug',
    onError: (err, req, res) => {
      console.error(`Proxy error for ${serviceName}:`, err.message);
      
      // 记录错误日志（异步执行，不等待）
      logProxyRequest(serviceName, {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.url,
        target: targets[activeTarget],
        status: 'ERROR',
        error: err.message,
        requestBody: req.body,
        responseBody: { error: 'Proxy error', message: err.message }
      }).catch(err => console.error('记录错误日志失败:', err));
      
      res.status(500).json({ error: 'Proxy error', message: err.message });
    },
    onProxyReq: (proxyReq, req, res) => {
      console.log(`Proxying ${req.method} ${req.url} to ${targets[activeTarget]}`);
      
      // 确保请求体被正确写入到代理请求中
      if (req.body && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
        const bodyData = JSON.stringify(req.body);
        proxyReq.setHeader('Content-Type', 'application/json');
        proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
        proxyReq.write(bodyData);
      }
      
      // 记录请求开始
      req.startTime = Date.now();
      req.proxyLogData = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.url,
        target: targets[activeTarget],
        requestHeaders: req.headers,
        requestBody: req.body
      };
    },
    onProxyRes: (proxyRes, req, res) => {
      const duration = Date.now() - req.startTime;
      
      // 捕获响应体
      let responseBody = '';
      const chunks = [];
      
      proxyRes.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      proxyRes.on('end', () => {
        responseBody = Buffer.concat(chunks).toString();
        
        let parsedResponseBody = null;
        try {
          parsedResponseBody = JSON.parse(responseBody);
        } catch (e) {
          parsedResponseBody = responseBody;
        }
        
        // 记录完整的请求日志（异步执行，不等待）
        logProxyRequest(serviceName, {
          ...req.proxyLogData,
          status: proxyRes.statusCode,
          duration,
          responseHeaders: proxyRes.headers,
          responseBody: parsedResponseBody
        }).catch(err => console.error('记录请求日志失败:', err));
      });
    }
  };

  proxyApp.use('/', createProxyMiddleware(proxyConfig));
  
  const proxyServer = proxyApp.listen(port, () => {
    console.log(`Proxy service ${serviceName} started on port ${port} -> ${targets[activeTarget]}`);
  });

  // 跟踪活动连接以便优雅关闭
  const connections = new Set();
  
  proxyServer.on('connection', (socket) => {
    connections.add(socket);
    socket.on('close', () => {
      connections.delete(socket);
    });
  });

  // 添加强制关闭所有连接的方法
  proxyServer.closeAllConnections = () => {
    console.log(`强制关闭 ${connections.size} 个连接: ${serviceName}:${port}`);
    for (const socket of connections) {
      socket.destroy();
    }
    connections.clear();
  };

  // 添加端口跟踪
  processManager.trackPort(port);
  
  // 更新数据库状态为运行中
  await database.updateProxyService(service.id, { isRunning: true });
  
  proxyServers.set(serverKey, {
    server: proxyServer,
    service: service,
    connections: connections
  });
  
  // 重建Map以同步数据库状态
  await rebuildProxyServersMap();


  
  // 注册到Eureka并启动心跳
  await registerToEureka(serviceName, port);
  startEurekaHeartbeat(serviceName, port);
  
  // 广播状态更新
  broadcast({ 
    type: 'proxy_started', 
    data: { id: service.id, serviceName, port } 
  });
}

async function stopProxyService(service) {
  const { serviceName, port } = service;
  const serverKey = `${serviceName}:${port}`;
  
  const proxyInfo = proxyServers.get(serverKey);
  if (proxyInfo) {
    try {
      console.log(`正在关闭代理服务: ${serviceName}:${port}`);
      
      // 停止心跳
      await stopEurekaHeartbeat(serviceName, port);
      
      // 使用回调方式安全关闭服务器
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.warn(`强制关闭代理服务超时: ${serviceName}:${port}`);
          resolve();
        }, 10000); // 10秒超时
        
        proxyInfo.server.close((err) => {
          clearTimeout(timeout);
          if (err) {
            console.error(`Error closing proxy server ${serviceName}:`, err);
            // 即使关闭失败，也继续执行清理操作
          } else {
            console.log(`代理服务已关闭: ${serviceName}:${port}`);
          }
          resolve();
        });
        
        // 强制关闭所有连接
        if (proxyInfo.server.listening) {
          // 获取服务器的所有连接并强制关闭
          proxyInfo.server.closeAllConnections && proxyInfo.server.closeAllConnections();
        }
      });
      
      // 从Map中删除
      proxyServers.delete(serverKey);
      
      // 停止端口跟踪
      processManager.untrackPort(port);
      
      // 从Eureka注销
      await unregisterFromEureka(serviceName, port);
      
      // 更新数据库状态为已停止
      await database.updateProxyService(service.id, { isRunning: false });
      
      // 重建Map以同步数据库状态
      await rebuildProxyServersMap();
      
      // 广播状态更新
      broadcast({ 
        type: 'proxy_stopped', 
        data: { id: service.id, serviceName, port } 
      });
      
      console.log(`Proxy service ${serviceName} stopped successfully`);
    } catch (error) {
      console.error(`Error stopping proxy service ${serviceName}:`, error);
      // 确保清理操作完成
      proxyServers.delete(serverKey);
      await stopEurekaHeartbeat(serviceName, port);
      throw error;
    }
  }
}

async function unregisterFromEureka(serviceName, port) {
  try {
    const instanceId = await generateInstanceId(serviceName, port);
    const eurekaUrl = `http://${config.eureka.host}:${config.eureka.port}/eureka/apps/${serviceName.toUpperCase()}/${instanceId}`;
    
    await axios.delete(eurekaUrl, {
      timeout: 5000 // 5秒超时
    });
    console.log(`Service ${serviceName} unregistered from Eureka`);
  } catch (error) {
    console.error(`Failed to unregister ${serviceName} from Eureka:`, error.message);
    // 注销失败不应该阻止服务停止
  }
}

// 启动Eureka心跳
function startEurekaHeartbeat(serviceName, port) {
  const heartbeatKey = `${serviceName}:${port}`;
  
  // 如果已经有心跳定时器，先清除
  if (heartbeatTimers.has(heartbeatKey)) {
    clearInterval(heartbeatTimers.get(heartbeatKey));
  }
  
  // 启动心跳定时器
  const heartbeatInterval = setInterval(async () => {
    try {
      await sendEurekaHeartbeat(serviceName, port);
    } catch (error) {
      console.error(`Heartbeat failed for ${serviceName}:`, error.message);
    }
  }, config.eureka.heartbeatInterval * 1000); // 配置的心跳间隔
  
  heartbeatTimers.set(heartbeatKey, heartbeatInterval);
  console.log(`Started Eureka heartbeat for ${serviceName} on port ${port}`);
}

// 停止Eureka心跳
async function stopEurekaHeartbeat(serviceName, port) {
  const heartbeatKey = `${serviceName}:${port}`;
  
  if (heartbeatTimers.has(heartbeatKey)) {
    clearInterval(heartbeatTimers.get(heartbeatKey));
    heartbeatTimers.delete(heartbeatKey);
    console.log(`Stopped Eureka heartbeat for ${serviceName} on port ${port}`);
  }
  
  // 清理心跳错误记录
  if (heartbeatErrors.has(heartbeatKey)) {
    heartbeatErrors.delete(heartbeatKey);
  }
  
  // 清理心跳历史数据
  await clearHeartbeatHistory(serviceName, port);
}

// 发送Eureka心跳
async function sendEurekaHeartbeat(serviceName, port) {
  const serverKey = `${serviceName}:${port}`;
  
  try {
    const instanceId = await generateInstanceId(serviceName, port);
    const heartbeatUrl = `http://${config.eureka.host}:${config.eureka.port}/eureka/apps/${serviceName.toUpperCase()}/${instanceId}`;
    
    // 发送PUT请求作为心跳
    await axios.put(heartbeatUrl, null, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000 // 5秒超时
    });
    
    // 记录成功的心跳
    await recordHeartbeat(serviceName, port, 'success');
    
    // 心跳成功，清除错误记录
    if (heartbeatErrors.has(serverKey)) {
      heartbeatErrors.delete(serverKey);
      console.log(`Heartbeat recovered for ${serviceName} on port ${port}`);
      
      // 广播状态更新
      broadcast({
        type: 'heartbeat_recovered',
        serviceName,
        port,
        message: `服务 ${serviceName} 心跳已恢复`
      });
    } else {
      console.log(`Heartbeat sent for ${serviceName} on port ${port}`);
    }
  } catch (error) {
    // 记录失败的心跳
    const status = error.code === 'ECONNABORTED' ? 'timeout' : 'error';
    await recordHeartbeat(serviceName, port, status, error.message);
    
    // 心跳失败，记录错误信息
    const errorInfo = {
      message: error.message,
      timestamp: new Date().toISOString(),
      code: error.response?.status || 'NETWORK_ERROR'
    };
    
    const wasHealthy = !heartbeatErrors.has(serverKey);
    heartbeatErrors.set(serverKey, errorInfo);
    
    console.error(`Failed to send heartbeat for ${serviceName}: ${error.message}`);
    
    // 如果是首次出现错误，广播状态变更
    if (wasHealthy) {
      broadcast({
        type: 'heartbeat_failed',
        serviceName,
        port,
        error: errorInfo,
        message: `服务 ${serviceName} 心跳失败`
      });
    }
  }
}

// 启动定期数据清理任务
function startDataCleanupTask() {
  console.log('🧹 启动定期数据清理任务...');
  
  // 每24小时清理一次旧数据
  setInterval(async () => {
    try {
      console.log('🧹 开始清理旧数据...');
      
      // 清理旧的心跳历史（保留最近1000条）
      await database.cleanupOldHeartbeatHistory(1000);
      
      // 清理旧的代理日志（保留最近10000条）
      await database.cleanupOldProxyLogs(10000);
      
      console.log('✅ 旧数据清理完成');
    } catch (error) {
      console.error('❌ 清理旧数据失败:', error);
    }
  }, 24 * 60 * 60 * 1000); // 24小时间隔
}

// 启动Eureka健康检查
function startEurekaHealthCheck() {
  console.log('🔍 启动Eureka健康检查监控...');
  
  // 每30秒检查一次Eureka健康状态
  eurekaHealthCheckTimer = setInterval(async () => {
    try {
      const currentTime = Date.now();
      const available = await checkEurekaAvailability();
      
      if (available) {
        // Eureka可用，重置不可用开始时间
        if (eurekaUnavailableStartTime) {
          const unavailableDuration = (currentTime - eurekaUnavailableStartTime) / 1000;
          console.log(`✅ Eureka服务恢复可用 (不可用持续时间: ${unavailableDuration.toFixed(1)}秒)`);
          eurekaUnavailableStartTime = null;
          
          // 广播恢复通知
          broadcast({
            type: 'eureka_health_recovered',
            message: `Eureka服务已恢复可用`,
            unavailableDuration: unavailableDuration
          });
        }
      } else {
        // Eureka不可用
        if (!eurekaUnavailableStartTime) {
          // 第一次检测到不可用
          eurekaUnavailableStartTime = currentTime;
          console.log('⚠️ 检测到Eureka服务不可用，开始计时...');
          
          broadcast({
            type: 'eureka_health_warning',
            message: 'Eureka服务不可用，正在监控中...',
            startTime: eurekaUnavailableStartTime
          });
        } else {
          // 已经不可用一段时间了
          const unavailableDuration = (currentTime - eurekaUnavailableStartTime) / 1000;
          const maxUnavailableTime = 3 * 60; // 3分钟
          
          console.log(`⚠️ Eureka持续不可用 ${unavailableDuration.toFixed(1)}秒 (最大允许: ${maxUnavailableTime}秒)`);
          
          // 广播状态更新
          broadcast({
            type: 'eureka_health_status',
            message: `Eureka不可用已持续 ${Math.floor(unavailableDuration)}秒`,
            unavailableDuration: unavailableDuration,
            maxAllowedTime: maxUnavailableTime,
            remainingTime: Math.max(0, maxUnavailableTime - unavailableDuration)
          });
          
          // 如果超过3分钟，自动终止所有服务
          if (unavailableDuration >= maxUnavailableTime && !isEurekaShutdownTriggered) {
            console.error(`🚨 Eureka服务不可用超过${maxUnavailableTime}秒，自动终止所有代理服务...`);
            isEurekaShutdownTriggered = true;
            
            // 广播紧急关闭通知
            broadcast({
              type: 'eureka_emergency_shutdown',
              message: `Eureka服务不可用超过${maxUnavailableTime}秒，系统自动终止所有代理服务`,
              unavailableDuration: unavailableDuration,
              reason: 'eureka_timeout'
            });
            
            // 执行关闭操作
            await shutdownAllProxyServicesForEureka();
            
            // 重置状态，以便下次可以重新触发
            setTimeout(() => {
              isEurekaShutdownTriggered = false;
              console.log('🔄 重置Eureka关闭触发状态，允许下次自动关闭');
            }, 60000); // 1分钟后重置，避免频繁触发
          }
        }
      }
    } catch (error) {
      console.error('Eureka健康检查失败:', error);
    }
  }, 30000); // 30秒间隔
}

// 停止Eureka健康检查
function stopEurekaHealthCheck() {
  if (eurekaHealthCheckTimer) {
    clearInterval(eurekaHealthCheckTimer);
    eurekaHealthCheckTimer = null;
    eurekaUnavailableStartTime = null;
    console.log('🛑 Eureka健康检查已停止');
  }
}

// 初始化端口范围配置
async function initializePortRangeConfig() {
  try {
    // 检查是否已有端口范围配置
    const existingConfig = await database.getPortRangeConfig();
    
    if (!existingConfig) {
      // 从环境变量读取端口范围配置
      const startPort = parseInt(process.env.PORT_RANGE_START) || 4000;
      const endPort = parseInt(process.env.PORT_RANGE_END) || 4100;
      
      // 验证端口范围
      if (startPort >= endPort) {
        throw new Error('起始端口必须小于结束端口');
      }
      
      if (startPort < 1 || endPort > 65535) {
        throw new Error('端口范围必须在1-65535之间');
      }
      
      const portRangeConfig = {
        startPort: startPort,
        endPort: endPort,
        totalPorts: endPort - startPort + 1,
        description: '代理服务端口范围配置',
        createdAt: new Date().toISOString()
      };
      
      await database.setPortRangeConfig(portRangeConfig);
      console.log(`🔧 端口范围配置初始化完成: ${startPort}-${endPort} (${portRangeConfig.totalPorts}个端口)`);
      
      // 如果是从环境变量设置的，给出Docker run命令提示
      if (process.env.PORT_RANGE_START || process.env.PORT_RANGE_END) {
        console.log(`💡 请确保Docker容器映射了端口范围: -p ${startPort}-${endPort}:${startPort}-${endPort}`);
      }
    } else {
      console.log(`✅ 端口范围配置已存在: ${existingConfig.startPort}-${existingConfig.endPort} (${existingConfig.totalPorts}个端口)`);
    }
  } catch (error) {
    console.error('❌ 初始化端口范围配置失败:', error);
    // 使用默认配置
    const defaultConfig = {
      startPort: 4000,
      endPort: 4100,
      totalPorts: 101,
      description: '默认端口范围配置',
      createdAt: new Date().toISOString()
    };
    await database.setPortRangeConfig(defaultConfig);
    console.log('🔧 使用默认端口范围配置: 4000-4100');
  }
}

// 启动状态同步检查
async function startStatusSync() {
  console.log('启动Eureka状态同步检查...');
  
  // 立即执行一次同步
  await syncServicesWithEureka();
  
  // 每60秒检查一次代理服务状态
  statusSyncTimer = setInterval(async () => {
    try {
      await syncServicesWithEureka();
    } catch (error) {
      console.error('状态同步检查失败:', error);
    }
  }, 60000); // 60秒间隔
}

// 停止状态同步检查
function stopStatusSync() {
  if (statusSyncTimer) {
    clearInterval(statusSyncTimer);
    statusSyncTimer = null;
    console.log('状态同步检查已停止');
  }
}



// 记录代理请求日志（使用数据库存储）
async function logProxyRequest(serviceName, logData) {
  try {
    // 保存到数据库
    const result = await database.logProxyRequest(serviceName, logData);
    
    // 创建带ID的日志对象用于广播
    const logWithId = {
      id: result.id,
      ...logData
    };
    
    // 推送给订阅者
    const subscribers = logSubscribers.get(serviceName);
    if (subscribers && subscribers.size > 0) {
      const message = JSON.stringify({
        type: 'new_log',
        serviceName,
        log: logWithId
      });
      
      subscribers.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      });
    }
  } catch (error) {
    console.error('记录代理日志失败:', error);
  }
}

// 获取服务日志（从数据库）
async function getServiceLogs(serviceName, limit = 100) {
  try {
    return await database.getServiceLogs(serviceName, limit);
  } catch (error) {
    console.error('获取服务日志失败:', error);
    return [];
  }
}

// 清理服务日志（从数据库）
async function clearServiceLogs(serviceName) {
  try {
    await database.clearServiceLogs(serviceName);
    // 不需要清理 logSubscribers，这是WebSocket连接状态
  } catch (error) {
    console.error('清理服务日志失败:', error);
  }
}

// 因Eureka不可用而关闭所有代理服务
async function shutdownAllProxyServicesForEureka() {
  try {
    console.log('🔄 开始关闭所有代理服务...');
    
    // 获取所有运行中的代理服务
    const runningServices = await database.getAllProxyServices();
    const activeServices = runningServices.filter(service => service.isRunning);
    
    if (activeServices.length === 0) {
      console.log('没有运行中的代理服务需要关闭');
      return;
    }
    
    console.log(`发现 ${activeServices.length} 个运行中的服务，开始逐个关闭...`);
    
    // 停止所有代理服务
    const shutdownPromises = activeServices.map(async (service) => {
      try {
        console.log(`关闭服务: ${service.serviceName}:${service.port}`);
        await stopProxyService(service);
        await database.updateProxyService(service.id, { isRunning: false });
        console.log(`✅ ${service.serviceName} 已关闭`);
        return { success: true, serviceName: service.serviceName };
      } catch (error) {
        console.error(`❌ 关闭服务 ${service.serviceName} 失败:`, error);
        return { success: false, serviceName: service.serviceName, error: error.message };
      }
    });
    
    const results = await Promise.all(shutdownPromises);
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    console.log(`🎯 代理服务关闭完成: 成功 ${successCount} 个, 失败 ${failCount} 个`);
    
    // 广播通知到所有WebSocket客户端
    const message = {
      type: 'eureka_unavailable_shutdown',
      message: `检测到Eureka服务器不可用，已自动关闭所有代理服务`,
      details: {
        totalServices: activeServices.length,
        successCount,
        failCount,
        timestamp: new Date().toISOString()
      }
    };
    
    broadcast(message);
    console.log('📢 已通知所有客户端');
    
  } catch (error) {
    console.error('❌ 自动关闭代理服务过程出错:', error);
    
    // 即使出错也要通知客户端
    broadcast({
      type: 'eureka_unavailable_shutdown_error',
      message: `检测到Eureka服务器不可用，但自动关闭代理服务时发生错误`,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

// 同步服务状态与Eureka
async function syncServicesWithEureka() {
  try {
    console.log('开始同步服务状态...');
    
    // 获取Eureka服务列表
    const eurekaServices = await getEurekaServices();
    const allProxyServices = await database.getAllProxyServices();
    
    let hasChanges = false;
    
    for (const proxyService of allProxyServices) {
      const { serviceName, port, isRunning } = proxyService;
      
      // 在Eureka中查找对应的服务实例
      const eurekaService = eurekaServices.find(service => 
        service.name.toLowerCase() === serviceName.toLowerCase()
      );
      
      let actuallyRunning = false;
      
      if (eurekaService) {
        const instances = Array.isArray(eurekaService.instance) 
          ? eurekaService.instance 
          : [eurekaService.instance];
        
        // 检查是否有匹配端口和状态为UP的实例
        actuallyRunning = instances.some(instance => 
          instance && 
          instance.port && 
          instance.port['$'] == port && 
          instance.status === 'UP'
        );
      }
      
      // 检查本地代理服务器状态
      const serverKey = `${serviceName}:${port}`;
      const localRunning = proxyServers.has(serverKey);
      
      // 如果数据库记录的状态与实际状态不一致，更新数据库
      if (isRunning !== actuallyRunning || isRunning !== localRunning) {
        console.log(`服务状态不一致 ${serviceName}:${port} - DB:${isRunning}, Eureka:${actuallyRunning}, Local:${localRunning}`);
        
        // 优先以本地代理服务器状态为准
        const correctStatus = localRunning;
        
        if (isRunning !== correctStatus) {
          await database.updateProxyService(proxyService.id, { isRunning: correctStatus });
          console.log(`更新服务状态: ${serviceName} -> ${correctStatus ? '运行中' : '已停止'}`);
          
          // 通过WebSocket广播状态变更
          const updatedService = await database.getProxyServiceById(proxyService.id);
          broadcast({ 
            type: 'service_status_synced', 
            data: updatedService,
            message: `服务 ${serviceName} 状态已同步为 ${correctStatus ? '运行中' : '已停止'}`
          });
          
          hasChanges = true;
        }
        
        // 如果本地没有运行但Eureka有记录，可能需要清理心跳定时器
        if (!localRunning && heartbeatTimers.has(serverKey)) {
          await stopEurekaHeartbeat(serviceName, port);
        }
      }
    }
    
    if (hasChanges) {
      console.log('服务状态同步完成，有状态变更');
    } else {
      console.log('服务状态同步完成，无状态变更');
    }
    
  } catch (error) {
    console.error('同步服务状态失败:', error);
  }
}

// 优雅关闭处理
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    console.log('已在关闭过程中，忽略信号:', signal);
    return;
  }
  
  isShuttingDown = true;
  console.log(`\n收到 ${signal} 信号，开始优雅关闭...`);
  
  try {
    // 1. 停止接受新的HTTP请求
    server.close(() => {
      console.log('HTTP服务器已停止接受新连接');
    });
    
    // 2. 停止状态同步和健康检查
    stopStatusSync();
    stopEurekaHealthCheck();
    console.log('状态同步和健康检查已停止');
    
    // 3. 清理所有心跳定时器
    for (const [key, timer] of heartbeatTimers) {
      clearInterval(timer);
    }
    heartbeatTimers.clear();
    console.log('所有心跳定时器已清理');
    
    // 4. 停止所有代理服务
    console.log(`正在停止 ${proxyServers.size} 个代理服务...`);
    const stopPromises = [];
    const serviceList = Array.from(proxyServers.values());
    
    for (const proxyInfo of serviceList) {
      console.log(`- 准备停止: ${proxyInfo.service.serviceName}:${proxyInfo.service.port}`);
      stopPromises.push(stopProxyService(proxyInfo.service));
    }
    
    // 等待所有代理服务关闭，但设置超时
    await Promise.race([
      Promise.all(stopPromises),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('停止代理服务超时')), 30000)
      )
    ]);
    
    console.log('所有代理服务已停止');
    
    // 5. 更新数据库中所有服务状态为停止
    try {
      const allServices = await database.getAllProxyServices();
      const updatePromises = allServices
        .filter(service => service.isRunning)
        .map(service => database.updateProxyService(service.id, { isRunning: false }));
      
      await Promise.all(updatePromises);
      console.log('数据库服务状态已更新');
    } catch (dbError) {
      console.error('更新数据库状态失败:', dbError);
    }
    
    // 6. 关闭数据库连接
    database.close();
    console.log('数据库连接已关闭');
    
    console.log('✅ 所有服务已安全关闭');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ 关闭服务时出错:', error);
    
          // 强制关闭所有剩余的代理服务
      console.log('正在强制关闭剩余服务...');
      for (const [key, proxyInfo] of proxyServers) {
        try {
          if (proxyInfo.server && proxyInfo.server.listening) {
            proxyInfo.server.close();
            console.log(`强制关闭: ${key}`);
          }
        } catch (err) {
          console.error(`强制关闭失败 ${key}:`, err);
        }
      }
      
      // 使用进程管理器强制清理所有跟踪的端口
      console.log('使用进程管理器强制清理端口...');
      await processManager.cleanupAllTrackedPorts();
    
    // 强制更新数据库状态
    try {
      const allServices = await database.getAllProxyServices();
      for (const service of allServices) {
        if (service.isRunning) {
          await database.updateProxyService(service.id, { isRunning: false });
        }
      }
      console.log('强制更新数据库状态完成');
    } catch (dbError) {
      console.error('强制更新数据库状态失败:', dbError);
    }
    
    database.close();
    process.exit(1);
  }
}

// 监听多种关闭信号
process.on('SIGINT', () => gracefulShutdown('SIGINT'));   // Ctrl+C
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // 正常终止

// Windows平台特殊处理
if (process.platform === 'win32') {
  // Windows下监听控制台事件
  process.on('SIGBREAK', () => gracefulShutdown('SIGBREAK')); // Ctrl+Break
  
  // 尝试处理Windows控制台关闭事件（需要额外的库，这里提供备选方案）
  const readline = require('readline');
  if (process.stdin.isTTY) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.on('SIGINT', () => gracefulShutdown('SIGINT'));
    rl.on('close', () => {
      console.log('控制台已关闭，正在清理资源...');
      gracefulShutdown('CONSOLE_CLOSE');
    });
  }
} else {
  // Unix/Linux平台
  process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));   // 终端关闭
  process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT')); // Quit信号
}

// 捕获未处理的异常
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  // 不要自动退出，只记录错误
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
  // 不要自动退出，只记录错误
});

const PORT = process.env.PORT || 3400;
server.listen(PORT, () => {
  console.log(`Switch Service server running on port ${PORT}`);
});

// 静态文件服务（生产环境）
const path = require('path');
const clientDistPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientDistPath));

// 前端路由 history fallback
app.get(/^\/(?!api|ws).*/, (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// 获取本机IP配置
app.get('/api/config/local-ip', async (req, res) => {
  try {
    let localIPConfig = await database.getLocalIPConfig();
    
    // 检查配置是否有效
    if (!localIPConfig || typeof localIPConfig !== 'object' || !localIPConfig.localIP) {
      console.log('本机IP配置无效或不存在，自动设置默认值');
      
      // 获取本机IP
      const detectedIP = await getLocalIP();
      localIPConfig = { localIP: detectedIP };
      
      // 保存到数据库
      await database.setLocalIPConfig(localIPConfig);
      console.log(`已自动设置本机IP配置: ${detectedIP}`);
    }
    
    res.json({ 
      success: true, 
      config: localIPConfig
    });
  } catch (error) {
    console.error('获取本机IP配置失败:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 更新本机IP配置
app.post('/api/config/local-ip', async (req, res) => {
  try {
    const { localIP } = req.body;
    
    if (!localIP) {
      return res.status(400).json({ 
        success: false, 
        error: '请提供有效的本机IP地址' 
      });
    }
    
    // 简单的IP格式验证
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(localIP)) {
      return res.status(400).json({ 
        success: false, 
        error: '请提供有效的IP地址格式' 
      });
    }
    
    const localIPConfig = { localIP };
    await database.setLocalIPConfig(localIPConfig);
    
    console.log('本机IP配置已更新并保存到数据库:', localIPConfig);
    
    res.json({ 
      success: true, 
      config: localIPConfig,
      message: '本机IP配置已更新并保存到数据库'
    });
  } catch (error) {
    console.error('更新本机IP配置失败:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 获取可用端口
app.get('/api/ports/available', async (req, res) => {
  try {
    const availablePort = await database.getAvailablePort();
    res.json({ 
      success: true, 
      port: availablePort 
    });
  } catch (error) {
    console.error('获取可用端口失败:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 获取端口使用情况统计
app.get('/api/ports/usage', async (req, res) => {
  try {
    const stats = await database.getPortUsageStats();
    res.json({ 
      success: true, 
      stats: stats 
    });
  } catch (error) {
    console.error('获取端口使用情况失败:', error);
    
    // 如果是JSON解析错误，返回默认值
    if (error.message.includes('not valid JSON')) {
      console.log('端口范围配置损坏，使用默认配置');
      const defaultStats = {
        startPort: 4000,
        endPort: 4100,
        totalPorts: 101,
        usedPorts: [],
        usedCount: 0,
        availablePorts: Array.from({ length: 101 }, (_, i) => 4000 + i),
        availableCount: 101
      };
      
      res.json({ 
        success: true, 
        stats: defaultStats 
      });
      return;
    }
    
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 获取端口范围配置
app.get('/api/config/port-range', async (req, res) => {
  try {
    let config = await database.getPortRangeConfig();
    
    // 如果配置为空或无效，设置默认配置
    if (!config || typeof config !== 'object') {
      console.log('端口范围配置无效，设置默认配置');
      config = {
        startPort: 4000,
        endPort: 4100,
        totalPorts: 101,
        description: '默认端口范围配置',
        updatedAt: new Date().toISOString()
      };
      
      // 保存默认配置
      await database.setPortRangeConfig(config);
    }
    
    res.json({ success: true, data: config });
  } catch (error) {
    console.error('获取端口范围配置失败:', error);
    
    // 如果是JSON解析错误，返回默认配置
    if (error.message.includes('not valid JSON')) {
      console.log('端口范围配置损坏，返回默认配置');
      const defaultConfig = {
        startPort: 4000,
        endPort: 4100,
        totalPorts: 101,
        description: '默认端口范围配置',
        updatedAt: new Date().toISOString()
      };
      
      res.json({ success: true, data: defaultConfig });
      return;
    }
    
    res.status(500).json({ success: false, error: error.message });
  }
});

// 设置端口范围配置
app.post('/api/config/port-range', async (req, res) => {
  try {
    const { startPort, endPort, description } = req.body;
    
    // 验证输入
    if (!startPort || !endPort || typeof startPort !== 'number' || typeof endPort !== 'number') {
      return res.status(400).json({ success: false, error: '端口参数无效' });
    }
    
    if (startPort >= endPort) {
      return res.status(400).json({ success: false, error: '起始端口必须小于结束端口' });
    }
    
    if (startPort < 1 || endPort > 65535) {
      return res.status(400).json({ success: false, error: '端口范围必须在1-65535之间' });
    }
    
    // 检查是否有服务使用了范围外的端口
    const portStats = await database.getPortUsageStats();
    const invalidPorts = portStats.usedPorts.filter(port => port < startPort || port > endPort);
    if (invalidPorts.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: `有${invalidPorts.length}个服务使用了新范围外的端口: ${invalidPorts.join(', ')}，请先停止这些服务`
      });
    }
    
    const config = {
      startPort: startPort,
      endPort: endPort,
      totalPorts: endPort - startPort + 1,
      description: description || '',
      updatedAt: new Date().toISOString()
    };
    
    await database.setPortRangeConfig(config);
    
    console.log(`🔧 端口范围配置更新: ${startPort}-${endPort} (${config.totalPorts}个端口)`);
    console.log(`💡 请确保Docker容器映射了端口范围: -p ${startPort}-${endPort}:${startPort}-${endPort}`);
    
    res.json({ 
      success: true, 
      message: '端口范围配置保存成功',
      dockerCommand: `docker run -p 3400:3400 -p ${startPort}-${endPort}:${startPort}-${endPort} your-image`
    });
  } catch (error) {
    console.error('设置端口范围配置失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = app; 