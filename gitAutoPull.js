import { exec } from 'child_process';
import cron from 'node-cron';
import { log } from './logger.js';

function checkAndPull() {
  log('INFO [Git-Pull]', 'Verificando actualizaciones en el repositorio remoto...');

  // Fetch para actualizar la información del remoto
  exec('git fetch', (err, stdout, stderr) => {
    if (err) {
      log('ERROR [Git-Pull]', `Error al hacer git fetch: ${stderr}`, true);
      return;
    }

    // Verificamos el estado comparado con el remoto
    exec('git status -uno', (err, stdout, stderr) => {
      if (err) {
        log('ERROR [Git-Pull]', `Error al verificar git status: ${stderr}`, true);
        return;
      }

      if (stdout.includes('Your branch is behind')) {
        log('INFO [Git-Pull]', 'Se detectaron cambios en remoto. Ejecutando git pull...');

        exec('git pull', (err, stdout, stderr) => {
          if (err) {
            log('ERROR [Git-Pull]', `Error al hacer git pull: ${stderr}`, true);
            return;
          }
          log('INFO [Git-Pull]', 'Git pull completado exitosamente.');
          log('INFO [Git-Pull]', 'NOTA: Si hubo cambios en el código fuente, el proceso actual de Node.js necesita ser reiniciado para aplicarlos.');
          process.exit(0); // Reinicia el proceso automáticamente para que PM2 lo levante con la nueva versión
        });
      } else {
        log('INFO [Git-Pull]', 'El repositorio local ya se encuentra actualizado.');
      }
    });
  });
}

export function start() {
  // Verificamos al iniciar el script
  checkAndPull();

  // verificamos automáticamente cada 1 hora
  log('INFO [Git-Pull]', 'Programando verificación de actualizaciones cada 1 hora...');
  cron.schedule('0 * * * *', () => {
    checkAndPull();
  });
}
