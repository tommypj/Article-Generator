import { getAuth } from 'firebase/auth'; // Import getAuth

const CLOUD_FUNCTION_URL = 'https://generatereport-35sqwhgxpq-uc.a.run.app';

const getAuthHeader = async () => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) {
        // If no user is authenticated, throw an error.
        // The UI should prevent calls if not authenticated.
        throw new Error("User not authenticated. Please log in.");
    }
    const idToken = await user.getIdToken();
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
    };
};

export const generateArticle = async (subject) => {
    const headers = await getAuthHeader(); // Get authenticated headers
    const response = await fetch(CLOUD_FUNCTION_URL, {
        method: 'POST',
        headers: headers, // Use authenticated headers
        body: JSON.stringify({ action: 'generateArticle', subject }),
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Eroare la generarea articolului.');
    }
    return response.json();
};

export const summarizeArticle = async (articleContent) => {
    const headers = await getAuthHeader();
    const response = await fetch(CLOUD_FUNCTION_URL, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ action: 'summarizeArticle', articleContent }),
    });
    // ADDED: Full error handling and return for summarizeArticle
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Eroare la generarea rezumatului.');
    }
    return response.json();
};

export const expandSection = async (articleContent, sectionTitle) => {
    const headers = await getAuthHeader();
    const response = await fetch(CLOUD_FUNCTION_URL, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ action: 'expandSection', articleContent, sectionTitle }),
    });
    // ADDED: Full error handling and return for expandSection
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Eroare la extinderea secțiunii.');
    }
    return response.json();
};