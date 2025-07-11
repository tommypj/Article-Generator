const CLOUD_FUNCTION_URL = 'https://us-central1-carinas-article-genetation.cloudfunctions.net/generateReport'; // URL-ul funcției tale Cloud

export const generateArticle = async (subject) => {
    const response = await fetch(CLOUD_FUNCTION_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'generateArticle', subject }),
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Eroare la generarea articolului.');
    }
    return response.json();
};

export const summarizeArticle = async (articleContent) => {
    const response = await fetch(CLOUD_FUNCTION_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'summarizeArticle', articleContent }),
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Eroare la generarea rezumatului.');
    }
    return response.json();
};

export const expandSection = async (articleContent, sectionTitle) => {
    const response = await fetch(CLOUD_FUNCTION_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'expandSection', articleContent, sectionTitle }),
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Eroare la extinderea secțiunii.');
    }
    return response.json();
};
