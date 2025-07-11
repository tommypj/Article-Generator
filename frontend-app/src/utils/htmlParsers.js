export const extractSectionTitles = (htmlString) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    const h2s = Array.from(doc.querySelectorAll('h2'));
    return h2s.map(h2 => h2.textContent.trim());
};
