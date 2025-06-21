# 多阶段构建：构建阶段
FROM node:18-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制package.json文件
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# 安装所有依赖（包括开发依赖，用于构建）
RUN npm install
RUN cd server && npm install
RUN cd client && npm install

# 复制源代码
COPY server/ ./server/
COPY client/ ./client/
COPY ecosystem.config.js ./

# 构建前端
RUN cd client && npm run build

# 生产阶段
FROM node:18-alpine AS production

# 安装PM2全局
RUN npm install -g pm2

# 创建非root用户
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# 设置工作目录
WORKDIR /app

# 复制package.json文件并安装生产依赖
COPY package*.json ./
COPY server/package*.json ./server/
RUN npm install --only=production && npm cache clean --force
RUN cd server && npm install --only=production && npm cache clean --force

# 从构建阶段复制构建产物
COPY --from=builder /app/server/ ./server/
COPY --from=builder /app/client/dist/ ./client/dist/
COPY --from=builder /app/ecosystem.config.js ./

# 创建数据目录并设置权限
RUN mkdir -p ./server/data && \
    chown -R nextjs:nodejs /app && \
    chmod -R 755 /app/server/data

# 切换到非root用户
USER nextjs

# 环境变量：端口范围配置
ENV PORT_RANGE_START=4000
ENV PORT_RANGE_END=4100

# 暴露端口：主服务端口和代理服务端口范围
EXPOSE 3400 4000-4100

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3400/api/config || exit 1

# 启动命令
CMD ["pm2-runtime", "ecosystem.config.js"] 