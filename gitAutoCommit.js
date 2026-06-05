import cron from 'node-cron';
import { DateTime } from 'luxon';
import { log, notifyError } from './logger.js';
import { execGit } from './gitUtils.js';

const TIMEZONE = 'America/Montevideo';

async function autoCommitAndPush() {
  log('INFO [Git]', 'Iniciando commit automático...');
  
  try {
    // Agregar archivos explícitamente para evitar subir basura accidentalmente
    await execGit('git add petroleo/ dollar/');
    
    const now = DateTime.now().setZone(TIMEZONE);
    const fecha = now.toISODate();
    const commitMsg = `Actualización de datos: ${fecha}`;
    
    // Commit
    try {
      const { stdout } = await execGit(`git commit -m "${commitMsg}"`);
      log('INFO [Git]', `Commit realizado: ${stdout.trim()}`);
    } catch (err) {
      if (err.stdout && err.stdout.includes('nothing to commit')) {
        log('INFO [Git]', 'Nada para commitear.');
        return;
      }
      throw err;
    }
    
    // Sincronizar antes de pushear para evitar conflictos (hace un pull rebase)
    log('INFO [Git]', 'Sincronizando con remoto antes de pushear (rebase)...');
    try {
      await execGit('git pull --rebase origin main -q');
    } catch (errPull) {
      log('ERROR [Git]', `Conflicto o error en rebase previo al push: ${errPull.message}`, true);
      await execGit('git rebase --abort').catch(() => {});
      log('ERROR [Git]', 'Rebase abortado. No se realizó el push.');
      notifyError(`Fallo crítico en git pull rebase al intentar auto-commit: ${errPull.message}`);
      return;
    }

    // Push
    await execGit('git push origin HEAD');
    log('INFO [Git]', 'Push realizado correctamente.');
    
  } catch (err) {
    log('ERROR [Git]', `Error inesperado en autoCommitAndPush: ${err.message}`, true);
    notifyError(`Error inesperado en autoCommitAndPush: ${err.message}`);
  }
}

export function start() {
  log('INFO [Git]', 'Programando auto-commit a las 23:50 (Mon-Fri, Montevideo Time)...');
  
  // 23:50 de Lunes a Viernes
  cron.schedule('50 23 * * 1-5', () => {
    autoCommitAndPush();
  }, {
    timezone: TIMEZONE
  });
}

