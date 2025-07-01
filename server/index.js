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
    host: 'host.docker.internal', // 容器环境下访问宿主机服务
    port: 8761,
    servicePath: '/eureka/apps',
    heartbeatInterval: 10 // 心跳间隔（秒）
  }
};

let proxyServers = new Map(); // 存储运行中的代理服务器实例（仅运行时状态）
let heartbeatTimers = new Map(); // 存储Eureka心跳定时器（仅运行时状态）
let heartbeatErrors = new Map(); // 存储心跳错误信息（运行时状态，用于即时通知）
let statusSyncTimer = null; // 状态同步定时器
let logSubscribers = new Map(); // 存储日志订阅者（WebSocket连接状态）
let systemLogSubscribers = new Set(); // 存储系统日志订阅者（WebSocket连接状态）
let eurekaUnavailableCount = 0; // Eureka不可用计数器
let isEurekaShutdownTriggered = false; // 是否已触发Eureka关闭
let isEurekaMonitoringActive = false; // Eureka监听是否活跃
let isEurekaAvailable = null; // Eureka服务可用性状态: null=未检查, true=可用, false=不可用
let eurekaHealthCheckTimer = null; // Eureka健康检查定时器
let eurekaUnavailableStartTime = null; // Eureka开始不可用的时间
let systemLogs = []; // 系统日志缓存（最近500条）
const MAX_SYSTEM_LOGS = 500;

// 请求详情存储（按UUID索引）
const requestDetailsMap = new Map();
const MAX_REQUEST_DETAILS = 200; // 最大系统日志数量

// 服务健康检查和自动恢复相关变量
let isHealthCheckActive = false; // 健康检查是否活跃
let serviceHealthCheckTimer = null; // 健康检查定时器
let autoRecoveryInProgress = new Set(); // 正在恢复的服务集合

// 健康检查配置
const HEARTBEAT_HEALTH_CONFIG = {
  CONSECUTIVE_FAILURES_THRESHOLD: 3,    // 连续失败阈值
  FAILURE_RATE_THRESHOLD: 0.7,          // 失败率阈值 (70%)
  DETECTION_WINDOW_SIZE: 10,             // 检测窗口大小（最近10次心跳）
  MAX_RESTART_ATTEMPTS: 3,               // 最大重启尝试次数
  AUTO_RESTART_DELAY: 5,                 // 自动重启延迟基数（秒）
  HEALTH_CHECK_INTERVAL: 10000,          // 健康检查间隔（10秒）
  MIN_SUCCESS_INTERVAL: 300              // 最小成功间隔（5分钟）
};

// 日志分类定义
const LOG_CATEGORIES = {
  SYSTEM: 'system',        // 系统启动、初始化
  EUREKA: 'eureka',        // Eureka相关
  SERVICE: 'service',      // 代理服务操作
  CONFIG: 'config',        // 配置相关
  NETWORK: 'network',      // 网络、端口相关
  ERROR: 'error',          // 错误日志
  DEBUG: 'debug'           // 调试信息
};

// 根据消息内容自动分类
function categorizeLog(level, message) {
  const msg = message.toLowerCase();
  
  // 错误日志优先级最高
  if (level === 'error') {
    return LOG_CATEGORIES.ERROR;
  }
  
  // Eureka相关
  if (msg.includes('eureka') || msg.includes('服务注册') || msg.includes('心跳')) {
    return LOG_CATEGORIES.EUREKA;
  }
  
  // 代理服务相关
  if (msg.includes('代理服务') || msg.includes('proxy') || msg.includes('启动') || 
      msg.includes('停止') || msg.includes('恢复') || msg.includes('批量')) {
    return LOG_CATEGORIES.SERVICE;
  }
  
  // 配置相关
  if (msg.includes('配置') || msg.includes('导入') || msg.includes('导出') || 
      msg.includes('更新') || msg.includes('保存')) {
    return LOG_CATEGORIES.CONFIG;
  }
  
  // 网络端口相关
  if (msg.includes('端口') || msg.includes('网络') || msg.includes('连接') || 
      msg.includes('清理') || msg.includes('占用')) {
    return LOG_CATEGORIES.NETWORK;
  }
  
  // 系统相关
  if (msg.includes('数据库') || msg.includes('初始化') || msg.includes('启动') || 
      msg.includes('服务初始化') || msg.includes('同步')) {
    return LOG_CATEGORIES.SYSTEM;
  }
  
  // 默认为调试信息
  return LOG_CATEGORIES.DEBUG;
}

// 系统日志收集器
function addSystemLog(level, message, ...args) {
  const timestamp = new Date().toISOString();
  const category = categorizeLog(level, message);
  
  const logEntry = {
    id: Date.now() + Math.random(),
    timestamp,
    level,
    category,
    message: typeof message === 'string' ? message : JSON.stringify(message),
    args: args.length > 0 ? args.map(arg => 
      typeof arg === 'string' ? arg : JSON.stringify(arg)
    ) : undefined
  };
  
  // 添加到系统日志数组
  systemLogs.push(logEntry);
  
  // 保持最大数量限制
  if (systemLogs.length > MAX_SYSTEM_LOGS) {
    systemLogs.shift();
  }
  
  // 广播给订阅系统日志的客户端
  broadcastToSystemLogSubscribers({
    type: 'system_log',
    log: logEntry
  });
}

// 重写console方法以收集日志
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info
};

console.log = function(message, ...args) {
  addSystemLog('info', message, ...args);
  originalConsole.log(message, ...args);
};

console.error = function(message, ...args) {
  addSystemLog('error', message, ...args);
  originalConsole.error(message, ...args);
};

console.warn = function(message, ...args) {
  addSystemLog('warn', message, ...args);
  originalConsole.warn(message, ...args);
};

console.info = function(message, ...args) {
  addSystemLog('info', message, ...args);
  originalConsole.info(message, ...args);
};

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
      console.log('已加载Eureka配置');
    } else {
      console.log('使用默认Eureka配置');
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
  
  // 启动服务健康检查
  startServiceHealthCheck();
}).catch(err => {
  console.error('数据库初始化失败:', err);
  process.exit(1);
});

// WebSocket连接处理
wss.on('connection', (ws) => {
  // 静默连接，不记录日志
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      await handleWebSocketMessage(ws, data);
    } catch (error) {
      console.error('WebSocket消息解析失败:', error.message);
    }
  });
  
  ws.on('close', () => {
    // 静默断开，不记录日志
    cleanupLogSubscriptions(ws);
  });
});

// 处理WebSocket消息
async function handleWebSocketMessage(ws, data) {
  const { type, serviceName, categories } = data;
  
  switch (type) {
    case 'subscribe_logs':
      await subscribeToLogs(ws, serviceName);
      break;
    case 'unsubscribe_logs':
      unsubscribeFromLogs(ws, serviceName);
      break;
    case 'subscribe_system_logs':
      await subscribeToSystemLogs(ws, categories);
      break;
    case 'unsubscribe_system_logs':
      unsubscribeFromSystemLogs(ws);
      break;
    case 'update_log_categories':
      await updateLogCategories(ws, categories);
      break;
    default:
      // 忽略未知消息类型，不记录日志
  }
}

// 订阅日志
async function subscribeToLogs(ws, serviceName) {
  if (!logSubscribers.has(serviceName)) {
    logSubscribers.set(serviceName, new Set());
  }
  
  logSubscribers.get(serviceName).add(ws);
  // 静默订阅，不记录日志
  
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
    // 静默取消订阅，不记录日志
  }
}

// 订阅系统日志
async function subscribeToSystemLogs(ws, categories = null) {
  // 存储客户端的分类过滤设置
  ws.logCategories = categories;
  systemLogSubscribers.add(ws);
  // 静默订阅系统日志，不记录日志
  
  // 发送历史系统日志（根据分类过滤）
  let filteredLogs = systemLogs;
  if (categories && categories.length > 0) {
    filteredLogs = systemLogs.filter(log => categories.includes(log.category));
  }
  
  ws.send(JSON.stringify({
    type: 'system_logs_history',
    logs: filteredLogs
  }));
}

// 取消订阅系统日志
function unsubscribeFromSystemLogs(ws) {
  systemLogSubscribers.delete(ws);
  delete ws.logCategories;
  // 静默取消订阅系统日志，不记录日志
}

// 更新日志分类过滤
async function updateLogCategories(ws, categories) {
  ws.logCategories = categories;
  
  // 重新发送历史日志（根据新的分类过滤）
  let filteredLogs = systemLogs;
  if (categories && categories.length > 0) {
    filteredLogs = systemLogs.filter(log => categories.includes(log.category));
  }
  
  ws.send(JSON.stringify({
    type: 'system_logs_history',
    logs: filteredLogs
  }));
}

// 清理日志订阅
function cleanupLogSubscriptions(ws) {
  for (const [serviceName, subscribers] of logSubscribers) {
    subscribers.delete(ws);
  }
  // 清理系统日志订阅
  systemLogSubscribers.delete(ws);
}

// 广播消息给所有WebSocket客户端
function broadcast(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// 广播消息给系统日志订阅者
function broadcastToSystemLogSubscribers(data) {
  systemLogSubscribers.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      // 如果是新日志消息，检查分类过滤
      if (data.type === 'system_log' && client.logCategories) {
        const log = data.log;
        if (!client.logCategories.includes(log.category)) {
          return; // 跳过不匹配的分类
        }
      }
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
    const url = `http://${config.eureka.host}:${config.eureka.port}${config.eureka.servicePath}`;
    const response = await axios.get(url, {
      headers: {
        'Accept': 'application/json'
      },
      timeout: 5000 // 5秒超时
    });
    
    // 只在状态发生变化时才广播消息，避免重复通知
    const wasAvailable = isEurekaAvailable;
    isEurekaAvailable = true;
    
    if (wasAvailable !== true) {
      console.log('✅ Eureka服务可用');
      
      // 广播Eureka可用状态（仅在状态变化时）
      broadcast({
        type: 'eureka_availability_updated',
        isAvailable: true,
        message: 'Eureka服务连接成功',
        timestamp: new Date().toISOString()
      });
    }
    
    return true;
  } catch (error) {
    // 只在状态发生变化时才广播消息，避免重复通知
    const wasAvailable = isEurekaAvailable;
    isEurekaAvailable = false;
    
    if (wasAvailable !== false) {
      console.error('❌ Eureka服务不可用:', error.message);
      
      // 广播Eureka不可用状态（仅在状态变化时）
      broadcast({
        type: 'eureka_availability_updated',
        isAvailable: false,
        message: `Eureka服务不可用: ${error.message}`,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
    
    return false;
  }
}

// 启动Eureka监听（如果还没启动的话）
async function ensureEurekaMonitoringStarted() {
  if (!isEurekaMonitoringActive && await hasRunningProxyServices()) {
    console.log('🚀 启动Eureka状态监听');
    await startStatusSync();
    isEurekaMonitoringActive = true;
  }
}

// 停止Eureka监听（如果没有服务运行的话）
async function ensureEurekaMonitoringStopped() {
  if (isEurekaMonitoringActive && !(await hasRunningProxyServices())) {
    console.log('🛑 停止Eureka状态监听');
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
      return;
    }
    
    console.log(`开始恢复 ${runningServices.length} 个运行中的代理服务`);
    
    for (const service of runningServices) {
      try {
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
    
    console.log('Eureka配置已更新并保存到数据库');
    
    // 如果配置发生变化，重启状态同步
    const configChanged = 
      oldConfig.host !== config.eureka.host ||
      oldConfig.port !== config.eureka.port ||
      oldConfig.servicePath !== config.eureka.servicePath;
      
    if (configChanged) {
      console.log('检测到Eureka连接配置变更，重启状态同步');
      
      // 停止现有的状态同步
      stopStatusSync();
      
      // 清理内存缓存
      clearAllMemoryCaches();
      
      // 启动新的状态同步（使用新配置）
      await startStatusSync();
      
      console.log('状态同步已重启');
      
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
    // 静默获取服务列表，不记录详细日志
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

// 检查是否是首次启动
app.get('/api/config/first-time', async (req, res) => {
  try {
    // 检查是否已有配置标记
    const firstTimeConfig = await database.getConfig('first_time_setup');
    const isFirstTime = !firstTimeConfig;
    
    res.json({ 
      success: true, 
      isFirstTime: isFirstTime
    });
  } catch (error) {
    console.error('检查首次启动状态失败:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 完成首次配置
app.post('/api/config/first-time-complete', async (req, res) => {
  try {
    const { eurekaConfig, localIPConfig } = req.body;
    
    // 保存Eureka配置
    if (eurekaConfig) {
      await database.setEurekaConfig(eurekaConfig);
      config.eureka = { ...config.eureka, ...eurekaConfig };
    }
    
    // 保存本机IP配置
    if (localIPConfig) {
      await database.setLocalIPConfig(localIPConfig);
      // 清除IP缓存
      clearLocalIPCache();
    }
    
    // 标记首次配置已完成
    await database.setConfig('first_time_setup', {
      completed: true,
      completedAt: new Date().toISOString()
    });
    
    console.log('首次配置完成');
    
    res.json({ 
      success: true, 
      message: '首次配置完成'
    });
  } catch (error) {
    console.error('完成首次配置失败:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
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
    console.log('🧪 手动触发Eureka不可用自动关闭测试');
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
    console.log('开始导出配置数据')
    
    // 获取所有静态配置数据（排除运行时配置）
    const [proxyServices, tags, debugApis] = await Promise.all([
      database.getAllProxyServices(),
      database.getAllTags(),
      database.getDebugApis()
    ])
    
    // 获取服务标签关联数据（包含服务名称和标签名称）
    const serviceTagsQuery = `
      SELECT st.service_id, st.tag_id, ps.service_name, t.name as tag_name
      FROM service_tags st
      JOIN proxy_services ps ON st.service_id = ps.id
      JOIN tags t ON st.tag_id = t.id
      ORDER BY ps.service_name, t.name
    `
    const serviceTags = await new Promise((resolve, reject) => {
      database.db.all(serviceTagsQuery, (err, rows) => {
        if (err) reject(err)
        else resolve(rows)
      })
    })
    
    // 清理运行时状态，只保留配置数据
    const cleanedServices = proxyServices.map(service => {
      const { id, port, isRunning, status, createdAt, updatedAt, tags, ...configData } = service
      return {
        ...configData,
        // 重置为第一个目标
        activeTarget: Object.keys(service.targets)[0] || 'default'
      }
    })
    
    const exportData = {
      version: '1.2.0', // 版本升级，标识支持多对多关系的导出格式
      exportTime: new Date().toISOString(),
      data: {
        proxyServices: cleanedServices,
        tags: tags,
        serviceTags: serviceTags,        // 新增：服务标签关联数据
        debugApis: debugApis             // API调试配置
      },
      excludedConfigs: ['eurekaConfig', 'localIPConfig', 'autoStartConfig', 'portRangeConfig', 'ports', 'runningStatus'], // 说明排除了哪些配置
      description: '此配置文件包含代理服务配置、标签、服务标签关联关系和API调试配置，不包含端口、IP、运行状态等运行时配置'
    }
    
    console.log(`导出完成: ${cleanedServices.length} 个服务, ${tags.length} 个标签, ${serviceTags.length} 个服务标签关联, ${Object.keys(debugApis).length} 个服务的API调试配置`);
    
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

// 预览导入配置数据（检查冲突）
app.post('/api/config/import/preview', async (req, res) => {
  try {
    const importData = req.body
    
    console.log('开始预览导入配置数据')
    
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
    
    const { proxyServices, tags, serviceTags, debugApis } = importData.data
    
    // 获取现有数据
    const [existingServices, existingTags, existingDebugApis] = await Promise.all([
      database.getAllProxyServices(),
      database.getAllTags(),
      database.getDebugApis()
    ])
    
    // 分析冲突
    const conflicts = {
      services: [],
      tags: [],
      debugApis: []
    }
    
    const newItems = {
      services: [],
      tags: [],
      debugApis: []
    }
    
    // 检查服务冲突
    if (proxyServices && Array.isArray(proxyServices)) {
      const existingServiceNames = new Set(existingServices.map(s => s.serviceName))
      
      proxyServices.forEach(service => {
        if (existingServiceNames.has(service.serviceName)) {
          conflicts.services.push({
            name: service.serviceName,
            existing: existingServices.find(s => s.serviceName === service.serviceName),
            importing: service
          })
        } else {
          newItems.services.push(service)
        }
      })
    }
    
    // 检查标签冲突
    if (tags && Array.isArray(tags)) {
      const existingTagNames = new Set(existingTags.map(t => t.name))
      
      tags.forEach(tag => {
        if (existingTagNames.has(tag.name)) {
          conflicts.tags.push({
            name: tag.name,
            existing: existingTags.find(t => t.name === tag.name),
            importing: tag
          })
        } else {
          newItems.tags.push(tag)
        }
      })
    }
    
    // 检查API调试配置冲突
    if (debugApis && typeof debugApis === 'object') {
      Object.entries(debugApis).forEach(([serviceName, apis]) => {
        if (existingDebugApis[serviceName] && existingDebugApis[serviceName].length > 0) {
          conflicts.debugApis.push({
            serviceName,
            existing: existingDebugApis[serviceName],
            importing: apis
          })
        } else {
          newItems.debugApis.push({ serviceName, apis })
        }
      })
    }
    
    res.json({
      success: true,
      conflicts,
      newItems,
      summary: {
        totalConflicts: conflicts.services.length + conflicts.tags.length + conflicts.debugApis.length,
        totalNew: newItems.services.length + newItems.tags.length + newItems.debugApis.length,
        hasConflicts: conflicts.services.length > 0 || conflicts.tags.length > 0 || conflicts.debugApis.length > 0
      }
    })
    
  } catch (error) {
    console.error('预览导入配置失败:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// 导入配置数据
app.post('/api/config/import', async (req, res) => {
  try {
    const { importData, options = {} } = req.body
    const { conflictResolution = 'skip' } = options // 'skip' | 'replace'
    
    console.log('开始导入配置数据，冲突处理策略:', conflictResolution)
    
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
    
    const { proxyServices, tags, serviceTags, debugApis } = importData.data
    
    // 统计信息
    const stats = {
      services: { imported: 0, skipped: 0, replaced: 0, errors: 0 },
      tags: { imported: 0, skipped: 0, replaced: 0, errors: 0 },
      serviceTags: { imported: 0, skipped: 0, errors: 0 },
      debugApis: { imported: 0, skipped: 0, replaced: 0, errors: 0 }
    }
    
    // 导入标签数据
    if (tags && Array.isArray(tags)) {
      // 一次性获取现有标签，避免重复查询
      const existingTags = await database.getAllTags()
      const existingTagNames = new Set(existingTags.map(t => t.name))
      
      for (const tag of tags) {
        try {
          if (!existingTagNames.has(tag.name)) {
            await database.createTag(tag)
            stats.tags.imported++
            // 添加到已存在集合中，避免重复导入
            existingTagNames.add(tag.name)
            console.log(`导入标签: ${tag.name}`)
          } else if (conflictResolution === 'replace') {
            // 替换现有标签
            const existingTag = existingTags.find(t => t.name === tag.name)
            if (existingTag) {
              await database.updateTag(existingTag.id, tag)
              stats.tags.replaced++
              console.log(`替换标签: ${tag.name}`)
            }
          } else {
            console.log(`跳过标签: ${tag.name}（已存在）`)
            stats.tags.skipped++
          }
        } catch (error) {
          console.error(`导入标签失败: ${tag.name}`, error)
          stats.tags.errors++
        }
      }
    }
    
    // 导入代理服务
    const serviceNameToIdMap = new Map() // 用于映射服务名称到新的ID
    
    if (proxyServices && Array.isArray(proxyServices)) {
      // 一次性获取现有服务，避免重复查询
      const existingServices = await database.getAllProxyServices()
      const existingServiceNames = new Set(existingServices.map(s => s.serviceName))
      
      // 为已存在的服务建立映射
      existingServices.forEach(service => {
        serviceNameToIdMap.set(service.serviceName, service.id)
      })
      
      for (const service of proxyServices) {
        try {
          const existingService = existingServices.find(s => s.serviceName === service.serviceName)
          
          if (!existingServiceNames.has(service.serviceName)) {
            // 创建新服务，需要分配端口
            let availablePort
            if (service.port && await database.isPortAvailable(service.port)) {
              // 如果导入数据中有端口且可用，使用该端口
              availablePort = service.port
            } else {
              // 否则获取可用端口
              availablePort = await database.getAvailablePort()
            }
            
            const serviceConfig = {
              serviceName: service.serviceName,
              port: availablePort,
              targets: service.targets,
              activeTarget: service.activeTarget,
              tags: service.tags || []
            }
            
            // 如果导入数据中有指定的ID，使用该ID
            if (service.id) {
              serviceConfig.id = service.id
            }
            
            const newService = await database.createProxyService(serviceConfig)
            stats.services.imported++
            // 添加到已存在集合中，避免重复导入
            existingServiceNames.add(service.serviceName)
            // 建立服务名称到新ID的映射
            serviceNameToIdMap.set(service.serviceName, newService.id)
            console.log(`导入服务: ${service.serviceName}，分配端口: ${availablePort}`)
          } else if (conflictResolution === 'replace') {
            // 替换现有服务（保持原有ID和端口）
            if (existingService) {
              // 只更新配置，保持运行状态、端口等
              const updates = {
                targets: service.targets,
                activeTarget: service.activeTarget
              }
              await database.updateProxyService(existingService.id, updates)
              stats.services.replaced++
              serviceNameToIdMap.set(service.serviceName, existingService.id)
              console.log(`替换服务: ${service.serviceName}，保持端口: ${existingService.port}`)
            }
          } else {
            console.log(`跳过服务: ${service.serviceName}（已存在），保持端口: ${existingService?.port}`)
            stats.services.skipped++
            // 即使跳过也要建立映射，用于后续的标签关联
            if (existingService) {
              serviceNameToIdMap.set(service.serviceName, existingService.id)
            }
          }
        } catch (error) {
          console.error(`导入服务失败: ${service.serviceName}`, error)
          stats.services.errors++
        }
      }
    }
    
    // 导入服务标签关联数据
    if (serviceTags && Array.isArray(serviceTags)) {
      // 重新获取最新的服务和标签数据（包含刚导入的）
      const [existingTags, currentServices] = await Promise.all([
        database.getAllTags(),
        database.getAllProxyServices()
      ])
      
      // 构建当前服务名称到ID的映射
      const serviceNameToIdMap = new Map()
      currentServices.forEach(service => {
        serviceNameToIdMap.set(service.serviceName, service.id)
      })
      
      // 构建标签名称到ID的映射
      const tagNameToIdMap = new Map()
      existingTags.forEach(tag => {
        tagNameToIdMap.set(tag.name, tag.id)
      })
      
      for (const relation of serviceTags) {
        try {
          const { service_name: serviceName, tag_name: tagName } = relation
          
          // 检查是否有必要的字段
          if (!serviceName || !tagName) {
            console.log(`跳过服务标签关联: 缺少必要字段 service_name 或 tag_name`, relation)
            stats.serviceTags.skipped++
            continue
          }
          
          // 通过服务名称找到当前的服务ID
          const currentServiceId = serviceNameToIdMap.get(serviceName)
          if (!currentServiceId) {
            console.log(`跳过服务标签关联: 服务 ${serviceName} 不存在`)
            stats.serviceTags.skipped++
            continue
          }
          
          // 通过标签名称找到当前的标签ID
          const currentTagId = tagNameToIdMap.get(tagName)
          if (!currentTagId) {
            console.log(`跳过服务标签关联: 标签 ${tagName} 不存在`)
            stats.serviceTags.skipped++
            continue
          }
          
          // 插入服务标签关联（忽略重复）
          await new Promise((resolve, reject) => {
            database.db.run(
              'INSERT OR IGNORE INTO service_tags (service_id, tag_id) VALUES (?, ?)',
              [currentServiceId, currentTagId],
              function(err) {
                if (err) reject(err)
                else resolve()
              }
            )
          })
          
          stats.serviceTags.imported++
          console.log(`导入服务标签关联: ${serviceName} -> ${tagName}`)
        } catch (error) {
          console.error(`导入服务标签关联失败:`, relation, error)
          stats.serviceTags.errors++
        }
      }
    }
    
    // 导入API调试配置
    if (debugApis && typeof debugApis === 'object') {
      // 获取现有的API调试配置和服务列表
      const existingDebugApis = await database.getDebugApis()
      const existingServices = await database.getAllProxyServices()
      const existingServiceNames = new Set(existingServices.map(s => s.serviceName))
      
      for (const [serviceName, apis] of Object.entries(debugApis)) {
        try {
          if (!existingServiceNames.has(serviceName)) {
            console.log(`跳过服务 ${serviceName} 的API调试配置：服务不存在`)
            stats.debugApis.skipped++
            continue
          }
          
          // 检查该服务是否已经有API调试配置
          if (existingDebugApis[serviceName] && existingDebugApis[serviceName].length > 0) {
            if (conflictResolution === 'replace') {
              // 替换现有的API调试配置
              await database.saveDebugApis(serviceName, apis)
              stats.debugApis.replaced++
              console.log(`替换服务 ${serviceName} 的API调试配置，共 ${apis.length} 个接口`)
              continue
            } else {
              console.log(`跳过服务 ${serviceName} 的API调试配置：已存在 ${existingDebugApis[serviceName].length} 个接口`)
              stats.debugApis.skipped++
              continue
            }
          }
          
          if (Array.isArray(apis) && apis.length > 0) {
            await database.saveDebugApis(serviceName, apis)
            stats.debugApis.imported++
            console.log(`导入服务 ${serviceName} 的API调试配置，共 ${apis.length} 个接口`)
          } else {
            console.log(`跳过服务 ${serviceName} 的API调试配置：无有效接口数据`)
            stats.debugApis.skipped++
          }
        } catch (error) {
          console.error(`导入服务 ${serviceName} 的API调试配置失败:`, error)
          stats.debugApis.errors++
        }
      }
    }
    
    console.log('配置导入完成，统计信息：', stats);
    
    // 重建代理服务器映射
    await rebuildProxyServersMap()
    
    // 清理所有内存缓存（因为导入时所有服务都是停止状态）
    clearAllMemoryCaches()
    
    // 生成详细的导入报告
    const totalImported = stats.services.imported + stats.tags.imported + stats.serviceTags.imported + stats.debugApis.imported
    const totalReplaced = stats.services.replaced + stats.tags.replaced + stats.debugApis.replaced
    const totalSkipped = stats.services.skipped + stats.tags.skipped + stats.serviceTags.skipped + stats.debugApis.skipped
    const totalErrors = stats.services.errors + stats.tags.errors + stats.serviceTags.errors + stats.debugApis.errors
    
    let message = '配置导入完成'
    if (totalImported > 0) {
      message += `，成功导入 ${totalImported} 项`
    }
    if (totalReplaced > 0) {
      message += `，替换 ${totalReplaced} 项`
    }
    if (totalSkipped > 0) {
      message += `，跳过 ${totalSkipped} 项`
    }
    if (totalErrors > 0) {
      message += `，${totalErrors} 项失败`
    }
    
    res.json({ 
      success: true, 
      message: message,
      stats: stats,
      summary: {
        totalImported,
        totalReplaced,
        totalSkipped, 
        totalErrors,
        details: {
          services: `导入 ${stats.services.imported}，替换 ${stats.services.replaced}，跳过 ${stats.services.skipped}，失败 ${stats.services.errors}`,
          tags: `导入 ${stats.tags.imported}，替换 ${stats.tags.replaced}，跳过 ${stats.tags.skipped}，失败 ${stats.tags.errors}`,
          serviceTags: `导入 ${stats.serviceTags.imported}，跳过 ${stats.serviceTags.skipped}，失败 ${stats.serviceTags.errors}`,
          debugApis: `导入 ${stats.debugApis.imported}，替换 ${stats.debugApis.replaced}，跳过 ${stats.debugApis.skipped}，失败 ${stats.debugApis.errors}`
        }
      }
    })
    
  } catch (error) {
    console.error('导入配置失败:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// 清理状态不一致的服务
app.post('/api/cleanup/inconsistent-services', async (req, res) => {
  try {
    console.log('🧹 开始清理状态不一致的服务');
    
    const services = await database.getAllProxyServices();
    const cleanupResults = [];
    
    for (const service of services) {
      const serverKey = `${service.serviceName}:${service.port}`;
      const hasLocalServer = proxyServers.has(serverKey);
      
      // 如果数据库显示运行中但本地没有服务器实例
      if (service.isRunning && !hasLocalServer) {
        // 发现不一致服务，静默处理
        
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

// 获取请求详情
app.get('/api/proxy/:serviceName/logs/:logId/details', async (req, res) => {
  try {
    const { serviceName, logId } = req.params;
    const logDetails = await database.getRequestLogDetails(serviceName, logId);
    
    if (!logDetails) {
      return res.status(404).json({ 
        success: false, 
        error: '请求日志不存在' 
      });
    }
    
    res.json({ 
      success: true, 
      data: logDetails 
    });
  } catch (error) {
    console.error('获取请求详情失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取系统日志
app.get('/api/system/logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 500;
    const { categories } = req.query;
    
    let filteredLogs = systemLogs;
    
    // 如果指定了分类过滤
    if (categories) {
      const categoryList = categories.split(',');
      filteredLogs = systemLogs.filter(log => 
        categoryList.includes(log.category)
      );
    }
    
    const logs = filteredLogs.slice(-limit);
    
    res.json({
      success: true,
      logs: logs,
      total: filteredLogs.length,
      totalAll: systemLogs.length
    });
  } catch (error) {
    console.error('获取系统日志失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取日志分类信息
app.get('/api/system/logs/categories', (req, res) => {
  try {
    // 统计各分类的日志数量
    const categoryCounts = {};
    Object.values(LOG_CATEGORIES).forEach(category => {
      categoryCounts[category] = systemLogs.filter(log => log.category === category).length;
    });
    
    const categories = [
      { key: LOG_CATEGORIES.SYSTEM, name: '系统', icon: '🔧', color: '#409EFF' },
      { key: LOG_CATEGORIES.EUREKA, name: 'Eureka', icon: '🌐', color: '#67C23A' },
      { key: LOG_CATEGORIES.SERVICE, name: '服务', icon: '⚙️', color: '#E6A23C' },
      { key: LOG_CATEGORIES.CONFIG, name: '配置', icon: '📋', color: '#909399' },
      { key: LOG_CATEGORIES.NETWORK, name: '网络', icon: '🔗', color: '#F56C6C' },
      { key: LOG_CATEGORIES.ERROR, name: '错误', icon: '❌', color: '#F56C6C' },
      { key: LOG_CATEGORIES.DEBUG, name: '调试', icon: '🐛', color: '#909399' }
    ].map(category => ({
      ...category,
      count: categoryCounts[category.key] || 0
    }));
    
    res.json({ 
      success: true, 
      categories 
    });
  } catch (error) {
    console.error('获取日志分类失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 清理系统日志
app.delete('/api/system/logs', (req, res) => {
  try {
    systemLogs.length = 0; // 清空数组
    
    // 广播清理通知
    broadcastToSystemLogSubscribers({
      type: 'system_logs_cleared'
    });
    
    res.json({ 
      success: true,
      message: '系统日志已清理'
    });
  } catch (error) {
    console.error('清理系统日志失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 根据请求UUID获取请求详情
app.get('/api/request/:requestUuid/details', async (req, res) => {
  try {
    const { requestUuid } = req.params;
    
    // 从Map中查找请求详情
    const requestDetails = requestDetailsMap.get(requestUuid);
    if (!requestDetails) {
      return res.status(404).json({ success: false, error: '请求详情不存在' });
    }
    
    res.json({
      success: true,
      details: requestDetails
    });
    
  } catch (error) {
    console.error('获取请求详情失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取系统日志对应的请求详情（兼容旧API）
app.get('/api/system/logs/:logId/request-details', async (req, res) => {
  try {
    const { logId } = req.params;
    
    // 将logId转换为数字进行比较
    const numericLogId = parseFloat(logId);
    
    // 查找系统日志
    const systemLog = systemLogs.find(log => log.id === numericLogId);
    if (!systemLog) {
      console.log(`系统日志查找失败: logId=${logId}, numericLogId=${numericLogId}`);
      console.log(`现有日志IDs: ${systemLogs.slice(-5).map(log => log.id).join(', ')}`);
      return res.status(404).json({ success: false, error: '系统日志不存在' });
    }
    
    console.log(`找到系统日志: ${systemLog.message}`);
    console.log(`参数数量: ${systemLog.args ? systemLog.args.length : 0}`);
    if (systemLog.args && systemLog.args.length > 0) {
      console.log(`参数类型: ${systemLog.args.map(arg => typeof arg).join(', ')}`);
    }
    
    // 检查是否是代理请求日志
    const proxyPattern = /\[([^\]]+)\]\s+Proxying\s+(\w+)\s+(.+?)\s+to\s+(.+)/;
    const match = systemLog.message.match(proxyPattern);
    
    if (!match) {
      return res.status(400).json({ success: false, error: '该日志不是代理请求日志' });
    }
    
    // 尝试从系统日志的参数中提取请求详情信息
    let requestDetails = null;
    
    if (systemLog.args && systemLog.args.length > 0) {
      // 查找可能包含请求详情的参数
      for (let arg of systemLog.args) {
        // 如果参数是字符串，尝试解析为JSON
        if (typeof arg === 'string') {
          try {
            arg = JSON.parse(arg);
          } catch (e) {
            continue; // 如果不是有效的JSON，跳过
          }
        }
        
        if (typeof arg === 'object' && arg !== null) {
          // 检查是否包含请求详情的关键字段
          if (arg.method || arg.path || arg.status || arg.requestHeaders) {
            requestDetails = {
              method: arg.method || match[2],
              path: arg.path || match[3], 
              target: arg.target || match[4],
              status: arg.status || 200,
              duration: arg.duration || 0,
              timestamp: arg.timestamp || systemLog.timestamp,
              requestHeaders: arg.requestHeaders || {},
              responseHeaders: arg.responseHeaders || {},
              requestBody: arg.requestBody || null,
              responseBody: arg.responseBody || null,
              error: arg.error || null
            };
            break;
          }
        }
      }
    }
    
    // 如果没有找到详细信息，创建基本信息
    if (!requestDetails) {
      requestDetails = {
        method: match[2],
        path: match[3],
        target: match[4],
        status: 200,
        duration: 0,
        timestamp: systemLog.timestamp,
        requestHeaders: {},
        responseHeaders: {},
        requestBody: null,
        responseBody: null,
        error: null
      };
    }
    
    res.json({
      success: true,
      details: requestDetails
    });
    
  } catch (error) {
    console.error('获取系统日志请求详情失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 批量启动代理服务
app.post('/api/proxy/batchStart', async (req, res) => {
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
        
        // 静默成功，不记录日志
      } catch (error) {
        console.error(`批量启动失败 ${id}:`, error);
        errors.push({ id, error: error.message });
      }
    }

    // 只发送一次批量更新的WebSocket广播
    if (results.length > 0) {
      broadcast({ 
        type: 'batch_services_started', 
        data: { 
          services: results,
          count: results.length
        } 
      });
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
app.post('/api/proxy/batchStop', async (req, res) => {
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
        
        // 静默成功，不记录日志
      } catch (error) {
        console.error(`批量停止失败 ${id}:`, error);
        errors.push({ id, error: error.message });
      }
    }

    // 只发送一次批量更新的WebSocket广播
    if (results.length > 0) {
      broadcast({ 
        type: 'batch_services_stopped', 
        data: { 
          services: results,
          count: results.length
        } 
      });
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
    const { serviceName, targets, activeTarget, tags = [] } = req.body;
    
    // 检查服务名是否已存在
    const existingService = await database.getProxyServiceByName(serviceName);
    if (existingService) {
      return res.status(400).json({ success: false, error: '服务名称已存在' });
    }

    // 自动分配端口（4000-4100范围）
    const port = await database.getAvailablePort();

    const serviceConfig = { serviceName, port, targets, activeTarget, tags };
    const createdService = await database.createProxyService(serviceConfig);

    console.log(`✅ 创建代理服务成功: ${serviceName} -> 端口 ${port}${tags.length > 0 ? ` (标签: ${tags.join(', ')})` : ''}`);
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

    console.log(`停止代理服务: ${service.serviceName}`);
    
    // 先停止代理服务
    await stopProxyService(service);
    
    // 然后更新数据库状态
    await database.updateProxyService(id, { isRunning: false });

    const updatedService = await database.getProxyServiceById(id);
    broadcast({ type: 'proxy_stopped', data: updatedService });
    res.json({ success: true, message: `代理服务 ${service.serviceName} 已停止` });
  } catch (error) {
    console.error(`停止代理服务失败 (ID: ${req.params.id}):`, error);
    
    // 即使停止失败，也要尝试更新数据库状态
    try {
      await database.updateProxyService(req.params.id, { isRunning: false });
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

    // 如果服务正在运行，只能更新特定字段（targets和tags）
    if (service.isRunning) {
      const allowedUpdates = {};
      if (updates.targets) {
        allowedUpdates.targets = updates.targets;
      }
      if (updates.tags !== undefined) {
        allowedUpdates.tags = updates.tags;
      }
      if (updates.activeTarget) {
        allowedUpdates.activeTarget = updates.activeTarget;
      }
      if (Object.keys(allowedUpdates).length === 0) {
        return res.status(400).json({ success: false, error: '运行中的服务只能修改路由目标和标签' });
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
    const { name, color, type, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, error: '标签名称不能为空' });
    }
    
    const tag = await database.createTag({ name, color, type, description });
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
    const { name, color, type, description } = req.body;
    
    const result = await database.updateTag(id, { name, color, type, description });
    
    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: '标签不存在' });
    }
    
    broadcast({ type: 'tag_updated', data: { id, name, color, type, description } });
    
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

// 批量为服务添加标签
app.post('/api/proxy/batchTags', async (req, res) => {
  try {
    const { serviceIds, tagIds } = req.body;
    
    if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
      return res.status(400).json({ success: false, error: '请提供有效的服务ID列表' });
    }
    
    if (!Array.isArray(tagIds) || tagIds.length === 0) {
      return res.status(400).json({ success: false, error: '请提供有效的标签ID列表' });
    }

    // 使用批量添加标签的数据库方法
    const result = await database.batchAddServiceTags(serviceIds, tagIds);
    
    // 获取更新后的服务数据
    const updatedServices = [];
    for (const serviceId of serviceIds) {
      const service = await database.getProxyServiceById(serviceId);
      if (service) {
        updatedServices.push(service);
      }
    }

    // 只发送一次批量更新的WebSocket广播
    if (updatedServices.length > 0) {
      broadcast({ 
        type: 'batch_tags_updated', 
        data: { 
          services: updatedServices,
          addedTagIds: tagIds
        } 
      });
    }

    // 计算统计信息
    const totalPossibleRelations = serviceIds.length * tagIds.length;
    const skippedRelations = totalPossibleRelations - result.addedRelations;
    
    let message = '';
    if (result.addedRelations > 0) {
      message += `成功添加 ${result.addedRelations} 个标签关联`;
    }
    if (skippedRelations > 0) {
      if (message) message += '，';
      message += `跳过 ${skippedRelations} 个已存在的关联`;
    }
    if (!message) {
      message = '所有标签关联都已存在，无需添加';
    }

    console.log(`批量添加标签完成: ${result.addedRelations}/${totalPossibleRelations} 个关联已添加`);

    res.json({ 
      success: true, 
      message: message,
      stats: {
        addedRelations: result.addedRelations,
        skippedRelations: skippedRelations,
        totalPossibleRelations: totalPossibleRelations,
        servicesCount: serviceIds.length,
        tagsCount: tagIds.length
      },
      total: serviceIds.length,
      succeeded: updatedServices.length
    });
  } catch (error) {
    console.error('批量添加标签失败:', error);
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



// 本机IP缓存
let cachedLocalIP = null;
let lastIPFetchTime = 0;
const IP_CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

// 获取本地IP地址（支持数据库配置覆盖，带缓存）
async function getLocalIP() {
  const now = Date.now();
  
  // 如果缓存有效，直接返回缓存值
  if (cachedLocalIP && (now - lastIPFetchTime) < IP_CACHE_DURATION) {
    return cachedLocalIP;
  }
  
  try {
    // 1. 首先检查数据库中的配置
    const localIPConfig = await database.getLocalIPConfig();
    if (localIPConfig && localIPConfig.localIP) {
      // 只在IP发生变化或首次获取时打印日志
      if (cachedLocalIP !== localIPConfig.localIP) {
        console.log(`使用数据库配置的本机IP: ${localIPConfig.localIP}`);
      }
      cachedLocalIP = localIPConfig.localIP;
      lastIPFetchTime = now;
      return cachedLocalIP;
    }
  } catch (error) {
    console.warn('获取数据库中的本机IP配置失败:', error.message);
  }

  // 2. 检查环境变量（优先级次高）
  if (process.env.LOCAL_IP) {
    if (cachedLocalIP !== process.env.LOCAL_IP) {
      console.log(`使用环境变量 LOCAL_IP: ${process.env.LOCAL_IP}`);
    }
    cachedLocalIP = process.env.LOCAL_IP;
    lastIPFetchTime = now;
    return cachedLocalIP;
  }
  
  if (process.env.HOST_IP) {
    if (cachedLocalIP !== process.env.HOST_IP) {
      console.log(`使用环境变量 HOST_IP: ${process.env.HOST_IP}`);
    }
    cachedLocalIP = process.env.HOST_IP;
    lastIPFetchTime = now;
    return cachedLocalIP;
  }
  
  // 3. 容器环境下默认使用127.0.0.1（用户本地访问地址）
  if (cachedLocalIP !== '127.0.0.1') {
    console.log('使用默认本机IP: 127.0.0.1（用户本地访问地址）');
  }
  cachedLocalIP = '127.0.0.1';
  lastIPFetchTime = now;
  return cachedLocalIP;
}

// 清除IP缓存的函数（当IP配置更新时调用）
function clearLocalIPCache() {
  cachedLocalIP = null;
  lastIPFetchTime = 0;
  console.log('本机IP缓存已清除');
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
      // 生成唯一的请求UUID
      const requestUuid = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const requestDetails = {
        requestUuid: requestUuid,
        method: req.method,
        path: req.url,
        target: targets[activeTarget],
        requestHeaders: req.headers,
        requestBody: req.body,
        timestamp: new Date().toISOString()
      };
      
      // 记录到系统日志，包含详细的请求信息和UUID
      addSystemLog('info', `[${serviceName}] Proxying ${req.method} ${req.url} to ${targets[activeTarget]}`, serviceName, requestDetails);
      
      // 确保请求体被正确写入到代理请求中
      if (req.body && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
        const bodyData = JSON.stringify(req.body);
        proxyReq.setHeader('Content-Type', 'application/json');
        proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
        proxyReq.write(bodyData);
      }
      
      // 记录请求开始
      req.startTime = Date.now();
      req.requestUuid = requestUuid; // 保存UUID供响应时使用
      req.proxyLogData = {
        requestUuid: requestUuid,
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
        
        // 保存完整的请求详情到Map中
        const completeRequestDetails = {
          requestUuid: req.requestUuid,
          method: req.method,
          path: req.url,
          target: req.proxyLogData.target,
          status: proxyRes.statusCode,
          duration,
          timestamp: req.proxyLogData.timestamp,
          requestHeaders: req.proxyLogData.requestHeaders,
          responseHeaders: proxyRes.headers,
          requestBody: req.proxyLogData.requestBody,
          responseBody: parsedResponseBody,
          error: null
        };
        
        requestDetailsMap.set(req.requestUuid, completeRequestDetails);
        
        // 保持Map大小限制
        if (requestDetailsMap.size > MAX_REQUEST_DETAILS) {
          const oldestKey = requestDetailsMap.keys().next().value;
          requestDetailsMap.delete(oldestKey);
        }
        
        // 记录响应日志，但不包含详细信息（因为详情已在请求日志中）
        addSystemLog('info', `[${serviceName}] Proxy response ${proxyRes.statusCode} for ${req.method} ${req.url} (${duration}ms)`, serviceName, req.requestUuid);
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
      console.error(`⚠️ 服务 ${serviceName}:${port} 心跳定时器执行失败:`, error.message);
    }
  }, config.eureka.heartbeatInterval * 1000); // 配置的心跳间隔
  
  heartbeatTimers.set(heartbeatKey, heartbeatInterval);
  console.log(`🔄 已启动服务 ${serviceName}:${port} 的Eureka心跳定时器`);
}

// 停止Eureka心跳
async function stopEurekaHeartbeat(serviceName, port) {
  const heartbeatKey = `${serviceName}:${port}`;
  
  if (heartbeatTimers.has(heartbeatKey)) {
    clearInterval(heartbeatTimers.get(heartbeatKey));
    heartbeatTimers.delete(heartbeatKey);
    console.log(`🛑 已停止服务 ${serviceName}:${port} 的Eureka心跳定时器`);
  }
  
  // 清理心跳错误记录
  if (heartbeatErrors.has(heartbeatKey)) {
    heartbeatErrors.delete(heartbeatKey);
  }
  
      // 清理心跳历史数据
    await clearHeartbeatHistory(serviceName, port);
    
    // 清理健康状态记录
    await database.deleteServiceHealthStatus(serviceName, port);
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
      console.log(`✅ 服务 ${serviceName}:${port} 心跳已恢复`);
      
      // 广播状态更新
      broadcast({
        type: 'heartbeat_recovered',
        serviceName,
        port,
        message: `服务 ${serviceName} 心跳已恢复`
      });
    } else {
      // 正常心跳续约成功，记录日志（但降低频率避免刷屏）
      // 每分钟只记录一次正常心跳（6次心跳记录1次，因为心跳间隔是10秒）
      const heartbeatCount = (Date.now() / (10 * 1000)) % 6; // 每60秒循环一次
      if (Math.floor(heartbeatCount) === 0) {
        console.log(`💓 服务 ${serviceName}:${port} 心跳续约正常`);
      }
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
    
    console.error(`❌ 服务 ${serviceName}:${port} 心跳失败: ${error.message}`);
    
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
      
      // 清理不再运行的服务的健康状态记录
      await database.cleanupOldHealthStatus();
      
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
          
          // 广播恢复通知（这是独特的恢复事件，不会与状态检查重复）
          broadcast({
            type: 'eureka_health_recovered',
            message: `Eureka服务已恢复可用`,
            unavailableDuration: unavailableDuration,
            timestamp: new Date().toISOString()
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
            startTime: eurekaUnavailableStartTime,
            timestamp: new Date().toISOString()
          });
        } else {
          // 已经不可用一段时间了
          const unavailableDuration = (currentTime - eurekaUnavailableStartTime) / 1000;
          const maxUnavailableTime = 3 * 60; // 3分钟
          
          console.log(`⚠️ Eureka持续不可用 ${unavailableDuration.toFixed(1)}秒 (最大允许: ${maxUnavailableTime}秒)`);
          
          // 只在整数分钟时广播状态更新，减少消息频率
          if (Math.floor(unavailableDuration) % 30 === 0) {
            broadcast({
              type: 'eureka_health_status',
              message: `Eureka不可用已持续 ${Math.floor(unavailableDuration)}秒`,
              unavailableDuration: unavailableDuration,
              maxAllowedTime: maxUnavailableTime,
              remainingTime: Math.max(0, maxUnavailableTime - unavailableDuration),
              timestamp: new Date().toISOString()
            });
          }
          
          // 如果超过3分钟，自动终止所有服务
          if (unavailableDuration >= maxUnavailableTime && !isEurekaShutdownTriggered) {
            console.error(`🚨 Eureka服务不可用超过${maxUnavailableTime}秒，自动终止所有代理服务...`);
            isEurekaShutdownTriggered = true;
            
            // 广播紧急关闭通知
            broadcast({
              type: 'eureka_emergency_shutdown',
              message: `Eureka服务不可用超过${maxUnavailableTime}秒，系统自动终止所有代理服务`,
              unavailableDuration: unavailableDuration,
              reason: 'eureka_timeout',
              timestamp: new Date().toISOString()
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
  // 立即执行一次同步
  await syncServicesWithEureka();
  
  // 每60秒检查一次代理服务状态
  statusSyncTimer = setInterval(async () => {
    try {
      await syncServicesWithEureka();
    } catch (error) {
      console.error('状态同步失败:', error);
    }
  }, 60000); // 60秒间隔
}

// 停止状态同步检查
function stopStatusSync() {
  if (statusSyncTimer) {
    clearInterval(statusSyncTimer);
    statusSyncTimer = null;
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
      console.log('服务状态已同步');
    }
    // 无变更时静默，不记录日志
    
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
    stopServiceHealthCheck();
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

// 开发环境默认5175，生产环境使用3400，可通过PORT环境变量覆盖
const PORT = process.env.PORT || 5175;
server.listen(PORT, () => {
  console.log(`Switch Service server running on port ${PORT}`);
});

// 静态文件服务（生产环境）
const path = require('path');
const clientDistPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientDistPath));

// 前端路由 history fallback
app.get(/^\/(?!api\/|ws\/).*/, (req, res) => {
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
    const isLocalhost = localIP === 'localhost';
    if (!ipRegex.test(localIP) && !isLocalhost) {
      return res.status(400).json({ 
        success: false, 
        error: '请提供有效的IP地址格式' 
      });
    }
    
    const localIPConfig = { localIP };
    await database.setLocalIPConfig(localIPConfig);
    
    // 清除IP缓存，强制下次获取时重新读取
    clearLocalIPCache();
    
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

// 接口调试相关API
app.get('/api/debug/apis', async (req, res) => {
  try {
    const apis = await database.getDebugApis()
    res.json({ success: true, data: apis })
  } catch (error) {
    console.error('获取调试接口失败:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

app.post('/api/debug/apis', async (req, res) => {
  try {
    const { serviceName, apis } = req.body
    await database.saveDebugApis(serviceName, apis)
    res.json({ success: true })
  } catch (error) {
    console.error('保存调试接口失败:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

app.delete('/api/debug/apis/:serviceName/:apiId', async (req, res) => {
  try {
    const { serviceName, apiId } = req.params
    await database.deleteDebugApi(serviceName, parseInt(apiId))
    res.json({ success: true })
  } catch (error) {
    console.error('删除调试接口失败:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// 代理请求API（用于跨域请求）
app.post('/api/debug/proxy-request', async (req, res) => {
  try {
    const { url, method, headers, body, params } = req.body
    
    // 构建完整URL
    const targetUrl = new URL(url)
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (key && value) {
          targetUrl.searchParams.append(key, value)
        }
      })
    }

    // 构建请求选项
    const options = {
      method: method || 'GET',
      headers: headers || {}
    }

    // 添加请求体
    if (['POST', 'PUT', 'PATCH'].includes(method) && body) {
      options.body = body
    }

    const startTime = Date.now()
    const response = await fetch(targetUrl.toString(), options)
    const duration = Date.now() - startTime

    // 获取响应头
    const responseHeaders = {}
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })

    // 获取响应体
    let responseData
    const contentType = response.headers.get('content-type')
    if (contentType && contentType.includes('application/json')) {
      try {
        responseData = await response.json()
      } catch {
        responseData = await response.text()
      }
    } else {
      responseData = await response.text()
    }

    res.json({
      success: true,
      data: {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        data: responseData,
        duration
      }
    })

  } catch (error) {
    console.error('代理请求失败:', error)
    res.status(500).json({
      success: false,
      error: error.message,
      data: {
        status: 0,
        statusText: 'Network Error',
        headers: {},
        data: error.message,
        duration: 0
      }
    })
  }
})

// ===== 服务健康检查和自动恢复系统 =====

// 启动服务健康检查
function startServiceHealthCheck() {
  if (isHealthCheckActive) {
    return;
  }
  
  console.log('🔍 启动服务健康检查监控...');
  isHealthCheckActive = true;
  
  // 每10秒检查一次服务健康状态
  serviceHealthCheckTimer = setInterval(async () => {
    try {
      await performHealthCheck();
    } catch (error) {
      console.error('健康检查失败:', error);
    }
  }, HEARTBEAT_HEALTH_CONFIG.HEALTH_CHECK_INTERVAL);
}

// 停止服务健康检查
function stopServiceHealthCheck() {
  if (serviceHealthCheckTimer) {
    clearInterval(serviceHealthCheckTimer);
    serviceHealthCheckTimer = null;
    isHealthCheckActive = false;
    console.log('🛑 服务健康检查已停止');
  }
}

// 执行健康检查
async function performHealthCheck() {
  try {
    // 获取所有运行中的服务
    const runningServices = await database.getAllProxyServices();
    const activeServices = runningServices.filter(service => service.isRunning);
    
    if (activeServices.length === 0) {
      return;
    }
    
    // 检查每个服务的健康状态
    for (const service of activeServices) {
      const healthStatus = await checkServiceHealth(service.serviceName, service.port);
      
      if (healthStatus.needsRecovery && !autoRecoveryInProgress.has(`${service.serviceName}:${service.port}`)) {
        console.warn(`🚨 检测到服务异常: ${service.serviceName}:${service.port} - ${healthStatus.reason}`);
        
        // 启动自动恢复
        await autoRecoverService(service, healthStatus);
      }
    }
    
  } catch (error) {
    console.error('执行健康检查时出错:', error);
  }
}

// 检查单个服务的健康状态
async function checkServiceHealth(serviceName, port) {
  try {
    const currentTime = Math.floor(Date.now() / 1000);
    
    // 获取最近的心跳历史
    const recentHeartbeats = await database.getHeartbeatHistory(serviceName, port, HEARTBEAT_HEALTH_CONFIG.DETECTION_WINDOW_SIZE);
    
    if (recentHeartbeats.length === 0) {
      return {
        status: 'no_data',
        needsRecovery: false,
        reason: '没有心跳数据'
      };
    }
    
    // 计算健康指标
    const failedHeartbeats = recentHeartbeats.filter(h => h.status !== 'success');
    const failureRate = failedHeartbeats.length / recentHeartbeats.length;
    
    // 计算连续失败次数
    let consecutiveFailures = 0;
    for (const heartbeat of recentHeartbeats) {
      if (heartbeat.status !== 'success') {
        consecutiveFailures++;
      } else {
        break;
      }
    }
    
    // 检查最后一次成功心跳的时间
    const lastSuccessHeartbeat = recentHeartbeats.find(h => h.status === 'success');
    const lastSuccessTime = lastSuccessHeartbeat ? lastSuccessHeartbeat.timestamp : null;
    const timeSinceLastSuccess = lastSuccessTime ? (currentTime - lastSuccessTime) : null;
    
    // 获取现有的健康状态记录
    let existingHealthStatus = await database.getServiceHealthStatus(serviceName, port);
    
    // 判断是否需要恢复
    let needsRecovery = false;
    let status = 'healthy';
    let reason = '';
    
    if (consecutiveFailures >= HEARTBEAT_HEALTH_CONFIG.CONSECUTIVE_FAILURES_THRESHOLD) {
      needsRecovery = true;
      status = 'critical';
      reason = `连续${consecutiveFailures}次心跳失败`;
    } else if (failureRate >= HEARTBEAT_HEALTH_CONFIG.FAILURE_RATE_THRESHOLD) {
      needsRecovery = true;
      status = 'critical';
      reason = `心跳失败率${(failureRate * 100).toFixed(1)}%超过阈值`;
    } else if (timeSinceLastSuccess && timeSinceLastSuccess > HEARTBEAT_HEALTH_CONFIG.MIN_SUCCESS_INTERVAL) {
      needsRecovery = true;
      status = 'critical';
      reason = `超过${Math.floor(timeSinceLastSuccess / 60)}分钟无成功心跳`;
    } else if (consecutiveFailures >= 2) {
      status = 'warning';
      reason = `连续${consecutiveFailures}次心跳失败（接近阈值）`;
    } else if (failureRate >= 0.5) {
      status = 'warning';
      reason = `心跳失败率${(failureRate * 100).toFixed(1)}%偏高`;
    }
    
    // 更新健康状态到数据库
    const healthStatusData = {
      consecutiveFailures: consecutiveFailures,
      lastSuccessTime: lastSuccessTime,
      restartAttempts: existingHealthStatus?.restartAttempts || 0,
      status: status,
      failureRate: failureRate,
      lastCheckTime: currentTime
    };
    
    await database.updateServiceHealthStatus(serviceName, port, healthStatusData);
    
    // 广播健康状态更新
    if (status !== 'healthy') {
      broadcast({
        type: 'service_health_warning',
        serviceName,
        port,
        status,
        reason,
        consecutiveFailures,
        failureRate: (failureRate * 100).toFixed(1),
        timeSinceLastSuccess: timeSinceLastSuccess,
        timestamp: new Date().toISOString()
      });
    }
    
    return {
      status,
      needsRecovery,
      reason,
      consecutiveFailures,
      failureRate,
      timeSinceLastSuccess,
      restartAttempts: healthStatusData.restartAttempts
    };
    
  } catch (error) {
    console.error(`检查服务健康状态失败 ${serviceName}:${port}:`, error);
    return {
      status: 'error',
      needsRecovery: false,
      reason: '健康检查出错'
    };
  }
}

// 自动恢复服务
async function autoRecoverService(service, healthStatus) {
  const serviceKey = `${service.serviceName}:${service.port}`;
  
  // 检查是否超过最大重启次数
  if (healthStatus.restartAttempts >= HEARTBEAT_HEALTH_CONFIG.MAX_RESTART_ATTEMPTS) {
    console.error(`❌ 服务 ${serviceKey} 已达到最大重启次数(${HEARTBEAT_HEALTH_CONFIG.MAX_RESTART_ATTEMPTS})，停止自动恢复`);
    
    // 广播最终失败通知
    broadcast({
      type: 'service_recovery_failed',
      serviceName: service.serviceName,
      port: service.port,
      reason: `已达到最大重启次数(${HEARTBEAT_HEALTH_CONFIG.MAX_RESTART_ATTEMPTS})`,
      finalStatus: 'failed',
      timestamp: new Date().toISOString()
    });
    
    return;
  }
  
  // 标记为正在恢复
  autoRecoveryInProgress.add(serviceKey);
  
  try {
    console.log(`🔄 开始自动恢复服务: ${serviceKey} - 尝试次数: ${healthStatus.restartAttempts + 1}/${HEARTBEAT_HEALTH_CONFIG.MAX_RESTART_ATTEMPTS}`);
    
    // 广播恢复开始通知
    broadcast({
      type: 'service_recovery_started',
      serviceName: service.serviceName,
      port: service.port,
      attempt: healthStatus.restartAttempts + 1,
      maxAttempts: HEARTBEAT_HEALTH_CONFIG.MAX_RESTART_ATTEMPTS,
      reason: healthStatus.reason,
      timestamp: new Date().toISOString()
    });
    
    // 等待一段时间再重启（渐进式延迟，控制在60秒内）
    const delay = HEARTBEAT_HEALTH_CONFIG.AUTO_RESTART_DELAY + (healthStatus.restartAttempts * 10);
    console.log(`⏳ 等待 ${delay} 秒后重启服务...`);
    await new Promise(resolve => setTimeout(resolve, delay * 1000));
    
    // 步骤1: 先停止服务
    console.log(`🛑 停止服务: ${serviceKey}`);
    await stopProxyService(service);
    
    // 等待一秒确保完全停止
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 步骤2: 重新启动服务
    console.log(`🚀 重新启动服务: ${serviceKey}`);
    await startProxyService(service, { skipEurekaCheck: true });
    
    // 更新重启次数
    const newRestartAttempts = healthStatus.restartAttempts + 1;
    await database.updateServiceHealthStatus(service.serviceName, service.port, {
      ...healthStatus,
      restartAttempts: newRestartAttempts,
      status: 'recovering',
      lastCheckTime: Math.floor(Date.now() / 1000)
    });
    
    console.log(`✅ 服务 ${serviceKey} 自动恢复完成`);
    
    // 广播恢复成功通知
    broadcast({
      type: 'service_recovery_success',
      serviceName: service.serviceName,
      port: service.port,
      attempt: newRestartAttempts,
      message: `服务 ${serviceKey} 自动恢复成功`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`❌ 自动恢复服务失败 ${serviceKey}:`, error);
    
    // 更新重启次数（即使失败也要记录）
    const newRestartAttempts = healthStatus.restartAttempts + 1;
    await database.updateServiceHealthStatus(service.serviceName, service.port, {
      ...healthStatus,
      restartAttempts: newRestartAttempts,
      status: 'failed',
      lastCheckTime: Math.floor(Date.now() / 1000)
    });
    
    // 广播恢复失败通知
    broadcast({
      type: 'service_recovery_error',
      serviceName: service.serviceName,
      port: service.port,
      attempt: newRestartAttempts,
      error: error.message,
      message: `服务 ${serviceKey} 自动恢复失败: ${error.message}`,
      timestamp: new Date().toISOString()
    });
    
  } finally {
    // 移除恢复标记
    autoRecoveryInProgress.delete(serviceKey);
  }
}

// 获取所有服务健康状态（API接口）
app.get('/api/health/status', async (req, res) => {
  try {
    const healthStatuses = await database.getAllServiceHealthStatus();
    res.json({
      success: true,
      healthStatuses,
      isHealthCheckActive,
      config: HEARTBEAT_HEALTH_CONFIG
    });
  } catch (error) {
    console.error('获取健康状态失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 手动触发健康检查（API接口）
app.post('/api/health/check', async (req, res) => {
  try {
    await performHealthCheck();
    res.json({
      success: true,
      message: '健康检查已执行'
    });
  } catch (error) {
    console.error('手动健康检查失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 重置服务健康状态（API接口）
app.post('/api/health/reset/:serviceName/:port', async (req, res) => {
  try {
    const { serviceName, port } = req.params;
    await database.deleteServiceHealthStatus(serviceName, parseInt(port));
    
    console.log(`重置服务健康状态: ${serviceName}:${port}`);
    res.json({
      success: true,
      message: `服务 ${serviceName}:${port} 健康状态已重置`
    });
  } catch (error) {
    console.error('重置健康状态失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = app; 