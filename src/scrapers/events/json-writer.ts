import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { log } from '../../logger.js';
import { DateTime } from 'luxon';
import { TimelineEvent } from './types.js';

const TIMEZONE = 'America/Montevideo';

/**
 * Archivos `YYYY-MM-DD.json` de los últimos `days` días calendario (hoy
 * incluido), del más nuevo al más viejo. Se filtra por fecha del nombre y no
 * por cantidad de archivos: si el scraper estuvo meses sin correr, los
 * archivos viejos no cuentan como "recientes".
 */
function getRecentJsonFileNames(outputDir: string, days: number): string[] {
  const oldest = DateTime.now()
    .setZone(TIMEZONE)
    .minus({ days: days - 1 })
    .toISODate();

  return fs
    .readdirSync(outputDir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .filter((f) => f.slice(0, 10) >= (oldest ?? ''))
    .sort()
    .reverse();
}

export function getRecentLocalNewsTitles(days: number = 7): string[] {
  const outputDir = path.join(process.cwd(), 'noticias');
  if (!fs.existsSync(outputDir)) return [];

  let allTitles: string[] = [];
  try {
    for (const file of getRecentJsonFileNames(outputDir, days)) {
      const content = fs.readFileSync(path.join(outputDir, file), 'utf-8');
      const data = JSON.parse(content) as TimelineEvent[];
      allTitles = allTitles.concat(data.map((item) => item.title));
    }
  } catch (e: any) {
    log(
      'ERROR [JSON-Writer]',
      `Error reading recent JSONs: ${e.message}`,
      true,
    );
  }
  return allTitles;
}

export function writeJsonFile(newsArray: TimelineEvent[]): string | null {
  if (!newsArray || newsArray.length === 0) return null;

  const date = DateTime.now().setZone(TIMEZONE).toISODate();
  const outputDir = path.join(process.cwd(), 'noticias');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filePath = path.join(outputDir, `${date}.json`);
  let existingData: TimelineEvent[] = [];

  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      existingData = JSON.parse(content) as TimelineEvent[];
    } catch (e: any) {
      log(
        'ERROR [JSON-Writer]',
        `Error parsing existing JSON: ${e.message}`,
        true,
      );
    }
  }

  // Agregar UUID a las nuevas noticias y estructurarlas bien
  const newsWithIds: TimelineEvent[] = newsArray.map((news) => ({
    id: uuidv4(),
    ...news,
    isEnriched: news.isEnriched || false,
    tags: Array.isArray(news.tags) ? news.tags : [],
    image_url: news.image_url || null,
  }));

  const combinedData = [...existingData, ...newsWithIds];

  fs.writeFileSync(filePath, JSON.stringify(combinedData, null, 2), 'utf-8');

  return filePath;
}

export function getRecentJsonFilesData(
  days: number = 3,
): { filePath: string; data: TimelineEvent[] }[] {
  const outputDir = path.join(process.cwd(), 'noticias');
  if (!fs.existsSync(outputDir)) return [];

  let results: { filePath: string; data: TimelineEvent[] }[] = [];
  try {
    for (const file of getRecentJsonFileNames(outputDir, days)) {
      const filePath = path.join(outputDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content) as TimelineEvent[];
      results.push({ filePath, data });
    }
  } catch (e: any) {
    log(
      'ERROR [JSON-Writer]',
      `Error reading recent JSONs data: ${e.message}`,
      true,
    );
  }
  return results;
}

export function updateJsonFile(filePath: string, data: TimelineEvent[]): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e: any) {
    log('ERROR [JSON-Writer]', `Error updating JSON file: ${e.message}`, true);
  }
}
