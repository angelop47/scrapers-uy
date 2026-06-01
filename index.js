import { start as startDolar } from './scrapers/dolar.js';
import { start as startPetroleo } from './scrapers/petroleo.js';
import { start as startGitAutoCommit } from './gitAutoCommit.js';

console.log('Iniciando sistema de scrapers...');

startDolar();
startPetroleo();
startGitAutoCommit();

console.log('Todos los scrapers han sido programados.');
