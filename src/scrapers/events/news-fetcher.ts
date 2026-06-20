import Parser from 'rss-parser';
import { log } from '../../logger.js';
import { RssNewsItem } from './types.js';

const parser = new Parser();

// RSS feeds de interés.
// Principales portales y diarios de Uruguay, más BBC Mundo para contexto global
const RSS_FEEDS = [
  'https://www.montevideo.com.uy/anxml.aspx?58',
  'https://www.teledoce.com/feed/',
  'http://feeds.bbci.co.uk/mundo/rss.xml',
];

export async function fetchNews(): Promise<RssNewsItem[]> {
  let allNews: RssNewsItem[] = [];

  for (const feedUrl of RSS_FEEDS) {
    try {
      log('INFO [News-Fetcher]', `Fetching news from: ${feedUrl}`);
      const feed = await parser.parseURL(feedUrl);

      feed.items.forEach((item) => {
        allNews.push({
          title: item.title || 'Sin Título',
          link: item.link || '',
          pubDate: item.pubDate || new Date().toISOString(),
          contentSnippet: item.contentSnippet || item.content || '',
          source: feed.title || 'Unknown',
        });
      });
    } catch (error: any) {
      log(
        'ERROR [News-Fetcher]',
        `Error reading feed ${feedUrl}: ${error.message}`,
        true,
      );
    }
  }

  // Ordenar de más reciente a más antigua
  allNews.sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime(),
  );
  // Limitar a las 50 más recientes para dar un buen abanico a la IA
  return allNews.slice(0, 50);
}
