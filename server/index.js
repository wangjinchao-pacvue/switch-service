const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { createProxyMiddleware } = require('http-proxy-middleware');
const WebSocket = require('ws');
const http = require('http');
const database = require('./database');
const processManager = require('./process-manager');
const serviceEventManager = require('./serviceEventManager');
const autoStartManager = require('./autoStartManager');
const os = require('os');

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

let proxyServers = new Map(); // 存储运行中的代理服务器
let heartbeatTimers = new Map(); // 存储Eureka心跳定时器
let heartbeatErrors = new Map(); // 存储心跳错误信息 {serviceName:port -> errorInfo}
let heartbeatHistory = new Map(); // 存储心跳历史数据 {serviceName:port -> [{timestamp, status, message}...]}
let statusSyncTimer = null; // 状态同步定时器
let proxyLogs = new Map(); // 存储代理服务日志 {serviceName: [logs...]}
let logSubscribers = new Map(); // 存储日志订阅者 {serviceName: Set<ws>}
let eurekaUnavailableCount = 0; // Eureka不可用计数器
let isEurekaShutdownTriggered = false; // 是否已触发Eureka关闭

// 初始化数据库
database.init().then(async () => {
  console.log('数据库初始化完成');
  
  // 初始化自动启动管理器
  await autoStartManager.init();
  
  // 启动时恢复运行中的代理服务
  await restoreRunningServices();
  
  // 执行自动启动
  try {
    const autoStartResult = await autoStartManager.executeAutoStart(startProxyService);
    if (autoStartResult) {
      console.log(`Auto-start execution result:`, autoStartResult);
    }
  } catch (error) {
    console.error('Failed to execute auto-start:', error);
  }
}).catch(err => {
  console.error('数据库初始化失败:', err);
  process.exit(1);
});

// WebSocket连接处理
wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleWebSocketMessage(ws, data);
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
function handleWebSocketMessage(ws, data) {
  const { type, serviceName } = data;
  
  switch (type) {
    case 'subscribe_logs':
      subscribeToLogs(ws, serviceName);
      break;
    case 'unsubscribe_logs':
      unsubscribeFromLogs(ws, serviceName);
      break;
    default:
      console.log('Unknown WebSocket message type:', type);
  }
}

// 订阅日志
function subscribeToLogs(ws, serviceName) {
  if (!logSubscribers.has(serviceName)) {
    logSubscribers.set(serviceName, new Set());
  }
  
  logSubscribers.get(serviceName).add(ws);
  console.log(`Client subscribed to logs for service: ${serviceName}`);
  
  // 发送历史日志
  const logs = proxyLogs.get(serviceName) || [];
  ws.send(JSON.stringify({
    type: 'logs_history',
    serviceName,
    logs: logs.slice(-100) // 发送最近100条
  }));
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
    
    // Eureka连接成功，重置计数器
    eurekaUnavailableCount = 0;
    isEurekaShutdownTriggered = false;
    
    if (response.data && response.data.applications && response.data.applications.application) {
      return response.data.applications.application;
    }
    return [];
  } catch (error) {
    console.error('Failed to fetch Eureka services:', error.message);
    
    // 增加不可用计数
    eurekaUnavailableCount++;
    console.log(`Eureka不可用次数: ${eurekaUnavailableCount}`);
    
    // 连续2次失败就触发自动关闭
    if (eurekaUnavailableCount >= 2 && !isEurekaShutdownTriggered) {
      console.error('🚨 检测到Eureka服务器持续不可用，自动关闭所有代理服务...');
      isEurekaShutdownTriggered = true;
      await shutdownAllProxyServicesForEureka();
    }
    
    return [];
  }
}

// 恢复运行中的代理服务
async function restoreRunningServices() {
  try {
    const services = await database.getAllProxyServices();
    for (const service of services) {
      if (service.isRunning) {
        console.log(`恢复代理服务: ${service.serviceName}`);
        await startProxyService(service);
      }
    }
    
    // 启动状态同步检查
    await startStatusSync();
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
app.post('/api/config/eureka', (req, res) => {
  const { host, port, servicePath, heartbeatInterval } = req.body;
  config.eureka = { 
    host, 
    port, 
    servicePath: servicePath || '/eureka/apps',
    heartbeatInterval: heartbeatInterval || 30
  };
  res.json({ success: true, config: config.eureka });
});

// 获取Eureka服务列表
app.get('/api/eureka/services', async (req, res) => {
  try {
    const services = await getEurekaServices();
    res.json({ success: true, services });
  } catch (error) {
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
app.get('/api/heartbeat/history/:serviceName/:port', (req, res) => {
  try {
    const { serviceName, port } = req.params;
    const history = getHeartbeatHistory(serviceName, parseInt(port));
    
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
    const [proxyServices, tags, autoStartConfig] = await Promise.all([
      database.getAllProxyServices(),
      database.getAllTags(),
      database.getAutoStartConfig()
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
        autoStartConfig: autoStartConfig,
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
    
    const { proxyServices, tags, autoStartConfig, eurekaConfig } = importData.data
    
    // 统计信息
    const stats = {
      services: { imported: 0, skipped: 0, errors: 0 },
      tags: { imported: 0, skipped: 0, errors: 0 },
      autoStart: { imported: 0 }
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
    
    // 导入自动启动配置
    if (autoStartConfig && autoStartConfig.serviceIds) {
      try {
        // 获取导入后的服务列表，建立服务名到ID的映射
        const currentServices = await database.getAllProxyServices()
        const serviceNameToId = new Map()
        currentServices.forEach(service => {
          const key = `${service.serviceName}:${service.port}`
          serviceNameToId.set(key, service.id)
        })
        
        // 转换自动启动配置中的服务ID
        const validServiceIds = []
        for (const oldServiceId of autoStartConfig.serviceIds) {
          // 找到对应的服务
          const originalService = proxyServices.find(s => s.id === oldServiceId)
          if (originalService) {
            const key = `${originalService.serviceName}:${originalService.port}`
            const newServiceId = serviceNameToId.get(key)
            if (newServiceId) {
              validServiceIds.push(newServiceId)
            }
          }
        }
        
        // 更新自动启动配置
        if (validServiceIds.length > 0) {
          await database.updateAutoStartConfig(validServiceIds)
          stats.autoStart.imported = validServiceIds.length
        }
      } catch (error) {
        console.error('导入自动启动配置失败:', error)
      }
    }
    
    console.log('导入完成:', stats)
    
    // 重建代理服务器映射
    await rebuildProxyServersMap()
    
    // 重新加载自动启动配置
    await autoStartManager.loadAutoStartConfig()
    
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
app.get('/api/proxy/:serviceName/logs', (req, res) => {
  try {
    const { serviceName } = req.params;
    const { limit = 100 } = req.query;
    
    const logs = getServiceLogs(serviceName, parseInt(limit));
    res.json({ success: true, logs, total: logs.length });
  } catch (error) {
    console.error('获取服务日志失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 注释：日志清空改为前端操作，不需要此API
// app.delete('/api/proxy/:serviceName/logs', (req, res) => {
//   try {
//     const { serviceName } = req.params;
//     clearServiceLogs(serviceName);
//     res.json({ success: true, message: `服务 ${serviceName} 的日志已清理` });
//   } catch (error) {
//     console.error('清理服务日志失败:', error);
//     res.status(500).json({ success: false, error: error.message });
//   }
// });

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
    const { serviceName, port, targets, activeTarget } = req.body;
    
    // 检查服务名是否已存在
    const existingService = await database.getProxyServiceByName(serviceName);
    if (existingService) {
      return res.status(400).json({ success: false, error: '服务名称已存在' });
    }

    // 检查端口是否被占用
    if (proxyServers.has(`${serviceName}:${port}`)) {
      return res.status(400).json({ success: false, error: '端口已被占用' });
    }

    const serviceConfig = { serviceName, port, targets, activeTarget };
    const createdService = await database.createProxyService(serviceConfig);

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

// ===== 自动启动配置API =====

// 获取自动启动配置
app.get('/api/autostart/config', async (req, res) => {
  try {
    const autoStartServices = autoStartManager.getAutoStartServices();
    const services = [];
    
    for (const serviceId of autoStartServices) {
      const service = await database.getProxyServiceById(serviceId);
      if (service) {
        services.push(service);
      }
    }
    
    res.json({ 
      success: true, 
      data: {
        serviceIds: autoStartServices,
        services: services
      } 
    });
  } catch (error) {
    console.error('Failed to get auto-start config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 添加服务到自动启动列表
app.post('/api/autostart/add/:serviceId', async (req, res) => {
  try {
    const { serviceId } = req.params;
    
    await autoStartManager.addToAutoStart(serviceId);
    
    res.json({ 
      success: true, 
      message: '服务已添加到自动启动列表'
    });
  } catch (error) {
    console.error('Failed to add service to auto-start:', error);
    if (error.message === 'Service not found') {
      res.status(404).json({ success: false, error: '服务不存在' });
    } else {
      res.status(500).json({ success: false, error: error.message });
    }
  }
});

// 从自动启动列表移除服务
app.delete('/api/autostart/remove/:serviceId', async (req, res) => {
  try {
    const { serviceId } = req.params;
    
    await autoStartManager.removeFromAutoStart(serviceId);
    
    res.json({ 
      success: true, 
      message: '服务已从自动启动列表移除'
    });
  } catch (error) {
    console.error('Failed to remove service from auto-start:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 执行自动启动
app.post('/api/autostart/execute', async (req, res) => {
  try {
    const results = await autoStartManager.executeAutoStart(startProxyService);
    
    res.json({ 
      success: true, 
      data: results,
      message: `自动启动完成：成功 ${results.succeeded} 个，失败 ${results.failed} 个`
    });
  } catch (error) {
    console.error('Failed to execute auto-start:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 检查服务是否在自动启动列表中
app.get('/api/autostart/check/:serviceId', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const isEnabled = autoStartManager.isAutoStartEnabled(serviceId);
    
    res.json({ 
      success: true, 
      data: { isEnabled }
    });
  } catch (error) {
    console.error('Failed to check auto-start status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 批量添加服务到自动启动列表
app.post('/api/autostart/batch/add', async (req, res) => {
  try {
    const { serviceIds } = req.body;
    
    if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: '请提供有效的服务ID列表' 
      });
    }
    
    const results = {
      succeeded: 0,
      failed: 0,
      errors: []
    };
    
    for (const serviceId of serviceIds) {
      try {
        await autoStartManager.addToAutoStart(serviceId);
        results.succeeded++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          serviceId,
          error: error.message
        });
      }
    }
    
    res.json({ 
      success: true, 
      data: results,
      message: `批量添加完成：成功 ${results.succeeded} 个，失败 ${results.failed} 个`
    });
  } catch (error) {
    console.error('Failed to batch add to auto-start:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 批量移除服务从自动启动列表
app.post('/api/autostart/batch/remove', async (req, res) => {
  try {
    const { serviceIds } = req.body;
    
    if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: '请提供有效的服务ID列表' 
      });
    }
    
    const results = {
      succeeded: 0,
      failed: 0,
      errors: []
    };
    
    for (const serviceId of serviceIds) {
      try {
        await autoStartManager.removeFromAutoStart(serviceId);
        results.succeeded++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          serviceId,
          error: error.message
        });
      }
    }
    
    res.json({ 
      success: true, 
      data: results,
      message: `批量移除完成：成功 ${results.succeeded} 个，失败 ${results.failed} 个`
    });
  } catch (error) {
    console.error('Failed to batch remove from auto-start:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 临时清理API - 清空自动启动配置
app.post('/api/autostart/clear', async (req, res) => {
  try {
    // 直接操作数据库清空配置
    await new Promise((resolve, reject) => {
      database.db.run("UPDATE auto_start_config SET service_ids = '[]' WHERE id = 1", (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
    
    // 重新加载配置
    await autoStartManager.loadAutoStartConfig();
    
    res.json({ 
      success: true, 
      message: '自动启动配置已清空'
    });
  } catch (error) {
    console.error('Failed to clear auto-start config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 手动触发自动启动 - 用于测试
app.post('/api/autostart/execute', async (req, res) => {
  try {
    console.log('Manual auto-start execution triggered...');
    const results = await autoStartManager.executeAutoStart(startProxyService);
    
    res.json({ 
      success: true, 
      data: results,
      message: `自动启动执行完成：成功 ${results.succeeded} 个，失败 ${results.failed} 个`
    });
  } catch (error) {
    console.error('Failed to execute auto-start manually:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});



// 辅助函数

// 记录心跳数据
function recordHeartbeat(serviceName, port, status, message = null) {
  const serverKey = `${serviceName}:${port}`;
  const timestamp = Date.now();
  
  if (!heartbeatHistory.has(serverKey)) {
    heartbeatHistory.set(serverKey, []);
  }
  
  const history = heartbeatHistory.get(serverKey);
  history.push({
    timestamp,
    status, // 'success' | 'error' | 'timeout'
    message
  });
  
  // 只保留近5分钟的数据
  const fiveMinutesAgo = timestamp - 5 * 60 * 1000;
  const filteredHistory = history.filter(item => item.timestamp >= fiveMinutesAgo);
  heartbeatHistory.set(serverKey, filteredHistory);
  
  // 广播心跳数据更新
  broadcast({
    type: 'heartbeat_update',
    data: {
      serviceName,
      port,
      timestamp,
      status,
      message,
      history: filteredHistory
    }
  });
}

// 获取服务心跳历史
function getHeartbeatHistory(serviceName, port) {
  const serverKey = `${serviceName}:${port}`;
  const history = heartbeatHistory.get(serverKey) || [];
  
  // 清理过期数据
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  const filteredHistory = history.filter(item => item.timestamp >= fiveMinutesAgo);
  heartbeatHistory.set(serverKey, filteredHistory);
  
  return filteredHistory;
}

// 清理服务心跳历史
function clearHeartbeatHistory(serviceName, port) {
  const serverKey = `${serviceName}:${port}`;
  heartbeatHistory.delete(serverKey);
}

// 清理所有内存缓存
function clearAllMemoryCaches() {
  console.log('🧹 清理所有内存缓存...')
  
  // 清理心跳定时器
  for (const [key, timer] of heartbeatTimers) {
    clearInterval(timer)
  }
  heartbeatTimers.clear()
  
  // 清理心跳错误记录
  heartbeatErrors.clear()
  
  // 清理心跳历史记录
  heartbeatHistory.clear()
  
  // 清理代理日志
  proxyLogs.clear()
  
  // 清理日志订阅者
  logSubscribers.clear()
  
  console.log('✅ 内存缓存已清理完成')
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

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

async function registerToEureka(serviceName, port) {
  try {
    // 优先用前端配置的 eureka.host
    let ip = config.eureka.host;
    if (ip === 'localhost' || ip === '127.0.0.1') {
      ip = getLocalIP();
    }

    const eurekaUrl = `http://${config.eureka.host}:${config.eureka.port}/eureka/apps/${serviceName.toUpperCase()}`;
    const instance = {
      instance: {
        instanceId: `${ip}:${serviceName}:${port}`,
        hostName: ip,
        app: serviceName.toUpperCase(),
        ipAddr: ip,
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

    console.log(`Service ${serviceName} registered to Eureka with ip ${ip}`);
  } catch (error) {
    console.error(`Failed to register ${serviceName} to Eureka:`, error.message);
  }
}

async function startProxyService(service) {
  const { serviceName, port, targets, activeTarget } = service;
  const serverKey = `${serviceName}:${port}`;
  
  if (proxyServers.has(serverKey)) {
    throw new Error('服务已在运行中');
  }

  const proxyApp = express();
  
  const proxyConfig = {
    target: targets[activeTarget],
    changeOrigin: true,
    pathRewrite: {
      '^/': '/'
    },
    onError: (err, req, res) => {
      console.error(`Proxy error for ${serviceName}:`, err.message);
      
      // 记录错误日志
      logProxyRequest(serviceName, {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.url,
        target: targets[activeTarget],
        status: 'ERROR',
        error: err.message,
        requestBody: req.body,
        responseBody: { error: 'Proxy error', message: err.message }
      });
      
      res.status(500).json({ error: 'Proxy error', message: err.message });
    },
    onProxyReq: (proxyReq, req, res) => {
      console.log(`Proxying ${req.method} ${req.url} to ${targets[activeTarget]}`);
      
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
        
        // 记录完整的请求日志
        logProxyRequest(serviceName, {
          ...req.proxyLogData,
          status: proxyRes.statusCode,
          duration,
          responseHeaders: proxyRes.headers,
          responseBody: parsedResponseBody
        });
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
      stopEurekaHeartbeat(serviceName, port);
      
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
      stopEurekaHeartbeat(serviceName, port);
      throw error;
    }
  }
}

async function unregisterFromEureka(serviceName, port) {
  try {
    const instanceId = `localhost:${serviceName}:${port}`;
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
function stopEurekaHeartbeat(serviceName, port) {
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
  clearHeartbeatHistory(serviceName, port);
}

// 发送Eureka心跳
async function sendEurekaHeartbeat(serviceName, port) {
  const serverKey = `${serviceName}:${port}`;
  
  try {
    const instanceId = `localhost:${serviceName}:${port}`;
    const heartbeatUrl = `http://${config.eureka.host}:${config.eureka.port}/eureka/apps/${serviceName.toUpperCase()}/${instanceId}`;
    
    // 发送PUT请求作为心跳
    await axios.put(heartbeatUrl, null, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000 // 5秒超时
    });
    
    // 记录成功的心跳
    recordHeartbeat(serviceName, port, 'success');
    
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
    recordHeartbeat(serviceName, port, status, error.message);
    
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

// 启动状态同步检查
async function startStatusSync() {
  console.log('启动Eureka状态同步检查...');
  
  // 立即执行一次同步
  await syncServicesWithEureka();
  
  // 每60秒检查一次状态
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

// 记录代理请求日志
function logProxyRequest(serviceName, logData) {
  if (!proxyLogs.has(serviceName)) {
    proxyLogs.set(serviceName, []);
  }
  
  const logs = proxyLogs.get(serviceName);
  logs.push({
    id: Date.now() + Math.random(),
    ...logData
  });
  
  // 保持最多1000条日志
  if (logs.length > 1000) {
    logs.splice(0, logs.length - 1000);
  }
  
  // 推送给订阅者
  const subscribers = logSubscribers.get(serviceName);
  if (subscribers && subscribers.size > 0) {
    const message = JSON.stringify({
      type: 'new_log',
      serviceName,
      log: logs[logs.length - 1]
    });
    
    subscribers.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }
}

// 获取服务日志
function getServiceLogs(serviceName, limit = 100) {
  const logs = proxyLogs.get(serviceName) || [];
  return logs.slice(-limit);
}

// 清理服务日志
function clearServiceLogs(serviceName) {
  proxyLogs.delete(serviceName);
  logSubscribers.delete(serviceName);
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
          stopEurekaHeartbeat(serviceName, port);
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
    
    // 2. 停止状态同步
    stopStatusSync();
    console.log('状态同步已停止');
    
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

const PORT = process.env.PORT || 3000;
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

module.exports = app; 