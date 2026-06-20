import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { DateTime } from 'luxon';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import cron from 'node-cron';
import { z } from 'zod';
import { log } from '../logger.js';

const URL = 'https://www.brou.com.uy/cotizaciones';
const TIMEZONE = 'America/Montevideo';
const DOLLAR_DIR = './dollar';

if (!fs.existsSync(DOLLAR_DIR)) {
  fs.mkdirSync(DOLLAR_DIR, { recursive: true });
}

function getCsvPath(): string {
  const now = DateTime.now().setZone(TIMEZONE);
  const filename = now.toFormat('MM-yyyy') + '.csv';
  return path.join(DOLLAR_DIR, filename);
}

// Zod Schema to validate scraped rows
const ScrapedRowSchema = z.object({
  moneda: z.string().min(1),
  compra: z.string().regex(/^[\d.,-]+$/, "Invalid characters in compra"),
  venta: z.string().regex(/^[\d.,-]+$/, "Invalid characters in venta"),
});

type ScrapedRow = z.infer<typeof ScrapedRowSchema>;

export interface CurrencyRecord {
  fecha: string;
  hora: string;
  moneda: string;
  compra: string;
  venta: string;
  compra_apertura: string;
  compra_minimo: string;
  compra_maximo: string;
  venta_apertura: string;
  venta_minimo: string;
  venta_maximo: string;
}

export async function scrape(): Promise<void> {
  log('INFO [Dólar]', 'Starting scraper...');
  const currentCsvPath = getCsvPath();

  try {
    log('INFO [Dólar]', `Fetching main page at ${URL}...`);
    const mainResponse = await fetch(URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!mainResponse.ok) {
      throw new Error(`Failed to fetch main page: ${mainResponse.status} ${mainResponse.statusText}`);
    }

    const mainHtml = await mainResponse.text();

    // Extract Liferay portlet URL for the cotizaciones table
    const urlMatch = mainHtml.match(/url:"(\\x2fc\\x2fportal\\x2frender_portlet[^"]*cotizacionfull_WAR_broutmfportlet[^"]*)"/);
    if (!urlMatch) {
      throw new Error('No portlet URL found in main page HTML. The page structure might have changed.');
    }

    // Decode Liferay escaped URL string
    const portletUrl = urlMatch[1]
      .replace(/\\x2f/g, '/')
      .replace(/\\x3f/g, '?')
      .replace(/\\x3d/g, '=')
      .replace(/\\x26/g, '&');

    log('INFO [Dólar]', 'Fetching portlet data...');
    const portletResponse = await fetch(`https://www.brou.com.uy${portletUrl}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!portletResponse.ok) {
      throw new Error(`Failed to fetch portlet: ${portletResponse.status} ${portletResponse.statusText}`);
    }

    const portletHtml = await portletResponse.text();
    const $ = cheerio.load(portletHtml);

    const rows: ScrapedRow[] = [];
    $('.cotizacion-portlet table tbody tr').each((i, el) => {
      const moneda = $(el).find('td:nth-child(1) .moneda').text().trim();
      const compra = $(el).find('td:nth-child(3) .valor').text().trim();
      const venta = $(el).find('td:nth-child(5) .valor').text().trim();

      if (moneda === 'Dólar' && compra && venta) {
        const parsed = ScrapedRowSchema.safeParse({ moneda, compra, venta });
        if (parsed.success) {
          rows.push(parsed.data);
        } else {
          log('WARN [Dólar]', `Zod validation failed for ${moneda}: ${parsed.error.message}`);
        }
      }
    });

    if (rows.length === 0) {
      throw new Error('No "Dólar" data found in the table. Check selectors or currency name.');
    }

    const now = DateTime.now().setZone(TIMEZONE);
    const fecha = now.toISODate(); // YYYY-MM-DD
    const hora = now.toFormat('HH:mm');

    let existingData: CurrencyRecord[] = [];
    if (fs.existsSync(currentCsvPath)) {
      const fileContent = fs.readFileSync(currentCsvPath, 'utf-8');
      try {
        existingData = parse(fileContent, { columns: true, skip_empty_lines: true }) as CurrencyRecord[];
      } catch (e) {
        log('WARN [Dólar]', 'Could not parse existing CSV, starting fresh.');
      }
    }

    const newRecords = rows.map((row: ScrapedRow) => {
      const todayRecords = existingData.filter(d => d.fecha === fecha && d.moneda === row.moneda);
      const lastRecord = existingData.length > 0 ? existingData.filter(d => d.moneda === row.moneda).pop() : null;

      // Values are expected in "1.234,56" format, convert to 1234.56
      const parseValue = (val: string | null | undefined): number | null => {
        if (!val || val === '-') return null;
        return parseFloat(val.replace(/\./g, '').replace(',', '.'));
      };

      const compraVal = parseValue(row.compra);
      const ventaVal = parseValue(row.venta);

      // Check if price changed since last record FOR THE SAME DAY
      // If it's a new day, we should write even if value didn't change
      const isSameDayAsLast = lastRecord && lastRecord.fecha === fecha;
      if (isSameDayAsLast && lastRecord?.compra === row.compra && lastRecord?.venta === row.venta) {
        log('SKIPPED [Dólar]', `No change detected for ${row.moneda} today.`);
        return null;
      }

      let c_apertura = compraVal;
      let c_minimo = compraVal;
      let c_maximo = compraVal;

      let v_apertura = ventaVal;
      let v_minimo = ventaVal;
      let v_maximo = ventaVal;

      if (todayRecords.length > 0) {
        // Buy stats
        const prevCApertura = parseFloat(todayRecords[0].compra_apertura);
        if (!isNaN(prevCApertura)) c_apertura = prevCApertura;

        if (compraVal !== null) {
          const allCompras = todayRecords
            .map(r => parseValue(r.compra))
            .filter((v): v is number => v !== null)
            .concat(compraVal);
          c_minimo = Math.min(...allCompras);
          c_maximo = Math.max(...allCompras);
        }

        // Sell stats
        const prevVApertura = parseFloat(todayRecords[0].venta_apertura);
        if (!isNaN(prevVApertura)) v_apertura = prevVApertura;

        if (ventaVal !== null) {
          const allVentas = todayRecords
            .map(r => parseValue(r.venta))
            .filter((v): v is number => v !== null)
            .concat(ventaVal);
          v_minimo = Math.min(...allVentas);
          v_maximo = Math.max(...allVentas);
        }
      }

      const format = (val: number | null): string => (val !== null && !isNaN(val) ? val.toFixed(5) : '-');

      return {
        fecha: fecha!,
        hora,
        moneda: row.moneda,
        compra: row.compra,
        venta: row.venta,
        compra_apertura: format(c_apertura),
        compra_minimo: format(c_minimo),
        compra_maximo: format(c_maximo),
        venta_apertura: format(v_apertura),
        venta_minimo: format(v_minimo),
        venta_maximo: format(v_maximo)
      } as CurrencyRecord;
    }).filter(Boolean) as CurrencyRecord[];

    if (newRecords.length === 0) {
      return;
    }

    const combinedData = [...existingData, ...newRecords];
    const output = stringify(combinedData, { header: true });
    fs.writeFileSync(currentCsvPath, output);

    log('SUCCESS [Dólar]', `Recorded new values for ${newRecords.length} currencies.`);
  } catch (error: any) {
    log('ERROR [Dólar]', `Scraping failed: ${error.message}`);
  }
}

export function start(): void {
  log('INFO [Dólar]', 'Scheduling scraper to run every 15 minutes between 09:00 and 18:59 (Mon-Fri)...');
  cron.schedule('*/15 9-18 * * 1-5', () => {
    scrape();
  }, {
    timezone: TIMEZONE
  });

  log('INFO [Dólar]', 'Scraper initialized. Will run only at scheduled cron times.');
}
