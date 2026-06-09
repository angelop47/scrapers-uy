import cron from 'node-cron';
import { DateTime } from 'luxon';
import { log, notifyError } from './logger.js';
import { execGit } from './gitUtils.js';

const TIMEZONE = 'America/Montevideo';

async function autoCommitAndPush() {
  log('INFO [Git]', 'Starting auto-commit...');
  
  try {
    // Agregar archivos explícitamente para evitar subir basura accidentalmente
    await execGit('git add petroleo/ dollar/');
    
    const now = DateTime.now().setZone(TIMEZONE);
    const fecha = now.toISODate();
    const commitMsg = `Actualización de datos: ${fecha}`;
    
    // Commit
    try {
      const { stdout } = await execGit(`git commit -m "${commitMsg}"`);
      log('INFO [Git]', `Commit successful: ${stdout.trim()}`);
    } catch (err) {
      if (err.stdout && err.stdout.includes('nothing to commit')) {
        log('INFO [Git]', 'Nothing to commit.');
        return;
      }
      throw err;
    }
    
    // Sincronizar antes de pushear para evitar conflictos (hace un pull rebase)
    log('INFO [Git]', 'Syncing with remote before pushing (rebase)...');
    try {
      await execGit('git pull --rebase origin main -q');
    } catch (errPull) {
      log('ERROR [Git]', `Conflict or error in rebase before push: ${errPull.message}`, true);
      await execGit('git rebase --abort').catch(() => {});
      log('ERROR [Git]', 'Rebase aborted. Push was not performed.');
      await notifyError(`Critical failure in git pull rebase when attempting auto-commit: ${errPull.message}`);
      return;
    }

    // Push
    await execGit('git push origin HEAD');
    log('INFO [Git]', 'Push performed successfully.');
    
  } catch (err) {
    log('ERROR [Git]', `Unexpected error in autoCommitAndPush: ${err.message}`, true);
    notifyError(`Unexpected error in autoCommitAndPush: ${err.message}`);
  }
}

export function start() {
  log('INFO [Git]', 'Scheduling auto-commit at 23:50 (Mon-Fri, Montevideo Time)...');
  
  // 23:50 de Lunes a Viernes
  cron.schedule('50 23 * * 1-5', () => {
    autoCommitAndPush();
  }, {
    timezone: TIMEZONE
  });
}

