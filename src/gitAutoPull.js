import cron from 'node-cron';
import { log, notifyError } from './logger.js';
import { execGit } from './gitUtils.js';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

async function checkAndPull() {
  log('INFO [Git-Pull]', 'Checking for updates in remote repository...');

  try {
    // Fetch para actualizar la información del remoto
    await execGit('git fetch');

    // Verificamos el estado comparado con el remoto
    const { stdout: statusOut } = await execGit('git status -uno');

    if (statusOut.includes('Your branch is behind')) {
      log('INFO [Git-Pull]', 'Changes detected on remote. Preparing update...');

      let stashed = false;
      try {
        // Verificar si hay cambios locales (staged, unstaged o archivos nuevos)
        const { stdout: checkStatus } = await execGit('git status --porcelain');
        if (checkStatus.trim().length > 0) {
          log('INFO [Git-Pull]', 'Local changes detected. Stashing temporarily...');
          await execGit('git stash -u');
          stashed = true;
        }

        log('INFO [Git-Pull]', 'Executing git pull with rebase...');
        await execGit('git pull --rebase origin main -q');
        log('INFO [Git-Pull]', 'Git pull (with rebase) completed successfully.');

        if (stashed) {
          log('INFO [Git-Pull]', 'Restoring local changes from stash...');
          await execGit('git stash pop');
        }

        log('INFO [Git-Pull]', 'Update detected. Checking and installing new dependencies (npm install)...');
        await execAsync('npm install');

        log('INFO [Git-Pull]', 'Shutting down process so PM2 can auto-restart with new code...');
        process.exit(0); // Reinicia el proceso automáticamente para que PM2 lo levante con la nueva versión
      } catch (errRebase) {
        log('ERROR [Git-Pull]', `Error executing git pull --rebase: ${errRebase.message}`, true);
        log('INFO [Git-Pull]', 'Aborting rebase to return to clean state...');
        await execGit('git rebase --abort').catch(() => {});
        if (stashed) {
          log('INFO [Git-Pull]', 'Restoring local changes from stash after error...');
          await execGit('git stash pop').catch(() => {});
        }
        log('ERROR [Git-Pull]', 'Rebase aborted. Manual intervention required.');
        await notifyError(`Git Pull conflict on server. Manual intervention required. Details: ${errRebase.message}`);
      }
    } else {
      log('INFO [Git-Pull]', 'Local repository is already up to date.');
    }
  } catch (err) {
    log('ERROR [Git-Pull]', `General error checking for updates: ${err.message}`, true);
  }
}

export function start() {
  // Verificamos al iniciar el script
  checkAndPull();

  // verificamos automáticamente a los 5 minutos de cada hora para evitar colisiones con los scrapers
  log('INFO [Git-Pull]', 'Scheduling update check (minute 5 of every hour)...');
  cron.schedule('5 * * * *', () => {
    checkAndPull();
  });
}

