import cron from 'node-cron';
import { DateTime } from 'luxon';
import { log, notifyError } from './logger.js';
import { execGit } from './gitUtils.js';

const TIMEZONE = 'America/Montevideo';

async function autoCommitAndPush(): Promise<void> {
  log('INFO [Git]', 'Starting auto-commit...');

  try {
    // Agregar archivos explícitamente para evitar subir basura accidentalmente
    await execGit(
      'git add petroleo/ dollar/ noticias/ stats/ economy/ backups/',
    );

    const now = DateTime.now().setZone(TIMEZONE);
    const fecha = now.toISODate() as string;
    const commitMsg = `Actualización de datos: ${fecha}`;

    // Commit
    try {
      const { stdout } = await execGit(`git commit -m "${commitMsg}"`);
      log('INFO [Git]', `Commit successful: ${stdout.trim()}`);
    } catch (err: any) {
      if (err.stdout && err.stdout.includes('nothing to commit')) {
        log('INFO [Git]', 'Nothing to commit.');
        return;
      }
      throw err;
    }

    // Sincronizar antes de pushear para evitar conflictos (hace un pull rebase)
    log('INFO [Git]', 'Syncing with remote before pushing (rebase)...');
    let stashed = false;
    try {
      // Verificar si hay cambios locales sin confirmar después del commit (por ejemplo, package-lock.json)
      const { stdout: checkStatus } = await execGit('git status --porcelain');
      if (checkStatus.trim().length > 0) {
        log('INFO [Git]', 'Unstaged changes detected. Stashing temporarily...');
        await execGit('git stash -u');
        stashed = true;
      }

      await execGit('git pull --rebase origin main -q');
      log('INFO [Git]', 'Git pull (rebase) successful.');

      if (stashed) {
        log('INFO [Git]', 'Restoring unstaged changes from stash...');
        await execGit('git stash pop');
        stashed = false;
      }
    } catch (errPull: any) {
      log(
        'ERROR [Git]',
        `Conflict or error in rebase before push: ${errPull.message}`,
        true,
      );
      await execGit('git rebase --abort').catch(() => { });
      if (stashed) {
        log('INFO [Git]', 'Restoring unstaged changes from stash after error...');
        await execGit('git stash pop').catch(() => { });
      }
      log('ERROR [Git]', 'Rebase aborted. Push was not performed.');
      await notifyError(
        `Critical failure in git pull rebase when attempting auto-commit: ${errPull.message}`,
      );
      return;
    }

    // Push
    await execGit('git push origin HEAD');
    log('INFO [Git]', 'Push performed successfully.');
  } catch (err: any) {
    log(
      'ERROR [Git]',
      `Unexpected error in autoCommitAndPush: ${err.message}`,
      true,
    );
    notifyError(`Unexpected error in autoCommitAndPush: ${err.message}`);
  }
}

export function start(): void {
  log(
    'INFO [Git]',
    'Scheduling auto-commit at 23:59 (Every day, Montevideo Time)...',
  );

  // 23:59 todos los días
  cron.schedule(
    '59 23 * * *',
    () => {
      autoCommitAndPush();
    },
    {
      timezone: TIMEZONE,
    },
  );
}
