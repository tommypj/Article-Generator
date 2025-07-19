const config = {
    app: {
        port: process.env.PORT || 8080,
        nodeEnv: process.env.NODE_ENV || 'development',
        jsonLimit: process.env.JSON_LIMIT || '10mb',
        allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['https://tribal-bonito-466218-n5.web.app'],
        requestTimeout: parseInt(process.env.REQUEST_TIMEOUT) || 300000, // 5 minutes
        secretName: process.env.SECRET_NAME || 'carina-api-key',
    },
    gemini: {
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash', // Modelul implicit
        temperature: parseFloat(process.env.GEMINI_TEMPERATURE) || 0.7,
        topP: parseFloat(process.env.GEMINI_TOP_P) || 0.8,
        topK: parseInt(process.env.GEMINI_TOP_K) || 40,
        maxOutputTokens: parseInt(process.env.GEMINI_MAX_TOKENS) || 24000
    },
    retry: {
        maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
        baseDelay: parseInt(process.env.RETRY_DELAY) || 1000,
        maxDelay: parseInt(process.env.MAX_RETRY_DELAY) || 10000
    },
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000, // 15 minutes
        max: parseInt(process.env.RATE_LIMIT_MAX) || 10, // requests per window
        skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESS === 'true'
    },
    validation: {
        subjectMinLength: parseInt(process.env.SUBJECT_MIN_LENGTH) || 5,
        subjectMaxLength: parseInt(process.env.SUBJECT_MAX_LENGTH) || 300,
        allowedCharacters: /^[a-zA-Z0-9\s\-\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF]+$/
    },
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: process.env.LOG_FORMAT || 'json'
    }
};

// Metodă pentru a obține Project ID, citită la momentul apelului
    config.getProjectId = () => 'tribal-bonito-466218-n5';
module.exports = { config };
