import { exec } from 'child_process';
import cron from 'node-cron';

function checkAndPull() {
  console.log('[Git-Pull] Verificando actualizaciones en el repositorio remoto...');

  // Fetch para actualizar la información del remoto
  exec('git fetch', (err, stdout, stderr) => {
    if (err) {
      console.error('[Git-Pull] Error al hacer git fetch:', stderr);
      return;
    }

    // Verificamos el estado comparado con el remoto
    exec('git status -uno', (err, stdout, stderr) => {
      if (err) {
        console.error('[Git-Pull] Error al verificar git status:', stderr);
        return;
      }

      if (stdout.includes('Your branch is behind')) {
        console.log('[Git-Pull] Se detectaron cambios en remoto. Ejecutando git pull...');

        exec('git pull', (err, stdout, stderr) => {
          if (err) {
            console.error('[Git-Pull] Error al hacer git pull:', stderr);
            return;
          }
          console.log('[Git-Pull] Git pull completado exitosamente.');
          console.log('[Git-Pull] NOTA: Si hubo cambios en el código fuente, el proceso actual de Node.js necesita ser reiniciado para aplicarlos.');
          process.exit(0); // Reinicia el proceso automáticamente para que PM2 lo levante con la nueva versión
        });
      } else {
        console.log('[Git-Pull] El repositorio local ya se encuentra actualizado.');
      }
    });
  });
}

export function start() {
  // Verificamos al iniciar el script
  checkAndPull();

  // verificamos automáticamente cada 1 hora
  console.log('[Git-Pull] Programando verificación de actualizaciones cada 1 hora...');
  cron.schedule('0 * * * *', () => {
    checkAndPull();
  });
}
