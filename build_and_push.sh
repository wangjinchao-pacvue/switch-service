#!/bin/bash

# 构建并推送 Docker 镜像脚本
# 用法：bash build_and_push.sh [tag] [repo]
# 默认 tag=1.0.0, repo=jcwangdocker/switch-service

set -e

TAG=${1:-1.0.0}
REPO=${2:-jcwangdocker/switch-service}

# 构建镜像

echo "[INFO] 构建镜像: $REPO:$TAG"
docker build -t $REPO:$TAG .

echo "[INFO] 镜像构建完成: $REPO:$TAG"

echo "[INFO] 登录 Docker Hub（如已登录可忽略提示）"
docker login -u jinchao.wang@pacuve.com

echo "[INFO] 推送镜像到仓库: $REPO:$TAG"
docker push $REPO:$TAG

echo "[SUCCESS] 镜像已推送: $REPO:$TAG" 