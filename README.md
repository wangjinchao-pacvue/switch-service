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
# 一键部署（下载脚本并执行）
curl -o deploy.sh https://raw.githubusercontent.com/wangjinchao-pacvue/switch-service/master/deploy.sh && chmod +x deploy.sh && ./deploy.sh

# 或分步执行：
# 1. 下载部署脚本
# curl -o deploy.sh https://raw.githubusercontent.com/wangjinchao-pacvue/switch-service/master/deploy.sh
# 2. 添加执行权限
# chmod +x deploy.sh  
# 3. 运行部署脚本
# ./deploy.sh
```

**部署脚本功能：**
- ✅ 自动拉取最新镜像
- ✅ 智能管理容器（停止旧容器，创建新容器）
- ✅ 自动配置端口映射和数据持久化
- ✅ 健康检查和状态验证

### 方式二：手动运行预构建镜像

```bash
# 直接运行预构建镜像（数据存储在容器内部）
docker run -d \
  --name switch-service \
  --restart unless-stopped \
  -p 3400:3400 \
  -p 4000-4100:4000-4100 \
  jcwangdocker/switch-service:latest
```

### 方式三：使用 Docker Compose

```yaml
# docker-compose.yml
version: '3.8'
services:
  switch-service:
    image: jcwangdocker/switch-service:latest
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

### 方式四：本地构建

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
  -v $(pwd)/data:/app/server/data \
  switch-service-web
```

## 更新部署

使用部署脚本可以轻松更新到最新版本：

```bash
# 更新到最新版本
./deploy.sh
```

或手动更新：

```bash
# 停止并删除旧容器
docker stop switch-service && docker rm switch-service

# 拉取最新镜像
docker pull jcwangdocker/switch-service:latest

# 重新运行容器
docker run -d \
  --name switch-service \
  --restart unless-stopped \
  -p 3400:3400 \
  -p 4000-4100:4000-4100 \
  -v $(pwd)/data:/app/server/data \
  jcwangdocker/switch-service:latest
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
  -v $(pwd)/data:/app/server/data \
  jcwangdocker/switch-service:latest
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

## 常用命令

```bash
# 查看容器状态
docker ps --filter name=switch-service

# 查看实时日志
docker logs -f switch-service

# 重启容器
docker restart switch-service

# 停止容器
docker stop switch-service

# 进入容器
docker exec -it switch-service sh
```

## 重启策略说明

- `--restart unless-stopped`: 容器会自动重启，除非手动停止
- 系统重启后容器会自动启动
- 手动停止容器后不会自动重启

## 注意事项

- 确保Docker容器的端口范围映射与环境变量配置一致
- 代理服务会自动注册到Eureka服务注册中心
- 建议挂载数据卷持久化数据
- **重要**: 每次代码变更会通过GitHub Actions自动构建新镜像
- 使用部署脚本可以快速更新到最新版本

## 技术栈

- **后端**: Node.js + Express
- **前端**: Vue 3 + Element Plus
- **数据库**: SQLite
- **代理**: http-proxy-middleware
- **服务注册**: Eureka Client
- **CI/CD**: GitHub Actions 