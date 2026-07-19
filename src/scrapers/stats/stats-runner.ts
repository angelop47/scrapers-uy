import fs from 'fs';
import path from 'path';
import { DateTime } from 'luxon';
import cron from 'node-cron';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(process.cwd(), '.env') });

import { log } from '../../logger.js';
import { getActiveMandateId } from '../../supabase.js';
import { fetchStatsWithMinimax, StatItem } from './minimax-stats.js';

const TIMEZONE = 'America/Montevideo';
const STATS_DIR = path.join(process.cwd(), 'stats');

function writeStatsJson(newStats: StatItem[]): void {
  if (!fs.existsSync(STATS_DIR)) {
    fs.mkdirSync(STATS_DIR, { recursive: true });
  }

  const now = DateTime.now().setZone(TIMEZONE);
  const filename = now.toISODate() + '.json';
  const filepath = path.join(STATS_DIR, filename);

  let existingData: StatItem[] = [];
  if (fs.existsSync(filepath)) {
    try {
      existingData = JSON.parse(
        fs.readFileSync(filepath, 'utf8'),
      ) as StatItem[];
    } catch (e) {
      log(
        'WARN [Stats-Runner]',
        `Could not parse existing ${filename}. Starting fresh.`,
      );
    }
  }

  // Filter duplicates by indicator name roughly
  const filteredNewStats = newStats.filter((stat) => {
    const isDuplicate = existingData.some(
      (existing) =>
        existing.indicator === stat.indicator && existing.date === stat.date,
    );
    if (isDuplicate) {
      log(
        'INFO [Stats-Runner]',
        `Skipping duplicate indicator for today: ${stat.indicator}`,
      );
      return false;
    }
    return true;
  });

  if (filteredNewStats.length === 0) {
    log('INFO [Stats-Runner]', 'No new unique stats to save.');
    return;
  }

  const combinedData = [...existingData, ...filteredNewStats];
  fs.writeFileSync(filepath, JSON.stringify(combinedData, null, 2), 'utf8');
  log(
    'SUCCESS [Stats-Runner]',
    `Saved ${filteredNewStats.length} new stats to ${filename}`,
  );
}

export async function runStatsAutomation(): Promise<void> {
  log('INFO [Stats-Runner]', '--- Starting mandate stats automation ---');
  try {
    const activeMandateId = await getActiveMandateId();

    if (!activeMandateId) {
      log(
        'WARN [Stats-Runner]',
        'Could not determine the active mandate_id from Supabase. Aborting stats fetch.',
      );
      return;
    }

    log(
      'INFO [Stats-Runner]',
      `Active mandate_id detected: ${activeMandateId}`,
    );

    // Obtener estadísticas recientes para no repetir
    let recentTitles: string[] = [];
    if (fs.existsSync(STATS_DIR)) {
      try {
        const files = fs
          .readdirSync(STATS_DIR)
          .filter((f) => f.endsWith('.json'))
          .sort()
          .reverse()
          .slice(0, 7); // últimos 7 archivos

        for (const file of files) {
          const content = fs.readFileSync(path.join(STATS_DIR, file), 'utf-8');
          const data = JSON.parse(content);
          if (Array.isArray(data)) {
            data.forEach((d: any) =>
              recentTitles.push(`${d.title} (${d.date})`),
            );
          }
        }
      } catch (e) {
        log(
          'WARN [Stats-Runner]',
          'No se pudieron leer las estadísticas recientes para contexto.',
        );
      }
    }

    const stats = await fetchStatsWithMinimax(activeMandateId, recentTitles);

    if (stats && stats.length > 0) {
      writeStatsJson(stats);
    } else {
      log(
        'INFO [Stats-Runner]',
        'No relevant stats found by MiniMax M3 today.',
      );
    }

    log(
      'INFO [Stats-Runner]',
      '--- Stats automation finished successfully ---',
    );
  } catch (error: any) {
    log(
      'ERROR [Stats-Runner]',
      `Error during stats automation: ${error.message}`,
    );
  }
}

export function start(): void {
  log(
    'INFO [Stats-Runner]',
    'Scheduling stats scraper to run daily at 10:00 AM...',
  );
  cron.schedule(
    '0 10 * * *',
    () => {
      runStatsAutomation();
    },
    {
      timezone: TIMEZONE,
    },
  );
}

// Permitir ejecución directa desde la terminal
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runStatsAutomation();
}
