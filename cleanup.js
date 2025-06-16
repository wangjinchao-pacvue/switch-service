#!/usr/bin/env node

const Database = require('./server/database');
const ProcessManager = require('./server/process-manager');

async function cleanup() {
  console.log('🧹 开始清理残留的代理服务进程...\n');

  try {
    // 初始化数据库
    await Database.init();
    console.log('✅ 数据库连接成功');

    // 获取所有代理服务
    const services = await Database.getAllProxyServices();
    console.log(`📋 找到 ${services.length} 个代理服务记录\n`);

    let cleanedCount = 0;
    let updatedCount = 0;

    for (const service of services) {
      const { serviceName, port, isRunning } = service;
      console.log(`🔍 检查服务: ${serviceName}:${port} (数据库状态: ${isRunning ? '运行中' : '已停止'})`);

      // 检查端口是否被占用
      const pid = await ProcessManager.getProcessByPort(port);
      
      if (pid) {
        console.log(`   ⚠️  发现进程 ${pid} 占用端口 ${port}`);
        
        // 尝试终止进程
        try {
          await ProcessManager.killProcess(pid);
          console.log(`   ✅ 进程 ${pid} 已被终止`);
          cleanedCount++;
        } catch (error) {
          console.log(`   ❌ 终止进程 ${pid} 失败: ${error.message}`);
        }
      } else {
        console.log(`   ✅ 端口 ${port} 未被占用`);
      }

      // 如果数据库记录显示正在运行，但实际没有进程，更新状态
      if (isRunning && !pid) {
        try {
          await Database.updateProxyService(service.id, { isRunning: false });
          console.log(`   📝 已更新数据库状态为停止`);
          updatedCount++;
        } catch (error) {
          console.log(`   ❌ 更新数据库状态失败: ${error.message}`);
        }
      }

      console.log(''); // 空行分隔
    }

    // 关闭数据库连接
    Database.close();

    console.log('🎉 清理完成!');
    console.log(`   📊 统计信息:`);
    console.log(`   - 检查的服务: ${services.length}`);
    console.log(`   - 清理的进程: ${cleanedCount}`);
    console.log(`   - 更新的状态: ${updatedCount}`);

    if (cleanedCount === 0 && updatedCount === 0) {
      console.log('   ✨ 没有发现需要清理的进程或更新的状态');
    }

  } catch (error) {
    console.error('❌ 清理过程出错:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  cleanup().then(() => {
    console.log('\n👋 清理脚本执行完毕');
    process.exit(0);
  }).catch((error) => {
    console.error('\n💥 清理脚本执行失败:', error);
    process.exit(1);
  });
}

module.exports = cleanup; 