import Parser from 'rss-parser';
import { log } from '../../logger.js';
import { RssNewsItem } from './types.js';

const parser = new Parser({ timeout: 15000 });

// RSS feeds de interés.
// Principales portales y diarios de Uruguay, más BBC Mundo para contexto global
const RSS_FEEDS = [
  'https://www.montevideo.com.uy/anxml.aspx?58',
  'https://www.teledoce.com/feed/',
  'http://feeds.bbci.co.uk/mundo/rss.xml',
];

// El scraper corre cada ~6 hs: con 36 hs de ventana no se pierde nada y no se
// le pagan tokens al modelo por noticias viejas.
const MAX_AGE_MS = 36 * 60 * 60 * 1000;
const MAX_ITEMS = 50;
const MAX_SNIPPET_CHARS = 300;

function cleanSnippet(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SNIPPET_CHARS);
}

async function fetchFeed(feedUrl: string): Promise<RssNewsItem[]> {
  log('INFO [News-Fetcher]', `Fetching news from: ${feedUrl}`);
  const feed = await parser.parseURL(feedUrl);

  return feed.items.map((item) => ({
    title: item.title || 'Sin Título',
    link: item.link || '',
    pubDate: item.pubDate || new Date().toISOString(),
    contentSnippet: cleanSnippet(item.contentSnippet || item.content || ''),
    source: feed.title || 'Unknown',
  }));
}

export async function fetchNews(): Promise<RssNewsItem[]> {
  // Los feeds son independientes: se leen en paralelo y uno caído no frena al resto.
  const results = await Promise.allSettled(RSS_FEEDS.map(fetchFeed));

  const allNews: RssNewsItem[] = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      allNews.push(...result.value);
    } else {
      log(
        'ERROR [News-Fetcher]',
        `Error reading feed ${RSS_FEEDS[i]}: ${result.reason?.message ?? result.reason}`,
        true,
      );
    }
  });

  const cutoff = Date.now() - MAX_AGE_MS;
  const seen = new Set<string>();

  return allNews
    .filter((n) => {
      const time = new Date(n.pubDate).getTime();
      // Si la fecha no se puede interpretar, se conserva la noticia.
      if (!Number.isNaN(time) && time < cutoff) return false;

      const key = n.link || n.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    .slice(0, MAX_ITEMS);
}
