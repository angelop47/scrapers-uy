import 'dotenv/config';
import { start as startDolar } from './scrapers/dolar.js';
import { start as startPetroleo } from './scrapers/petroleo.js';
import { start as startGitAutoCommit } from './gitAutoCommit.js';
import { start as startGitAutoPull } from './gitAutoPull.js';
import { start as startSupabaseSync } from './supabase.js';
import { log } from './logger.js';

log('INFO [System]', 'Starting scrapers system...');

startDolar();
startPetroleo();
startGitAutoCommit();
startGitAutoPull();
startSupabaseSync();

log('INFO [System]', 'All scrapers have been scheduled.');
