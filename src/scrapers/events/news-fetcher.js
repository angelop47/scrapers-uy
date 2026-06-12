import Parser from 'rss-parser';
import { log } from '../../logger.js';

const parser = new Parser();

// RSS feeds de interés. 
// Principales portales y diarios de Uruguay, más BBC Mundo para contexto global
const RSS_FEEDS = [
    'https://www.montevideo.com.uy/anxml.aspx?58',
    'https://www.teledoce.com/feed/',
    'http://feeds.bbci.co.uk/mundo/rss.xml'
];

export async function fetchNews() {
    let allNews = [];

    for (const feedUrl of RSS_FEEDS) {
        try {
            log('INFO [News-Fetcher]', `Fetching news from: ${feedUrl}`);
            const feed = await parser.parseURL(feedUrl);

            feed.items.forEach(item => {
                allNews.push({
                    title: item.title,
                    link: item.link,
                    pubDate: item.pubDate,
                    contentSnippet: item.contentSnippet || item.content,
                    source: feed.title
                });
            });
        } catch (error) {
            log('ERROR [News-Fetcher]', `Error reading feed ${feedUrl}: ${error.message}`, true);
        }
    }

    // Ordenar de más reciente a más antigua
    allNews.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    // Limitar a las 50 más recientes para dar un buen abanico a la IA
    return allNews.slice(0, 50);
}
