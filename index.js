import 'dotenv/config';
import { start as startDolar } from './scrapers/dolar.js';
import { start as startPetroleo } from './scrapers/petroleo.js';
import { start as startGitAutoCommit } from './gitAutoCommit.js';
import { start as startGitAutoPull } from './gitAutoPull.js';
import { start as startSupabaseSync } from './supabase.js';
import { log } from './logger.js';

log('INFO [System]', 'Iniciando sistema de scrapers...');

startDolar();
startPetroleo();
startGitAutoCommit();
startGitAutoPull();
startSupabaseSync();

log('INFO [System]', 'Todos los scrapers han sido programados.');
