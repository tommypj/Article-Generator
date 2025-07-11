// 1. Încarcă variabilele de mediu din fișierul .env (doar pentru dezvoltare locală)
// În Cloud Functions, variabilele de mediu sunt injectate automat de platformă.
require('dotenv').config();

// 2. Importă Modulele Necesare
const express = require('express');
const cors = require('cors'); 
const helmet = require('helmet'); // Securitate
const compression = require('compression'); // Compresie răspunsuri
const rateLimit = require('express-rate-limit'); // Limitare rată
const asyncHandler = require('express-async-handler'); // Pentru a prinde erorile în rutele async

const { config } = require('./config/config'); // Importă configurația centralizată
const { logger, createTimer } = require('./utils/logger'); // Importă logger-ul și timer-ul
const InputValidator = require('./validators/validators'); // Corectat: calea către validators.js
const GeminiService = require('./services/geminiService'); // Importă serviciul Gemini

// Client pentru Secret Manager - necesar pentru a prelua cheia API la startup
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const secretManagerClient = new SecretManagerServiceClient();

// 3. Inițializarea Aplicației Express
const app = express();
app.set('trust proxy', 1); // ADĂUGAT: Soluția pentru eroarea 'X-Forwarded-For' a rate-limit-ului

// Inițializarea serviciilor și validatoarelor
const inputValidator = new InputValidator();
const geminiService = new GeminiService();

// Funcție pentru a prelua cheia API la startup
async function getGeminiApiKey() {
    // Citim projectId direct din process.env la momentul apelului
    const projectId = config.getProjectId(); // Folosim metoda din config
    if (!projectId) {
        // Această eroare ar trebui să fie rară dacă GCP_PROJECT e setat în comanda de deploy/consolă
        throw new Error('Project ID is not set. Please ensure GCP_PROJECT environment variable is set in Cloud Functions.');
    }
    const name = `projects/${projectId}/secrets/${config.app.secretName}/versions/latest`;
    logger.info(`Attempting to access secret: ${name}`);
    try {
        const [version] = await secretManagerClient.accessSecretVersion({ name });
        return version.payload.data.toString('utf8');
    } catch (error) {
        logger.error('Failed to access secret from Secret Manager', { 
            error: error.message, 
            secretName: config.app.secretName 
        });
        throw new Error(`Failed to access API key from Secret Manager: ${error.message}. Check secret name and IAM permissions.`);
    }
}

// 4. Inițializare globală a API-ului Gemini (se întâmplă o singură dată la pornirea aplicației)
async function globalGeminiInitialization() {
    try {
        logger.info('Starting global Gemini service initialization...');
        const apiKey = await getGeminiApiKey();
        await geminiService.initialize(apiKey);
        // Setăm flag-ul initialized în serviciul Gemini
        geminiService.initialized = true; // Asigură că flag-ul este setat
        logger.info('Global GeminiService initialization complete.');
    } catch (error) {
        // Salvăm eroarea de inițializare pentru a o putea verifica în health check
        geminiService.initializationError = error; // Adăugat: salvăm eroarea în serviciu
        logger.error('Critical: Failed global Gemini service initialization.', { 
            error: error.message 
        });
        // Nu apelăm process.exit(1) aici, lăsăm funcția să pornească pentru health check
    }
}

// Apelăm inițializarea globală (nu blocăm serverul)
globalGeminiInitialization();

// 5. Middleware-uri Globale
app.use(helmet()); // Protejează împotriva unor vulnerabilități web cunoscute
app.use(compression()); // Activează compresia Gzip pentru răspunsuri

// Configurare CORS
app.use(cors({
    origin: config.app.allowedOrigins, // Va fi un array ['https://carina-s-blog.web.app']
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'], // Adăugăm și Authorization, e o bună practică
    credentials: true
}));

// Configurare Rate Limiting - exclus health check
const apiLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    message: 'Prea multe cereri de la această adresă IP, te rog încearcă din nou mai târziu.',
    skipSuccessfulRequests: config.rateLimit.skipSuccessfulRequests,
    skip: (req) => req.path === '/health' // Exclude health check from rate limiting
});
app.use(apiLimiter);

// Parser pentru corpul cererilor JSON
app.use(express.json({ limit: config.app.jsonLimit }));

// 6. Middleware pentru verificarea inițializării
const checkInitialization = (req, res, next) => {
    if (!geminiService.initialized) {
        if (geminiService.initializationError) {
            logger.error('Request blocked: Service unavailable due to initialization error.', { error: geminiService.initializationError.message });
            return res.status(500).json({ 
                error: 'Serviciul este indisponibil din cauza unei erori de inițializare.',
                details: geminiService.initializationError.message
            });
        }
        logger.warn('Request blocked: Service initializing.');
        return res.status(503).json({ 
            error: 'Serviciul se inițializează. Te rog încearcă din nou în câteva secunde.' 
        });
    }
    next();
};


// 7. Definirea Rutelor

// Rută Health Check (fără rate limiting și fără verificarea inițializării)
app.get('/health', (req, res) => {
    logger.info('Health check endpoint hit');
    const status = geminiService.initialized ? 'healthy' : (geminiService.initializationError ? 'unhealthy' : 'initializing');
    res.json({ 
        status, 
        timestamp: new Date().toISOString(),
        geminiServiceInitialized: geminiService.initialized,
        initializationError: geminiService.initializationError ? geminiService.initializationError.message : null,
        message: geminiService.initialized 
            ? 'All systems nominal' 
            : (geminiService.initializationError ? 'Initialization failed' : 'Gemini service still initializing')
    });
});

// Rută principală pentru generarea articolului (POST /)
app.post('/', checkInitialization, asyncHandler(async (req, res) => {
    logger.info('Article generation request received', { body: req.body });
    
    let validatedBody;
    try {
        // Validarea input-ului utilizatorului (acum validăm întregul body pentru 'action' și 'subject')
        validatedBody = inputValidator.validateArticleRequest(req.body);
        logger.info('Input validation successful', { body: validatedBody });
    } catch (validationError) {
        logger.warn('Input validation failed', { 
            error: validationError.message, 
            input: req.body 
        });
        return res.status(400).json({ error: validationError.message });
    }

    // Extragem acțiunea și parametrii din body-ul validat
    const { action, subject, articleContent, sectionTitle } = validatedBody;

    try {
        let responseData;

        switch (action) {
            case 'generateArticle':
                logger.info(`[START] Incepe generarea articolului pentru subiectul: "${subject}"`);
                responseData = await geminiService.generateArticle(subject); // Apelăm generateArticle
                logger.info('Article generation completed successfully', { subject: responseData.finalSubject, seoScore: responseData.seoAnalysis?.scor_general });
                break;

            case 'summarizeArticle':
                if (!articleContent) {
                    return res.status(400).json({ error: 'Conținutul articolului este necesar pentru rezumat.' });
                }
                logger.info('[START] Incepe generarea rezumatului...');
                const summary = await geminiService.summarizeArticle(articleContent);
                responseData = { summary };
                logger.info('Article summary generated successfully.');
                break;

            case 'expandSection':
                if (!articleContent || !sectionTitle) {
                    return res.status(400).json({ error: 'Conținutul articolului și titlul secțiunii sunt necesare pentru extindere.' });
                }
                logger.info(`[START] Incepe extinderea secțiunii: "${sectionTitle}"`);
                const expandedContent = await geminiService.expandSection(articleContent, sectionTitle);
                responseData = { expandedContent };
                logger.info(`Section "${sectionTitle}" expanded successfully.`);
                break;

            default:
                return res.status(400).json({ error: 'Acțiune invalidă specificată.' });
        }
        
        // Trimiterea răspunsului către frontend
        return res.json({ success: true, ...responseData });

    } catch (error) {
        logger.error('Failed to process request', { 
            error: error.message, 
            stack: error.stack, 
            action, 
            subject 
        });
        
        // Clasificarea și trimiterea erorilor specifice către client
        if (error.message.includes('API key') || error.message.includes('Secret Manager')) {
            return res.status(500).json({ error: 'Eroare de configurare a cheii API. Verificați logurile funcției Cloud.' });
        }
        
        if (error.message.includes('Eroare la procesarea Etapa') || 
            error.message.includes('Răspuns invalid') || 
            error.message.includes('Răspuns gol')) {
            return res.status(500).json({ 
                error: `Eroare la interpretarea răspunsului AI într-o etapă intermediară. Te rog încearcă din nou.` 
            });
        }
        
        if (error.message.includes('timeout')) {
            return res.status(504).json({ 
                error: 'Generarea articolului durează prea mult. Te rog încearcă din nou.' 
            });
        }
        
        // Erori direct de la API-ul Gemini (ex: 404, 429, 503)
        if (error.code) { 
            if (error.code === 404) {
                return res.status(500).json({ error: `Eroare API Gemini: Modelul (${config.gemini.model}) nu a fost găsit sau nu este suportat în regiunea dvs. Asigurați-vă că Vertex AI API este activat și cotele sunt suficiente.` });
            }
            if (error.code === 429 || error.code === 503) {
                return res.status(429).json({ error: 'Serviciul Gemini este supraîncărcat sau indisponibil temporar. Te rog încearcă din nou în câteva minute.' });
            }
            if (error.code === 400) {
                return res.status(400).json({ error: `Eroare API Gemini: Cerere invalidă. Detalii: ${error.details || error.message}.` });
            }
            if (error.code === 401 || error.code === 403) {
                return res.status(403).json({ error: 'Permisiuni insuficiente pentru API-ul Gemini. Verifică rolurile contului de serviciu (Vertex AI User).' });
            }
            // Eroare API generică
            return res.status(500).json({ error: `Eroare API Gemini: Cod ${error.code}. Te rog încearcă din nou. Detalii: ${error.details || error.message}.` });
        } 
        
        // Toate celelalte erori neașteptate
        return res.status(500).json({ 
            error: `A apărut o eroare neașteptată la generarea articolului: ${error.message || 'Eroare necunoscută.'}. Te rog încearcă din nou mai târziu.` 
        });
    }
}));

// Gestionarea rutelor inexistente (404 Not Found)
app.use((req, res, next) => { 
    logger.warn('404 Not Found for URL', { url: req.originalUrl, method: req.method });
    res.status(404).json({ error: 'Ruta nu a fost găsită.' });
});

// Global error handler (ultimul middleware pentru a prinde erorile AsyncHandler)
app.use((err, req, res, next) => { 
    console.error('Eroare prinsă de handler-ul global:', { 
        error: err.message, 
        stack: err.stack 
    });
    // Trimitem un mesaj generic de eroare pentru a nu expune detalii interne
    res.status(err.status || 500).json({ 
        error: 'Eroare internă de server. Te rog contactează suportul.' 
    });
});

// Exportă aplicația Express pentru Cloud Functions
exports.app = app;
