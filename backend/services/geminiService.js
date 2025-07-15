const { GoogleGenerativeAI } = require('@google/generative-ai');
const { config } = require('../config/config');
const { logger, createTimer } = require('../utils/logger');
const InputValidator = require('../validators/validators'); 
const { JSDOM } = require('jsdom'); 
// CRITICAL CHANGE: Import the new standalone parseGeminiJSON function
const { parseGeminiJSON } = require('../utils/jsonParser'); 

console.log('--- GeminiService.js LOADED - DEBUG VERSION 14 (External JSON Parser Confirmed) ---'); // NEW DEBUG VERSION. This MUST appear in your Cloud Function logs after successful deploy.

class GeminiService {
    constructor() {
        this.genAI = null;
        this.model = null;
        this.initialized = false;
        this.initializationError = null;
        this.validator = new InputValidator();

        // CRITICAL CHANGE: Removed all calls to bind parseGeminiJSON.
        // It's now imported and called directly.
        // this.parseGeminiJSON = this.parseGeminiJSON.bind(this); // THIS LINE MUST BE REMOVED IF PRESENT
    }

    // CRITICAL CHANGE: The parseGeminiJSON method definition is REMOVED from this class.
    // It is now defined in backend/utils/jsonParser.js and imported.

    async initialize(apiKey) {
        if (this.initialized) {
            logger.info('GeminiService este deja inițializat.');
            return;
        }
        if (this.initializationError) {
            logger.warn('GeminiService nu a putut fi inițializat anterior. Încercare nouă.');
            this.initializationError = null;
        }

        const timer = createTimer('Gemini initialization');
        
        try {
            logger.info('Initializing Gemini API...');
            
            this.genAI = new GoogleGenerativeAI(apiKey);
            this.model = this.genAI.getGenerativeModel({
                model: config.gemini.model,
                generationConfig: {
                    temperature: config.gemini.temperature,
                    topP: config.gemini.topP,
                    topK: config.gemini.topK,
                    maxOutputTokens: config.gemini.maxOutputTokens 
                }
            });

            this.initialized = true;
            timer.end({ success: true, model: config.gemini.model, temperature: config.gemini.temperature, maxOutputTokens: config.gemini.maxOutputTokens }); 
            logger.info('Gemini API initialized successfully', {
                model: config.gemini.model,
                temperature: config.gemini.temperature,
                maxOutputTokens: config.gemini.maxOutputTokens 
            });
        } catch (error) {
            timer.end({ success: false, error: error.message });
            this.initializationError = error;
            logger.error('Failed to initialize Gemini API', { error: error.message });
            throw new Error(`Eroare la inițializarea API-ului Gemini: ${error.message}`);
        }
    }

    async generateContent(prompt, stepName, userId, currentAttempt = 1) { 
        if (!this.initialized) {
            throw new Error('GeminiService nu este inițializat. Apelați initialize() mai întâi.');
        }

        const timer = createTimer(`Content generation (${stepName})`);
        
        for (let attempt = 0; attempt < config.retry.maxRetries; attempt++) { 
            try {
                logger.info('Generating content with Gemini', {
                    stepName, 
                    promptLength: prompt.length,
                    attempt: attempt + 1,
                    maxRetries: config.retry.maxRetries,
                    userId 
                });

                const result = await this.model.generateContent(prompt);
                const response = result.response;
                const text = response.text(); 

                if (!text || text.trim().length === 0) {
                    throw new Error('Răspuns gol de la Gemini');
                }

                timer.end({ 
                    success: true, 
                    responseLength: text.length, 
                    attempt: attempt + 1,
                    stepName, 
                    userId 
                });

                logger.info('Content generated successfully', {
                    stepName, 
                    responseLength: text.length, 
                    attempt: attempt + 1,
                    userId 
                });

                return text; 
            } catch (error) {
                const isLastAttempt = attempt === config.retry.maxRetries - 1;
                
                logger.warn('Content generation attempt failed', {
                    stepName, 
                    attempt: attempt + 1,
                    error: error.message,
                    isLastAttempt,
                    willRetry: !isLastAttempt,
                    userId 
                });

                if (isLastAttempt) {
                    timer.end({ 
                        success: false, 
                        error: error.message, 
                        attempt: attempt + 1,
                        stepName, 
                        userId 
                    });
                    throw this.handleGeminiError(error, stepName, userId); 
                }

                const delay = Math.min(
                    config.retry.baseDelay * Math.pow(2, attempt),
                    config.retry.maxDelay
                );
                
                if (this.shouldRetry(error)) {
                    logger.info(`Retrying in ${delay}ms for ${stepName}...`, { userId }); 
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    throw this.handleGeminiError(error, stepName, userId); 
                }
            }
        }
    }

    shouldRetry(error) {
        const retryableErrors = [429, 503, 502, 504];
        const retryableMessages = ['timeout', 'rate limit', 'quota exceeded', 'model is overloaded']; 
        
        return (error.code && retryableErrors.includes(error.code)) ||
               (error.message && retryableMessages.some(msg => 
                   error.message.toLowerCase().includes(msg)
               ));
    }

    handleGeminiError(error, stepName = 'Unknown Step', userId = 'N/A') { 
        logger.error(`Gemini API error (${stepName})`, {
            code: error.code,
            message: error.message,
            details: error.details,
            stepName, 
            userId 
        });

        if (error.code === 404) {
            return new Error(`Modelul Gemini (${config.gemini.model}) nu a fost găsit sau nu este suportat în regiunea dvs. (${stepName})`);
        }
        
        if (error.code === 429 || error.code === 503) {
            return new Error(`Serviciul Gemini este supraîncărcat. Te rog încearcă din nou în câteva minute.`);
        }
        
        if (error.code === 400) {
            return new Error(`Cerere invalidă către Gemini (${stepName}): ${error.message}`);
        }
        
        if (error.code === 401 || error.code === 403) {
            return new Error(`Permisiuni insuficiente pentru API-ul Gemini (${stepName}). Verifică configurația cheii API.`);
        }

        return new Error(`Eroare API Gemini neașteptată (${stepName}): ${error.message}`);
    }

    cleanHtmlResponse(text) {
        let cleanText = text.replace(/```(?:html)?\s*\n?|\n?```/g, '').trim();
        
        const dom = new JSDOM(cleanText);
        const doc = dom.window.document; 

        let bodyContent = '';
        const bodyElement = doc.querySelector('body');
        
        if (bodyElement) {
            bodyContent = bodyElement.innerHTML;
        } else {
            const tempDiv = doc.createElement('div');
            tempDiv.innerHTML = cleanText;
            bodyContent = tempDiv.innerHTML; 
        }
        
        return bodyContent;
    }

    // --- Methods for each article generation step ---

    async generateStep1(initialSubject, userId) {
        const prompt = `Ești un expert SEO și psihoterapeut. Generează 3 idei de subiecte detaliate pentru un articol de blog care se bazează **direct și specific** pe "${initialSubject}" (NU schimba subiectul principal, doar detaliază-l), optimizate SEO. Pentru fiecare idee, propune:
- Un cuvânt cheie principal relevant și cu volum de căutare decent.
- 5-7 cuvinte cheie secundare/LSI (variații, sinonime, termeni înrudiți semantic).
- 10 cuvinte cheie long-tail relevante cu intenția de căutare (informațională/comercială/navigațională).
Alege cel mai bun subiect și set de cuvinte cheie din lista generată, justificând alegerea, și returnează-le într-un format JSON strict, fără text suplimentar în afara blocului JSON: {"subiect_final": "...", "cuvant_cheie_principal": "...", "cuvinte_cheie_secundare_lsi": ["...", "..."], "cuvinte_cheie_long_tail": ["...", "..."], "justificare_alegere": "..."}.`;

        const resultText = await this.generateContent(prompt, 'Etapa 1', userId); 
        const parsed = parseGeminiJSON(resultText, 'Etapa 1'); // CRITICAL CHANGE: Call directly without 'this.'
        
        return this.validator.validateStepResponse(parsed, 1);
    }

    async generateStep2(finalSubject, keywords, userId) {
        const prompt = `Pe baza subiectului "${finalSubject}" și a cuvintelor cheie relevante "${keywords}", simulează o analiză a concurenței pe Google. Identifică 3-5 sub-teme esențiale sau întrebări frecvente pe care concurența le abordează (ou nu suficient), și propune un unghi unic sau o lacună de conținut pe care articolul nostru le poate exploata. Structurează articolul în secțiuni (H2) și sub-secțiuni (H3) logice pentru un articol de aproximativ 1200 de cuvinte.
Propune un Meta Titlu concis (50-60 de caractere) care să includă cuvântul cheie principal și să fie convingător.
Propune o Meta Descriere succintă (150-160 de caractere) a conținutului paginii.
Returnează JSON strict: {"structura_articol": [{"titlu_h2": "...", "subteme_h3": ["...", "..."]}, ...], "unghi_unic": "...", "meta_titlu_propus": "...", "meta_descriere_propusa": "..."}.
**Asigură-te că răspunsul JSON este complet și valid, fără trunchieri sau erori de formatare.**`;

        const resultText = await this.generateContent(prompt, 'Etapa 2', userId); 
        const parsed = parseGeminiJSON(resultText, 'Etapa 2'); // CRITICAL CHANGE: Call directly without 'this.'
        
        return this.validator.validateStepResponse(parsed, 2);
    }

    async generateStep3(finalSubject, articleOutline, userId) { 
        const prompt = `Pentru articolul cu subiectul "${finalSubject}" și structura ${JSON.stringify(articleOutline, null, 2)}, identifică 3-5 concepte cheie de la autori renumiți în psihoterapie (ex: Sigmund Freud, Carl Jung, Carl Rogers, Aaron Beck, Irvin Yalom, Viktor Frankl) relevante pentru sub-temele identificate. Pentru fiecare concept, propune un scurt citat reprezentativ sau o idee principală care poate fi integrată în articol. Include și 2-3 idei de statistici relevante (fără a da cifre exacte, doar tematica) și 2-3 sugestii de surse externe de autoritate (ex: numele unei instituții, o publicație). Returnează JSON strict: {"autori_concepte": [{"nume_autor": "...", "concept": "...", "citat_sau_idee": "..."}, ...], "idei_statistici": ["...", "..."], "surse_externe_sugerate": ["...", "..."]}.`;

        const resultText = await this.generateContent(prompt, 'Etapa 3', userId); 
        const parsed = parseGeminiJSON(resultText, 'Etapa 3'); // CRITICAL CHANGE: Call directly without 'this.'
        
        return this.validator.validateStepResponse(parsed, 3);
    }

    async generateStep4(finalSubject, step1Result, step2Result, autori_concepte, idei_statistici, surse_externe_sugerate, meta_titlu_propus, meta_descriere_propusa, structura_articol, userId) {
        const prompt = `
            Ești un expert în crearea de conținut SEO și psihoterapeut. Redactează un articol de blog complet de **aproximativ 1200-1500 de cuvinte**, pe subiectul "${finalSubject}".
            FORMATUL DE IEȘIRE TREBUIE SĂ FIE DOAR HTML VALID, CURAT ȘI GATA DE COPY-PASTE ÎNTR-UN SITE, FĂRĂ TEXT SUPLIMENTAR SAU MARKDOWN ÎN AFARA HTML-ului.
            Articolul trebuie să respecte următoarele criterii de calitate, SEO și user-friendliness:

            <!DOCTYPE html>
            <html lang="ro">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${meta_titlu_propus}</title>
                <meta name="description" content="${meta_descriere_propusa}">
                <style>
                    /* Stiluri de bază pentru lizibilitate și aspect modern */
                    body { font-family: 'Arial', sans-serif; line-height: 1.7; color: #333; margin: 20px; max-width: 800px; margin: 0 auto; padding: 20px; }
                    h1, h2, h3 { font-weight: bold; color: #2c3e50; margin-top: 2em; margin-bottom: 0.8em; line-height: 1.2; }
                    h1 { font-size: 2.2em; text-align: center; }
                    h2 { font-size: 1.8em; color: #3498db; }
                    h3 { font-size: 1.4em; }
                    p { margin-bottom: 1em; text-align: justify; }
                    ul, ol { margin-bottom: 1em; padding-left: 25px; }
                    li { margin-bottom: 0.5em; }
                    strong { color: #000; }
                    blockquote { border-left: 4px solid #ccc; padding-left: 15px; margin: 1.5em 0; font-style: italic; color: #555; }
                    a { color: #3498db; text-decoration: none; }
                    a:hover { text-decoration: underline; }
                    .table-of-contents { background-color: #f9f9f9; padding: 15px; border-radius: 8px; border: 1px solid #eee; margin-bottom: 30px; }
                    .table-of-contents ul { padding-left: 0; }
                    .table-of-contents li { margin-bottom: 0.5em; }
                    .table-of-contents a { font-weight: bold; }
                    .highlight-box { background-color: #e6f7ff; border-left: 4px solid #3498db; padding: 15px; margin: 20px 0; border-radius: 4px; }
                    .highlight-box p { margin: 0; font-style: italic; }
                    .cta-block { background-color: #d4edda; color: #155724; padding: 25px; text-align: center; border-radius: 8px; margin-top: 40px; border: 1px solid #c3e6cb; }
                    .cta-block h2 { color: #155724; margin-top: 0; }
                    .cta-block a { background-color: #28a745; color: white; padding: 12px 25px; border-radius: 5px; text-decoration: none; display: inline-block; font-weight: bold; }
                    @media (max-width: 768px) {
                        body { margin: 10px; padding: 10px; }
                        h1 { font-size: 1.8em; }
                        h2 { font-size: 1.5em; }
                        h3 { font-size: 1.2em; }
                    }
                </style>
            </head>
            <body>
                <div class="table-of-contents">
                    <h2 style="color: #2c3e50; margin-top: 0;">Cuprins:</h2>
                    <ul style="list-style-type: none; padding: 0;">
                        ${structura_articol.map((section, index) => {
                            const sectionId = `section-${index + 1}`;
                            let listItem = `<li><a href="#${sectionId}" style="color: #3498db; text-decoration: none; font-weight: bold;">${section.titlu_h2}</a>`;
                            if (section.subteme_h3 && section.subteme_h3.length > 0) {
                                listItem += `<ul style="list-style-type: none; padding-left: 20px; font-size: 0.95em;">`;
                                section.subteme_h3.forEach((subtheme, subIndex) => {
                                    const subSectionId = `${sectionId}-${subIndex + 1}`;
                                    listItem += `<li><a href="#${subSectionId}" style="color: #555; text-decoration: none;">${subtheme}</a></li>`;
                                });
                                listItem += `</ul>`;
                            }
                            listItem += `</li>`;
                            return listItem;
                        }).join('')}
                    </ul>
                </div>

                <h1>${finalSubject}</h1>

                <p><strong>Introducere:</strong> Creează o introducere captivantă de 2-3 paragrafe care explică pe scurt ce este "${finalSubject}", de ce este importantă pentru cititor și ce va învăța din articol. Integrează cuvântul cheie principal "${step1Result.cuvant_cheie_principal}" natural în text. Folosește un ton primitor, empatic și profesional.</p>

                ${structura_articol.map((section, index) => {
                    const sectionId = `section-${index + 1}`;
                    let sectionContent = `<h2 id="${sectionId}">${section.titlu_h2}</h2>`;
                    
                    // ADJUSTED: Promote conciseness for H2 sections
                    sectionContent += `<p>Dezvoltă această secțiune con 1-3 paragrafe esențiali e concisi, oferindo informazioni pratici e validati științifici. Integrează cuvintele cheie secundare relevante pentru această secțiune: ${step1Result.cuvinte_cheie_secundare_lsi.join(', ')}. Include, dacă este cazul, o listă cu bullet points sau numerotată.</p>`;
                    
                    if (section.subteme_h3 && section.subteme_h3.length > 0) {
                        section.subteme_h3.forEach((subtheme, subIndex) => {
                            const subSectionId = `${sectionId}-${subIndex + 1}`;
                            sectionContent += `<h3 id="${subSectionId}">${subtheme}</h3>`;
                            // ADJUSTED: Promote conciseness for H3 sub-sections
                            sectionContent += `<p>Dezvoltă această sub-secțiune con 1-2 paragrafe clari e concisi, oferindo dettagli specifici e esempi pratici rilevanti pentru "${subtheme}". Integrează cuvinte cheie long-tail natural în text.</p>`;
                            
                            if (subIndex === 0) {
                                sectionContent += `<div class="highlight-box">
                                    <p><strong>💡 Sfat util:</strong> Adaugă aici o recomandare practică, un punct cheie sau un beneficiu evidențiat, legat direct de sub-tema curentă. Fii cât mai specific și acționabil.</p>
                                </div>`;
                            }
                        });
                    }
                    return sectionContent;
                }).join('')}

                <h2>Perspective din Psihoterapie: Ce spun Experți</h2>
                <p>Domeniul psihoterapiei oferă fundamentele științifice pentru înțelegerea ${finalSubject}. Iată ce ne învață cercetătorii:</p>
                ${autori_concepte.map(author => `
                    <blockquote>
                        <p><strong>${author.nume_autor}</strong> (${author.concept}): "${author.citat_sau_idee}"</p>
                    </blockquote>
                `).join('')}

                <p>Importanța unor statistici relevante în domeniu, menționate de ${idei_statistici.join(' ')}, arată că provocările psihologice sunt comune, afectând milioane de oameni la nivel global. Acest lucru subliniază necesitatea abordărilor validate științific.</p>
                
                <h2>Resurse Suplimentare</h2>
                <ul>
                    <li>Para información validada sobre salud mental: <a href="https://www.who.int/health-topics/mental-health" rel="nofollow">Organizația Mondială a Sănătății (OMS)</a></li>
                    <li>Psihoterapeuți acreditați: <a href="https://www.copsi.ro" rel="nofollow">Colegiul Psihologilor din România</a></li>
                    <li>Studii științifice: <a href="https://scholar.google.com/" rel="nofollow">Google Scholar</a></li>
                    <li>Publicații de specialitate: <a href="https://pubmed.ncbi.nlm.nih.gov/" rel="nofollow">PubMed</a></li>
                    ${surse_externe_sugerate.map(source => `<li>${source}</li>`).join('')}
                </ul>

                <h2>Concluzie: O Călătorie Spre Binele Tău</h2>
                <p>Rezumă principalele beneficii ale gestionării ${finalSubject} și încurajează cititorul să ia măsuri concrete. Subliniază importanța sprijinului profesional și a perseverenței în procesul de îmbunătățire a bunăstării mentale.</p>
                <p>Finalizează con un mesaj puternic și pozitiv, care să încurajeze cititorul să acționeze și să își asume controlul asupra bunăstării sale mentale, punând în valoare ideea de creștere și împlinire personală.</p>

                <div class="cta-block">
                    <h2>Ești pregătit să faci primul pas?</h2>
                    <p>Dacă simți că acest articol a rezonat con tine și ai nevoie de sprijin specializat, nu ești singur/ă. Este un act de curaj să ceri ajutor.</p>
                    <a href="https://carina-s-blog.web.app/contact" style="background-color: #28a745; color: white; padding: 12px 25px; border-radius: 5px; text-decoration: none; display: inline-block;">Programează o ședință acum!</a>
                </div>
            </body>
            </html>
        `;

        const resultText = await this.generateContent(prompt, 'Etapa 4', userId);
        const htmlArticle = this.cleanHtmlResponse(resultText);

        logger.info('HTML article generated successfully', {
            finalSubject,
            htmlLength: htmlArticle.length,
            userId
        });

        return htmlArticle;
    }

    async generateStep5(htmlArticle, keywords, userId) {
        const prompt = `
        Evaluează următorul articol HTML pentru SEO și calitate UX:

        CRITERII DE EVALUARE:
        1. **Cuvinte cheie**: Densitate și distribuție pentru: "${keywords}"
        2. **Structură HTML**: Ierarhia H1 > H2 > H3 (și H4 dacă există) și semantica.
        3. **Calitatea conținutului**: Originalitate, valoare, coerență.
        4. **Meta date**: Title și meta description.
        5. **UX**: Lizibilitate, structură, CTA-uri.

        Returnează DOAR JSON strict:
        {
            "scor_general": 85,
            "analiza_detaliata": {
                "cuvinte_cheie": {"scor": 90, "comentarii": "Densitate optimă..."},
                "structura_html": {"scor": 80, "comentarii": "Ierarhie corectă..."},
                "calitate_continut": {"scor": 85, "comentarii": "Conținut valoros..."},
                "meta_date": {"scor": 75, "comentarii": "Title și description OK..."},
                "ux_lizibilitate": {"scor": 90, "comentarii": "Structură clară..."}
            },
            "recomandari_prioritare": ["Îmbunătățire 1", "Îmbunătățire 2", "Îmbunătățire 3"],
            "status_seo": "Bun"
        }

        Articol HTML:
        ${htmlArticle.substring(0, 8000)}...
        `;

        try {
            const resultText = await this.generateContent(prompt, 'Etapa 5', userId);
            const parsed = this.parseGeminiJSON(resultText, 'Etapa 5');
            
            if (!parsed.scor_general || typeof parsed.scor_general !== 'number') {
                throw new Error('Scor general invalid');
            }
            
            parsed.scor_general = Math.max(0, Math.min(100, parsed.scor_general));
            
            return parsed;
        } catch (error) {
            logger.warn('SEO report generation failed', { error: error.message, userId });
            
            return {
                scor_general: 75,
                analiza_detaliata: {
                    mesaj: "Raportul SEO nu a putut fi generat complet, dar articolul a fost creat cu succes."
                },
                recomandari_prioritare: [
                        "Verifică manual densitatea cuvintelor cheie",
                        "Asigură-te că structura H1-H3 este corectă",
                        "Revizuiește meta description și title",
                        "Verifică link-urile externe generate"
                    ],
                    status_seo: "Parțial analizat"
                };
            }
        }

        async generateArticle(initialSubject, userId) {
            const timer = createTimer('Complete article generation');
            try {
                // STEP 1: Research and Keyword Analysis
                const step1Result = await this.generateStep1(initialSubject, userId);
                const { subiect_final, cuvant_cheie_principal, cuvinte_cheie_secundare_lsi, cuvinte_cheie_long_tail } = step1Result;
                
                const keywords = [
                    cuvant_cheie_principal,
                    ...(cuvinte_cheie_secundare_lsi || []),
                    ...(cuvinte_cheie_long_tail || [])
                ].filter(Boolean).join(', ');

                // STEP 2: Article Structure and Meta (using step1Result.finalSubject and keywords)
                const step2Result = await this.generateStep2(subiect_final, keywords, userId);
                const { structura_articol, unghi_unic, meta_titlu_propus, meta_descriere_propusa } = step2Result;

                // STEP 3: Research Details and References (using step1Result and step2Result)
                const step3Result = await this.generateStep3(subiect_final, structura_articol, userId);
                const { autori_concepte, idei_statistici, surse_externe_sugerate } = step3Result;

                // STEP 4: Generate Full HTML Article (using all previous results)
                const htmlArticleContent = await this.generateStep4(
                    subiect_final,
                    step1Result,
                    step2Result,
                    autori_concepte,
                    idei_statistici || [],
                    surse_externe_sugerate || [],
                    meta_titlu_propus,
                    meta_descriere_propusa,
                    structura_articol,
                    userId
                );
                const finalHtmlArticle = this.cleanHtmlResponse(htmlArticleContent);
                logger.info('HTML article generated successfully', { htmlLength: finalHtmlArticle.length, userId });


                // STEP 5: SEO Analysis
                const seoAnalysisResult = await this.generateStep5(finalHtmlArticle, keywords, userId);
                logger.info('Etapa 5 (Analiza SEO) finalizată.', { seoScore: seoAnalysisResult.scor_general, userId });

                timer.end({ success: true, userId });
                return {
                    success: true,
                    articleHtml: finalHtmlArticle,
                    finalSubject: subiect_final,
                    keywords,
                    articleOutline: structura_articol,
                    authorInsights: autori_concepte,
                    statisticIdeas: idei_statistici || [],
                    externalSources: surse_externe_sugerate || [],
                    seoAnalysis: seoAnalysisResult,
                    metadata: {
                        uniqueAngle: unghi_unic,
                        proposedMetaTitle: meta_titlu_propus,
                        proposedMetaDescription: meta_descriere_propusa,
                        generatedAt: new Date().toISOString(),
                        userId
                    }
                };

            } catch (error) {
                timer.end({ success: false, error: error.message, userId });
                logger.error('Complete article generation failed', { error: error.message, userId });
                throw error;
            }
        }

        async summarizeArticle(articleContent, userId) {
            const prompt = `Ești un expert în rezumarea textelor. Creează un rezumat concis și informativ (maxim 200 de cuvinte) al următorului conținut HTML. Rezumatul trebuie să fie în limba română și să captureze ideile principale, fără a include tag-uri HTML.

Articol HTML:
${articleContent.substring(0, 10000)}...`;

            logger.info(`Generating summary for user ${userId}`);
            const resultText = await this.generateContent(prompt, 'Summarize Article', userId);
            return resultText;
        }

        async expandSection(articleContent, sectionTitle, userId) {
            const prompt = `Ești un expert în crearea de conținut și psihoterapeut. Extinde secțiunea "${sectionTitle}" din următorul articol HTML. Adaugă minim 300 de cuvinte de conținut nou, detaliat, cu exemple practice și informații relevante, menținând tonul și stilul articolului original. Returnează DOAR conținutul HTML extins pentru acea secțiune (fără tag-uri <html>, <head>, <body>). Asigură-te că folosești paragrafe (<p>), liste (<ul><li>, <ol><li>) și text bold (<strong>) pentru lizibilitate.

Articol HTML:
${articleContent.substring(0, 10000)}...`;

            logger.info(`Expanding section "${sectionTitle}" for user ${userId}`);
            const resultText = await this.generateContent(prompt, 'Expand Section', userId);
            return resultText;
        }
    }

    module.exports = GeminiService;