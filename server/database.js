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
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      this.db = new sqlite3.Database(DB_PATH, (err) => {
        if (err) {
          console.error('数据库连接失败:', err);
          reject(err);
        } else {
          console.log('SQLite数据库连接成功');
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
          tags TEXT DEFAULT '[]',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;

      const createTagsTable = `
        CREATE TABLE IF NOT EXISTS tags (
          id TEXT PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          color TEXT DEFAULT '#409eff',
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;

      // 首先创建 proxy_services 表
      this.db.run(createProxyServicesTable, (err) => {
        if (err) {
          console.error('创建proxy_services表失败:', err);
          reject(err);
          return;
        }

        // 检查并添加 tags 列（如果不存在）
        this.db.run('ALTER TABLE proxy_services ADD COLUMN tags TEXT DEFAULT \'[]\'', (alterErr) => {
          // 忽略列已存在的错误
          if (alterErr && !alterErr.message.includes('duplicate column name')) {
            console.error('添加tags列失败:', alterErr);
          }

          // 然后创建 tags 表
          this.db.run(createTagsTable, (tagErr) => {
            if (tagErr) {
              console.error('创建tags表失败:', tagErr);
              reject(tagErr);
            } else {
              console.log('数据库表初始化完成');
              resolve();
            }
          });
        });
      });
    });
  }

  // 获取所有代理服务
  async getAllProxyServices() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM proxy_services ORDER BY created_at DESC', (err, rows) => {
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
            tags: JSON.parse(row.tags || '[]'),
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
    const id = uuidv4();
    const { serviceName, port, targets, activeTarget } = serviceConfig;
    
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO proxy_services (id, service_name, port, targets, active_target, is_running)
        VALUES (?, ?, ?, ?, ?, 0)
      `;
      
      this.db.run(sql, [id, serviceName, port, JSON.stringify(targets), activeTarget], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, ...serviceConfig, isRunning: false });
        }
      });
    });
  }

  // 更新代理服务
  async updateProxyService(id, updates) {
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

    if (updates.tags !== undefined) {
      fields.push('tags = ?');
      values.push(JSON.stringify(updates.tags));
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    return new Promise((resolve, reject) => {
      const sql = `UPDATE proxy_services SET ${fields.join(', ')} WHERE id = ?`;
      
      this.db.run(sql, values, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // 删除代理服务
  async deleteProxyService(id) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM proxy_services WHERE id = ?', [id], function(err) {
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
      this.db.get('SELECT * FROM proxy_services WHERE id = ?', [id], (err, row) => {
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
            tags: JSON.parse(row.tags || '[]'),
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
      this.db.get('SELECT * FROM proxy_services WHERE service_name = ?', [serviceName], (err, row) => {
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
            tags: JSON.parse(row.tags || '[]'),
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
    const { name, color = '#409eff', description = '' } = tagData;
    
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO tags (id, name, color, description)
        VALUES (?, ?, ?, ?)
      `;
      
      this.db.run(sql, [id, name, color, description], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, name, color, description });
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
    
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }

    values.push(id);

    return new Promise((resolve, reject) => {
      const sql = `UPDATE tags SET ${fields.join(', ')} WHERE id = ?`;
      
      this.db.run(sql, values, function(err) {
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
      this.db.run('DELETE FROM tags WHERE id = ?', [id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // 根据标签筛选代理服务
  async getProxyServicesByTags(tagNames) {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM proxy_services ORDER BY created_at DESC', (err, rows) => {
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
            tags: JSON.parse(row.tags || '[]'),
            createdAt: row.created_at,
            updatedAt: row.updated_at
          }));
          
          // 如果没有指定标签，返回所有服务
          if (!tagNames || tagNames.length === 0) {
            resolve(services);
            return;
          }
          
          // 筛选包含指定标签的服务
          const filteredServices = services.filter(service => {
            return tagNames.some(tagName => service.tags.includes(tagName));
          });
          
          resolve(filteredServices);
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
        
        this.db.run(sql, [serviceIdsStr], function(err) {
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
      const sql = `
        CREATE TABLE IF NOT EXISTS auto_start_config (
          id INTEGER PRIMARY KEY,
          service_ids TEXT DEFAULT '[]',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;
      
      this.db.run(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          // 确保有一行默认配置
          this.db.get('SELECT * FROM auto_start_config WHERE id = 1', (err, row) => {
            if (err) {
              reject(err);
            } else if (!row) {
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