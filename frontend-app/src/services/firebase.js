// Importă funcțiile Firebase direct din modulele lor npm
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, getDocs } from "firebase/firestore";

let firebaseApp = null;
let firestoreDb = null;
let firebaseAuth = null;
let currentUserId = null; 
let currentAppId = null;
let authListenerInitialized = false; // NEW: Flag to track if onAuthStateChanged has fired once

export const initFirebase = (appId, firebaseConfig, onAuthReady) => { 
    console.log('firebase.js: initFirebase called.');
    console.log('  firebaseConfig passed:', firebaseConfig);
    console.log('  appId passed:', appId);

    if (firebaseApp) {
        console.log('firebase.js: Firebase already initialized.');
        // If already initialized, and auth listener has already run, report its current state
        if (onAuthReady && authListenerInitialized) { // Check if auth listener already ran
            onAuthReady(true, currentUserId, currentUserId ? null : 'Utilizatorul nu este autentificat.');
        }
        return;
    }

    currentAppId = appId;

    try {
        firebaseApp = initializeApp(firebaseConfig);
        firestoreDb = getFirestore(firebaseApp);
        firebaseAuth = getAuth(firebaseApp);
        console.log('firebase.js: Firebase app initialized via initializeApp.');

        onAuthStateChanged(firebaseAuth, (user) => {
            console.log('firebase.js: onAuthStateChanged fired. User:', user);
            authListenerInitialized = true; // Set flag: the auth listener has now provided its initial state
            if (user) {
                currentUserId = user.uid; 
                console.log('firebase.js: User is logged in. UID:', currentUserId);
                if (onAuthReady) onAuthReady(true, currentUserId); // Pass true for ready
            } else {
                currentUserId = null;
                console.log('firebase.js: User is signed out.');
                if (onAuthReady) onAuthReady(true, null, 'Utilizatorul nu este autentificat.'); // MODIFIED: Pass true for ready
            }
        });
    } catch (err) {
        console.error('firebase.js: Firebase initialization error in catch block:', err);
        if (onAuthReady) onAuthReady(false, null, `Eroare inițializare Firebase: ${err.message}`);
    }
};

export const getFirebaseServices = () => {
    console.log('firebase.js: getFirebaseServices called.');
    if (!firebaseApp || !firestoreDb || !firebaseAuth) {
        console.error('firebase.js: getFirebaseServices - Firebase not initialized.');
        throw new Error('Firebase is not initialized. Call initFirebase() first.');
    }
    // Removed the currentUserId check here, as getFirebaseServices might be called before
    // the user is fully logged in for some operations, but it's the responsibility of the caller
    // (e.g., handleGenerateArticle) to ensure userId is present.
    console.log('firebase.js: Returning Firebase services with userId:', currentUserId);
    return { db: firestoreDb, auth: firebaseAuth, userId: currentUserId, appId: currentAppId };
};

// --- New Authentication Functions ---

export const registerUserWithEmail = async (email, password) => {
    try {
        const userCredential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
        console.log('firebase.js: User registered with email:', userCredential.user.email);
        return userCredential.user;
    } catch (error) {
        console.error('firebase.js: Registration failed:', error.message);
        throw new Error(`Registration failed: ${error.message}`);
    }
};

export const signInUserWithEmail = async (email, password) => {
    try {
        const userCredential = await signInWithEmailAndPassword(firebaseAuth, email, password);
        console.log('firebase.js: User signed in with email:', userCredential.user.email);
        return userCredential.user;
    } catch (error) {
        console.error('firebase.js: Login failed:', error.message);
        throw new Error(`Login failed: ${error.message}`);
    }
};

export const signInWithGoogle = async () => {
    try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(firebaseAuth, provider);
        console.log('firebase.js: User signed in with Google:', result.user.email);
        return result.user;
    } catch (error) {
        console.error('firebase.js: Google Sign-In failed:', error.message);
        throw new Error(`Google Sign-In failed: ${error.message}`);
    }
};

export const signOutUser = async () => {
    try {
        await signOut(firebaseAuth);
        console.log('firebase.js: User signed out successfully.');
    } catch (error) {
        console.error('firebase.js: Logout failed:', error.message);
        throw new Error(`Logout failed: ${error.message}`);
    }
};

// Existing Firestore functions (fetchArticleHistory, saveArticleToFirestore, clearArticleHistory)
// They will automatically use the `currentUserId` which is now from persistent auth.
export const fetchArticleHistory = (db, userId, appId, setArticleHistory, setError) => {
    console.log('firebase.js: fetchArticleHistory called for userId:', userId);
    if (!userId) { 
        console.log('firebase.js: Cannot fetch history: User ID is null.');
        setArticleHistory([]); 
        return () => {}; 
    }
    const historyCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/generatedArticles`);
    const q = query(historyCollectionRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
        console.log('firebase.js: onSnapshot received update. Articles count:', snapshot.size);
        const articles = [];
        snapshot.forEach((doc) => {
            articles.push({ id: doc.id, ...doc.data() });
        });
        articles.sort((a, b) => (b.timestamp?.toDate() || 0) - (a.timestamp?.toDate() || 0));
        setArticleHistory(articles);
        console.log('firebase.js: Article history updated:', articles.length);
    }, (err) => {
        console.error('firebase.js: Error fetching article history:', err);
        setError(`Eroare la încărcarea istoricului: ${err.message}`);
    });

    return unsubscribe;
};

export const saveArticleToFirestore = async (db, userId, appId, articleData) => {
    console.log('firebase.js: saveArticleToFirestore called for userId:', userId);
    if (!userId) { 
        console.error('firebase.js: Cannot save article: User not authenticated.');
        throw new Error('Cannot save article: User not authenticated.');
    }
    const historyCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/generatedArticles`);
    await addDoc(historyCollectionRef, {
        ...articleData,
        timestamp: new Date()
    });
    console.log('firebase.js: Article saved to history for userId:', userId);
};

export const clearArticleHistory = async (db, userId, appId) => {
    console.log('firebase.js: clearArticleHistory called for userId:', userId);
    if (!userId) { 
        console.error('firebase.js: Cannot clear history: User not authenticated.');
        throw new Error('Cannot clear history: User not authenticated.');
    }
    const historyCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/generatedArticles`);
    const q = query(historyCollectionRef);
    const snapshot = await getDocs(q);
    const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/generatedArticles`, d.id)));
    await Promise.all(deletePromises);
    console.log('firebase.js: History cleared successfully for userId:', userId);
};