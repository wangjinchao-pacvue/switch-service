const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'data', 'switch-service.db');

class Database {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      // 确保data目录存在
      const fs = require('fs');
      const dataDir = path.dirname(DB_PATH);

      try {
        if (!fs.existsSync(dataDir)) {
          console.log('创建数据目录:', dataDir);
          fs.mkdirSync(dataDir, { recursive: true });
        }

        // 检查目录权限
        try {
          fs.accessSync(dataDir, fs.constants.W_OK);
          console.log('数据目录权限检查通过:', dataDir);
        } catch (accessErr) {
          console.error('数据目录权限不足:', accessErr);
          console.log('尝试修复权限...');
          try {
            fs.chmodSync(dataDir, 0o755);
            console.log('权限修复成功');
          } catch (chmodErr) {
            console.error('权限修复失败:', chmodErr);
          }
        }
      } catch (dirErr) {
        console.error('创建数据目录失败:', dirErr);
        reject(dirErr);
        return;
      }

      this.db = new sqlite3.Database(DB_PATH, (err) => {
        if (err) {
          console.error('数据库连接失败:', err);
          console.error('数据库路径:', DB_PATH);
          console.error('当前工作目录:', process.cwd());
          console.error('当前用户ID:', process.getuid ? process.getuid() : 'N/A');
          console.error('当前组ID:', process.getgid ? process.getgid() : 'N/A');
          reject(err);
        } else {
          console.log('SQLite数据库连接成功:', DB_PATH);
          this.createTables().then(resolve).catch(reject);
        }
      });
    });
  }

  async createTables() {
    return new Promise((resolve, reject) => {
      const createProxyServicesTable = `
        CREATE TABLE IF NOT EXISTS proxy_services (
          id TEXT PRIMARY KEY,
          service_name TEXT UNIQUE NOT NULL,
          port INTEGER NOT NULL,
          targets TEXT NOT NULL,
          active_target TEXT NOT NULL,
          is_running INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;

      const createTagsTable = `
        CREATE TABLE IF NOT EXISTS tags (
          id TEXT PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          color TEXT DEFAULT '#409eff',
          type TEXT DEFAULT 'default',
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;

      const createSystemConfigTable = `
        CREATE TABLE IF NOT EXISTS system_config (
          id INTEGER PRIMARY KEY,
          config_key TEXT UNIQUE NOT NULL,
          config_value TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;

      const createHeartbeatHistoryTable = `
        CREATE TABLE IF NOT EXISTS heartbeat_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          service_name TEXT NOT NULL,
          port INTEGER NOT NULL,
          status TEXT NOT NULL,
          message TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;

      const createProxyLogsTable = `
        CREATE TABLE IF NOT EXISTS proxy_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          service_name TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          method TEXT,
          path TEXT,
          target TEXT,
          status TEXT,
          duration INTEGER,
          request_headers TEXT,
          request_body TEXT,
          response_headers TEXT,
          response_body TEXT,
          error TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;

      const createDebugApisTable = `
        CREATE TABLE IF NOT EXISTS debug_apis (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          service_name TEXT NOT NULL,
          api_data TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;

      const createServiceTagsTable = `
        CREATE TABLE IF NOT EXISTS service_tags (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          service_id TEXT NOT NULL,
          tag_id TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (service_id) REFERENCES proxy_services(id) ON DELETE CASCADE,
          FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
          UNIQUE(service_id, tag_id)
        )
      `;

      const createServiceHealthStatusTable = `
        CREATE TABLE IF NOT EXISTS service_health_status (
          service_name TEXT NOT NULL,
          port INTEGER NOT NULL,
          consecutive_failures INTEGER DEFAULT 0,
          last_success_time INTEGER,
          restart_attempts INTEGER DEFAULT 0,
          status TEXT DEFAULT 'healthy',
          failure_rate REAL DEFAULT 0.0,
          last_check_time INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (service_name, port)
        )
      `;

      // 首先创建 proxy_services 表
      this.db.run(createProxyServicesTable, (err) => {
        if (err) {
          console.error('创建proxy_services表失败:', err);
          reject(err);
          return;
        }

        // 然后创建 tags 表
        this.db.run(createTagsTable, (tagErr) => {
          if (tagErr) {
            console.error('创建tags表失败:', tagErr);
            reject(tagErr);
            return;
          }

          // 创建 system_config 表
          this.db.run(createSystemConfigTable, (configErr) => {
            if (configErr) {
              console.error('创建system_config表失败:', configErr);
              reject(configErr);
              return;
            }

            // 创建 heartbeat_history 表
            this.db.run(createHeartbeatHistoryTable, (heartbeatErr) => {
              if (heartbeatErr) {
                console.error('创建heartbeat_history表失败:', heartbeatErr);
                reject(heartbeatErr);
                return;
              }

              // 创建 proxy_logs 表
              this.db.run(createProxyLogsTable, (logErr) => {
                if (logErr) {
                  console.error('创建proxy_logs表失败:', logErr);
                  reject(logErr);
                } else {
                  // 创建debug_apis表
                  this.db.run(createDebugApisTable, (debugErr) => {
                    if (debugErr) {
                      console.error('创建debug_apis表失败:', debugErr);
                      reject(debugErr);
                    } else {
                      // 创建service_tags表
                      this.db.run(createServiceTagsTable, (serviceTagsErr) => {
                        if (serviceTagsErr) {
                          console.error('创建service_tags表失败:', serviceTagsErr);
                          reject(serviceTagsErr);
                        } else {
                          // 创建service_health_status表
                          this.db.run(createServiceHealthStatusTable, (healthStatusErr) => {
                            if (healthStatusErr) {
                              console.error('创建service_health_status表失败:', healthStatusErr);
                              reject(healthStatusErr);
                            } else {
                              console.log('数据库表初始化完成');
                              // 初始化默认数据
                              this.initializeDefaultData().then(() => {
                                resolve();
                              }).catch(reject);
                            }
                          });
                        }
                      });
                    }
                  });
                }
              });
            });
          });
        });
      });
    });
  }

  // 初始化默认数据
  async initializeDefaultData() {
    console.log('开始初始化默认数据...');
    
    try {
      // 1. 初始化默认标签
      await this.initializeDefaultTags();
      
      // 2. 初始化端口范围配置（如果不存在）
      await this.initializePortRangeIfNeeded();
      
      // 3. 初始化健康检查配置
      await this.initializeHealthCheckConfig();
      
      console.log('✅ 默认数据初始化完成');
    } catch (error) {
      console.error('❌ 默认数据初始化失败:', error);
      throw error;
    }
  }

  // 初始化默认标签
  async initializeDefaultTags() {
    return new Promise((resolve, reject) => {
      // 先检查是否已有标签
      this.db.get('SELECT COUNT(*) as count FROM tags', (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        
        // 如果已有标签，跳过初始化
        if (row.count > 0) {
          console.log('标签表已有数据，跳过默认标签初始化');
          resolve();
          return;
        }
        
        // 定义默认标签
        const defaultTags = [
          {
            id: this.generateTagId(),
            name: '生产环境',
            color: '#f56c6c',
            type: 'environment',
            description: '生产环境服务'
          },
          {
            id: this.generateTagId(),
            name: '测试环境',
            color: '#e6a23c',
            type: 'environment',
            description: '测试环境服务'
          },
          {
            id: this.generateTagId(),
            name: '开发环境',
            color: '#67c23a',
            type: 'environment',
            description: '开发环境服务'
          },
          {
            id: this.generateTagId(),
            name: '微服务',
            color: '#409eff',
            type: 'architecture',
            description: '微服务架构'
          },
          {
            id: this.generateTagId(),
            name: '数据库',
            color: '#909399',
            type: 'category',
            description: '数据库相关服务'
          },
          {
            id: this.generateTagId(),
            name: 'API网关',
            color: '#606266',
            type: 'category',
            description: 'API网关服务'
          }
        ];
        
        // 插入默认标签
        const insertPromises = defaultTags.map(tag => {
          return new Promise((tagResolve, tagReject) => {
            const sql = `
              INSERT INTO tags (id, name, color, type, description)
              VALUES (?, ?, ?, ?, ?)
            `;
            this.db.run(sql, [tag.id, tag.name, tag.color, tag.type, tag.description], (tagErr) => {
              if (tagErr) {
                tagReject(tagErr);
              } else {
                tagResolve();
              }
            });
          });
        });
        
        Promise.all(insertPromises)
          .then(() => {
            console.log(`✅ 已初始化 ${defaultTags.length} 个默认标签`);
            resolve();
          })
          .catch(reject);
      });
    });
  }

  // 初始化端口范围配置（如果不存在）
  async initializePortRangeIfNeeded() {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT config_value FROM system_config WHERE config_key = ?', ['port_range'], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        
        // 如果已有端口范围配置，跳过
        if (row) {
          console.log('端口范围配置已存在，跳过初始化');
          resolve();
          return;
        }
        
        // 设置默认端口范围配置
        const defaultPortRange = {
          startPort: 4000,
          endPort: 4100,
          totalPorts: 101,
          description: '默认代理服务端口范围',
          createdAt: new Date().toISOString()
        };
        
        const sql = `
          INSERT INTO system_config (config_key, config_value)
          VALUES (?, ?)
        `;
        
        this.db.run(sql, ['port_range', JSON.stringify(defaultPortRange)], (configErr) => {
          if (configErr) {
            reject(configErr);
          } else {
            console.log('✅ 已初始化默认端口范围配置 (4000-4100)');
            resolve();
          }
        });
      });
    });
  }

  // 初始化健康检查配置
  async initializeHealthCheckConfig() {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT config_value FROM system_config WHERE config_key = ?', ['health_check_config'], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        
        // 如果已有健康检查配置，跳过
        if (row) {
          console.log('健康检查配置已存在，跳过初始化');
          resolve();
          return;
        }
        
        // 设置默认健康检查配置
        const defaultHealthConfig = {
          consecutiveFailuresThreshold: 3,
          failureRateThreshold: 0.7,
          detectionWindowSize: 10,
          autoRestartDelay: 60,
          maxRestartAttempts: 3,
          healthCheckInterval: 10000,
          minSuccessInterval: 300,
          enabled: true,
          description: '默认服务健康检查配置',
          createdAt: new Date().toISOString()
        };
        
        const sql = `
          INSERT INTO system_config (config_key, config_value)
          VALUES (?, ?)
        `;
        
        this.db.run(sql, ['health_check_config', JSON.stringify(defaultHealthConfig)], (configErr) => {
          if (configErr) {
            reject(configErr);
          } else {
            console.log('✅ 已初始化默认健康检查配置');
            resolve();
          }
        });
      });
    });
  }

  // 生成标签ID的辅助方法
  generateTagId() {
    return 'tag_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // 获取所有代理服务
  async getAllProxyServices() {
    return new Promise((resolve, reject) => {
      // 使用JOIN查询来获取服务及其标签
      const sql = `
        SELECT 
          ps.*,
          GROUP_CONCAT(st.tag_id) as tag_ids
        FROM proxy_services ps
        LEFT JOIN service_tags st ON ps.id = st.service_id
        GROUP BY ps.id
        ORDER BY ps.created_at DESC
      `;

      this.db.all(sql, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const services = rows.map(row => ({
            id: row.id,
            serviceName: row.service_name,
            port: row.port,
            targets: JSON.parse(row.targets),
            activeTarget: row.active_target,
            isRunning: Boolean(row.is_running),
            tags: row.tag_ids ? row.tag_ids.split(',').filter(Boolean) : [],
            createdAt: row.created_at,
            updatedAt: row.updated_at
          }));
          resolve(services);
        }
      });
    });
  }

  // 创建代理服务
  async createProxyService(serviceConfig) {
    const { id = uuidv4(), serviceName, port, targets, activeTarget, tags = [] } = serviceConfig;

    return new Promise((resolve, reject) => {
      // 开始事务
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');

        // 插入服务（不再需要tags字段）
        const serviceSql = `
          INSERT INTO proxy_services (id, service_name, port, targets, active_target, is_running)
          VALUES (?, ?, ?, ?, ?, 0)
        `;

        this.db.run(serviceSql, [id, serviceName, port, JSON.stringify(targets), activeTarget], (err) => {
          if (err) {
            this.db.run('ROLLBACK');
            reject(err);
            return;
          }

          // 如果有标签，插入标签关系
          if (tags.length > 0) {
            const tagSql = 'INSERT INTO service_tags (service_id, tag_id) VALUES (?, ?)';
            let completed = 0;
            let hasError = false;

            tags.forEach(tagId => {
              this.db.run(tagSql, [id, tagId], (tagErr) => {
                if (tagErr && !hasError) {
                  hasError = true;
                  this.db.run('ROLLBACK');
                  reject(tagErr);
                  return;
                }

                completed++;
                if (completed === tags.length) {
                  this.db.run('COMMIT');
                  resolve({ id, ...serviceConfig, isRunning: false, tags });
                }
              });
            });
          } else {
            this.db.run('COMMIT');
            resolve({ id, ...serviceConfig, isRunning: false, tags: [] });
          }
        });
      });
    });
  }

  // 更新代理服务
  async updateProxyService(id, updates) {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');

        // 处理非标签字段的更新
        const fields = [];
        const values = [];

        if (updates.targets !== undefined) {
          fields.push('targets = ?');
          values.push(JSON.stringify(updates.targets));
        }

        if (updates.activeTarget !== undefined) {
          fields.push('active_target = ?');
          values.push(updates.activeTarget);
        }

        if (updates.isRunning !== undefined) {
          fields.push('is_running = ?');
          values.push(updates.isRunning ? 1 : 0);
        }

        if (updates.port !== undefined) {
          fields.push('port = ?');
          values.push(updates.port);
        }

        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        // 更新服务基本信息
        if (fields.length > 1) { // 除了updated_at还有其他字段需要更新
          const sql = `UPDATE proxy_services SET ${fields.join(', ')} WHERE id = ?`;
          this.db.run(sql, values, (err) => {
            if (err) {
              this.db.run('ROLLBACK');
              reject(err);
              return;
            }

            this.updateServiceTags(id, updates.tags, resolve, reject);
          });
        } else {
          // 只更新标签
          this.updateServiceTags(id, updates.tags, resolve, reject);
        }
      });
    });
  }

  // 更新服务标签的内部方法
  updateServiceTags(serviceId, tags, resolve, reject) {
    if (tags === undefined) {
      // 没有标签更新，直接提交事务
      this.db.run('COMMIT');
      resolve({ changes: 1 });
      return;
    }

    // 删除现有的标签关系
    this.db.run('DELETE FROM service_tags WHERE service_id = ?', [serviceId], (deleteErr) => {
      if (deleteErr) {
        this.db.run('ROLLBACK');
        reject(deleteErr);
        return;
      }

      // 如果有新标签，插入新的关系
      if (tags.length > 0) {
        const tagSql = 'INSERT INTO service_tags (service_id, tag_id) VALUES (?, ?)';
        let completed = 0;
        let hasError = false;

        tags.forEach(tagId => {
          this.db.run(tagSql, [serviceId, tagId], (tagErr) => {
            if (tagErr && !hasError) {
              hasError = true;
              this.db.run('ROLLBACK');
              reject(tagErr);
              return;
            }

            completed++;
            if (completed === tags.length) {
              this.db.run('COMMIT');
              resolve({ changes: 1 });
            }
          });
        });
      } else {
        // 没有新标签，直接提交事务
        this.db.run('COMMIT');
        resolve({ changes: 1 });
      }
    });
  }

  // 删除代理服务
  async deleteProxyService(id) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM proxy_services WHERE id = ?', [id], function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // 根据ID获取代理服务
  async getProxyServiceById(id) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          ps.*,
          GROUP_CONCAT(st.tag_id) as tag_ids
        FROM proxy_services ps
        LEFT JOIN service_tags st ON ps.id = st.service_id
        WHERE ps.id = ?
        GROUP BY ps.id
      `;

      this.db.get(sql, [id], (err, row) => {
        if (err) {
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          resolve({
            id: row.id,
            serviceName: row.service_name,
            port: row.port,
            targets: JSON.parse(row.targets),
            activeTarget: row.active_target,
            isRunning: Boolean(row.is_running),
            tags: row.tag_ids ? row.tag_ids.split(',').filter(Boolean) : [],
            createdAt: row.created_at,
            updatedAt: row.updated_at
          });
        }
      });
    });
  }

  // 根据服务名获取代理服务
  async getProxyServiceByName(serviceName) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          ps.*,
          GROUP_CONCAT(st.tag_id) as tag_ids
        FROM proxy_services ps
        LEFT JOIN service_tags st ON ps.id = st.service_id
        WHERE ps.service_name = ?
        GROUP BY ps.id
      `;

      this.db.get(sql, [serviceName], (err, row) => {
        if (err) {
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          resolve({
            id: row.id,
            serviceName: row.service_name,
            port: row.port,
            targets: JSON.parse(row.targets),
            activeTarget: row.active_target,
            isRunning: Boolean(row.is_running),
            tags: row.tag_ids ? row.tag_ids.split(',').filter(Boolean) : [],
            createdAt: row.created_at,
            updatedAt: row.updated_at
          });
        }
      });
    });
  }

  // ===== 标签管理 =====

  // 获取所有标签
  async getAllTags() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM tags ORDER BY name', (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const tags = rows.map(row => ({
            id: row.id,
            name: row.name,
            color: row.color,
            type: row.type || 'default',
            description: row.description,
            createdAt: row.created_at
          }));
          resolve(tags);
        }
      });
    });
  }

  // 创建标签
  async createTag(tagData) {
    const id = uuidv4();
    const { name, color = '#409eff', type = 'default', description = '' } = tagData;

    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO tags (id, name, color, type, description)
        VALUES (?, ?, ?, ?, ?)
      `;

      this.db.run(sql, [id, name, color, type, description], function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, name, color, type, description });
        }
      });
    });
  }

  // 更新标签
  async updateTag(id, updates) {
    const fields = [];
    const values = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }

    if (updates.color !== undefined) {
      fields.push('color = ?');
      values.push(updates.color);
    }

    if (updates.type !== undefined) {
      fields.push('type = ?');
      values.push(updates.type);
    }

    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }

    values.push(id);

    return new Promise((resolve, reject) => {
      const sql = `UPDATE tags SET ${fields.join(', ')} WHERE id = ?`;

      this.db.run(sql, values, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // 删除标签
  async deleteTag(id) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM tags WHERE id = ?', [id], function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // 根据标签筛选代理服务
  async getProxyServicesByTags(tagIds) {
    return new Promise((resolve, reject) => {
      // 如果没有指定标签，返回所有服务
      if (!tagIds || tagIds.length === 0) {
        this.getAllProxyServices().then(resolve).catch(reject);
        return;
      }

      // 使用JOIN查询来筛选包含指定标签的服务
      const placeholders = tagIds.map(() => '?').join(',');
      const sql = `
        SELECT DISTINCT
          ps.*,
          GROUP_CONCAT(st.tag_id) as tag_ids
        FROM proxy_services ps
        INNER JOIN service_tags st ON ps.id = st.service_id
        WHERE st.tag_id IN (${placeholders})
        GROUP BY ps.id
        ORDER BY ps.created_at DESC
      `;

      this.db.all(sql, tagIds, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const services = rows.map(row => ({
            id: row.id,
            serviceName: row.service_name,
            port: row.port,
            targets: JSON.parse(row.targets),
            activeTarget: row.active_target,
            isRunning: Boolean(row.is_running),
            tags: row.tag_ids ? row.tag_ids.split(',').filter(Boolean) : [],
            createdAt: row.created_at,
            updatedAt: row.updated_at
          }));
          resolve(services);
        }
      });
    });
  }

  // 批量为服务添加标签
  async batchAddServiceTags(serviceIds, tagIds) {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');

        let addedRelations = 0;
        let totalOperations = 0;
        let completedOperations = 0;
        let hasError = false;

        // 计算需要插入的关系
        const insertPromises = [];

        serviceIds.forEach(serviceId => {
          tagIds.forEach(tagId => {
            totalOperations++;

            // 检查关系是否已存在
            const checkSql = 'SELECT 1 FROM service_tags WHERE service_id = ? AND tag_id = ?';
            this.db.get(checkSql, [serviceId, tagId], (checkErr, existingRow) => {
              if (checkErr && !hasError) {
                hasError = true;
                this.db.run('ROLLBACK');
                reject(checkErr);
                return;
              }

              // 如果关系不存在，则插入
              if (!existingRow) {
                const insertSql = 'INSERT INTO service_tags (service_id, tag_id) VALUES (?, ?)';
                this.db.run(insertSql, [serviceId, tagId], (insertErr) => {
                  if (insertErr && !hasError) {
                    hasError = true;
                    this.db.run('ROLLBACK');
                    reject(insertErr);
                    return;
                  }

                  if (!insertErr) {
                    addedRelations++;
                  }

                  completedOperations++;
                  if (completedOperations === totalOperations) {
                    this.db.run('COMMIT');
                    resolve({ addedRelations, totalOperations });
                  }
                });
              } else {
                // 关系已存在，跳过
                completedOperations++;
                if (completedOperations === totalOperations) {
                  this.db.run('COMMIT');
                  resolve({ addedRelations, totalOperations });
                }
              }
            });
          });
        });

        // 如果没有操作要执行
        if (totalOperations === 0) {
          this.db.run('COMMIT');
          resolve({ addedRelations: 0, totalOperations: 0 });
        }
      });
    });
  }

  // ===== 自动启动配置管理 =====

  // 获取自动启动配置
  async getAutoStartConfig() {
    return new Promise((resolve, reject) => {
      // 确保配置表存在
      this.createAutoStartTableIfNotExists().then(() => {
        this.db.get('SELECT service_ids FROM auto_start_config WHERE id = 1', (err, row) => {
          if (err) {
            reject(err);
          } else {
            const serviceIds = row ? JSON.parse(row.service_ids || '[]') : [];
            resolve({ serviceIds });
          }
        });
      }).catch(reject);
    });
  }

  // 更新自动启动配置
  async updateAutoStartConfig(serviceIds) {
    return new Promise((resolve, reject) => {
      // 确保配置表存在
      this.createAutoStartTableIfNotExists().then(() => {
        const serviceIdsStr = JSON.stringify(serviceIds || []);
        const sql = 'UPDATE auto_start_config SET service_ids = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1';

        this.db.run(sql, [serviceIdsStr], function (err) {
          if (err) {
            reject(err);
          } else {
            resolve({ changes: this.changes });
          }
        });
      }).catch(reject);
    });
  }

  // 创建自动启动配置表（如果不存在）
  async createAutoStartTableIfNotExists() {
    return new Promise((resolve, reject) => {
      const createAutoStartTable = `
        CREATE TABLE IF NOT EXISTS auto_start_config (
          id INTEGER PRIMARY KEY,
          service_ids TEXT DEFAULT '[]',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;

      this.db.run(createAutoStartTable, (err) => {
        if (err) {
          console.error('创建auto_start_config表失败:', err);
          reject(err);
        } else {
          // 检查是否有默认配置，如果没有则创建
          this.db.get('SELECT * FROM auto_start_config WHERE id = 1', (err, row) => {
            if (err) {
              reject(err);
            } else if (!row) {
              // 创建默认配置
              this.db.run('INSERT INTO auto_start_config (id, service_ids) VALUES (1, \'[]\')', (err) => {
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

  // ===== 系统配置管理方法 =====

  // 获取配置项
  async getConfig(configKey) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT config_value FROM system_config WHERE config_key = ?', [configKey], (err, row) => {
        if (err) {
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          try {
            // 尝试解析JSON
            const parsed = JSON.parse(row.config_value);
            resolve(parsed);
          } catch (parseErr) {
            // 如果不是JSON，返回原始值
            console.warn(`配置项 ${configKey} 不是有效的JSON格式:`, row.config_value);
            resolve(row.config_value);
          }
        }
      });
    });
  }

  // 设置配置项
  async setConfig(configKey, configValue) {
    return new Promise((resolve, reject) => {
      const value = typeof configValue === 'object' ? JSON.stringify(configValue) : configValue;

      const sql = `
        INSERT OR REPLACE INTO system_config (config_key, config_value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `;

      this.db.run(sql, [configKey, value], function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // 获取Eureka配置
  async getEurekaConfig() {
    return await this.getConfig('eureka_config');
  }

  // 保存Eureka配置
  async setEurekaConfig(eurekaConfig) {
    return await this.setConfig('eureka_config', eurekaConfig);
  }

  // 获取所有配置
  async getAllConfigs() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM system_config ORDER BY config_key', (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const configs = {};
          rows.forEach(row => {
            try {
              configs[row.config_key] = JSON.parse(row.config_value);
            } catch (parseErr) {
              configs[row.config_key] = row.config_value;
            }
          });
          resolve(configs);
        }
      });
    });
  }

  // ===== 心跳历史管理 =====

  // 记录心跳历史
  async recordHeartbeat(serviceName, port, status, message = null) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO heartbeat_history (service_name, port, status, message, created_at)
        VALUES (?, ?, ?, ?, ?)
      `;

      // 使用秒级时间戳
      const timestamp = Math.floor(Date.now() / 1000);

      this.db.run(sql, [serviceName, port, status, message, timestamp], function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID });
        }
      });
    });
  }

  // 获取心跳历史
  async getHeartbeatHistory(serviceName, port, limit = 100) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM heartbeat_history 
        WHERE service_name = ? AND port = ? 
        ORDER BY created_at DESC 
        LIMIT ?
      `;

      this.db.all(sql, [serviceName, port, limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const history = rows.map(row => ({
            id: row.id,
            serviceName: row.service_name,
            port: row.port,
            status: row.status,
            message: row.message,
            timestamp: row.created_at
          }));
          resolve(history);
        }
      });
    });
  }

  // 清理心跳历史
  async clearHeartbeatHistory(serviceName, port) {
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM heartbeat_history WHERE service_name = ? AND port = ?';

      this.db.run(sql, [serviceName, port], function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // 清理旧的心跳历史（保留最近N条）
  async cleanupOldHeartbeatHistory(keepRecords = 1000) {
    return new Promise((resolve, reject) => {
      const sql = `
        DELETE FROM heartbeat_history 
        WHERE id NOT IN (
          SELECT id FROM heartbeat_history 
          ORDER BY created_at DESC 
          LIMIT ?
        )
      `;

      this.db.run(sql, [keepRecords], function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // ===== 代理日志管理 =====

  // 记录代理日志
  async logProxyRequest(serviceName, logData) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO proxy_logs (
          service_name, timestamp, method, path, target, status, duration,
          request_headers, request_body, response_headers, response_body, error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const values = [
        serviceName,
        logData.timestamp,
        logData.method,
        logData.path,
        logData.target,
        logData.status,
        logData.duration,
        JSON.stringify(logData.requestHeaders || {}),
        JSON.stringify(logData.requestBody || {}),
        JSON.stringify(logData.responseHeaders || {}),
        JSON.stringify(logData.responseBody || {}),
        logData.error
      ];

      this.db.run(sql, values, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID });
        }
      });
    });
  }

  // 获取服务日志
  async getServiceLogs(serviceName, limit = 100) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM proxy_logs 
        WHERE service_name = ? 
        ORDER BY created_at DESC 
        LIMIT ?
      `;

      this.db.all(sql, [serviceName, limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const logs = rows.map(row => ({
            id: row.id,
            serviceName: row.service_name,
            timestamp: row.timestamp,
            method: row.method,
            path: row.path,
            target: row.target,
            status: row.status,
            duration: row.duration,
            requestHeaders: JSON.parse(row.request_headers || '{}'),
            requestBody: JSON.parse(row.request_body || '{}'),
            responseHeaders: JSON.parse(row.response_headers || '{}'),
            responseBody: JSON.parse(row.response_body || '{}'),
            error: row.error,
            createdAt: row.created_at
          }));
          resolve(logs);
        }
      });
    });
  }

  // 清理服务日志
  async clearServiceLogs(serviceName) {
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM proxy_logs WHERE service_name = ?';

      this.db.run(sql, [serviceName], function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // 获取请求日志详情
  async getRequestLogDetails(serviceName, logId) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM proxy_logs 
        WHERE service_name = ? AND id = ?
      `;

      this.db.get(sql, [serviceName, logId], (err, row) => {
        if (err) {
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          const logDetails = {
            id: row.id,
            serviceName: row.service_name,
            timestamp: row.timestamp,
            method: row.method,
            path: row.path,
            target: row.target,
            status: row.status,
            duration: row.duration,
            requestHeaders: JSON.parse(row.request_headers || '{}'),
            requestBody: JSON.parse(row.request_body || 'null'),
            responseHeaders: JSON.parse(row.response_headers || '{}'),
            responseBody: JSON.parse(row.response_body || 'null'),
            error: row.error,
            createdAt: row.created_at
          };
          resolve(logDetails);
        }
      });
    });
  }

  // 清理旧的代理日志（保留最近N条）
  async cleanupOldProxyLogs(keepRecords = 10000) {
    return new Promise((resolve, reject) => {
      const sql = `
        DELETE FROM proxy_logs 
        WHERE id NOT IN (
          SELECT id FROM proxy_logs 
          ORDER BY created_at DESC 
          LIMIT ?
        )
      `;

      this.db.run(sql, [keepRecords], function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // 获取本机IP配置
  async getLocalIPConfig() {
    const result = await this.getConfig('local_ip');
    return result;
  }

  // 设置本机IP配置
  async setLocalIPConfig(localIPConfig) {
    await this.setConfig('local_ip', localIPConfig);
  }

  // 获取端口范围配置
  async getPortRangeConfig() {
    const result = await this.getConfig('port_range');
    return result;
  }

  // 设置端口范围配置
  async setPortRangeConfig(portRangeConfig) {
    await this.setConfig('port_range', portRangeConfig);
  }

  // 获取可用端口 (支持动态端口范围)
  async getAvailablePort() {
    return new Promise(async (resolve, reject) => {
      try {
        // 获取端口范围配置
        const portRangeConfig = await this.getPortRangeConfig();
        const startPort = portRangeConfig?.startPort || 4000;
        const endPort = portRangeConfig?.endPort || 4100;

        // 查询所有已使用的端口
        this.db.all('SELECT port FROM proxy_services', (err, rows) => {
          if (err) {
            reject(err);
            return;
          }

          const usedPorts = new Set(rows.map(row => row.port));

          // 从起始端口开始查找可用端口
          for (let port = startPort; port <= endPort; port++) {
            if (!usedPorts.has(port)) {
              resolve(port);
              return;
            }
          }

          // 如果所有端口都被占用，返回错误
          reject(new Error(`所有端口(${startPort}-${endPort})都已被占用，请释放一些端口或调整端口范围配置`));
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  // 检查端口是否在允许范围内且可用
  async isPortAvailable(port) {
    try {
      // 获取端口范围配置
      const portRangeConfig = await this.getPortRangeConfig();
      const startPort = portRangeConfig?.startPort || 4000;
      const endPort = portRangeConfig?.endPort || 4100;

      // 检查端口范围
      if (port < startPort || port > endPort) {
        throw new Error(`端口必须在${startPort}-${endPort}范围内`);
      }

      return new Promise((resolve, reject) => {
        this.db.get('SELECT id FROM proxy_services WHERE port = ?', [port], (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(!row); // 如果没有找到记录，说明端口可用
          }
        });
      });
    } catch (error) {
      throw error;
    }
  }

  // 获取端口使用情况统计
  async getPortUsageStats() {
    return new Promise(async (resolve, reject) => {
      try {
        // 获取端口范围配置
        const portRangeConfig = await this.getPortRangeConfig();
        const startPort = portRangeConfig?.startPort || 4000;
        const endPort = portRangeConfig?.endPort || 4100;
        const totalPorts = endPort - startPort + 1;

        this.db.all('SELECT port FROM proxy_services ORDER BY port', (err, rows) => {
          if (err) {
            reject(err);
            return;
          }

          const usedPorts = rows.map(row => row.port);
          const availablePorts = [];

          for (let port = startPort; port <= endPort; port++) {
            if (!usedPorts.includes(port)) {
              availablePorts.push(port);
            }
          }

          resolve({
            startPort: startPort,
            endPort: endPort,
            totalPorts: totalPorts,
            usedPorts: usedPorts,
            usedCount: usedPorts.length,
            availablePorts: availablePorts,
            availableCount: availablePorts.length
          });
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  // 调试接口相关方法
  async getDebugApis() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM debug_apis ORDER BY service_name, id', (err, rows) => {
        if (err) {
          reject(err);
          return;
        }

        const result = {};
        if (rows && rows.length > 0) {
          rows.forEach(row => {
            if (!result[row.service_name]) {
              result[row.service_name] = [];
            }
            result[row.service_name] = JSON.parse(row.api_data);
          });
        }

        resolve(result);
      });
    });
  }

  async saveDebugApis(serviceName, apis) {
    return new Promise((resolve, reject) => {
      // 先删除现有记录
      this.db.run('DELETE FROM debug_apis WHERE service_name = ?', [serviceName], (err) => {
        if (err) {
          reject(err);
          return;
        }

        // 如果有接口数据，则插入新记录
        if (apis && apis.length > 0) {
          this.db.run(`
            INSERT INTO debug_apis (service_name, api_data, updated_at) 
            VALUES (?, ?, CURRENT_TIMESTAMP)
          `, [serviceName, JSON.stringify(apis)], (insertErr) => {
            if (insertErr) {
              reject(insertErr);
            } else {
              console.log(`保存服务 ${serviceName} 的调试接口配置，共 ${apis.length} 个接口`);
              resolve();
            }
          });
        } else {
          console.log(`清空服务 ${serviceName} 的调试接口配置`);
          resolve();
        }
      });
    });
  }

  async deleteDebugApi(serviceName, apiId) {
    return new Promise((resolve, reject) => {
      // 先获取当前数据
      this.db.get('SELECT api_data FROM debug_apis WHERE service_name = ?', [serviceName], (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        if (row) {
          const apis = JSON.parse(row.api_data);
          const filteredApis = apis.filter(api => api.id !== apiId);

          if (filteredApis.length === 0) {
            // 如果没有接口了，删除整个记录
            this.db.run('DELETE FROM debug_apis WHERE service_name = ?', [serviceName], (deleteErr) => {
              if (deleteErr) {
                reject(deleteErr);
              } else {
                console.log(`删除服务 ${serviceName} 的调试接口 (ID: ${apiId})，记录已清空`);
                resolve();
              }
            });
          } else {
            // 更新数据
            this.db.run(`
              UPDATE debug_apis 
              SET api_data = ?, updated_at = CURRENT_TIMESTAMP 
              WHERE service_name = ?
            `, [JSON.stringify(filteredApis), serviceName], (updateErr) => {
              if (updateErr) {
                reject(updateErr);
              } else {
                console.log(`删除服务 ${serviceName} 的调试接口 (ID: ${apiId})`);
                resolve();
              }
            });
          }
        } else {
          console.log(`服务 ${serviceName} 没有找到调试接口记录`);
          resolve();
        }
      });
    });
  }

  // ===== 服务健康状态管理 =====

  // 获取服务健康状态
  async getServiceHealthStatus(serviceName, port) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM service_health_status WHERE service_name = ? AND port = ?';
      
      this.db.get(sql, [serviceName, port], (err, row) => {
        if (err) {
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          resolve({
            serviceName: row.service_name,
            port: row.port,
            consecutiveFailures: row.consecutive_failures,
            lastSuccessTime: row.last_success_time,
            restartAttempts: row.restart_attempts,
            status: row.status,
            failureRate: row.failure_rate,
            lastCheckTime: row.last_check_time,
            createdAt: row.created_at,
            updatedAt: row.updated_at
          });
        }
      });
    });
  }

  // 更新服务健康状态
  async updateServiceHealthStatus(serviceName, port, statusData) {
    return new Promise((resolve, reject) => {
      const {
        consecutiveFailures,
        lastSuccessTime,
        restartAttempts,
        status,
        failureRate,
        lastCheckTime
      } = statusData;

      const sql = `
        INSERT OR REPLACE INTO service_health_status (
          service_name, port, consecutive_failures, last_success_time,
          restart_attempts, status, failure_rate, last_check_time, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;

      this.db.run(sql, [
        serviceName, port, consecutiveFailures || 0, lastSuccessTime,
        restartAttempts || 0, status || 'healthy', failureRate || 0.0, 
        lastCheckTime || Math.floor(Date.now() / 1000)
      ], function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // 获取所有健康状态
  async getAllServiceHealthStatus() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM service_health_status ORDER BY service_name, port';
      
      this.db.all(sql, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const healthStatuses = rows.map(row => ({
            serviceName: row.service_name,
            port: row.port,
            consecutiveFailures: row.consecutive_failures,
            lastSuccessTime: row.last_success_time,
            restartAttempts: row.restart_attempts,
            status: row.status,
            failureRate: row.failure_rate,
            lastCheckTime: row.last_check_time,
            createdAt: row.created_at,
            updatedAt: row.updated_at
          }));
          resolve(healthStatuses);
        }
      });
    });
  }

  // 删除服务健康状态记录
  async deleteServiceHealthStatus(serviceName, port) {
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM service_health_status WHERE service_name = ? AND port = ?';
      
      this.db.run(sql, [serviceName, port], function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // 清理旧的健康状态记录（清理不再运行的服务）
  async cleanupOldHealthStatus() {
    return new Promise((resolve, reject) => {
      const sql = `
        DELETE FROM service_health_status 
        WHERE (service_name, port) NOT IN (
          SELECT service_name, port FROM proxy_services WHERE is_running = 1
        )
      `;
      
      this.db.run(sql, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error('关闭数据库连接失败:', err);
        } else {
          console.log('数据库连接已关闭');
        }
      });
    }
  }
}

module.exports = new Database(); 