import { fetchNews } from './scrapers/events/news-fetcher.js';
import { generateMostRelevantNews } from './scrapers/events/gemini-generator.js';
import { writeJsonFile, getTodayLocalNewsTitles } from './scrapers/events/json-writer.js';
import { log } from './logger.js';
import cron from 'node-cron';
import { fileURLToPath } from 'url';

async function runNewsAutomation() {
    try {
        log('INFO [News]', '--- Starting news automation ---');
        
        // 1. Obtener noticias
        const newsList = await fetchNews();
        if (newsList.length === 0) {
            log('WARNING [News]', 'No news found in feeds. Aborting.');
            return;
        }
        log('INFO [News]', `Collected ${newsList.length} news from RSS feeds.`);

        const localTitles = getTodayLocalNewsTitles();
        if (localTitles.length > 0) {
            log('INFO [News]', `Found ${localTitles.length} news already generated locally today.`);
        }

        // 2. Procesar con IA
        const relevantNewsArray = await generateMostRelevantNews(newsList, localTitles);
        
        if (!relevantNewsArray || relevantNewsArray.length === 0) {
            log('INFO [News]', 'No new news selected.');
            return;
        }

        // Verificación ESTRICTA local: Evitar que Groq se haya "saltado" la regla
        const localTitlesLower = localTitles.map(t => t.toLowerCase());
        const verifiedNews = relevantNewsArray.filter(news => {
            const isDuplicate = localTitlesLower.some(local => 
                local.includes(news.title.toLowerCase()) || 
                news.title.toLowerCase().includes(local)
            );
            
            if (isDuplicate) {
                log('WARNING [News]', `Discarded by local verification (duplicate of today): "${news.title}"`);
                return false;
            }
            return true;
        });

        if (verifiedNews.length === 0) {
            log('WARNING [News]', 'None of the selected news passed local verification. All were duplicates.');
            return;
        }

        // 3. Generar JSON
        let filePath;
        if (verifiedNews.length > 0) {
            verifiedNews.forEach(news => log('SUCCESS [News]', `News approved and selected: "${news.title}"`));
            filePath = writeJsonFile(verifiedNews);
        }
        
        if (filePath) {
            log('SUCCESS [News]', `JSON file updated successfully: ${filePath}`);
        }
        log('INFO [News]', '--- Process finished successfully ---');
    } catch (error) {
        log('ERROR [News]', `Error during automation: ${error.message}`, true);
    }
}

export function start() {
    log('INFO [News]', 'Scheduling news scraper to run 4 times a day (06:00, 12:00, 18:00, 22:00)...');
    cron.schedule('0 6,12,18,22 * * *', () => {
        runNewsAutomation();
    });

    // Ejecución inmediata al iniciar el sistema
    runNewsAutomation();
}

// Permitir ejecución directa desde la terminal
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    start();
}
