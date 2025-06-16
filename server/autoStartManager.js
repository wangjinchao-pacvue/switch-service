const database = require('./database');
const serviceEventManager = require('./serviceEventManager');

class AutoStartManager {
  constructor() {
    this.autoStartServices = new Set(); // 存储需要自动启动的服务ID
    this.initialized = false;
  }

  // 初始化，注册为服务事件观察者
  async init() {
    if (this.initialized) return;
    
    try {
      // 从数据库加载自动启动配置
      await this.loadAutoStartConfig();
      
      // 注册为服务删除事件的观察者
      serviceEventManager.subscribe('service_deleted', this);
      serviceEventManager.subscribe('service_created', this);
      
      this.initialized = true;
      console.log('AutoStartManager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize AutoStartManager:', error);
    }
  }

  // 实现观察者接口
  handleEvent(eventType, data) {
    switch (eventType) {
      case 'service_deleted':
        this.removeFromAutoStart(data.serviceId);
        break;
      case 'service_created':
        console.log(`Service created: ${data.serviceId}`);
        break;
    }
  }

  // 从数据库加载自动启动配置
  async loadAutoStartConfig() {
    try {
      // 检查配置表是否存在，如果不存在则创建
      await this.createConfigTableIfNotExists();
      
      const result = await this.getAutoStartConfigFromDB();
      this.autoStartServices = new Set(result.serviceIds || []);
      console.log(`Loaded ${this.autoStartServices.size} auto-start services`);
    } catch (error) {
      console.error('Failed to load auto-start config:', error);
      this.autoStartServices = new Set();
    }
  }

  // 创建配置表
  async createConfigTableIfNotExists() {
    return new Promise((resolve, reject) => {
      const sql = `
        CREATE TABLE IF NOT EXISTS auto_start_config (
          id INTEGER PRIMARY KEY,
          service_ids TEXT DEFAULT '[]',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;
      
      database.db.run(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          // 确保有一行默认配置
          database.db.get('SELECT * FROM auto_start_config WHERE id = 1', (err, row) => {
            if (err) {
              reject(err);
            } else if (!row) {
              database.db.run('INSERT INTO auto_start_config (id, service_ids) VALUES (1, \'[]\')', (err) => {
                if (err) {
                  reject(err);
                } else {
                  resolve();
                }
              });
            } else {
              resolve();
            }
          });
        }
      });
    });
  }

  // 从数据库获取自动启动配置
  async getAutoStartConfigFromDB() {
    return new Promise((resolve, reject) => {
      database.db.get('SELECT service_ids FROM auto_start_config WHERE id = 1', (err, row) => {
        if (err) {
          reject(err);
        } else {
          const serviceIds = row ? JSON.parse(row.service_ids || '[]') : [];
          resolve({ serviceIds });
        }
      });
    });
  }

  // 保存自动启动配置到数据库
  async saveAutoStartConfigToDB() {
    return new Promise((resolve, reject) => {
      const serviceIds = JSON.stringify(Array.from(this.autoStartServices));
      const sql = 'UPDATE auto_start_config SET service_ids = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1';
      
      database.db.run(sql, [serviceIds], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // 添加服务到自动启动列表
  async addToAutoStart(serviceId) {
    if (!this.initialized) {
      throw new Error('AutoStartManager not initialized');
    }
    
    // 验证服务是否存在
    const service = await database.getProxyServiceById(serviceId);
    if (!service) {
      throw new Error('Service not found');
    }
    
    this.autoStartServices.add(serviceId);
    await this.saveAutoStartConfigToDB();
    console.log(`Added service ${serviceId} to auto-start list`);
  }

  // 从自动启动列表移除服务
  async removeFromAutoStart(serviceId) {
    if (!this.initialized) {
      console.warn('AutoStartManager not initialized, skipping removal');
      return;
    }
    
    if (this.autoStartServices.has(serviceId)) {
      this.autoStartServices.delete(serviceId);
      await this.saveAutoStartConfigToDB();
      console.log(`Removed service ${serviceId} from auto-start list`);
    }
  }

  // 获取自动启动服务列表
  getAutoStartServices() {
    return Array.from(this.autoStartServices);
  }

  // 检查服务是否在自动启动列表中
  isAutoStartEnabled(serviceId) {
    return this.autoStartServices.has(serviceId);
  }

  // 执行自动启动
  async executeAutoStart(startServiceFunction) {
    const results = {
      succeeded: 0,
      failed: 0,
      errors: []
    };
    
    if (!this.initialized) {
      console.warn('AutoStartManager not initialized, skipping auto-start');
      return results;
    }
    
    const autoStartIds = Array.from(this.autoStartServices);
    if (autoStartIds.length === 0) {
      console.log('No services configured for auto-start');
      return results;
    }
    
    console.log(`Starting auto-start for ${autoStartIds.length} services...`);
    
    for (const serviceId of autoStartIds) {
      try {
        const service = await database.getProxyServiceById(serviceId);
        if (service && !service.isRunning) {
          console.log(`Starting auto-start for service: ${service.serviceName} (ID: ${serviceId})`);
          await startServiceFunction(service);
          results.succeeded++;
          console.log(`✅ Auto-started service: ${service.serviceName}`);
        } else if (!service) {
          console.warn(`Auto-start service not found: ${serviceId}, removing from list`);
          await this.removeFromAutoStart(serviceId);
        } else {
          console.log(`Service ${service.serviceName} already running, skipping auto-start`);
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          serviceId,
          error: error.message
        });
        console.error(`❌ Failed to auto-start service ${serviceId}:`, error);
      }
    }
    
    console.log(`Auto-start completed: ${results.succeeded} succeeded, ${results.failed} failed`);
    return results;
  }
}

// 导出单例实例
module.exports = new AutoStartManager(); 