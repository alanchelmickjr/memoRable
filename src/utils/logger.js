import winston from 'winston';

const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue',
};

// ALL levels go to stderr - stdout is reserved for MCP JSON-RPC protocol
let logger = {
  info: (...args) => console.error('[INFO]', ...args),
  warn: (...args) => console.error('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  debug: (...args) => console.error('[DEBUG]', ...args),
  stream: { write: (msg) => console.error(msg.trim()) }
};

let isWinstonSetup = false;

export async function setupLogger() {
  if (isWinstonSetup) {
    return logger;
  }

  await createLogsDirectory();

  winston.addColors(logColors);

  const useJson = process.env.LOG_FORMAT === 'json';

  const consoleFormat = useJson
    ? winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      )
    : winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.colorize({ all: true }),
        winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
          if (stack) return `${timestamp} ${level}: ${message}${metaStr}\n${stack}`;
          return `${timestamp} ${level}: ${message}${metaStr}`;
        })
      );

  const fileFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.uncolorize(),
    winston.format.json()
  );

  logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    levels: logLevels,
    defaultMeta: { service: process.env.SERVICE_NAME || 'mcp-server' },
    transports: [
      // Console transport - ALL levels to stderr (stdout reserved for MCP JSON-RPC)
      new winston.transports.Console({
        stderrLevels: ['error', 'warn', 'info', 'debug'],
        format: consoleFormat,
      }),

      // File transport for errors
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: fileFormat,
      }),

      // File transport for all logs
      new winston.transports.File({
        filename: 'logs/combined.log',
        format: fileFormat,
      }),
    ],
    exceptionHandlers: [
      new winston.transports.File({
        filename: 'logs/exceptions.log',
        format: fileFormat,
      }),
    ],
    rejectionHandlers: [
      new winston.transports.File({
        filename: 'logs/rejections.log',
        format: fileFormat,
      }),
    ],
  });

  // Morgan stream for HTTP request logging
  logger.stream = {
    write: (message) => {
      logger.info(message.trim(), { component: 'http' });
    },
  };

  isWinstonSetup = true;
  return logger;
}

/**
 * Change log level at runtime — tickle or calm the nervous system.
 * @param {string} level - 'error' | 'warn' | 'info' | 'debug'
 */
export function setLogLevel(level) {
  if (!logLevels.hasOwnProperty(level)) return false;
  logger.level = level;
  if (logger.transports) {
    logger.transports.forEach(t => { t.level = level; });
  }
  return true;
}

export function getLogLevel() {
  return logger.level || process.env.LOG_LEVEL || 'info';
}

export async function createLogsDirectory() {
  const { mkdir } = await import('fs/promises');
  try {
    await mkdir('logs', { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      console.error('Failed to create logs directory:', error);
    }
  }
}

export { logger };
