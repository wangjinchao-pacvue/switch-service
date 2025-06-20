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

### 1. 克隆项目

```bash
git clone <repository-url>
cd switch-service-web
```

### 2. 构建Docker镜像

```bash
docker build -t switch-service-web .
```

### 3. 运行容器

```bash
# 基本运行（使用默认端口范围 4000-4100）
docker run -d \
  --name switch-service \
  -p 3400:3400 \
  -p 4000-4100:4000-4100 \
  switch-service-web

# 自定义端口范围
docker run -d \
  --name switch-service \
  -p 3400:3400 \
  -p 5000-5200:5000-5200 \
  -e PORT_RANGE_START=5000 \
  -e PORT_RANGE_END=5200 \
  switch-service-web
```

### 4. 访问应用

打开浏览器访问：`http://localhost:3400`

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