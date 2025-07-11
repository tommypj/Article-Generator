const winston = require('winston');
const { config } = require('../config/config');

// Custom format for development
const devFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
        return `${timestamp} [${level}]: ${message} ${metaStr}`;
    })
);

// Production format
const prodFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
    level: config.logging.level,
    format: config.app.nodeEnv === 'production' ? prodFormat : devFormat,
    defaultMeta: { service: 'carina-blog-generator' },
    transports: [
        new winston.transports.Console({
            handleExceptions: true,
            handleRejections: true
        })
    ]
});

// Add file transport for production
if (config.app.nodeEnv === 'production') {
    logger.add(new winston.transports.File({ 
        filename: 'logs/error.log', 
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5
    }));
    
    logger.add(new winston.transports.File({ 
        filename: 'logs/combined.log',
        maxsize: 5242880, // 5MB
        maxFiles: 5
    }));
}

// Performance timing helper
const createTimer = (name) => {
    const start = process.hrtime.bigint();
    logger.info(`Performance: ${name} started`);

    return {
        end: (meta = {}) => {
            const end = process.hrtime.bigint();
            const duration = Number(end - start) / 1_000_000; // Convert nanoseconds to milliseconds
            logger.info(`Performance: ${name} completed`, { duration: `${duration.toFixed(2)}ms`, ...meta });
        }
    };
};

module.exports = { logger, createTimer };
