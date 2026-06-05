import fs from 'fs';
import path from 'path';
import { DateTime } from 'luxon';

const TIMEZONE = 'America/Montevideo';

// Mantiene los logs en una carpeta "logs" (crearla si no existe)
const LOG_DIR = './logs';
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function getDailyLogPath() {
  const dateStr = DateTime.now().setZone(TIMEZONE).toFormat('yyyy-MM-dd');
  return path.join(LOG_DIR, `scraper-${dateStr}.log`);
}

function cleanOldLogs() {
  try {
    const files = fs.readdirSync(LOG_DIR);
    const now = DateTime.now().setZone(TIMEZONE);

    files.forEach(file => {
      if (file.startsWith('scraper-') && file.endsWith('.log')) {
        const datePart = file.replace('scraper-', '').replace('.log', '');
        const logDate = DateTime.fromFormat(datePart, 'yyyy-MM-dd', { zone: TIMEZONE });

        // Borrar logs de más de 14 días
        if (logDate.isValid && now.diff(logDate, 'days').days > 14) {
          fs.unlinkSync(path.join(LOG_DIR, file));
        }
      }
    });
  } catch (e) {
    console.error(`[Logger Error] Could not clean old logs: ${e.message}`);
  }
}

export function log(status, message, isError = false) {
  const now = DateTime.now().setZone(TIMEZONE).toFormat('yyyy-MM-dd HH:mm:ss');
  const logMessage = `[${now}] ${status}: ${message}\n`;

  try {
    const currentLogPath = getDailyLogPath();
    fs.appendFileSync(currentLogPath, logMessage);

    if (Math.random() < 0.05) {
      cleanOldLogs();
    }
  } catch (e) {
    console.error(`[Logger Error] Could not write to log file: ${e.message}`);
  }

  if (isError) {
    console.error(logMessage.trim());
  } else {
    console.log(logMessage.trim());
  }
}

/**
 * Función para enviar notificaciones críticas a sistemas externos.
 * Actualmente es un stub (placeholder). 
 */
export function notifyError(message) {
  console.error(`\n[ALERT] => ENVIANDO NOTIFICACIÓN: ${message}\n`);
}
