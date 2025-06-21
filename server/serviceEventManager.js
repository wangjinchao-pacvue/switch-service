class ServiceEventManager {
  constructor() {
    this.observers = new Map(); // 存储不同事件类型的观察者
  }

  // 注册观察者
  subscribe(eventType, observer) {
    if (!this.observers.has(eventType)) {
      this.observers.set(eventType, []);
    }
    this.observers.get(eventType).push(observer);
    // 静默订阅，不记录日志
  }

  // 取消订阅
  unsubscribe(eventType, observer) {
    if (this.observers.has(eventType)) {
      const observers = this.observers.get(eventType);
      const index = observers.indexOf(observer);
      if (index > -1) {
        observers.splice(index, 1);
        // 静默取消订阅，不记录日志
      }
    }
  }

  // 发布事件
  notify(eventType, data) {
    if (this.observers.has(eventType)) {
      const observers = this.observers.get(eventType);
      // 静默通知，不记录日志
      observers.forEach(observer => {
        try {
          observer.handleEvent(eventType, data);
        } catch (error) {
          console.error(`事件观察者错误 (${eventType}):`, error);
        }
      });
    }
  }

  // 获取所有事件类型
  getEventTypes() {
    return Array.from(this.observers.keys());
  }

  // 获取指定事件的观察者数量
  getObserverCount(eventType) {
    return this.observers.has(eventType) ? this.observers.get(eventType).length : 0;
  }
}

// 导出单例实例
module.exports = new ServiceEventManager(); 