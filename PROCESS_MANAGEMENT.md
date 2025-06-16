# 进程管理功能说明

## 概述

为了确保当主服务器关闭时，所有代理服务进程也能被正确关闭，我们实现了以下增强功能：

## 🔧 主要功能

### 1. 优雅关闭 (Graceful Shutdown)

服务器现在支持多种关闭信号的监听和处理：

- **SIGINT** (Ctrl+C)
- **SIGTERM** (正常终止)
- **SIGBREAK** (Windows Ctrl+Break)
- **控制台关闭事件** (Windows)

### 2. 进程跟踪

- **端口跟踪**: 自动跟踪所有代理服务使用的端口
- **连接管理**: 跟踪每个代理服务的活动连接
- **强制关闭**: 超时时强制关闭所有连接

### 3. 清理脚本

提供独立的清理脚本，用于清理可能残留的代理服务进程

## 🚀 使用方法

### 正常关闭服务器

```bash
# 在运行服务器的终端按 Ctrl+C
# 或发送 SIGTERM 信号
kill -TERM <server_pid>
```

### 使用清理脚本

```bash
# 清理所有残留的代理服务进程
npm run cleanup

# 或直接运行
node cleanup.js
```

### 查看端口状态

```bash
# 通过API查看跟踪的端口状态
curl http://localhost:3000/api/ports/status

# 强制清理指定端口
curl -X POST http://localhost:3000/api/ports/8080/kill
```

## 📋 关闭流程

当收到关闭信号时，服务器会按以下顺序执行：

1. **停止接受新连接** - 关闭HTTP服务器
2. **停止状态同步** - 清理定时器
3. **清理心跳定时器** - 停止所有Eureka心跳
4. **停止代理服务** - 优雅关闭所有代理服务（30秒超时）
5. **更新数据库状态** - 将所有服务状态设为停止
6. **关闭数据库连接** - 清理数据库资源
7. **进程退出** - 安全退出主进程

## ⚠️ 故障处理

### 如果优雅关闭失败

1. **强制关闭代理服务** - 直接关闭所有代理服务器
2. **进程管理器清理** - 使用系统命令强制终止进程
3. **强制更新数据库** - 确保状态一致性
4. **强制退出** - exit(1)

### 清理残留进程

如果主服务器异常退出，可能会有代理服务进程残留：

```bash
# 运行清理脚本
npm run cleanup
```

清理脚本会：
- 检查所有注册的代理服务端口
- 终止占用这些端口的进程
- 更新数据库中的服务状态

## 🔍 监控和调试

### 查看进程状态

```bash
# Windows
netstat -ano | findstr :8080

# Linux/Mac
lsof -ti:8080
```

### 日志输出

服务器关闭时会输出详细的日志信息：

```
收到 SIGINT 信号，开始优雅关闭...
HTTP服务器已停止接受新连接
状态同步已停止
所有心跳定时器已清理
正在停止 5 个代理服务...
- 准备停止: dspapi:27721
- 准备停止: admin-meta-api:8080
所有代理服务已停止
数据库服务状态已更新
数据库连接已关闭
✅ 所有服务已安全关闭
```

## 🛠️ 技术实现

### ProcessManager 类

- **端口跟踪**: 维护活跃端口列表
- **进程检测**: 跨平台进程ID获取
- **强制终止**: 安全的进程终止机制

### 连接管理

```javascript
// 跟踪每个代理服务的连接
const connections = new Set();
proxyServer.on('connection', (socket) => {
  connections.add(socket);
  socket.on('close', () => connections.delete(socket));
});

// 强制关闭所有连接
proxyServer.closeAllConnections = () => {
  for (const socket of connections) {
    socket.destroy();
  }
};
```

### 超时保护

- **优雅关闭超时**: 30秒
- **单个服务关闭超时**: 10秒
- **心跳超时**: 5秒

## 📝 最佳实践

1. **总是使用 Ctrl+C 正常关闭服务器**
2. **如果发现残留进程，运行清理脚本**
3. **定期检查端口占用状态**
4. **监控日志输出确保正常关闭**

## 🐛 故障排除

### 常见问题

**Q: 服务器关闭后仍有进程占用端口？**
A: 运行 `npm run cleanup` 清理残留进程

**Q: 清理脚本无法终止某些进程？**
A: 可能需要管理员权限，在Windows上以管理员身份运行

**Q: 数据库状态不一致？**
A: 清理脚本会自动同步数据库状态

### 手动清理

如果自动清理失败，可以手动清理：

```bash
# Windows - 查找和终止进程
netstat -ano | findstr :8080
taskkill /F /PID <PID>

# Linux/Mac - 查找和终止进程
lsof -ti:8080 | xargs kill -9
```

## 📊 API 端点

| 方法 | 端点 | 功能 |
|------|------|------|
| GET | `/api/ports/status` | 获取端口占用状态 |
| POST | `/api/ports/:port/kill` | 强制清理指定端口 |
| GET | `/api/heartbeat/status` | 获取心跳状态 |

通过这些功能，确保了代理服务的完整生命周期管理和资源清理。 