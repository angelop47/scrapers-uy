import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { DateTime } from 'luxon';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import cron from 'node-cron';
import { log } from '../logger.js';

const URL = 'https://www.brou.com.uy/cotizaciones';
const TIMEZONE = 'America/Montevideo';
const DOLLAR_DIR = './dollar';

if (!fs.existsSync(DOLLAR_DIR)) {
  fs.mkdirSync(DOLLAR_DIR, { recursive: true });
}

function getCsvPath() {
  const now = DateTime.now().setZone(TIMEZONE);
  const filename = now.toFormat('MM-yyyy') + '.csv';
  return path.join(DOLLAR_DIR, filename);
}


async function scrape() {
  log('INFO [Dólar]', 'Starting scraper...');
  const currentCsvPath = getCsvPath();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    log('INFO [Dólar]', `Navigating to ${URL}...`);
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });

    // Wait for the table to be visible
    log('INFO [Dólar]', 'Waiting for table content...');
    await page.waitForSelector('.cotizacion-portlet table', { timeout: 30000 });

    const rows = await page.$$eval('.cotizacion-portlet table tr', (trs) => {
      return trs.map(tr => {
        const moneda = tr.querySelector('td:nth-child(1) .moneda')?.innerText.trim();
        const compra = tr.querySelector('td:nth-child(3) .valor')?.innerText.trim();
        const venta = tr.querySelector('td:nth-child(5) .valor')?.innerText.trim();
        // Filter specifically for "Dólar"
        if (moneda === 'Dólar' && compra && venta) {
          return { moneda, compra, venta };
        }
        return null;
      }).filter(Boolean);
    });

    if (rows.length === 0) {
      throw new Error('No "Dólar" data found in the table. Check selectors or currency name.');
    }

    const now = DateTime.now().setZone(TIMEZONE);
    const fecha = now.toISODate(); // YYYY-MM-DD
    const hora = now.toFormat('HH:mm');

    let existingData = [];
    if (fs.existsSync(currentCsvPath)) {
      const fileContent = fs.readFileSync(currentCsvPath, 'utf-8');
      try {
        existingData = parse(fileContent, { columns: true, skip_empty_lines: true });
      } catch (e) {
        log('WARN [Dólar]', 'Could not parse existing CSV, starting fresh.');
      }
    }

    const newRecords = rows.map(row => {
      const todayRecords = existingData.filter(d => d.fecha === fecha && d.moneda === row.moneda);
      const lastRecord = existingData.length > 0 ? existingData.filter(d => d.moneda === row.moneda).pop() : null;

      // Values are expected in "1.234,56" format, convert to 1234.56
      const parseValue = (val) => {
        if (!val || val === '-') return null;
        return parseFloat(val.replace(/\./g, '').replace(',', '.'));
      };

      const compraVal = parseValue(row.compra);
      const ventaVal = parseValue(row.venta);

      // Check if price changed since last record FOR THE SAME DAY
      // If it's a new day, we should write even if value didn't change
      const isSameDayAsLast = lastRecord && lastRecord.fecha === fecha;
      if (isSameDayAsLast && lastRecord.compra === row.compra && lastRecord.venta === row.venta) {
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
            .filter(v => v !== null)
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
            .filter(v => v !== null)
            .concat(ventaVal);
          v_minimo = Math.min(...allVentas);
          v_maximo = Math.max(...allVentas);
        }
      }

      const format = (val) => (val !== null && !isNaN(val) ? val.toFixed(5) : '-');

      return {
        fecha,
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
      };
    }).filter(Boolean);

    if (newRecords.length === 0) {
      return;
    }

    const combinedData = [...existingData, ...newRecords];
    const output = stringify(combinedData, { header: true });
    fs.writeFileSync(currentCsvPath, output);

    log('SUCCESS [Dólar]', `Recorded new values for ${newRecords.length} currencies.`);
  } catch (error) {
    log('ERROR [Dólar]', `Scraping failed: ${error.message}`);
  } finally {
    await browser.close();
  }
}

export function start() {
  log('INFO [Dólar]', 'Scheduling scraper to run every 15 minutes between 09:00 and 18:59 (Mon-Fri)...');
  cron.schedule('*/15 9-18 * * 1-5', () => {
    scrape();
  }, {
    timezone: TIMEZONE
  });

  log('INFO [Dólar]', 'Scraper initialized. Will run only at scheduled cron times.');
}
