import { exec } from 'child_process';
import cron from 'node-cron';
import { DateTime } from 'luxon';
import { log } from './logger.js';

const TIMEZONE = 'America/Montevideo';

function autoCommitAndPush() {
  log('INFO [Git]', 'Iniciando commit automático...');
  
  // Agregar archivos modificados y nuevos
  exec('git add .', (err, stdout, stderr) => {
    if (err) {
      log('ERROR [Git]', `Error al agregar archivos: ${stderr}`, true);
      return;
    }
    
    const now = DateTime.now().setZone(TIMEZONE);
    const fecha = now.toISODate();
    const commitMsg = `Actualización de datos: ${fecha}`;
    
    // Commit
    exec(`git commit -m "${commitMsg}"`, (err, stdout, stderr) => {
      // It might throw error if nothing to commit
      if (err && stdout.includes('nothing to commit')) {
        log('INFO [Git]', 'Nada para commitear.');
        return;
      } else if (err) {
         log('ERROR [Git]', `Error al hacer commit: ${stderr}`, true);
         return;
      }
      
      log('INFO [Git]', `Commit realizado: ${stdout.trim()}`);
      
      // Push
      exec('git push origin HEAD', (err, stdout, stderr) => {
        if (err) {
          log('ERROR [Git]', `Error al hacer push: ${stderr}`, true);
          return;
        }
        log('INFO [Git]', 'Push realizado correctamente.');
      });
    });
  });
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
