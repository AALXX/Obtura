const getTimeStamp = (): string => {
    return new Date().toString();
};

/**
 * Logs an info
 * @param {string} namespace
 * @param {string} message
 * @param {any} object
 */
const info = (namespace: string, message: string, object?: any) => {
    if (object) {
        console.log(`[${getTimeStamp()}] [INFO] [${namespace}] ${message}`, object);
    } else {
        console.log(`[${getTimeStamp()}] [INFO] [${namespace}] ${message}`);
    }
};

/**
 * Logs an warn
 * @param {string} namespace
 * @param {string} message
 * @param {any} object
 */
const warn = (namespace: string, message: string, object?: any) => {
    if (object) {
        console.warn(`[${getTimeStamp()}] [WARN] [${namespace}] ${message}`, object);
    } else {
        console.warn(`[${getTimeStamp()}] [WARN] [${namespace}] ${message}`);
    }
};

/**
 * Logs an error
 * @param {string} namespace
 * @param {string} message
 * @param {any} object
 */
const error = (namespace: string, message: string, object?: any) => {
    if (object) {
        console.error(`[${getTimeStamp()}] [ERROR] [${namespace}] ${message}`, object);
    } else {
        console.error(`[${getTimeStamp()}] [ERROR] [${namespace}] ${message}`);
    }
};

/**
 * Logs an debug
 * @param {string} namespace
 * @param {string} message
 * @param {any} object
 */
const debug = (namespace: string, message: string, object?: any) => {
    if (object) {
        console.debug(`[${getTimeStamp()}] [DEBUG] [${namespace}] ${message}`, object);
    } else {
        console.debug(`[${getTimeStamp()}] [DEBUG] [${namespace}] ${message}`);
    }
};

export default {
    info,
    warn,
    error,
    debug,
};
