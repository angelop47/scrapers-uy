import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import { log, notifyError } from './logger.js';

const TIMEZONE = 'America/Montevideo';
const BACKUP_DIR = './backups';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

export async function backupDatabase(): Promise<void> {
  if (!supabaseUrl || !supabaseKey) {
    log(
      'ERROR [Backup]',
      'Supabase URL or Key is missing in environment variables.',
    );
    return;
  }

  log('INFO [Backup]', 'Starting Supabase database backup...');

  try {
    // 1. Discover all tables via PostgREST OpenAPI spec
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch OpenAPI spec: ${res.statusText}`);
    }

    const spec = (await res.json()) as any;
    const paths = Object.keys(spec.paths || {});
    const EXCLUDED_TABLES = ['profiles', 'user_roles'];
    // Extract table names and exclude '/' and specific tables
    const tables = paths
      .map((p) => p.replace(/^\//, ''))
      .filter((t) => t.length > 0 && !EXCLUDED_TABLES.includes(t));

    log(
      'INFO [Backup]',
      `Discovered ${tables.length} tables: ${tables.join(', ')}`,
    );

    // Ensure backup directory exists
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    // 2. Fetch and backup data for each table
    for (const table of tables) {
      log('INFO [Backup]', `Backing up table "${table}"...`);
      let allRows: any[] = [];
      let offset = 0;
      const limit = 1000;
      let hasMore = true;

      while (hasMore) {
        const tableUrl = `${supabaseUrl}/rest/v1/${table}?select=*`;
        const pageRes = await fetch(tableUrl, {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            Range: `${offset}-${offset + limit - 1}`,
            Prefer: 'count=exact',
          },
        });

        if (!pageRes.ok) {
          throw new Error(
            `Failed to fetch data for table "${table}": ${pageRes.statusText}`,
          );
        }

        const data = (await pageRes.json()) as any[];
        allRows = allRows.concat(data);

        const contentRange = pageRes.headers.get('content-range');
        if (contentRange) {
          const parts = contentRange.split('/');
          if (parts.length === 2) {
            const total = parseInt(parts[1], 10);
            if (!isNaN(total) && allRows.length >= total) {
              hasMore = false;
            }
          }
        } else {
          if (data.length < limit) {
            hasMore = false;
          }
        }

        if (hasMore) {
          offset += limit;
        }
      }

      // Write data to file
      const filePath = path.join(BACKUP_DIR, `${table}.json`);
      fs.writeFileSync(filePath, JSON.stringify(allRows, null, 2), 'utf-8');
      log(
        'SUCCESS [Backup]',
        `Table "${table}" backed up successfully. Total rows: ${allRows.length}`,
      );
    }

    log('SUCCESS [Backup]', 'Database backup completed successfully!');
  } catch (err: any) {
    log('ERROR [Backup]', `Backup failed: ${err.message}`, true);
    await notifyError(`Backup failed: ${err.message}`);
  }
}

export function start(): void {
  log(
    'INFO [Backup]',
    'Scheduling automatic backup at 23:50 (Every day, Montevideo Time)...',
  );

  // 23:50 todos los días
  cron.schedule(
    '50 23 * * *',
    () => {
      backupDatabase();
    },
    {
      timezone: TIMEZONE,
    },
  );
}
