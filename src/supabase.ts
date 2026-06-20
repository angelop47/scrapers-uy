import fs from 'fs';
import path from 'path';
import { DateTime } from 'luxon';
import { parse } from 'csv-parse/sync';
import cron from 'node-cron';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { log } from './logger.js';

const TIMEZONE = 'America/Montevideo';
const PETROLEO_DIR = './petroleo';
const DOLLAR_DIR = './dollar';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

export const supabase: SupabaseClient | null = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

interface CsvRowRecord {
  [key: string]: string;
}

function getCsvData(dir: string): CsvRowRecord[] {
  const now = DateTime.now().setZone(TIMEZONE);
  const filename = now.toFormat('MM-yyyy') + '.csv';
  const filepath = path.join(dir, filename);

  if (!fs.existsSync(filepath)) {
    return [];
  }

  const fileContent = fs.readFileSync(filepath, 'utf-8');
  try {
    return parse(fileContent, { columns: true, skip_empty_lines: true }) as CsvRowRecord[];
  } catch (e) {
    return [];
  }
}

export async function syncPetroleo(): Promise<void> {
  if (!supabase) return;
  log('INFO [Supabase]', 'Syncing petroleo...');
  const data = getCsvData(PETROLEO_DIR);
  const now = DateTime.now().setZone(TIMEZONE);
  const fecha = now.toISODate() as string;

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
  } catch (err: any) {
    log('ERROR [Supabase]', err.message);
  }
}

export async function syncDolar(): Promise<void> {
  if (!supabase) return;
  log('INFO [Supabase]', 'Syncing dolar...');
  const data = getCsvData(DOLLAR_DIR);
  const now = DateTime.now().setZone(TIMEZONE);
  const fecha = now.toISODate() as string;

  const todayRecords = data.filter(d => d.fecha === fecha && d.moneda === 'Dólar');
  if (todayRecords.length === 0) {
    log('WARN [Supabase]', `No dolar records found for today (${fecha}).`);
    return;
  }

  const lastRecord = todayRecords[todayRecords.length - 1];

  // Utilizaremos los datos de VENTA (venta) como el precio principal
  const ultimoStr = lastRecord.venta;
  const ultimo = parseFloat(ultimoStr ? ultimoStr.replace(/\./g, '').replace(',', '.') : 'NaN');
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
  } catch (err: any) {
    log('ERROR [Supabase]', err.message);
  }
}

export async function getActiveMandateId(): Promise<string | null> {
  if (!supabase) return null;
  const now = DateTime.now().setZone(TIMEZONE).toISODate() as string;

  try {
    const { data, error } = await supabase
      .from('mandates')
      .select('id')
      .lte('start_date', now)
      .or(`end_date.is.null,end_date.gt.${now}`)
      .order('start_date', { ascending: false })
      .limit(1)
      .single();

    if (error) throw error;
    return data?.id || null;
  } catch (err: any) {
    log('ERROR [Supabase]', `Error fetching active mandate: ${err.message}`);
    return null;
  }
}

export async function getLatestEconomicIndicators(): Promise<any | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('economic_indicators')
      .select('*')
      .order('date', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // Ignorar error si no hay filas
    return data || null;
  } catch (err: any) {
    log('ERROR [Supabase]', `Error fetching latest economic indicators: ${err.message}`);
    return null;
  }
}

export function start(): void {
  log('INFO [Supabase]', 'Scheduling sync to run at 23:55 (Mon-Fri, Uruguay Time)...');
  cron.schedule('55 23 * * 1-5', () => {
    syncPetroleo();
    syncDolar();
  }, {
    timezone: TIMEZONE
  });
}
