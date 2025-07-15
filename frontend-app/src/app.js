// Importă Hooks React
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import DOMPurify from 'dompurify'; // Add this import

// Importă componentele auxiliare
import { Button } from './components/Button.js';
import { Input } from './components/Input.js';
import { Card } from './components/Card.js';
import { Alert } from './components/Alert.js';
import { extractSectionTitles } from './utils/htmlParsers.js'; 

// All Firebase interaction MUST go through your local ./services/firebase.js file.
import { initFirebase, getFirebaseServices, fetchArticleHistory, saveArticleToFirestore, clearArticleHistory, registerUserWithEmail, signInUserWithEmail, signInWithGoogle, signOutUser } from './services/firebase.js'; 
import { generateArticle, summarizeArticle, expandSection } from './services/api.js'; 


// Main App Component
function App() { 
    // State for article generation and display
    const [subject, setSubject] = useState('');
    const [generatedArticleHtml, setGeneratedArticleHtml] = useState('');
    const [seoReport, setSeoReport] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(''); // General application errors

    // State for Firebase & User Management
    const [userId, setUserId] = useState(null); // Authenticated user ID
    const [isAuthReady, setIsAuthReady] = useState(false); // Whether Firebase Auth listener is ready
    const [isLoggedIn, setIsLoggedIn] = useState(false); // Whether a user is currently logged in
    const [db, setDb] = useState(null); // Firestore DB instance
    const [auth, setAuth] = useState(null); // Firebase Auth instance
    const [appId, setAppId] = useState(null); // Firebase App ID
    const [authError, setAuthError] = useState(''); // Errors specific to authentication attempts

    // State for Login Form
    const [userEmail, setUserEmail] = useState('');
    const [userPassword, setUserPassword] = useState('');

    // State for article history
    const [articleHistory, setArticleHistory] = useState([]);
    const unsubscribeRef = useRef(null); // To store Firestore unsubscribe function

    // State for summary/expansion features
    const [summarizedArticleContent, setSummarizedArticleContent] = useState('');
    const [expandedSectionContent, setExpandedSectionContent] = useState('');
    const [selectedArticleForExpansion, setSelectedArticleForExpansion] = useState('');
    const [selectedSectionForExpansion, setSelectedSectionForExpansion] = useState('');
    const [selectedArticleIdForSummary, setSelectedArticleIdForSummary] = useState(null); 
    const [selectedArticleIdForExpansion, setSelectedArticleIdForExpansion] = useState(null); 


    // MODIFIED useEffect for Firebase initialization and auth state
    useEffect(() => {
        console.log('App.js: useEffect - Initializing Firebase...'); // ADDED LOG
        const firebaseConfig = typeof window.__firebase_config !== 'undefined' ? window.__firebase_config : null;
        const currentAppId = typeof window.__app_id !== 'undefined' ? window.__app_id : null;

        console.log('App.js: firebaseConfig from window:', firebaseConfig); // ADDED LOG
        console.log('App.js: currentAppId from window:', currentAppId); // ADDED LOG

        if (!firebaseConfig || !currentAppId) {
            setError("Firebase configuration is not available. Please ensure index.html is correctly configured.");
            console.error('App.js: Firebase config or appId is missing from window.'); // ADDED LOG
            return;
        }

        const onAuthReadyCallback = (ready, uid, initError) => {
            console.log('App.js: onAuthReadyCallback fired. Arguments:'); // ADDED LOG
            console.log('  ready:', ready); // ADDED LOG
            console.log('  uid:', uid); // ADDED LOG
            console.log('  initError:', initError); // ADDED LOG

            setIsAuthReady(ready);
            setUserId(uid);
            if (uid) {
                setIsLoggedIn(true);
                try {
                    const services = getFirebaseServices();
                    setDb(services.db);
                    setAuth(services.auth); 
                    setAppId(services.appId);
                    console.log('App.js: Firebase services obtained successfully.'); // ADDED LOG
                } catch (err) {
                    setError(`Error getting Firebase services: ${err.message}`);
                    console.error('App.js: Error getting Firebase services:', err.message); // ADDED LOG
                }
            } else {
                setIsLoggedIn(false);
                setDb(null);
                setAuth(null); 
                setAppId(null);
                if (ready) { 
                    setAuthError(initError || 'Utilizatorul nu este autentificat.');
                    console.log('App.js: Auth listener ready, but user not logged in. Setting authError.'); // ADDED LOG
                }
            }
            if (initError) {
                setError(`Firebase Auth Init Error: ${initError}`);
                console.error('App.js: Firebase Auth Init Error detected:', initError); // ADDED LOG
            } else {
                if (error.includes('Firebase Auth Init Error')) {
                    setError(''); 
                }
            }
        };

        initFirebase(currentAppId, firebaseConfig, onAuthReadyCallback);

        return () => {
            if (unsubscribeRef.current) {
                console.log('App.js: Cleaning up Firestore listener.'); // ADDED LOG
                unsubscribeRef.current(); 
                unsubscribeRef.current = null;
            }
        };
    }, []); 

    // New useEffect to handle fetching history only when user is logged in and DB is ready
    useEffect(() => {
        console.log('App.js: useEffect for history fetch triggered.'); // ADDED LOG
        console.log('  isAuthReady:', isAuthReady, 'isLoggedIn:', isLoggedIn, 'db:', !!db, 'appId:', !!appId, 'userId:', !!userId); // ADDED LOG

        if (isAuthReady && isLoggedIn && db && appId && userId) { 
            console.log('App.js: Attempting to fetch history for user:', userId); // ADDED LOG
            if (unsubscribeRef.current) {
                unsubscribeRef.current();
            }
            const unsubscribe = fetchArticleHistory(db, userId, appId, setArticleHistory, setError);
            unsubscribeRef.current = unsubscribe; 
            return () => { 
                if (unsubscribeRef.current) {
                    unsubscribeRef.current();
                    unsubscribeRef.current = null;
                }
            };
        } else if (isAuthReady && !isLoggedIn) {
            console.log('App.js: Auth ready but user not logged in. Clearing history.'); // ADDED LOG
            setArticleHistory([]);
        }
    }, [isAuthReady, isLoggedIn, db, userId, appId]);


    // --- Authentication Handlers ---
    const handleRegister = async () => {
        setLoading(true);
        setAuthError(''); 
        setError(''); 
        try {
            console.log('App.js: Attempting registration for:', userEmail); // ADDED LOG
            await registerUserWithEmail(userEmail, userPassword);
            console.log('App.js: Registration successful.'); // ADDED LOG
        } catch (err) {
            setAuthError(err.message);
            console.error('App.js: Registration failed:', err.message); // ADDED LOG
        } finally {
            setLoading(false);
        }
    };

    const handleLogin = async () => {
        setLoading(true);
        setAuthError(''); 
        setError('');
        try {
            console.log('App.js: Attempting login for:', userEmail); // ADDED LOG
            await signInUserWithEmail(userEmail, userPassword);
            console.log('App.js: Login successful.'); // ADDED LOG
        } catch (err) {
            setAuthError(err.message);
            console.error('App.js: Login failed:', err.message); // ADDED LOG
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        setLoading(true);
        setAuthError(''); 
        setError('');
        try {
            console.log('App.js: Attempting Google login.'); // ADDED LOG
            await signInWithGoogle();
            console.log('App.js: Google login successful.'); // ADDED LOG
        } catch (err) {
            setAuthError(err.message);
            console.error('App.js: Google login failed:', err.message); // ADDED LOG
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        setLoading(true);
        setError('');
        setAuthError('');
        try {
            console.log('App.js: Attempting logout.'); // ADDED LOG
            await signOutUser();
            console.log('App.js: Logout successful.'); // ADDED LOG
            setGeneratedArticleHtml('');
            setSeoReport(null);
            setSummarizedArticleContent('');
            setExpandedSectionContent('');
            setSelectedArticleForExpansion('');
            setSelectedSectionForExpansion('');
            setSelectedArticleIdForSummary(null);
            setSelectedArticleIdForExpansion(null);
            setSubject('');
        } catch (err) {
            setAuthError(err.message);
            console.error('App.js: Logout failed:', err.message); // ADDED LOG
        } finally {
            setLoading(false);
        }
    };

    // --- Article Generation & History Handlers ---
    const handleGenerateArticle = async () => {
        if (!isLoggedIn) {
            setError('Please log in to generate articles.');
            console.warn('App.js: Generate article blocked - not logged in.'); // ADDED LOG
            return;
        }
        if (!subject.trim()) {
            setError('Please enter a subject.');
            console.warn('App.js: Generate article blocked - no subject.'); // ADDED LOG
            return;
        }
        setLoading(true);
        setError('');
        try {
            console.log('App.js: Calling generateArticle API.'); // ADDED LOG
            const result = await generateArticle(subject); 
            setGeneratedArticleHtml(result.articleHtml);
            setSeoReport(result.seoAnalysis);
            
            const { db: firestoreDbInstance, userId: currentAuthUserId, appId: currentAppIdInstance } = getFirebaseServices();
            console.log('App.js: Saving article to Firestore for user:', currentAuthUserId); // ADDED LOG
            await saveArticleToFirestore(firestoreDbInstance, currentAuthUserId, currentAppIdInstance, {
                subject: result.finalSubject,
                html: result.articleHtml,
                seoScore: result.seoAnalysis?.scor_general,
                generatedAt: new Date().toISOString()
            });
            console.log('App.js: Article saved to Firestore.'); // ADDED LOG
        } catch (err) {
            setError(`Error generating article: ${err.message}`);
            console.error('App.js: Error generating article:', err.message); // ADDED LOG
        } finally {
            setLoading(false);
        }
    };

    const handleSummarizeArticle = async (articleHtml, articleId) => {
        if (!isLoggedIn) {
            setError('Please log in to summarize articles.');
            console.warn('App.js: Summarize blocked - not logged in.'); // ADDED LOG
            return;
        }
        setLoading(true);
        setError('');
        try {
            console.log('App.js: Calling summarizeArticle API.'); // ADDED LOG
            const result = await summarizeArticle(articleHtml);
            setSummarizedArticleContent(result.summary);
            setSelectedArticleIdForSummary(articleId);
            console.log('App.js: Article summarized successfully.'); // ADDED LOG
        } catch (err) {
            setError(`Error summarizing article: ${err.message}`);
            console.error('App.js: Error summarizing article:', err.message); // ADDED LOG
        } finally {
            setLoading(false);
        }
    };

    const handleExpandSection = async (articleHtml, sectionTitle) => {
        if (!isLoggedIn) {
            setError('Please log in to expand sections.');
            console.warn('App.js: Expand blocked - not logged in.'); // ADDED LOG
            return;
        }
        if (!sectionTitle) {
            setError('Please select a section to expand.');
            console.warn('App.js: Expand blocked - no section selected.'); // ADDED LOG
            return;
        }
        setLoading(true);
        setError('');
        try {
            console.log('App.js: Calling expandSection API.'); // ADDED LOG
            const result = await expandSection(articleHtml, sectionTitle);
            setExpandedSectionContent(result.expandedContent);
            setSelectedArticleForExpansion(articleHtml);
            setSelectedSectionForExpansion(sectionTitle);
            console.log('App.js: Section expanded successfully.'); // ADDED LOG
        } catch (err) {
            setError(`Error expanding section: ${err.message}`);
            console.error('App.js: Error expanding section:', err.message); // ADDED LOG
        } finally {
            setLoading(false);
        }
    };

    const handleClearHistory = async () => {
        if (!isLoggedIn) {
            setError('Please log in to clear history.');
            console.warn('App.js: Clear history blocked - not logged in.'); // ADDED LOG
            return;
        }
        setLoading(true);
        setError('');
        try {
            console.log('App.js: Calling clearArticleHistory.'); // ADDED LOG
            const { db: firestoreDbInstance, userId: currentAuthUserId, appId: currentAppIdInstance } = getFirebaseServices();
            await clearArticleHistory(firestoreDbInstance, currentAuthUserId, currentAppIdInstance);
            setArticleHistory([]);
            console.log('App.js: History cleared successfully.'); // ADDED LOG
        } catch (err) {
            setError(`Error clearing history: ${err.message}`);
            console.error('App.js: Error clearing history:', err.message); // ADDED LOG
        } finally {
            setLoading(false);
        }
    };


    // Main Render Logic
    // If Firebase Auth listener is not yet ready, show loading state
    if (!isAuthReady) {
        console.log('App.js: Render - Showing loading screen (!isAuthReady).'); // ADDED LOG
        return (
            <div className="p-8 text-center min-h-screen flex items-center justify-center">
                <p className="text-lg font-semibold">Se încarcă aplicația și se autentifică... Te rog așteaptă.</p>
                {/* Display general error if any, not authError here */}
                {error && <Alert type="error" className="mt-4" onClose={() => setError('')}>{error}</Alert>}
            </div>
        );
    }

    // If Firebase Auth listener is ready but user is not logged in, show login/registration form
    if (!isLoggedIn) {
        console.log('App.js: Render - Showing Login/Registration Form (isAuthReady && !isLoggedIn).'); // ADDED LOG
        return (
            <div className="min-h-screen bg-gray-100 p-4 flex flex-col items-center justify-center">
                <Card className="w-full max-w-md p-8">
                    <h2 className="text-2xl font-bold text-center mb-6">Autentificare</h2>
                    {/* Display auth-specific errors here */}
                    {authError && <Alert type="error" className="mb-4" onClose={() => setAuthError('')}>{authError}</Alert>}
                    <Input
                        placeholder="Email"
                        value={userEmail}
                        onChange={(e) => setUserEmail(e.target.value)}
                        className="mb-3"
                    />
                    <Input
                        type="password"
                        placeholder="Parolă"
                        value={userPassword}
                        onChange={(e) => setUserPassword(e.target.value)}
                        className="mb-4"
                    />
                    <Button onClick={handleLogin} disabled={loading} className="w-full mb-3">
                        {loading ? 'Autentificare...' : 'Autentificare'}
                    </Button>
                    <p className="text-center text-gray-600 mb-4">sau</p>
                    <Button onClick={handleGoogleLogin} disabled={loading} className="w-full bg-red-600 hover:bg-red-700">
                        {loading ? 'Autentificare cu Google...' : 'Autentificare cu Google'}
                    </Button>
                    <Button onClick={handleRegister} disabled={loading} className="w-full mt-4 bg-gray-600 hover:bg-gray-700">
                        {loading ? 'Înregistrare...' : 'Înregistrare (Email)'}
                    </Button>
                </Card>
            </div>
        );
    }

    // If logged in, render the main app content
    console.log('App.js: Render - Showing Main App Content (isLoggedIn is TRUE).'); // ADDED LOG
    return (
        <div className="min-h-screen bg-gray-100 p-4 flex flex-col items-center">
            <h1 className="text-4xl font-bold text-blue-700 mb-8">Generato AI Content Dashboard</h1>
            <p className="text-center text-gray-600 mb-4">Autentificat ca: **{auth?.currentUser?.email || auth?.currentUser?.uid || 'Utilizator necunoscut'}**</p>
            <Button onClick={handleLogout} disabled={loading} className="mb-4 bg-red-500 hover:bg-red-600">
                Deconectare
            </Button>

            {error && <Alert type="error" className="w-full max-w-4xl mb-4" onClose={() => setError('')}>{error}</Alert>}

            <Card className="w-full max-w-4xl mb-8">
                <h2 className="text-2xl font-bold mb-4">Generare Articol Nou</h2>
                <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Introdu subiectul articolului (ex: 'gestionarea anxietății la adolescenți')"
                    className="mb-4"
                />
                <Button onClick={handleGenerateArticle} disabled={loading || !subject.trim()}>
                    {loading ? 'Generare...' : 'Generează Articol'}
                </Button>
            </Card>

            {generatedArticleHtml && (
                <Card className="w-full max-w-4xl mb-8">
                    <h2 className="text-2xl font-bold mb-4">Articol Generat</h2>
                    <div
                        className="prose max-w-none p-4 border border-gray-200 rounded-md bg-gray-50 overflow-x-auto"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(generatedArticleHtml) }}
                    ></div>
                    <div className="mt-4 flex space-x-2">
                        <Button onClick={() => handleSummarizeArticle(generatedArticleHtml, 'current')} disabled={loading} className="history-button purple">Rezumă Articol Curent</Button>
                    </div>
                </Card>
            )}

            {summarizedArticleContent && (
                <Card className="w-full max-w-4xl mb-8">
                    <h2 className="text-2xl font-bold mb-4">Rezumatul Articolului {(selectedArticleIdForSummary === 'current' ? 'curent' : `ID: ${selectedArticleIdForSummary}`)}</h2>
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                        <p className="text-blue-700">{summarizedArticleContent}</p>
                    </div>
                    <Button onClick={() => setSummarizedArticleContent('')} className="mt-4 bg-gray-600 hover:bg-gray-700">Ascunde Rezumat</Button>
                </Card>
            )}

            {expandedSectionContent && (
                <Card className="w-full max-w-4xl mb-8">
                    <h2 className="text-2xl font-bold mb-4">Secțiune Extinsă {(selectedArticleIdForExpansion ? `din ${selectedSectionForExpansion}` : '')}</h2>
                    <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                    <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(expandedSectionContent) }}></div>
                    </div>
                    <Button onClick={() => setExpandedSectionContent('')} className="mt-4 bg-gray-600 hover:bg-gray-700">Ascunde Secțiune Extinsă</Button>
                </Card>
            )}


            <Card className="w-full max-w-4xl">
                <h2 className="text-2xl font-bold mb-4">Istoricul Articolelor ({articleHistory.length})</h2>
                {articleHistory.length === 0 ? (
                    <p className="text-gray-600">Niciun articol generat încă. Generează unul!</p>
                ) : (
                    <>
                        <Button onClick={handleClearHistory} disabled={loading} className="mb-4 bg-red-500 hover:bg-red-600">Șterge Istoric</Button>
                        <ul>
                            {articleHistory.map((article) => (
                                <li key={article.id} className="mb-4 p-4 border rounded-md shadow-sm bg-gray-50">
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="text-xl font-semibold text-blue-600">{article.subject}</h3>
                                        <span className="text-sm text-gray-500">
                                            {article.metadata?.generatedAt ? new Date(article.metadata.generatedAt).toLocaleString() : (article.timestamp ? new Date(article.timestamp.seconds * 1000).toLocaleString() : 'Data necunoscută')}
                                        </span>
                                    </div>
                                    <div className="flex space-x-2 mb-2">
                                        <Button
                                            onClick={() => {
                                                setGeneratedArticleHtml(article.html);
                                                setSeoReport(article.seoAnalysis || null);
                                                setSummarizedArticleContent(''); // Clear summary when viewing new article
                                                setExpandedSectionContent(''); // Clear expanded section when viewing new article
                                            }}
                                            className="history-button purple"
                                            disabled={loading}
                                        >
                                            Vezi Articol
                                        </Button>
                                        <Button
                                            onClick={() => handleSummarizeArticle(article.html, article.id)}
                                            className="history-button green"
                                            disabled={loading}
                                        >
                                            Rezumă
                                        </Button>
                                        <Button
                                            onClick={() => {
                                                setSelectedArticleForExpansion(article.html);
                                                setSelectedArticleIdForExpansion(article.id);
                                                setExpandedSectionContent(''); // Clear previous expanded content
                                                setSelectedSectionForExpansion(''); // Reset selected section
                                            }}
                                            className="history-button gray"
                                            disabled={loading}
                                        >
                                            Extinde Secțiune
                                        </Button>
                                    </div>
                                    {selectedArticleIdForExpansion === article.id && ( // Only show expansion form for selected article
                                        <div className="mt-4">
                                            <h4 className="font-semibold mb-2">Extinde o secțiune:</h4>
                                            <select
                                                onChange={(e) => setSelectedSectionForExpansion(e.target.value)}
                                                value={selectedSectionForExpansion}
                                                className="w-full p-2 border border-gray-300 rounded-md mb-2"
                                            >
                                                <option value="">Selectează o secțiune</option>
                                                {extractSectionTitles(article.html).map((title, idx) => (
                                                    <option key={idx} value={title}>{title}</option>
                                                ))}
                                            </select>
                                            <Button
                                                onClick={() => handleExpandSection(selectedArticleForExpansion, selectedSectionForExpansion)}
                                                disabled={loading || !selectedSectionForExpansion}
                                                className="w-full"
                                            >
                                                Extinde Secțiunea
                                            </Button>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </Card>
        </div>
    );
}

// Ensure the render is inside DOMContentLoaded, as your original code already does.
document.addEventListener('DOMContentLoaded', () => {
    const rootElement = document.getElementById('root');
    if (rootElement) {
        ReactDOM.createRoot(rootElement).render(React.createElement(App));
    } else {
        console.error("Elementul cu ID 'root' nu a fost găsit în DOM.");
    }
});