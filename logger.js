import fs from 'fs';
import { DateTime } from 'luxon';

const LOG_PATH = './scraper.log';
const TIMEZONE = 'America/Montevideo';

export function log(status, message, isError = false) {
  const now = DateTime.now().setZone(TIMEZONE).toFormat('yyyy-MM-dd HH:mm:ss');
  const logMessage = `[${now}] ${status}: ${message}\n`;
  
  try {
    fs.appendFileSync(LOG_PATH, logMessage);
  } catch (e) {
    console.error(`[Logger Error] Could not write to log file: ${e.message}`);
  }

  if (isError) {
    console.error(logMessage.trim());
  } else {
    console.log(logMessage.trim());
  }
}
