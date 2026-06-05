import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

let isGitLocked = false;

/**
 * Ejecuta un comando Git asegurando que no haya otro comando Git en curso
 * dentro del mismo proceso de Node (previene conflictos de index.lock).
 */
export async function execGit(command) {
  // Esperar si Git está bloqueado por otra operación en este proceso
  while (isGitLocked) {
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  isGitLocked = true;
  try {
    const { stdout, stderr } = await execAsync(command);
    return { stdout, stderr };
  } finally {
    isGitLocked = false;
  }
}
