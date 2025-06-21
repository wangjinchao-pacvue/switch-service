# Switch Service Web

一个基于SpringCloud的服务管理和代理工具，连接Eureka服务注册中心，提供服务代理、监控和管理功能。

## 功能特性

- 🔄 **服务代理** - 动态创建和管理HTTP代理服务
- 📊 **服务监控** - 实时监控代理服务状态和心跳
- 🎯 **目标切换** - 支持多环境目标服务切换
- 📝 **请求日志** - 记录和查看代理请求的详细日志
- 🏷️ **标签管理** - 为服务添加标签进行分类管理
- ⚙️ **端口管理** - 自动分配和管理端口范围
- 📋 **系统日志** - 实时查看系统运行日志

## Docker 安装

### 方式一：使用部署脚本（推荐）

```bash
# 下载部署脚本
curl -o deploy.sh https://raw.githubusercontent.com/wangjinchao-pacvue/switch-service/master/deploy.sh
chmod +x deploy.sh

# 运行部署脚本（自动拉取最新镜像并创建容器）
./deploy.sh
```

### 方式二：手动运行预构建镜像

```bash
# 直接运行预构建镜像
docker run -d \
  --name switch-service \
  --restart unless-stopped \
  -p 3400:3400 \
  -p 4000-4100:4000-4100 \
  jcwangdocker/switch-service:latest
```

### 方式二：使用 Docker Compose

```yaml
# docker-compose.yml
version: '3.8'
services:
  switch-service:
    image: jcwangdocker/switch-service:1.0.0
    container_name: switch-service
    restart: unless-stopped
    ports:
      - "3400:3400"
      - "4000-4100:4000-4100"
    volumes:
      - ./data:/app/server/data
```

```bash
# 启动服务
docker-compose up -d
```

### 方式三：本地构建

```bash
# 1. 克隆项目
git clone https://github.com/wangjinchao-pacvue/switch-service.git
cd switch-service-web

# 2. 构建并运行
docker build -t switch-service-web .
docker run -d \
  --name switch-service \
  --restart unless-stopped \
  -p 3400:3400 \
  -p 4000-4100:4000-4100 \
  switch-service-web
```

## 高级配置

### 自定义端口范围
```bash
docker run -d \
  --name switch-service \
  --restart unless-stopped \
  -p 3400:3400 \
  -p 5000-5200:5000-5200 \
  -e PORT_RANGE_START=5000 \
  -e PORT_RANGE_END=5200 \
  jcwangdocker/switch-service:1.0.0
```

### 数据持久化
```bash
docker run -d \
  --name switch-service \
  --restart unless-stopped \
  -p 3400:3400 \
  -p 4000-4100:4000-4100 \
  -v $(pwd)/data:/app/server/data \
  jcwangdocker/switch-service:1.0.0
```

## 访问应用

打开浏览器访问：`http://localhost:3400`

## 环境变量配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `PORT` | `3400` | 应用主端口 |
| `PORT_RANGE_START` | `4000` | 代理服务端口范围起始 |
| `PORT_RANGE_END` | `4100` | 代理服务端口范围结束 |

## 使用说明

### 1. 配置Eureka连接
在应用界面中配置Eureka服务器地址

### 2. 创建代理服务
点击"创建代理服务"按钮，填写配置信息

### 3. 管理代理服务
- **启动/停止**: 控制代理服务运行状态
- **切换目标**: 在不同环境间切换
- **查看日志**: 实时查看代理请求和系统日志
- **服务监控**: 查看心跳状态和服务健康度

## 重启策略说明

- `--restart unless-stopped`: 容器会自动重启，除非手动停止
- 系统重启后容器会自动启动
- 手动停止容器后不会自动重启

## 注意事项

- 确保Docker容器的端口范围映射与环境变量配置一致
- 代理服务会自动注册到Eureka服务注册中心
- 建议挂载数据卷持久化数据
- **重要**: 每次代码变更需要手动重启服务

## 技术栈

- **后端**: Node.js + Express
- **前端**: Vue 3 + Element Plus
- **数据库**: SQLite
- **代理**: http-proxy-middleware
- **服务注册**: Eureka Client 