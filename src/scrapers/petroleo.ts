import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { DateTime } from 'luxon';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import cron from 'node-cron';
import { z } from 'zod';
import { log } from '../logger.js';

const URL = 'https://oilprice.com/';
const TIMEZONE = 'America/Montevideo';
const PETROLEO_DIR = './petroleo';

if (!fs.existsSync(PETROLEO_DIR)) {
  fs.mkdirSync(PETROLEO_DIR, { recursive: true });
}

function getCsvPath(): string {
  const now = DateTime.now().setZone(TIMEZONE);
  const filename = now.toFormat('MM-yyyy') + '.csv';
  return path.join(PETROLEO_DIR, filename);
}

// Zod schema for scraped data
const ScrapedRowSchema = z.object({
  tipo: z.string().min(1),
  precio: z.number().positive(),
});

type ScrapedRow = z.infer<typeof ScrapedRowSchema>;

export interface PetroleoRecord {
  fecha: string;
  hora: string;
  tipo: string;
  precio: string;
  apertura: string;
  minimo: string;
  maximo: string;
}

export async function scrape(): Promise<void> {
  log('INFO [Petróleo]', 'Starting scraper...');
  const currentCsvPath = getCsvPath();

  try {
    log('INFO [Petróleo]', `Fetching main page at ${URL}...`);
    const response = await fetch(URL, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch oilprice.com: ${response.status} ${response.statusText}`,
      );
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const rows: ScrapedRow[] = [];
    $('tr.link_oilprice_row').each((i, el) => {
      const spread = $(el).attr('data-spread');
      if (spread === 'Crude Oil Brent') {
        const tipo = 'Brent';
        const valText = $(el).find('td.value').text().trim();
        if (valText) {
          const precioStr = valText.replace(/[^0-9.]/g, '');
          const precio = parseFloat(precioStr);

          const parsed = ScrapedRowSchema.safeParse({ tipo, precio });
          if (parsed.success) {
            rows.push(parsed.data);
          } else {
            log(
              'WARN [Petróleo]',
              `Zod validation failed for ${tipo}: ${parsed.error.message}`,
            );
          }
        }
      }
    });

    if (rows.length === 0) {
      throw new Error('No oil data found. Check selectors.');
    }

    const now = DateTime.now().setZone(TIMEZONE);
    const fecha = now.toISODate(); // YYYY-MM-DD
    const hora = now.toFormat('HH:mm');

    let existingData: PetroleoRecord[] = [];
    if (fs.existsSync(currentCsvPath)) {
      const fileContent = fs.readFileSync(currentCsvPath, 'utf-8');
      try {
        existingData = parse(fileContent, {
          columns: true,
          skip_empty_lines: true,
        }) as PetroleoRecord[];
      } catch (e) {
        log('WARN [Petróleo]', 'Could not parse existing CSV, starting fresh.');
      }
    }

    const newRecords = rows
      .map((row: ScrapedRow) => {
        const todayRecords = existingData.filter(
          (d) => d.fecha === fecha && d.tipo === row.tipo,
        );
        const lastRecord =
          existingData.length > 0
            ? existingData.filter((d) => d.tipo === row.tipo).pop()
            : null;

        const precioVal = row.precio;

        const isSameDayAsLast = lastRecord && lastRecord.fecha === fecha;
        if (
          isSameDayAsLast &&
          parseFloat(lastRecord?.precio || '0') === precioVal
        ) {
          log(
            'SKIPPED [Petróleo]',
            `No change detected for ${row.tipo} today.`,
          );
          return null;
        }

        let apertura = precioVal;
        let minimo = precioVal;
        let maximo = precioVal;

        if (todayRecords.length > 0) {
          const prevApertura = parseFloat(todayRecords[0].apertura);
          if (!isNaN(prevApertura)) apertura = prevApertura;

          const allPrecios = todayRecords
            .map((r) => parseFloat(r.precio))
            .filter((v) => !isNaN(v))
            .concat(precioVal);
          minimo = Math.min(...allPrecios);
          maximo = Math.max(...allPrecios);
        }

        const format = (val: number | null): string =>
          val !== null && !isNaN(val) ? val.toFixed(2) : '-';

        return {
          fecha: fecha!,
          hora,
          tipo: row.tipo,
          precio: format(precioVal),
          apertura: format(apertura),
          minimo: format(minimo),
          maximo: format(maximo),
        } as PetroleoRecord;
      })
      .filter(Boolean) as PetroleoRecord[];

    if (newRecords.length === 0) {
      return;
    }

    const combinedData = [...existingData, ...newRecords];
    const output = stringify(combinedData, { header: true });
    fs.writeFileSync(currentCsvPath, output);

    log(
      'SUCCESS [Petróleo]',
      `Recorded new values for ${newRecords.map((r) => r.tipo).join(', ')}.`,
    );
  } catch (error: any) {
    log('ERROR [Petróleo]', `Scraping failed: ${error.message}`);
  }
}

export function start(): void {
  log(
    'INFO [Petróleo]',
    'Scheduling scraper to run Mon-Thu all day, and Fri until 22:00 (US Time)...',
  );

  // Monday to Thursday: every hour
  cron.schedule(
    '0 * * * 1-4',
    () => {
      scrape();
    },
    {
      timezone: 'America/New_York',
    },
  );

  // Friday: every hour from 00:00 to 22:00 (avoiding 23:00 NY = 00:00 Montevideo on Saturday)
  cron.schedule(
    '0 0-22 * * 5',
    () => {
      scrape();
    },
    {
      timezone: 'America/New_York',
    },
  );

  log(
    'INFO [Petróleo]',
    'Scraper initialized. Will run only at scheduled cron times.',
  );
}
