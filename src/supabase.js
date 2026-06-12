import fs from 'fs';
import path from 'path';
import { DateTime } from 'luxon';
import { parse } from 'csv-parse/sync';
import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';
import { log } from './logger.js';

const TIMEZONE = 'America/Montevideo';
const PETROLEO_DIR = './petroleo';
const DOLLAR_DIR = './dollar';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
export const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function getCsvData(dir) {
  const now = DateTime.now().setZone(TIMEZONE);
  const filename = now.toFormat('MM-yyyy') + '.csv';
  const filepath = path.join(dir, filename);
  
  if (!fs.existsSync(filepath)) {
    return [];
  }
  
  const fileContent = fs.readFileSync(filepath, 'utf-8');
  try {
    return parse(fileContent, { columns: true, skip_empty_lines: true });
  } catch (e) {
    return [];
  }
}

export async function syncPetroleo() {
  if (!supabase) return;
  log('INFO [Supabase]', 'Syncing petroleo...');
  const data = getCsvData(PETROLEO_DIR);
  const now = DateTime.now().setZone(TIMEZONE);
  const fecha = now.toISODate();
  
  const todayRecords = data.filter(d => d.fecha === fecha && d.tipo === 'Brent');
  if (todayRecords.length === 0) {
    log('WARN [Supabase]', `No petroleo records found for today (${fecha}).`);
    return;
  }
  
  const lastRecord = todayRecords[todayRecords.length - 1];
  const precio = parseFloat(lastRecord.precio);
  if (isNaN(precio)) return;
  
  try {
    const { error } = await supabase.from('oil_prices').upsert({ date: fecha, price: precio }, { onConflict: 'date' });
    if (error) throw error;
    log('SUCCESS [Supabase]', `Synced petroleo for ${fecha}`);
  } catch (err) {
    log('ERROR [Supabase]', err.message);
  }
}

export async function syncDolar() {
  if (!supabase) return;
  log('INFO [Supabase]', 'Syncing dolar...');
  const data = getCsvData(DOLLAR_DIR);
  const now = DateTime.now().setZone(TIMEZONE);
  const fecha = now.toISODate();
  
  const todayRecords = data.filter(d => d.fecha === fecha && d.moneda === 'Dólar');
  if (todayRecords.length === 0) {
    log('WARN [Supabase]', `No dolar records found for today (${fecha}).`);
    return;
  }
  
  const lastRecord = todayRecords[todayRecords.length - 1];
  
  // Utilizaremos los datos de VENTA (venta) como el precio principal
  const ultimoStr = lastRecord.venta;
  const ultimo = parseFloat(ultimoStr ? ultimoStr.replace(/\\./g, '').replace(',', '.') : 'NaN');
  const apertura = parseFloat(lastRecord.venta_apertura);
  const maximo = parseFloat(lastRecord.venta_maximo);
  const minimo = parseFloat(lastRecord.venta_minimo);
  
  if (isNaN(ultimo)) return;
  
  try {
    const { error } = await supabase.from('dollar_rates').upsert({
      date: fecha,
      ultimo,
      apertura: isNaN(apertura) ? null : apertura,
      maximo: isNaN(maximo) ? null : maximo,
      minimo: isNaN(minimo) ? null : minimo
    }, { onConflict: 'date' });
    if (error) throw error;
    log('SUCCESS [Supabase]', `Synced dolar for ${fecha}`);
  } catch (err) {
    log('ERROR [Supabase]', err.message);
  }
}

export function start() {
  log('INFO [Supabase]', 'Scheduling sync to run at 23:55 (Mon-Fri, Uruguay Time)...');
  cron.schedule('55 23 * * 1-5', () => {
    syncPetroleo();
    syncDolar();
  }, {
    timezone: TIMEZONE
  });
}
