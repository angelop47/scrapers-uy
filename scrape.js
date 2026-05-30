import { chromium } from 'playwright';
import fs from 'fs';
import { DateTime } from 'luxon';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const URL = 'https://www.brou.com.uy/cotizaciones';
const CSV_PATH = './cotizaciones.csv';
const LOG_PATH = './scraper.log';
const TIMEZONE = 'America/Montevideo';

function log(status, message) {
  const now = DateTime.now().setZone(TIMEZONE).toFormat('yyyy-MM-dd HH:mm:ss');
  const logMessage = `[${now}] ${status}: ${message}\n`;
  fs.appendFileSync(LOG_PATH, logMessage);
  console.log(logMessage.trim());
}

async function scrape() {
  console.log('Starting scraper...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  });
  const page = await context.newPage();
  
  try {
    console.log(`Navigating to ${URL}...`);
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
    
    // Wait for the table to be visible
    console.log('Waiting for table content...');
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
    if (fs.existsSync(CSV_PATH)) {
      const fileContent = fs.readFileSync(CSV_PATH, 'utf-8');
      try {
        existingData = parse(fileContent, { columns: true, skip_empty_lines: true });
      } catch (e) {
        console.warn('Could not parse existing CSV, starting fresh.');
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
        log('SKIPPED', `No change detected for ${row.moneda} today.`);
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
    fs.writeFileSync(CSV_PATH, output);
    
    log('SUCCESS', `Recorded new values for ${newRecords.length} currencies.`);
  } catch (error) {
    log('ERROR', `Scraping failed: ${error.message}`);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

scrape();
