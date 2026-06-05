import cron from 'node-cron';
import { log, notifyError } from './logger.js';
import { execGit } from './gitUtils.js';

async function checkAndPull() {
  log('INFO [Git-Pull]', 'Verificando actualizaciones en el repositorio remoto...');

  try {
    // Fetch para actualizar la información del remoto
    await execGit('git fetch');

    // Verificamos el estado comparado con el remoto
    const { stdout: statusOut } = await execGit('git status -uno');

    if (statusOut.includes('Your branch is behind')) {
      log('INFO [Git-Pull]', 'Se detectaron cambios en remoto. Ejecutando git pull...');

      try {
        await execGit('git pull --rebase origin main -q');
        log('INFO [Git-Pull]', 'Git pull (con rebase) completado exitosamente.');
        log('INFO [Git-Pull]', 'Actualización detectada. Apagando el proceso para que PM2 lo reinicie automáticamente con el nuevo código...');
        process.exit(0); // Reinicia el proceso automáticamente para que PM2 lo levante con la nueva versión
      } catch (errRebase) {
        log('ERROR [Git-Pull]', `Error al hacer git pull --rebase: ${errRebase.message}`, true);
        log('INFO [Git-Pull]', 'Abortando rebase para devolver a estado limpio...');
        await execGit('git rebase --abort').catch(() => {});
        log('ERROR [Git-Pull]', 'Rebase abortado. Requiere intervención manual.');
        notifyError(`Conflicto de Git Pull en el servidor. Requiere intervención manual. Detalle: ${errRebase.message}`);
      }
    } else {
      log('INFO [Git-Pull]', 'El repositorio local ya se encuentra actualizado.');
    }
  } catch (err) {
    log('ERROR [Git-Pull]', `Error general verificando actualizaciones: ${err.message}`, true);
  }
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

