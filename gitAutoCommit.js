import { exec } from 'child_process';
import cron from 'node-cron';
import { DateTime } from 'luxon';

const TIMEZONE = 'America/Montevideo';

function autoCommitAndPush() {
  console.log('[Git] Iniciando commit automático...');
  
  // Agregar archivos modificados y nuevos
  exec('git add .', (err, stdout, stderr) => {
    if (err) {
      console.error('[Git] Error al agregar archivos:', stderr);
      return;
    }
    
    const now = DateTime.now().setZone(TIMEZONE);
    const fecha = now.toISODate();
    const commitMsg = `Actualización de datos: ${fecha}`;
    
    // Commit
    exec(`git commit -m "${commitMsg}"`, (err, stdout, stderr) => {
      // It might throw error if nothing to commit
      if (err && stdout.includes('nothing to commit')) {
        console.log('[Git] Nada para commitear.');
        return;
      } else if (err) {
         console.error('[Git] Error al hacer commit:', stderr);
         return;
      }
      
      console.log('[Git] Commit realizado:', stdout.trim());
      
      // Push
      exec('git push origin HEAD', (err, stdout, stderr) => {
        if (err) {
          console.error('[Git] Error al hacer push:', stderr);
          return;
        }
        console.log('[Git] Push realizado correctamente.');
      });
    });
  });
}

export function start() {
  console.log('[Git] Programando auto-commit a las 23:50 (Mon-Fri, Montevideo Time)...');
  
  // 23:50 de Lunes a Viernes
  cron.schedule('50 23 * * 1-5', () => {
    autoCommitAndPush();
  }, {
    timezone: TIMEZONE
  });
}
