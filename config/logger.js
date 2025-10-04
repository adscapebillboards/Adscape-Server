// Logger configuration for controlling console output
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

class Logger {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || 'INFO';
    this.enabled = process.env.ENABLE_LOGGING !== 'false';
  }

  shouldLog(level) {
    if (!this.enabled) return false;
    return LOG_LEVELS[level] <= LOG_LEVELS[this.logLevel];
  }

  error(...args) {
    if (this.shouldLog('ERROR')) {
      console.error('❌ [ERROR]', ...args);
    }
  }

  warn(...args) {
    if (this.shouldLog('WARN')) {
      console.warn('⚠️ [WARN]', ...args);
    }
  }

  info(...args) {
    if (this.shouldLog('INFO')) {
      console.log('ℹ️ [INFO]', ...args);
    }
  }

  debug(...args) {
    if (this.shouldLog('DEBUG')) {
      console.log('🔍 [DEBUG]', ...args);
    }
  }

  // Special methods for different contexts
  api(method, url, ...args) {
    if (this.shouldLog('INFO')) {
      console.log(`🌐 [API] ${method} ${url}`, ...args);
    }
  }

  db(operation, ...args) {
    if (this.shouldLog('DEBUG')) {
      console.log(`🗄️ [DB] ${operation}`, ...args);
    }
  }

  campaign(operation, ...args) {
    if (this.shouldLog('INFO')) {
      console.log(`📢 [CAMPAIGN] ${operation}`, ...args);
    }
  }

  billboard(operation, ...args) {
    if (this.shouldLog('INFO')) {
      console.log(`🖼️ [BILLBOARD] ${operation}`, ...args);
    }
  }

  user(operation, ...args) {
    if (this.shouldLog('INFO')) {
      console.log(`👤 [USER] ${operation}`, ...args);
    }
  }

  slot(operation, ...args) {
    if (this.shouldLog('DEBUG')) {
      console.log(`⏰ [SLOT] ${operation}`, ...args);
    }
  }

  asset(operation, ...args) {
    if (this.shouldLog('DEBUG')) {
      console.log(`📦 [ASSET] ${operation}`, ...args);
    }
  }
}

// Create singleton instance
const logger = new Logger();

module.exports = logger; 