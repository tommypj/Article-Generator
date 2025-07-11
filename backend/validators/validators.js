const Joi = require('joi');
const validator = require('validator');
const { config } = require('../config/config');
const { logger } = require('../utils/logger');

class InputValidator {
    constructor() {
        this.articleRequestSchema = Joi.object({
            action: Joi.string().valid('generateArticle', 'summarizeArticle', 'expandSection').required().messages({
                'any.only': 'Acțiune invalidă specificată. Acțiunile permise sunt: generateArticle, summarizeArticle, expandSection.',
                'any.required': 'Acțiunea este obligatorie.'
            }),
            subject: Joi.string()
                .min(config.validation.subjectMinLength)
                .max(config.validation.subjectMaxLength)
                .pattern(config.validation.allowedCharacters)
                .when('action', {
                    is: 'generateArticle',
                    then: Joi.required(),
                    otherwise: Joi.optional()
                })
                .messages({
                    'string.min': `Subiectul trebuie să aibă cel puțin ${config.validation.subjectMinLength} caractere`,
                    'string.max': `Subiectul poate avea maxim ${config.validation.subjectMaxLength} caractere`,
                    'string.pattern.base': 'Subiectul conține caractere nepermise',
                    'any.required': 'Subiectul este obligatoriu pentru generarea articolului'
                }),
            articleContent: Joi.string().when('action', {
                is: Joi.exist().valid('summarizeArticle', 'expandSection'),
                then: Joi.required(),
                otherwise: Joi.optional()
            }).messages({
                'any.required': 'Conținutul articolului este obligatoriu pentru această acțiune.'
            }),
            sectionTitle: Joi.string().when('action', {
                is: 'expandSection',
                then: Joi.required(),
                otherwise: Joi.optional()
            }).messages({
                'any.required': 'Titlul secțiunii este obligatoriu pentru extindere.'
            })
        });
    }

    validateArticleRequest(data) {
        const { error, value } = this.articleRequestSchema.validate(data, {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            const errorMessage = error.details.map(detail => detail.message).join('; ');
            logger.warn('Input validation failed', {
                errors: error.details,
                input: data
            });
            throw new Error(errorMessage);
        }

        if (value.subject) {
            value.subject = validator.escape(value.subject);
        }
        if (value.articleContent) {
            value.articleContent = validator.escape(value.articleContent);
        }
        if (value.sectionTitle) {
            value.sectionTitle = validator.escape(value.sectionTitle);
        }

        return value;
    }

    parseGeminiJSON(text, stepName) {
        try {
            logger.debug('Parsing Gemini JSON response', {
                stepName,
                textLength: text.length
            });

            const cleanJsonText = text.replace(/```(?:json)?\s*\n?|\n?```/g, '').trim();
            
            if (!cleanJsonText) {
                throw new Error(`Răspuns gol de la Gemini în ${stepName}`);
            }

            const parsed = JSON.parse(cleanJsonText);

            if (!parsed || typeof parsed !== 'object') {
                throw new Error(`Format invalid de răspuns în ${stepName}`);
            }

            logger.info('JSON parsed successfully', {
                stepName,
                keys: Object.keys(parsed)
            });
            return parsed;
        } catch (error) {
            logger.error('JSON parsing failed', {
                stepName,
                error: error.message,
                textPreview: text.substring(0, Math.min(text.length, 500))
            });
            throw new Error(`Eroare la procesarea ${stepName}: ${error.message}. Răspuns brut: ${text.substring(0, Math.min(text.length, 500))}...`);
        }
    }

    validateStepResponse(parsed, step) {
        let schema;
        switch (step) {
            case 1:
                schema = Joi.object({
                    subiect_final: Joi.string().required(),
                    cuvant_cheie_principal: Joi.string().required(),
                    cuvinte_cheie_secundare_lsi: Joi.array().items(Joi.string()).required(),
                    cuvinte_cheie_long_tail: Joi.array().items(Joi.string()).required(),
                    justificare_alegere: Joi.string().optional()
                });
                break;
            case 2:
                schema = Joi.object({
                    structura_articol: Joi.array().items(Joi.object({
                        titlu_h2: Joi.string().required(),
                        subteme_h3: Joi.array().items(Joi.string()).optional()
                    })).required(),
                    unghi_unic: Joi.string().required(),
                    meta_titlu_propus: Joi.string().required(),
                    meta_descriere_propusa: Joi.string().required()
                });
                break;
            case 3:
                schema = Joi.object({
                    autori_concepte: Joi.array().items(Joi.object({
                        nume_autor: Joi.string().required(),
                        concept: Joi.string().required(),
                        citat_sau_idee: Joi.string().required()
                    })).required(),
                    idei_statistici: Joi.array().items(Joi.string()).optional(),
                    surse_externe_sugerate: Joi.array().items(Joi.string()).optional()
                });
                break;
            case 5:
                schema = Joi.object({
                    scor_general: Joi.number().min(0).max(100).required(),
                    analiza_detaliata: Joi.object().required(),
                    recomandari_prioritare: Joi.array().items(Joi.string()).required(),
                    status_seo: Joi.string().required()
                });
                break;
            default:
                throw new Error(`Validare necunoscută pentru etapa: ${step}`);
        }

        const { error, value } = schema.validate(parsed, { abortEarly: false, allowUnknown: true });

        if (error) {
            const errorMessage = error.details.map(detail => detail.message).join('; ');
            logger.warn(`Validare răspuns Etapa ${step} eșuată`, { errors: error.details, parsedData: parsed });
            throw new Error(`Răspuns invalid în Etapa ${step}: ${errorMessage}`);
        }
        return value;
    }
}

module.exports = InputValidator;
