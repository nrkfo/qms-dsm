"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.LogLevel = void 0;
exports.setupLogger = setupLogger;
var LogLevel;
(function (LogLevel) {
    LogLevel["DEBUG"] = "DEBUG";
    LogLevel["INFO"] = "INFO";
    LogLevel["WARNING"] = "WARNING";
    LogLevel["ERROR"] = "ERROR";
    LogLevel["CRITICAL"] = "CRITICAL";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
class LoggerInstance {
    constructor(moduleName) {
        this.moduleName = moduleName;
    }
    log(level, msg, err) {
        const timestamp = new Date().toLocaleString('ru-RU', { hour12: false }).replace(',', '');
        const logMsg = `[${this.moduleName}] [${timestamp}] [${level}] -> ${msg}`;
        if (level === LogLevel.ERROR || level === LogLevel.CRITICAL) {
            if (err)
                console.error(logMsg, err);
            else
                console.error(logMsg);
        }
        else if (level === LogLevel.WARNING) {
            if (err)
                console.warn(logMsg, err);
            else
                console.warn(logMsg);
        }
        else if (level === LogLevel.INFO) {
            console.log(logMsg);
        }
        else {
            console.debug(logMsg);
        }
    }
    debug(msg) { this.log(LogLevel.DEBUG, msg); }
    info(msg) { this.log(LogLevel.INFO, msg); }
    warn(msg, err) { this.log(LogLevel.WARNING, msg, err); }
    error(msg, err) { this.log(LogLevel.ERROR, msg, err); }
    critical(msg, err) { this.log(LogLevel.CRITICAL, msg, err); }
}
function setupLogger(moduleName) {
    return new LoggerInstance(moduleName);
}
exports.logger = setupLogger('Система');
process.on('uncaughtException', (err) => {
    exports.logger.critical('НЕОБРАБОТАННОЕ ИСКЛЮЧЕНИЕ (uncaughtException) в бэкенд-коде Node.js!', err);
});
process.on('unhandledRejection', (reason, promise) => {
    exports.logger.critical('НЕОБРАБОТАННЫЙ ПРОМИС (unhandledRejection) в бэкенд-коде Node.js!', reason);
});
