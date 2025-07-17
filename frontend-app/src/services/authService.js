// frontend-app/src/services/authService.js
// This file centralizes Firebase Authentication functions.

import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
// Note: onAuthStateChanged is usually handled where the Firebase app is initialized (in firebase.js)

// It's good practice to get the auth instance from firebase.js if possible,
// but for direct auth operations, you can also use getAuth() here if it's already initialized.
// For consistency, let's get the firebaseAuth instance from getFirebaseServices() when needed,
// but for these direct auth calls, getAuth() is fine if the app is already initialized.
// However, to be absolutely safe and avoid potential uninitialized errors,
// it's best to pass the firebaseAuth instance to these functions, or ensure getAuth() is called after initializeApp.
// For simplicity and directness, these will assume firebaseAuth is initialized globally as in firebase.js.

// We will export functions that accept 'auth' as a parameter to ensure they use the correct instance.

export const registerUserWithEmail = async (authInstance, email, password) => {
    try {
        const userCredential = await createUserWithEmailAndPassword(authInstance, email, password);
        console.log('authService.js: User registered with email:', userCredential.user.email);
        return userCredential.user;
    } catch (error) {
        console.error('authService.js: Registration failed:', error.message);
        throw new Error(`Registration failed: ${error.message}`);
    }
};

export const signInUserWithEmail = async (authInstance, email, password) => {
    try {
        const userCredential = await signInWithEmailAndPassword(authInstance, email, password);
        console.log('authService.js: User signed in with email:', userCredential.user.email);
        return userCredential.user;
    } catch (error) {
        console.error('authService.js: Login failed:', error.message);
        throw new Error(`Login failed: ${error.message}`);
    }
};

export const signInWithGoogle = async (authInstance) => {
    try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(authInstance, provider);
        console.log('authService.js: User signed in with Google:', result.user.email);
        return result.user;
    } catch (error) {
        console.error('authService.js: Google Sign-In failed:', error.message);
        throw new Error(`Google Sign-In failed: ${error.message}`);
    }
};

export const signOutUser = async (authInstance) => {
    try {
        await signOut(authInstance);
        console.log('authService.js: User signed out successfully.');
    } catch (error) {
        console.error('authService.js: Logout failed:', error.message);
        throw new Error(`Logout failed: ${error.message}`);
    }
};