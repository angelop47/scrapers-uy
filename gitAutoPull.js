import cron from 'node-cron';
import { log, notifyError } from './logger.js';
import { execGit } from './gitUtils.js';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

async function checkAndPull() {
  log('INFO [Git-Pull]', 'Verificando actualizaciones en el repositorio remoto...');

  try {
    // Fetch para actualizar la información del remoto
    await execGit('git fetch');

    // Verificamos el estado comparado con el remoto
    const { stdout: statusOut } = await execGit('git status -uno');

    if (statusOut.includes('Your branch is behind')) {
      log('INFO [Git-Pull]', 'Se detectaron cambios en remoto. Preparando actualización...');

      let stashed = false;
      try {
        // Verificar si hay cambios locales (staged, unstaged o archivos nuevos)
        const { stdout: checkStatus } = await execGit('git status --porcelain');
        if (checkStatus.trim().length > 0) {
          log('INFO [Git-Pull]', 'Cambios locales detectados. Haciendo stash temporal...');
          await execGit('git stash -u');
          stashed = true;
        }

        log('INFO [Git-Pull]', 'Ejecutando git pull con rebase...');
        await execGit('git pull --rebase origin main -q');
        log('INFO [Git-Pull]', 'Git pull (con rebase) completado exitosamente.');

        if (stashed) {
          log('INFO [Git-Pull]', 'Restaurando cambios locales desde el stash...');
          await execGit('git stash pop');
        }

        log('INFO [Git-Pull]', 'Actualización detectada. Verificando e instalando nuevas dependencias (npm install)...');
        await execAsync('npm install');

        log('INFO [Git-Pull]', 'Apagando el proceso para que PM2 lo reinicie automáticamente con el nuevo código...');
        process.exit(0); // Reinicia el proceso automáticamente para que PM2 lo levante con la nueva versión
      } catch (errRebase) {
        log('ERROR [Git-Pull]', `Error al hacer git pull --rebase: ${errRebase.message}`, true);
        log('INFO [Git-Pull]', 'Abortando rebase para devolver a estado limpio...');
        await execGit('git rebase --abort').catch(() => {});
        if (stashed) {
          log('INFO [Git-Pull]', 'Restaurando cambios locales del stash tras error...');
          await execGit('git stash pop').catch(() => {});
        }
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

  // verificamos automáticamente a los 5 minutos de cada hora para evitar colisiones con los scrapers
  log('INFO [Git-Pull]', 'Programando verificación de actualizaciones (minuto 5 de cada hora)...');
  cron.schedule('5 * * * *', () => {
    checkAndPull();
  });
}

