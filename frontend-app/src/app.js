// Importă Hooks React
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom'; // Importăm ReactDOM pentru a-l folosi direct

// Importă funcțiile Firebase SDKs (din modulele ES, pentru a fi consistente)
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, getDocs } from "firebase/firestore";
import { getDoc } from "firebase/firestore"; // getDoc was missing from the import list in app.js

// Importă componentele auxiliare
import { Button } from './components/Button.js';
import { Input } from './components/Input.js';
import { Card } from './components/Card.js';
import { Alert } from './components/Alert.js';
import { extractSectionTitles } from './utils/htmlParsers.js';
import { generateArticle, summarizeArticle, expandSection } from './services/api.js';
import { initFirebase, getFirebaseServices, fetchArticleHistory, saveArticleToFirestore, clearArticleHistory } from './services/firebase.js';

// Main App Component
function App() { 
    const [subject, setSubject] = useState('');
    const [generatedArticleHtml, setGeneratedArticleHtml] = useState('');
    const [seoReport, setSeoReport] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [articleHistory, setArticleHistory] = useState([]);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [appId, setAppId] = useState('');
    const [summarizedArticleContent, setSummarizedArticleContent] = useState('');
    const [expandedSectionContent, setExpandedSectionContent] = useState('');
    const [selectedArticleForExpansion, setSelectedArticleForExpansion] = useState(null);
    const [selectedSectionForExpansion, setSelectedSectionForExpansion] = useState('');
    const [selectedArticleIdForSummary, setSelectedArticleIdForSummary] = useState(null);
    const [selectedArticleIdForExpansion, setSelectedArticleIdForExpansion] = useState(null);


    const generatedArticleRef = useRef(null);
    const historyRef = useRef(null);

    // 1. Firebase Initialization and Authentication
    useEffect(() => {
        const currentAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const firebaseConfig = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
        const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

        if (!firebaseConfig) {
            setError('Eroare: Configurația Firebase nu este disponibilă.');
            setIsAuthReady(true);
            return;
        }

        setAppId(currentAppId);

        initFirebase(currentAppId, firebaseConfig, initialAuthToken, (ready, uid, initError) => {
            setIsAuthReady(ready);
            setUserId(uid);
            if (initError) setError(initError);
            if (ready) {
                const services = getFirebaseServices();
                setDb(services.db);
                setAuth(services.auth);
            }
        });
    }, []);

    // 2. Fetch Article History from Firestore
    useEffect(() => {
        if (!db || !userId || !isAuthReady || !appId) return;

        const unsubscribe = fetchArticleHistory(db, userId, appId, setArticleHistory, setError);
        return () => unsubscribe();
    }, [db, userId, isAuthReady, appId]);

    // Scroll to generated article when it appears
    useEffect(() => {
        if (generatedArticleHtml && generatedArticleRef.current) {
            generatedArticleRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [generatedArticleHtml]);

    // 3. Handle Article Generation
    const handleGenerateArticle = async () => {
        if (!isAuthReady) {
            setError('Autentificarea nu este gata. Te rog așteaptă.');
            return;
        }
        if (!subject.trim()) {
            setError('Te rog introdu un subiect.');
            return;
        }

        setLoading(true);
        setError('');
        setGeneratedArticleHtml('');
        setSeoReport(null);
        setSummarizedArticleContent('');
        setExpandedSectionContent('');
        setSelectedArticleForExpansion(null);
        setSelectedSectionForExpansion('');
        setSelectedArticleIdForSummary(null);
        setSelectedArticleIdForExpansion(null);


        try {
            const data = await generateArticle(subject); // Folosim serviciul API

            setGeneratedArticleHtml(data.report);
            setSeoReport(data.seoAnalysis);
            
            if (db && userId && appId) {
                await saveArticleToFirestore(db, userId, appId, {
                    subject: data.finalSubject,
                    generatedHtml: data.report,
                    seoAnalysis: data.seoAnalysis,
                    keywords: data.keywords,
                    articleOutline: data.articleOutline,
                    authorInsights: data.authorInsights,
                    statisticIdeas: data.statisticIdeas,
                    externalSources: data.externalSources,
                    metadata: data.metadata
                });
                console.log('Article saved to history.');
            }
        } catch (err) {
            console.error('Eroare la generarea articolului:', err);
            setError(`Eroare: ${err.message}. Verifică logurile funcției Cloud.`);
        } finally {
            setLoading(false);
        }
    };

    // 4. Handle Summarize Article
    const handleSummarizeArticle = async (articleHtml, articleId = null) => {
        if (!isAuthReady) {
            setError('Autentificarea nu este gata. Te rog așteaptă.');
            return;
        }
        setLoading(true);
        setError('');
        setSummarizedArticleContent('Se generează rezumatul...');
        setSelectedArticleIdForSummary(articleId);

        try {
            const data = await summarizeArticle(articleHtml); // Folosim serviciul API

            setSummarizedArticleContent(data.summary);
        } catch (err) {
            console.error('Eroare la generarea rezumatului:', err);
            setError(`Eroare: ${err.message}`);
            setSummarizedArticleContent('Eroare la generarea rezumatului.');
        } finally {
            setLoading(false);
        }
    };

    // 5. Handle Expand Section
    const handleExpandSection = async (articleHtml, sectionTitle, articleId = null) => {
        if (!isAuthReady) {
            setError('Autentificarea nu este gata. Te rog așteaptă.');
            return;
        }
        setLoading(true);
        setError('');
        setExpandedSectionContent('Se extinde secțiunea...');
        setSelectedArticleForExpansion(articleHtml);
        setSelectedSectionForExpansion(sectionTitle);
        setSelectedArticleIdForExpansion(articleId);

        try {
            const data = await expandSection(articleHtml, sectionTitle); // Folosim serviciul API

            setExpandedSectionContent(data.expandedContent);
        } catch (err) {
            console.error('Eroare la extinderea secțiunii:', err);
            setError(`Eroare: ${err.message}`);
            setExpandedSectionContent('Eroare la extinderea secțiunii.');
        } finally {
            setLoading(false);
        }
    };

    // Helper to extract section titles from HTML for expansion
    const extractSectionTitles = (htmlString) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');
        const h2s = Array.from(doc.querySelectorAll('h2'));
        return h2s.map(h2 => h2.textContent.trim());
    };


    // 6. Handle Clear History
    const handleClearHistory = async () => {
        if (!db || !userId || !appId) return;

        if (window.confirm('Ești sigur că vrei să ștergi tot istoricul articolelor generate? Această acțiune este ireversibilă.')) {
            setLoading(true);
            setError('');
            try {
                await clearArticleHistory(db, userId, appId); // Folosim serviciul Firebase
                console.log('History cleared successfully.');
                setGeneratedArticleHtml('');
                setSeoReport(null);
                setSummarizedArticleContent('');
                setExpandedSectionContent('');
                setSelectedArticleForExpansion(null);
                setSelectedSectionForExpansion('');
                setSelectedArticleIdForSummary(null);
                setSelectedArticleIdForExpansion(null);
            } catch (err) {
                console.error('Eroare la ștergerea istoricului:', err);
                setError(`Eroare la ștergerea istoricului: ${err.message}`);
            } finally {
                setLoading(false);
            }
        }
    };

    if (!isAuthReady) {
        return (
            React.createElement('div', { className: "flex items-center justify-center min-h-screen bg-gray-100" },
                React.createElement(Card, { className: "p-8 text-center" },
                    React.createElement('p', { className: "text-lg font-semibold" }, "Se încarcă aplicația și se autentifică... Te rog așteaptă."),
                    error && React.createElement(Alert, { type: "error", className: "mt-4", onClose: () => setError('') }, error)
                )
            )
        );
    }

    return (
        React.createElement('div', { className: "min-h-screen bg-gray-100 flex flex-col items-center p-4 sm:p-6 lg:p-8 font-sans" },
            React.createElement(Card, { className: "w-full max-w-3xl mb-8" },
                React.createElement('h1', { className: "text-3xl sm:text-4xl font-bold text-center text-blue-800 mb-6" }, "Generator de Articole Automatizat"),
                userId && (
                    React.createElement(Alert, { type: "info", className: "mb-4 text-sm break-all", onClose: () => {} },
                        "ID Utilizator: ", React.createElement('span', { className: "font-mono" }, userId)
                    )
                ),
                React.createElement('div', { className: "mb-4" },
                    React.createElement('label', { htmlFor: "subjectInput", className: "block text-gray-700 text-lg font-medium mb-2" }, "Introdu o idee inițială de subiect (ex: anxietate, stimă de sine):"),
                    React.createElement(Input, {
                        id: "subjectInput",
                        value: subject,
                        onChange: (e) => setSubject(e.target.value),
                        placeholder: "Ex: Stima de sine, Gestionarea stresului, Psihoterapia individuală",
                        className: "text-lg"
                    })
                ),
                React.createElement(Button, {
                    onClick: handleGenerateArticle,
                    disabled: loading,
                    className: "w-full py-3 text-xl"
                }, loading ? 'Se generează articolul... (poate dura 1-2 minute)' : 'Generează Articol Complet'),
                error && React.createElement(Alert, { type: "error", className: "mt-4", onClose: () => setError('') }, error)
            ),

            generatedArticleHtml && (
                React.createElement(Card, { className: "w-full max-w-3xl mb-8", ref: generatedArticleRef },
                    React.createElement('h2', { className: "text-2xl font-bold text-blue-800 mb-4" }, "Articol Generat:"),
                    React.createElement('div', {
                        className: "prose max-w-none p-4 border border-gray-200 rounded-md bg-gray-50 overflow-x-auto",
                        dangerouslySetInnerHTML: { __html: generatedArticleHtml }
                    }),
                    seoReport && (
                        React.createElement('div', { className: "mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md" },
                            React.createElement('h3', { className: "text-xl font-semibold text-blue-700 mb-2" }, "Raport SEO:"),
                            React.createElement('p', { className: "text-lg" }, "Scor General: ", React.createElement('span', { className: "font-bold" }, seoReport.scor_general || 'N/A'), "/100"),
                            React.createElement('p', { className: "text-lg" }, "Status SEO: ", React.createElement('span', { className: "font-bold" }, seoReport.status_seo || 'N/A')),
                            React.createElement('h4', { className: "font-semibold mt-3" }, "Recomandări Prioritare:"),
                            React.createElement('ul', { className: "list-disc list-inside text-gray-700" },
                                seoReport.recomandari_prioritare && seoReport.recomandari_prioritare.length > 0 ? (
                                    seoReport.recomandari_prioritare.map((rec, idx) => React.createElement('li', { key: idx }, rec))
                                ) : (
                                    React.createElement('li', null, "Nu există recomandări specifice.")
                                )
                            ),
                            seoReport.analiza_detaliata && seoReport.analiza_detaliata.mesaj && (
                                React.createElement(Alert, { type: "warning", className: "mt-3 text-sm", onClose: () => {} }, seoReport.analiza_detaliata.mesaj)
                             )
                        )
                    )
                )
            ),

            /* New LLM Features Section */
            (generatedArticleHtml || articleHistory.length > 0) && (
                React.createElement(React.Fragment, null, // Using React.Fragment for multiple top-level elements
                    React.createElement(Card, { className: "w-full max-w-3xl mb-8" },
                        React.createElement('h2', { className: "text-2xl font-bold text-blue-800 mb-4" }, "Funcționalități Articol ✨"),
                        
                        /* Article Summarizer */
                        React.createElement('div', { className: "mb-6 p-4 border border-gray-200 rounded-md bg-gray-50" },
                            React.createElement('h3', { className: "text-xl font-semibold text-gray-800 mb-2" }, "Rezumat Articol ✨"),
                            React.createElement('p', { className: "text-gray-600 mb-3" }, "Generează un rezumat concis al articolului afișat mai sus sau al unui articol din istoric."),
                            React.createElement(Button, { 
                                onClick: () => handleSummarizeArticle(generatedArticleHtml, 'current'),
                                disabled: loading || !generatedArticleHtml,
                                className: "mr-2 bg-purple-600 hover:bg-purple-700"
                            }, "Rezumat Articol Curent"),
                            React.createElement('select', { 
                                className: "p-2 border border-gray-300 rounded-md mr-2",
                                onChange: (e) => {
                                    const selectedArticle = articleHistory.find(art => art.id === e.target.value);
                                    if (selectedArticle) {
                                        setSummarizedArticleContent('');
                                        handleSummarizeArticle(selectedArticle.generatedHtml, selectedArticle.id);
                                    } else {
                                        setSummarizedArticleContent('');
                                        setSelectedArticleIdForSummary(null);
                                    }
                                },
                                disabled: loading || articleHistory.length === 0
                            },
                                React.createElement('option', { value: "" }, "Sau alege din istoric..."),
                                articleHistory.map(art => (
                                    React.createElement('option', { key: art.id, value: art.id }, art.subject.substring(0, 50), "...")
                                ))
                            ),
                            summarizedArticleContent && selectedArticleIdForSummary && (
                              React.createElement('div', { className: "mt-4 p-3 bg-purple-50 border border-purple-200 rounded-md" },
                                  React.createElement('h4', { className: "font-semibold text-purple-700" }, "Rezumat:"),
                                  React.createElement('p', { className: "text-gray-800" }, summarizedArticleContent)
                              )
                            )
                        )
                    ),

                            /* Expand Section */
                            React.createElement('div', { className: "p-4 border border-gray-200 rounded-md bg-gray-50" },
                                React.createElement('h3', { className: "text-xl font-semibold text-gray-800 mb-2" }, "Extinde Secțiune Articol ✨"),
                                React.createElement('p', { className: "text-gray-600 mb-3" }, "Alege o secțiune dintr-un articol și extinde-i conținutul."),
                                
                                React.createElement('select', { 
                                    className: "p-2 border border-gray-300 rounded-md mr-2",
                                    onChange: (e) => {
                                        const selectedArticle = articleHistory.find(art => art.id === e.target.value);
                                        setSelectedArticleForExpansion(selectedArticle ? selectedArticle.generatedHtml : null);
                                        setSelectedArticleIdForExpansion(selectedArticle ? selectedArticle.id : null);
                                        setSelectedSectionForExpansion('');
                                        setExpandedSectionContent('');
                                    },
                                    disabled: loading || articleHistory.length === 0
                                },
                                    React.createElement('option', { value: "" }, "Alege un articol din istoric..."),
                                    articleHistory.map(art => (
                                        React.createElement('option', { key: art.id, value: art.id }, art.subject.substring(0, 50), "...")
                                    ))
                                ),

                                selectedArticleForExpansion && (
                                    React.createElement('select', { 
                                        className: "p-2 border border-gray-300 rounded-md mt-2 mr-2",
                                        onChange: (e) => setSelectedSectionForExpansion(e.target.value),
                                        value: selectedSectionForExpansion,
                                        disabled: loading
                                    },
                                        React.createElement('option', { value: "" }, "Alege o secțiune..."),
                                        extractSectionTitles(selectedArticleForExpansion).map((title, idx) => (
                                            React.createElement('option', { key: idx, value: title }, title)
                                        ))
                                    )
                                ),

                                React.createElement(Button, { 
                                    onClick: () => handleExpandSection(selectedArticleForExpansion, selectedSectionForExpansion, selectedArticleIdForExpansion),
                                    disabled: loading || !selectedArticleForExpansion || !selectedSectionForExpansion,
                                    className: "mt-2 bg-green-600 hover:bg-green-700"
                                }, "Extinde Secțiunea"),

                                expandedSectionContent && selectedArticleIdForExpansion && (
                                    React.createElement('div', { className: "mt-4 p-3 bg-green-50 border border-green-200 rounded-md" },
                                        React.createElement('h4', { className: "font-semibold text-green-700" }, "Conținut Extins:"),
                                        React.createElement('div', { dangerouslySetInnerHTML: { __html: expandedSectionContent } })
                                    )
                                )
                            )
                        )
                    ),


                    articleHistory.length > 0 && (
                        React.createElement(Card, { className: "w-full max-w-3xl", ref: historyRef },
                            React.createElement('h2', { className: "text-2xl font-bold text-blue-800 mb-4" }, "Istoric Articole Generate (", articleHistory.length, ")"),
                            React.createElement(Button, { onClick: handleClearHistory, disabled: loading, className: "mb-4 bg-red-500 hover:bg-red-600" }, "Șterge Istoricul"),
                            React.createElement('div', { className: "space-y-4 max-h-96 overflow-y-auto pr-2" },
                                articleHistory.map((article) => (
                                    React.createElement('div', { key: article.id, className: "history-item" },
                                        React.createElement('h3', { className: "text-xl font-semibold text-gray-800 mb-2" }, article.subject),
                                        React.createElement('p', { className: "text-sm text-gray-600 mb-2" },
                                            "Generat la: ", article.timestamp ? new Date(article.timestamp.toDate()).toLocaleString() : 'N/A',
                                            article.seoAnalysis?.scor_general && (
                                                React.createElement('span', { className: "ml-4 font-bold" }, "Scor SEO: ", article.seoAnalysis.scor_general || 'N/A')
                                            )
                                        ),
                                        React.createElement('div', { className: "flex flex-wrap gap-2 mt-2" },
                                            React.createElement('button', { 
                                                onClick: () => {
                                                    setGeneratedArticleHtml(article.generatedHtml);
                                                    setSeoReport(article.seoAnalysis);
                                                    setSummarizedArticleContent('');
                                                    setExpandedSectionContent('');
                                                    setSelectedArticleIdForSummary(null);
                                                    setSelectedArticleIdForExpansion(null);
                                                    if (generatedArticleRef.current) {
                                                        generatedArticleRef.current.scrollIntoView({ behavior: 'smooth' });
                                                    }
                                                },
                                                className: "history-button gray"
                                            }, "Vezi Articol"),
                                            React.createElement('button', { 
                                                onClick: () => handleSummarizeArticle(article.generatedHtml, article.id),
                                                disabled: loading,
                                                className: "history-button purple"
                                            }, "Rezumat ✨"),
                                            React.createElement('button', { 
                                                onClick: () => {
                                                    setSelectedArticleForExpansion(article.generatedHtml);
                                                    setSelectedArticleIdForExpansion(article.id);
                                                    setSelectedSectionForExpansion('');
                                                    setExpandedSectionContent('');
                                                    setSummarizedArticleContent('');
                                                    setSelectedArticleIdForSummary(null);
                                                    if (historyRef.current) {
                                                        historyRef.current.scrollIntoView({ behavior: 'smooth' });
                                                    }
                                                },
                                                disabled: loading,
                                                className: "history-button green"
                                            }, "Extinde Secțiune ✨")
                                        ),
                                        summarizedArticleContent && article.id === selectedArticleIdForSummary && (
                                            React.createElement('div', { className: "mt-4 p-3 bg-purple-50 border border-purple-200 rounded-md" },
                                                React.createElement('h4', { className: "font-semibold text-purple-700" }, "Rezumat:"),
                                                React.createElement('p', { className: "text-gray-800" }, summarizedArticleContent)
                                            )
                                        ),
                                        expandedSectionContent && article.id === selectedArticleIdForExpansion && (
                                            React.createElement('div', { className: "mt-4 p-3 bg-green-50 border border-green-200 rounded-md" },
                                                React.createElement('h4', { className: "font-semibold text-green-700" }, "Conținut Extins:"),
                                                React.createElement('div', { dangerouslySetInnerHTML: { __html: expandedSectionContent } })
                                            )
                                        )
                                    )
                                ))
                            )
                        )
                    )
                )
            );
        }

        // Render the App component into the root div
        document.addEventListener('DOMContentLoaded', () => {
            const rootElement = document.getElementById('root');
            if (rootElement) {
                ReactDOM.createRoot(rootElement).render(React.createElement(App));
            } else {
                console.error("Elementul cu ID 'root' nu a fost găsit în DOM.");
            }
        });

