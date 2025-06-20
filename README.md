# Switch Service Web

一个基于SpringCloud的服务管理和代理工具，连接Eureka服务注册中心，提供服务代理、监控和管理功能。

## 功能特性

- 🔄 **服务代理** - 动态创建和管理HTTP代理服务
- 📊 **服务监控** - 实时监控代理服务状态和心跳
- 🎯 **目标切换** - 支持多环境目标服务切换
- 📝 **请求日志** - 记录和查看代理请求的详细日志
- 🏷️ **标签管理** - 为服务添加标签进行分类管理
- ⚙️ **端口管理** - 自动分配和管理端口范围

## Docker 安装

### 方式一：使用预构建镜像（推荐）

```bash
# 直接运行预构建镜像
docker run -d \
  --name switch-service \
  -p 3400:3400 \
  -p 4000-4100:4000-4100 \
  jcwangdocker/switch-service:1.0.0
```

### 方式二：使用 Docker Compose

```bash
# 克隆项目
git clone https://github.com/wangjinchao-pacvue/switch-service.git
cd switch-service-web

# 启动服务（包含可选的Eureka服务器）
docker-compose up -d

# 仅启动Switch Service
docker-compose up -d switch-service
```

### 方式三：本地构建

```bash
# 1. 克隆项目
git clone https://github.com/wangjinchao-pacvue/switch-service.git
cd switch-service-web

# 2. 使用构建脚本
bash build_and_push.sh [tag] [repo]

# 3. 或手动构建
docker build -t switch-service-web .

# 4. 运行容器
docker run -d \
  --name switch-service \
  -p 3400:3400 \
  -p 4000-4100:4000-4100 \
  switch-service-web
```

### 高级配置

#### 自定义端口范围
```bash
docker run -d \
  --name switch-service \
  -p 3400:3400 \
  -p 5000-5200:5000-5200 \
  -e PORT_RANGE_START=5000 \
  -e PORT_RANGE_END=5200 \
  jcwangdocker/switch-service:1.0.0
```

#### 数据持久化
```bash
docker run -d \
  --name switch-service \
  -p 3400:3400 \
  -p 4000-4100:4000-4100 \
  -v $(pwd)/data:/app/server/data \
  jcwangdocker/switch-service:1.0.0
```

#### 查看容器日志
```bash
# 查看实时日志
docker logs -f switch-service

# 查看最近100行日志
docker logs --tail 100 switch-service
```

### 访问应用

打开浏览器访问：`http://localhost:3400`

### 构建和推送镜像

如果您需要构建自己的镜像版本：

```bash
# 使用提供的脚本（需要Docker Hub账号）
bash build_and_push.sh 1.0.0 your-dockerhub-username/switch-service

# 手动构建
docker build -t your-repo/switch-service:tag .
docker push your-repo/switch-service:tag
```

## 环境变量配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `PORT` | `3400` | 应用主端口 |
| `PORT_RANGE_START` | `4000` | 代理服务端口范围起始 |
| `PORT_RANGE_END` | `4100` | 代理服务端口范围结束 |

## 使用说明

### 1. 配置Eureka连接

在应用界面中配置Eureka服务器地址：
- **主机**: localhost（或Eureka服务器IP）
- **端口**: 8761（默认Eureka端口）
- **服务路径**: /eureka/apps

### 2. 创建代理服务

1. 点击"创建代理服务"按钮
2. 填写服务名称
3. 配置目标服务URL（支持多个环境）
4. 点击创建

### 3. 管理代理服务

- **启动/停止**: 控制代理服务运行状态
- **切换目标**: 在不同环境间切换
- **查看日志**: 实时查看代理请求日志
- **服务监控**: 查看心跳状态和服务健康度

## 注意事项

- 确保Docker容器的端口范围映射与环境变量配置一致
- 代理服务会自动注册到Eureka服务注册中心
- 数据存储在容器内的SQLite数据库中，建议挂载数据卷持久化

## 开发模式

如需本地开发，请参考项目中的开发配置文件。

## 技术栈

- **后端**: Node.js + Express
- **前端**: Vue 3 + Element Plus
- **数据库**: SQLite
- **代理**: http-proxy-middleware
- **服务注册**: Eureka Client 