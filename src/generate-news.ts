import { fetchNews } from './scrapers/events/news-fetcher.js';
import { generateMostRelevantNews } from './scrapers/events/gemini-generator.js';
import { writeJsonFile, getRecentLocalNewsTitles, getRecentJsonFilesData, updateJsonFile } from './scrapers/events/json-writer.js';
import { enrichNewsContent } from './scrapers/events/news-enricher.js';
import { log } from './logger.js';
import cron from 'node-cron';
import { fileURLToPath } from 'url';
import { TimelineEvent } from './scrapers/events/types.js';

export async function runNewsAutomation(): Promise<void> {
  try {
    log('INFO [News]', '--- Starting news automation ---');

    // 1. Obtener noticias
    const newsList = await fetchNews();
    if (newsList.length === 0) {
      log('WARNING [News]', 'No news found in feeds. Aborting.');
      await runNewsEnrichment();
      return;
    }
    log('INFO [News]', `Collected ${newsList.length} news from RSS feeds.`);

    // Log a summary of the titles found so we know what is being evaluated
    newsList.forEach((n, i) => {
      log('DEBUG [News]', `  ${i + 1}. [${n.source}] ${n.title}`);
    });

    const localTitles: string[] = getRecentLocalNewsTitles(7); // Obtener títulos de los últimos 7 días
    if (localTitles.length > 0) {
      log('INFO [News]', `Found ${localTitles.length} news already generated locally in recent days.`);
    }

    // 2. Procesar con IA
    const relevantNewsArray = await generateMostRelevantNews(newsList, localTitles);

    if (!relevantNewsArray || relevantNewsArray.length === 0) {
      log('INFO [News]', 'No new news selected.');
      await runNewsEnrichment();
      return;
    }

    // Verificación ESTRICTA local: Evitar que Groq/Gemini se haya "saltado" la regla
    const localTitlesLower = localTitles.map(t => t.toLowerCase());
    const verifiedNews = relevantNewsArray.filter(news => {
      const isDuplicate = localTitlesLower.some(local =>
        local.includes(news.title.toLowerCase()) ||
        news.title.toLowerCase().includes(local)
      );

      if (isDuplicate) {
        log('WARNING [News]', `Discarded by local verification (duplicate from recent days): "${news.title}"`);
        return false;
      }
      return true;
    });

    if (verifiedNews.length === 0) {
      log('WARNING [News]', 'None of the selected news passed local verification. All were duplicates.');
    } else {
      // Guardar noticias base (con isEnriched: false por defecto)
      verifiedNews.forEach(news => log('SUCCESS [News]', `News approved and selected: "${news.title}"`));
      writeJsonFile(verifiedNews);
    }

    // 3. Paso de Recuperación y Enriquecimiento (Diferido)
    await runNewsEnrichment();

    log('INFO [News]', '--- Process finished successfully ---');
  } catch (error: any) {
    log('ERROR [News]', `Error during automation: ${error.message}`, true);
  }
}

async function runNewsEnrichment(): Promise<void> {
  try {
    log('INFO [News]', 'Searching for news pending enrichment in the last 3 days...');
    const recentFilesData = getRecentJsonFilesData(3);

    for (const fileData of recentFilesData) {
      const { filePath, data } = fileData;
      // Enriquecer todas las noticias que tengan isEnriched === false
      const needsEnrichment = data.filter((n: TimelineEvent) => !n.isEnriched);

      if (needsEnrichment.length > 0) {
        log('INFO [News]', `Found ${needsEnrichment.length} pending news in: ${filePath}`);
        const newlyEnriched = await enrichNewsContent(needsEnrichment);

        // Actualizar el arreglo de ese archivo específico
        const finalData = data.map((news: TimelineEvent) => {
          const enriched = newlyEnriched.find(e => e.id === news.id);
          return enriched ? enriched : news;
        });

        updateJsonFile(filePath, finalData);
        log('SUCCESS [News]', `File updated with enriched contents: ${filePath}`);
      }
    }
  } catch (error: any) {
    log('ERROR [News]', `Error during enrichment: ${error.message}`, true);
  }
}

export function start(): void {
  log('INFO [News]', 'Scheduling news scraper to run 4 times a day (06:05, 12:05, 18:05, 22:05)...');
  cron.schedule('5 6,12,18,22 * * *', () => {
    runNewsAutomation();
  }, {
    timezone: 'America/Montevideo'
  });

  log('INFO [News]', 'Scheduling news enricher to run individually at 13, 14, 19, 20, 23 hs...');
  cron.schedule('0 13,14,19,20,23 * * *', () => {
    runNewsEnrichment();
  }, {
    timezone: 'America/Montevideo'
  });

  // Ejecución inmediata al iniciar el sistema removida para respetar estrictamente el cron
  log('INFO [News]', 'Scraper initialized. Will run only at scheduled cron times.');
}

// Permitir ejecución directa desde la terminal
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start();
}
