#!/bin/bash

# Switch Service 部署脚本
# 自动拉取最新镜像并创建/更新容器

set -e

CONTAINER_NAME="switch-service"
IMAGE_NAME="jcwangdocker/switch-service:latest"
HOST_PORT=3400
PROXY_PORT_START=4000
PROXY_PORT_END=4100

echo "🚀 开始部署 Switch Service..."

# 停止并删除现有容器（如果存在）
if docker ps -a --format 'table {{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "📦 停止现有容器: ${CONTAINER_NAME}"
    docker stop ${CONTAINER_NAME} || true
    echo "🗑️  删除现有容器: ${CONTAINER_NAME}"
    docker rm ${CONTAINER_NAME} || true
fi

# 拉取最新镜像
echo "⬇️  拉取最新镜像: ${IMAGE_NAME}"
docker pull ${IMAGE_NAME}

# 运行新容器（数据存储在容器内部）
echo "🔄 启动新容器: ${CONTAINER_NAME}"
docker run -d \
  --name ${CONTAINER_NAME} \
  --restart unless-stopped \
  -p ${HOST_PORT}:3400 \
  -p ${PROXY_PORT_START}-${PROXY_PORT_END}:${PROXY_PORT_START}-${PROXY_PORT_END} \
  -e PORT_RANGE_START=${PROXY_PORT_START} \
  -e PORT_RANGE_END=${PROXY_PORT_END} \
  ${IMAGE_NAME}

# 等待容器启动
echo "⏳ 等待容器启动..."
sleep 5

# 检查容器状态
if docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -q "^${CONTAINER_NAME}"; then
    echo "✅ 容器启动成功!"
    echo "🌐 访问地址: http://localhost:${HOST_PORT}"
    echo "📊 容器状态:"
    docker ps --filter name=${CONTAINER_NAME} --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
    
    echo ""
    echo "📋 有用的命令:"
    echo "  查看日志: docker logs -f ${CONTAINER_NAME}"
    echo "  停止容器: docker stop ${CONTAINER_NAME}"
    echo "  重启容器: docker restart ${CONTAINER_NAME}"
else
    echo "❌ 容器启动失败!"
    echo "📋 查看错误日志:"
    docker logs ${CONTAINER_NAME}
    exit 1
fi

echo "🎉 部署完成!" 