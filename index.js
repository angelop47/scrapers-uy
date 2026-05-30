import { start as startDolar } from './scrapers/dolar.js';
import { start as startPetroleo } from './scrapers/petroleo.js';

console.log('Iniciando sistema de scrapers...');

startDolar();
startPetroleo();

console.log('Todos los scrapers han sido programados.');
