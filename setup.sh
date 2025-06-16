#!/bin/bash

echo "🚀 Switch Service 安装和启动脚本"
echo "=================================="

# 检查Node.js是否安装
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装。请先安装 Node.js (版本 >= 16)"
    exit 1
fi

echo "✅ Node.js 版本: $(node --version)"

# 检查npm是否安装
if ! command -v npm &> /dev/null; then
    echo "❌ npm 未安装。请先安装 npm"
    exit 1
fi

echo "✅ npm 版本: $(npm --version)"

echo ""
echo "📦 安装依赖..."

# 安装根目录依赖
echo "安装根目录依赖..."
npm install

# 安装后端依赖
echo "安装后端依赖..."
cd server && npm install
cd ..

# 安装前端依赖
echo "安装前端依赖..."
cd client && npm install
cd ..

echo ""
echo "🎉 依赖安装完成！"
echo ""
echo "🚀 启动选项："
echo "1. 开发模式（热重载）: npm run dev"
echo "2. 生产模式: npm run build && npm run server:start"
echo "3. Docker模式: docker-compose up -d"
echo ""

read -p "是否现在启动开发模式？(y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 启动开发模式..."
    npm run dev
else
    echo "ℹ️  稍后可以使用以下命令启动："
    echo "   npm run dev"
    echo ""
    echo "📖 更多信息请查看 README.md"
fi 