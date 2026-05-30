"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimeoutError = void 0;
exports.requestWithRetry = requestWithRetry;
const logger_1 = require("./logger");
const logger = (0, logger_1.setupLogger)('HTTP-Клиент');
class TimeoutError extends Error {
    constructor(message = 'Request timed out') {
        super(message);
        this.name = 'TimeoutError';
        // Restore prototype chain
        Object.setPrototypeOf(this, TimeoutError.prototype);
    }
}
exports.TimeoutError = TimeoutError;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/**
 * Executes an HTTP request with AbortController timeout and exponential retries.
 * @param url Target URL string
 * @param options HTTP client settings
 */
function requestWithRetry(url_1) {
    return __awaiter(this, arguments, void 0, function* (url, options = {}) {
        var _a;
        const method = options.method || 'GET';
        const headers = options.headers || {};
        const timeout = options.timeout !== undefined ? options.timeout : 5000;
        const retries = options.retries !== undefined ? options.retries : 2;
        const backoffMs = options.backoffMs !== undefined ? options.backoffMs : 300;
        let attempt = 0;
        while (true) {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), timeout);
            try {
                const fetchOptions = {
                    method,
                    headers,
                    signal: controller.signal,
                };
                if (options.body) {
                    fetchOptions.body = typeof options.body === 'object' ? JSON.stringify(options.body) : options.body;
                }
                const response = yield fetch(url, fetchOptions);
                clearTimeout(id);
                return response;
            }
            catch (err) {
                clearTimeout(id);
                const isAbort = err.name === 'AbortError' || err.code === 'DOMException' || ((_a = err.message) === null || _a === void 0 ? void 0 : _a.includes('aborted'));
                if (attempt < retries) {
                    attempt++;
                    const delayTime = backoffMs * Math.pow(2, attempt - 1);
                    logger.warn(`Попытка HTTP-запроса ${attempt} к ${url} завершилась ошибкой (${isAbort ? 'Превышено время ожидания (Timeout)' : err.message}). Повторная попытка через ${delayTime}мс...`);
                    yield delay(delayTime);
                    continue;
                }
                if (isAbort) {
                    const timeoutErr = new TimeoutError(`Превышено время ожидания ответа от ${url} после ${timeout}мс (AbortController)`);
                    logger.error(`Сбой запроса к MES: превышен лимит времени ожидания ${timeout}мс`, timeoutErr);
                    throw timeoutErr;
                }
                logger.error(`Сетевой сбой при отправке HTTP-запроса к ${url} (попытки исчерпаны)`, err);
                throw err;
            }
        }
    });
}
