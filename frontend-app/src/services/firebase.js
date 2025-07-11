// Importă funcțiile Firebase direct din modulele lor ES
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, getDocs } from "firebase/firestore";

let firebaseApp = null;
let firestoreDb = null;
let firebaseAuth = null;
let currentUserId = null;
let currentAppId = null;

export const initFirebase = (appId, firebaseConfig, initialAuthToken, onAuthReady) => {
    if (firebaseApp) {
        console.log('Firebase deja inițializat.');
        if (onAuthReady) onAuthReady(true, currentUserId);
        return;
    }

    currentAppId = appId;

    try {
        firebaseApp = initializeApp(firebaseConfig);
        firestoreDb = getFirestore(firebaseApp);
        firebaseAuth = getAuth(firebaseApp);

        onAuthStateChanged(firebaseAuth, async (user) => {
            if (!user) {
                try {
                    if (initialAuthToken) {
                        await signInWithCustomToken(firebaseAuth, initialAuthToken);
                        console.log('Signed in with custom token');
                    } else {
                        await signInAnonymously(firebaseAuth);
                        console.log('Signed in anonymously');
                    }
                } catch (authError) {
                    console.error('Firebase Auth Error:', authError);
                    if (onAuthReady) onAuthReady(false, null, `Eroare autentificare: ${authError.message}`);
                    return;
                }
            }
            currentUserId = firebaseAuth.currentUser?.uid || (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15));
            console.log('Firebase Auth Ready. User ID:', currentUserId);
            if (onAuthReady) onAuthReady(true, currentUserId);
        });
    } catch (err) {
        console.error('Firebase initialization error:', err);
        if (onAuthReady) onAuthReady(false, null, `Eroare inițializare Firebase: ${err.message}`);
    }
};

export const getFirebaseServices = () => {
    if (!firebaseApp || !firestoreDb || !firebaseAuth) {
        throw new Error('Firebase nu este inițializat. Apelați initFirebase() mai întâi.');
    }
    return { db: firestoreDb, auth: firebaseAuth, userId: currentUserId, appId: currentAppId };
};

export const fetchArticleHistory = (db, userId, appId, setArticleHistory, setError) => {
    const historyCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/generatedArticles`);
    const q = query(historyCollectionRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
        const articles = [];
        snapshot.forEach((doc) => {
            articles.push({ id: doc.id, ...doc.data() });
        });
        articles.sort((a, b) => (b.timestamp?.toDate() || 0) - (a.timestamp?.toDate() || 0));
        setArticleHistory(articles);
        console.log('Article history updated:', articles.length);
    }, (err) => {
        console.error('Error fetching article history:', err);
        setError(`Eroare la încărcarea istoricului: ${err.message}`);
    });

    return unsubscribe;
};

export const saveArticleToFirestore = async (db, userId, appId, articleData) => {
    const historyCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/generatedArticles`);
    await addDoc(historyCollectionRef, {
        ...articleData,
        timestamp: new Date() // Adaugăm timestamp la salvare
    });
    console.log('Article saved to history.');
};

export const clearArticleHistory = async (db, userId, appId) => {
    const historyCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/generatedArticles`);
    const q = query(historyCollectionRef);
    const snapshot = await getDocs(q);
    const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/generatedArticles`, d.id)));
    await Promise.all(deletePromises);
    console.log('History cleared successfully.');
};
