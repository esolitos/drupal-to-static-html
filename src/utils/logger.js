/**
 * Simple stdout logger with timestamps
 */

const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

class Logger {
  constructor(prefix = '', level = 'INFO') {
    this.prefix = prefix;
    this.level = LOG_LEVELS[level] || LOG_LEVELS.INFO;
  }

  _log(level, ...args) {
    if (LOG_LEVELS[level] >= this.level) {
      const ts = new Date().toISOString();
      const pfx = this.prefix ? `[${this.prefix}] ` : '';
      console.log(`${ts} ${level} ${pfx}`, ...args);
    }
  }

  debug(...args) { this._log('DEBUG', ...args); }
  info(...args)  { this._log('INFO',  ...args); }
  warn(...args)  { this._log('WARN',  ...args); }
  error(...args) { this._log('ERROR', ...args); }
}

module.exports = Logger;
