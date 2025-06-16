# Switch Service

一个本地部署的SpringCloud服务管理和代理工具，用于连接和管理Eureka服务注册中心，并创建动态代理服务。

## 功能特性

### 1. Eureka服务管理
- 🔗 连接本地或远程Eureka服务器
- 📊 实时展示所有SpringCloud服务的基本信息
- ⚙️ 可配置Eureka服务器地址、端口和服务路径
- 🔄 支持定时刷新（10秒、1分钟、5分钟或手动）
- 📈 显示服务实例数量和健康状态

### 2. 动态代理服务
- 🚀 创建HTTP代理服务并自动注册到Eureka
- 🏷️ 自定义服务名称和端口号
- 🌐 支持多环境配置（测试、生产等）
- 🔄 动态切换代理目标，无需重启服务
- ⚡ 手动启动/停止代理服务
- ⚙️ 灵活的配置编辑（运行时可添加新路由）
- 💾 SQLite数据库持久化存储
- 🎯 完美支持SpringCloud OpenFeign调用

## 技术栈

**前端：**
- Vue 3
- Element Plus
- Pinia (状态管理)
- Vue Router
- Axios

**后端：**
- Node.js
- Express
- WebSocket (实时更新)
- http-proxy-middleware (代理中间件)
- eureka-js-client (Eureka客户端)
- SQLite3 (数据持久化)

**部署：**
- Docker
- Docker Compose
- PM2 (进程管理)

## 快速开始

### 使用Docker Compose（推荐）

1. 克隆项目：
\`\`\`bash
git clone <your-repo-url>
cd switch-service-web
\`\`\`

2. 启动服务：
\`\`\`bash
# 启动Switch Service和可选的Eureka Server
docker-compose up -d

# 或者只启动Switch Service（如果你已有Eureka Server）
docker-compose up -d switch-service
\`\`\`

3. 访问应用：
   - 前端界面: http://localhost:5173
   - 后端API: http://localhost:3000
   - Eureka Server (如果启用): http://localhost:8761

### 手动部署

1. 安装依赖：
\`\`\`bash
# 安装根目录依赖
npm install

# 安装后端依赖
cd server && npm install

# 安装前端依赖
cd ../client && npm install
\`\`\`

2. 开发模式运行：
\`\`\`bash
# 从根目录运行，会同时启动前后端
npm run dev
\`\`\`

3. 生产模式运行：
\`\`\`bash
# 构建前端
npm run build

# 启动后端服务
npm run server:start
\`\`\`

## 使用指南

### 1. 配置Eureka连接

在应用首页的"Eureka配置"部分：
- **主机地址**: 输入Eureka服务器的主机地址（默认：localhost）
- **端口**: 输入Eureka服务器端口（默认：8761）
- **服务路径**: 输入Eureka服务路径（默认：/eureka/apps）

点击"更新配置"保存设置。

### 2. 查看Eureka服务

配置完成后，左侧会显示所有注册到Eureka的服务：
- 服务名称
- 实例数量
- 健康状态
- 服务端口

### 3. 创建代理服务

在"代理服务管理"部分，点击"创建服务"：

1. **服务名称**: 输入要创建的代理服务名（如：user-service）
2. **服务端口**: 选择一个可用端口（避免与现有服务冲突）
3. **代理目标**: 配置多个环境的目标地址
   - 环境名称：如"测试环境"、"生产环境"
   - 目标URL：如"http://test.api.com"、"http://prod.api.com"

创建后，服务配置会保存到数据库，但默认处于停止状态。

### 4. 管理代理服务

每个代理服务都有以下操作：

- **启动/停止**: 手动控制服务运行状态
- **配置**: 编辑服务配置
  - 停止状态：可以修改所有配置
  - 运行状态：只能添加新的路由目标
- **删除**: 彻底删除服务配置

### 5. 切换代理目标

运行中的服务可以通过下拉菜单动态切换代理目标环境，服务会自动重启以应用新配置。

### 6. 数据持久化

所有代理服务配置都保存在SQLite数据库中，重启应用后配置不会丢失。运行中的服务会在启动时自动恢复。

## API接口

### Eureka相关
- \`GET /api/config\` - 获取当前配置
- \`POST /api/config/eureka\` - 更新Eureka配置
- \`GET /api/eureka/services\` - 获取Eureka服务列表

### 代理服务相关
- \`GET /api/proxy/list\` - 获取代理服务列表
- \`POST /api/proxy/create\` - 创建代理服务
- \`POST /api/proxy/:id/start\` - 启动代理服务
- \`POST /api/proxy/:id/stop\` - 停止代理服务
- \`POST /api/proxy/:id/switch\` - 切换代理目标
- \`PUT /api/proxy/:id\` - 更新代理服务配置
- \`DELETE /api/proxy/:id\` - 删除代理服务

## 配置说明

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| PORT | 3000 | 后端服务端口 |
| NODE_ENV | development | 运行环境 |

### Docker配置

项目包含以下Docker配置文件：
- \`Dockerfile\`: 主要的容器构建文件
- \`docker-compose.yml\`: 包含Switch Service和可选的Eureka Server
- \`ecosystem.config.js\`: PM2进程管理配置

## 使用场景

这个工具特别适用于以下场景：

1. **本地SpringCloud开发**: 需要在本地开发时连接不同环境的外部服务
2. **服务代理**: 通过Eureka服务名代理到实际的外部服务
3. **环境切换**: 在测试环境和生产环境之间快速切换
4. **服务监控**: 实时查看Eureka注册的服务状态

## 故障排除

### 常见问题

1. **无法连接Eureka服务器**
   - 检查Eureka服务器是否运行
   - 验证主机地址和端口配置
   - 确认防火墙设置

2. **代理服务创建失败**
   - 检查端口是否被占用
   - 验证目标URL是否可访问
   - 查看后端日志错误信息

3. **前端无法访问后端API**
   - 确认后端服务运行在端口3000
   - 检查CORS配置
   - 验证代理配置

### 日志查看

使用Docker时查看日志：
\`\`\`bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f switch-service
\`\`\`

## 贡献指南

欢迎提交Issue和Pull Request来改进这个项目！

## 许可证

MIT License 