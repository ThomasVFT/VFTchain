// VFT Platform - Production Logging Configuration
const winston = require('winston');
const path = require('path');
const os = require('os');

const isDevelopment = process.env.NODE_ENV === 'development';
const logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'error');

// Create logs directory
const logsDir = path.join(os.homedir(), '.vft-client', 'logs');
require('fs').mkdirSync(logsDir, { recursive: true });

// Custom format for production logs
const productionFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
        return JSON.stringify({
            timestamp,
            level,
            message,
            stack,
            meta: Object.keys(meta).length ? meta : undefined
        }, null, isDevelopment ? 2 : 0);
    })
);

// Configure transports based on environment
const transports = [
    // Always log errors to file
    new winston.transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: 'error',
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
        format: productionFormat
    }),
    
    // General application logs
    new winston.transports.File({
        filename: path.join(logsDir, 'app.log'),
        level: logLevel,
        maxsize: 5 * 1024 * 1024, // 5MB
        maxFiles: 3,
        format: productionFormat
    })
];

// Only log to console in development
if (isDevelopment) {
    transports.push(
        new winston.transports.Console({
            level: 'debug',
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    );
}

// Create logger instance
const logger = winston.createLogger({
    level: logLevel,
    format: productionFormat,
    transports,
    // Don't exit on handled exceptions
    exitOnError: false,
    // Handle uncaught exceptions
    exceptionHandlers: [
        new winston.transports.File({
            filename: path.join(logsDir, 'exceptions.log'),
            maxsize: 5 * 1024 * 1024,
            maxFiles: 2
        })
    ],
    // Handle unhandled promise rejections
    rejectionHandlers: [
        new winston.transports.File({
            filename: path.join(logsDir, 'rejections.log'),
            maxsize: 5 * 1024 * 1024,
            maxFiles: 2
        })
    ]
});

// Remove console.log in production
if (!isDevelopment) {
    console.log = () => {};
    console.info = () => {};
    console.warn = () => {};
    console.error = (...args) => logger.error(args.join(' '));
}

// Export configured logger
module.exports = logger;