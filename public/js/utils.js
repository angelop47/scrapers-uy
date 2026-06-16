export const categoryLabels = {
    "business": "Negocios",
    "crisis": "Crisis",
    "culture": "Cultura",
    "economic": "Económico",
    "entertainment": "Entretenimiento",
    "infrastructure": "Infraestructura",
    "international": "Internacional",
    "law": "Ley / Decreto",
    "politics": "Política",
    "social": "Social"
};

export function toggleContent(btn) {
    const content = btn.nextElementSibling;
    if (content.style.display === 'block') {
        content.style.display = 'none';
        btn.textContent = 'Leer desarrollo completo';
    } else {
        content.style.display = 'block';
        btn.textContent = 'Ocultar desarrollo';
    }
}
// Expose to window for inline onclick handlers
window.toggleContent = toggleContent;

export function copyTextToClipboard(text) {
    if (!navigator.clipboard) {
        return new Promise((resolve, reject) => {
            try {
                const textArea = document.createElement("textarea");
                textArea.value = text;
                textArea.style.position = "fixed";
                textArea.style.top = "0";
                textArea.style.left = "0";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                const successful = document.execCommand('copy');
                document.body.removeChild(textArea);
                if (successful) {
                    resolve();
                } else {
                    reject(new Error('execCommand copy failed'));
                }
            } catch (err) {
                reject(err);
            }
        });
    }
    return navigator.clipboard.writeText(text);
}
