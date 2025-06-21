const { exec, spawn } = require('child_process');
const os = require('os');

class ProcessManager {
  constructor() {
    this.trackedPorts = new Set();
  }

  // 添加要跟踪的端口
  trackPort(port) {
    this.trackedPorts.add(port);
    // 静默跟踪端口，不记录日志
  }

  // 停止跟踪端口
  untrackPort(port) {
    this.trackedPorts.delete(port);
    // 静默停止跟踪，不记录日志
  }

  // 获取占用指定端口的进程ID
  async getProcessByPort(port) {
    return new Promise((resolve, reject) => {
      const isWindows = os.platform() === 'win32';
      const command = isWindows 
        ? `netstat -ano | findstr :${port}` 
        : `lsof -ti:${port}`;

      exec(command, (error, stdout, stderr) => {
        if (error) {
          resolve(null); // 没有找到进程
          return;
        }

        if (isWindows) {
          // Windows netstat 输出解析
          const lines = stdout.split('\n').filter(line => line.includes(':' + port));
          if (lines.length > 0) {
            const parts = lines[0].trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            resolve(parseInt(pid));
          } else {
            resolve(null);
          }
        } else {
          // Unix lsof 输出解析
          const pid = parseInt(stdout.trim());
          resolve(isNaN(pid) ? null : pid);
        }
      });
    });
  }

  // 强制杀死占用指定端口的进程
  async killProcessByPort(port) {
    try {
      const pid = await this.getProcessByPort(port);
      if (pid) {
        console.log(`发现端口 ${port} 被进程 ${pid} 占用，正在终止...`);
        await this.killProcess(pid);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`杀死端口 ${port} 进程失败:`, error);
      return false;
    }
  }

  // 杀死指定进程
  async killProcess(pid) {
    return new Promise((resolve, reject) => {
      const isWindows = os.platform() === 'win32';
      const command = isWindows ? `taskkill /F /PID ${pid}` : `kill -9 ${pid}`;

      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`杀死进程 ${pid} 失败:`, error);
          reject(error);
        } else {
          console.log(`进程 ${pid} 已被终止`);
          resolve();
        }
      });
    });
  }

  // 清理所有跟踪的端口
  async cleanupAllTrackedPorts() {
    if (this.trackedPorts.size > 0) {
      console.log(`清理 ${this.trackedPorts.size} 个跟踪的端口`);
    }
    const cleanupPromises = Array.from(this.trackedPorts).map(port => 
      this.killProcessByPort(port)
    );
    
    const results = await Promise.allSettled(cleanupPromises);
    const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
    
    if (successful > 0) {
      console.log(`端口清理完成: ${successful}/${this.trackedPorts.size} 个端口已清理`);
    }
    this.trackedPorts.clear();
    
    return successful;
  }

  // 检查端口是否被占用
  async isPortInUse(port) {
    const pid = await this.getProcessByPort(port);
    return pid !== null;
  }

  // 获取所有跟踪端口的状态
  async getTrackedPortsStatus() {
    const status = {};
    for (const port of this.trackedPorts) {
      const pid = await this.getProcessByPort(port);
      status[port] = { inUse: pid !== null, pid };
    }
    return status;
  }
}

module.exports = new ProcessManager(); 