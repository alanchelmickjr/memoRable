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

// Default console logger for when setupLogger hasn't been called yet
let logger = {
  info: (...args) => console.log('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  debug: (...args) => console.debug('[DEBUG]', ...args),
  stream: { write: (msg) => console.log(msg.trim()) }
};

let isWinstonSetup = false;

export async function setupLogger() {
  if (isWinstonSetup) {
    return logger;
  }
  
  await createLogsDirectory();

  // Add colors to Winston
  winston.addColors(logColors);

  const format = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.colorize({ all: true }),
    winston.format.printf(({ level, message, timestamp, stack }) => {
      if (stack) {
        return `${timestamp} ${level}: ${message}\n${stack}`;
      }
      return `${timestamp} ${level}: ${message}`;
    })
  );

  logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    levels: logLevels,
    format,
    transports: [
      // Console transport
      new winston.transports.Console(),
      
      // File transport for errors
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: winston.format.uncolorize(),
      }),
      
      // File transport for all logs
      new winston.transports.File({
        filename: 'logs/combined.log',
        format: winston.format.uncolorize(),
      }),
    ],
    exceptionHandlers: [
      new winston.transports.File({
        filename: 'logs/exceptions.log',
        format: winston.format.uncolorize(),
      }),
    ],
    rejectionHandlers: [
      new winston.transports.File({
        filename: 'logs/rejections.log',
        format: winston.format.uncolorize(),
      }),
    ],
  });

  // Create a stream for Morgan HTTP logging
  logger.stream = {
    write: (message) => {
      logger.info(message.trim());
    },
  };

  isWinstonSetup = true;
  return logger;
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