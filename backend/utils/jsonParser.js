// backend/utils/jsonParser.js
const { logger } = require('./logger'); // Import logger from utils

// Define parseGeminiJSON as a standalone, exported function
const parseGeminiJSON = (text, stepName) => {
    logger.info(`Attempting to parse JSON for ${stepName} (Standalone Parser)`, { textPreview: text.substring(0, 200) });

    let cleanJsonText = text.replace(/```(?:json)?\s*\n?|\n?```/g, '').trim();

    if (!cleanJsonText) {
        logger.error(`Empty response from Gemini in ${stepName} after cleaning (Standalone Parser).`);
        throw new Error(`Răspuns gol de la Gemini în ${stepName}`);
    }

    try {
        const parsed = JSON.parse(cleanJsonText);
        logger.info('JSON parsed successfully (standalone parser)', { stepName, keys: Object.keys(parsed) });
        return parsed;
    } catch (error) {
        logger.error('JSON parsing failed (standalone parser)', { stepName, error: error.message, textPreview: cleanJsonText.substring(0, 500) });
        throw new Error(`Eroare la procesarea ${stepName}: ${error.message}. Răspuns brut: ${cleanJsonText.substring(0, 500)}...`);
    }
};

module.exports = { parseGeminiJSON };