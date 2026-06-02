import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { DateTime } from 'luxon';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import cron from 'node-cron';
import { log } from '../logger.js';

const URL = 'https://oilprice.com/';
const TIMEZONE = 'America/Montevideo';
const PETROLEO_DIR = './petroleo';

if (!fs.existsSync(PETROLEO_DIR)) {
  fs.mkdirSync(PETROLEO_DIR, { recursive: true });
}

function getCsvPath() {
  const now = DateTime.now().setZone(TIMEZONE);
  const filename = now.toFormat('MM-yyyy') + '.csv';
  return path.join(PETROLEO_DIR, filename);
}


async function scrape() {
  log('INFO [Petróleo]', 'Starting scraper...');
  const currentCsvPath = getCsvPath();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    log('INFO [Petróleo]', `Navigating to ${URL}...`);
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    log('INFO [Petróleo]', 'Waiting for price data...');
    await page.waitForSelector('tr.link_oilprice_row', { timeout: 30000 });

    const rows = await page.$$eval('tr.link_oilprice_row', (trs) => {
      return trs.map(tr => {
        const spread = tr.getAttribute('data-spread');
        if (spread === 'Crude Oil Brent') {
          const tipo = 'Brent';
          const valText = tr.querySelector('td.value')?.innerText.trim();
          if (valText) {
            const precioStr = valText.replace(/[^0-9.]/g, '');
            const precio = parseFloat(precioStr);
            if (!isNaN(precio)) {
              return { tipo, precio };
            }
          }
        }
        return null;
      }).filter(Boolean);
    });

    if (rows.length === 0) {
      throw new Error('No oil data found. Check selectors.');
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
        log('WARN [Petróleo]', 'Could not parse existing CSV, starting fresh.');
      }
    }

    const newRecords = rows.map(row => {
      const todayRecords = existingData.filter(d => d.fecha === fecha && d.tipo === row.tipo);
      const lastRecord = existingData.length > 0 ? existingData.filter(d => d.tipo === row.tipo).pop() : null;

      const precioVal = row.precio;

      const isSameDayAsLast = lastRecord && lastRecord.fecha === fecha;
      if (isSameDayAsLast && parseFloat(lastRecord.precio) === precioVal) {
        log('SKIPPED [Petróleo]', `No change detected for ${row.tipo} today.`);
        return null;
      }

      let apertura = precioVal;
      let minimo = precioVal;
      let maximo = precioVal;

      if (todayRecords.length > 0) {
        const prevApertura = parseFloat(todayRecords[0].apertura);
        if (!isNaN(prevApertura)) apertura = prevApertura;

        if (precioVal !== null) {
          const allPrecios = todayRecords
            .map(r => parseFloat(r.precio))
            .filter(v => !isNaN(v))
            .concat(precioVal);
          minimo = Math.min(...allPrecios);
          maximo = Math.max(...allPrecios);
        }
      }

      const format = (val) => (val !== null && !isNaN(val) ? val.toFixed(2) : '-');

      return {
        fecha,
        hora,
        tipo: row.tipo,
        precio: format(precioVal),
        apertura: format(apertura),
        minimo: format(minimo),
        maximo: format(maximo)
      };
    }).filter(Boolean);

    if (newRecords.length === 0) {
      return;
    }

    const combinedData = [...existingData, ...newRecords];
    const output = stringify(combinedData, { header: true });
    fs.writeFileSync(currentCsvPath, output);

    log('SUCCESS [Petróleo]', `Recorded new values for ${newRecords.map(r => r.tipo).join(', ')}.`);
  } catch (error) {
    log('ERROR [Petróleo]', `Scraping failed: ${error.message}`);
  } finally {
    await browser.close();
  }
}

export function start() {
  log('INFO [Petróleo]', 'Scheduling scraper to run every 15 minutes (Mon-Fri, US Time)...');
  cron.schedule('*/15 * * * 1-5', () => {
    scrape();
  }, {
    timezone: 'America/New_York'
  });

  const now = DateTime.now().setZone(TIMEZONE);
  if (now.weekday <= 5) {
    scrape();
  } else {
    log('INFO [Petróleo]', 'Skipping initial execution (it is weekend).');
  }
}
