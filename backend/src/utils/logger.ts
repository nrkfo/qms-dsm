export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
}

class LoggerInstance {
  private moduleName: string;

  constructor(moduleName: string) {
    this.moduleName = moduleName;
  }

  public log(level: LogLevel, msg: string, err?: any) {
    const timestamp = new Date().toLocaleString('ru-RU', { hour12: false }).replace(',', '');
    const logMsg = `[${this.moduleName}] [${timestamp}] [${level}] -> ${msg}`;
    
    if (level === LogLevel.ERROR || level === LogLevel.CRITICAL) {
      if (err) console.error(logMsg, err);
      else console.error(logMsg);
    } else if (level === LogLevel.WARNING) {
      if (err) console.warn(logMsg, err);
      else console.warn(logMsg);
    } else if (level === LogLevel.INFO) {
      console.log(logMsg);
    } else {
      console.debug(logMsg);
    }
  }

  public debug(msg: string) { this.log(LogLevel.DEBUG, msg); }
  public info(msg: string) { this.log(LogLevel.INFO, msg); }
  public warn(msg: string, err?: any) { this.log(LogLevel.WARNING, msg, err); }
  public error(msg: string, err?: any) { this.log(LogLevel.ERROR, msg, err); }
  public critical(msg: string, err?: any) { this.log(LogLevel.CRITICAL, msg, err); }
}

export function setupLogger(moduleName: string): LoggerInstance {
  return new LoggerInstance(moduleName);
}

export const logger = setupLogger('Система');

process.on('uncaughtException', (err) => {
  logger.critical('НЕОБРАБОТАННОЕ ИСКЛЮЧЕНИЕ (uncaughtException) в бэкенд-коде Node.js!', err);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.critical('НЕОБРАБОТАННЫЙ ПРОМИС (unhandledRejection) в бэкенд-коде Node.js!', reason);
});
