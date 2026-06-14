import fs from 'fs';
import path from 'path';
import { DateTime } from 'luxon';
import cron from 'node-cron';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(process.cwd(), '.env') });

import { log } from '../../logger.js';
import { getLatestEconomicIndicators, insertEconomicIndicators } from '../../supabase.js';
import { fetchEconomicIndicators } from './gemini-economy.js';

const TIMEZONE = 'America/Montevideo';
const ECONOMY_DIR = path.join(process.cwd(), 'economy');

const INDICATOR_KEYS = [
    "inflation_annual_pct", "unemployment_pct", "country_risk_points", 
    "gdp_usd_billions", "external_debt_pct_gdp", "bcu_reserves_usd_millions", 
    "minimum_wage_uyu", "poverty_rate_pct", "fiscal_deficit_pct_gdp"
];

function saveLocalJson(data, dateStr) {
    if (!fs.existsSync(ECONOMY_DIR)) {
        fs.mkdirSync(ECONOMY_DIR, { recursive: true });
    }
    const filename = `${dateStr}.json`;
    const filepath = path.join(ECONOMY_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
    log('INFO [Economy-Runner]', `Saved economy stats to local file: ${filename}`);
}

function getLatestLocalEconomy() {
    if (!fs.existsSync(ECONOMY_DIR)) return null;
    try {
        const files = fs.readdirSync(ECONOMY_DIR).filter(f => f.endsWith('.json'));
        if (files.length === 0) return null;
        
        // Sort files to get the most recent one (alphabetically by YYYY-MM-DD)
        files.sort().reverse();
        const latestFile = files[0];
        
        const content = fs.readFileSync(path.join(ECONOMY_DIR, latestFile), 'utf-8');
        return JSON.parse(content);
    } catch (e) {
        log('ERROR [Economy-Runner]', `Failed to read local economy state: ${e.message}`);
        return null;
    }
}

export async function runEconomyAutomation() {
    log('INFO [Economy-Runner]', '--- Starting Macroeconomic Indicators Automation ---');
    try {
        const todayStr = DateTime.now().setZone(TIMEZONE).toISODate();
        
        // 1. Obtener estado anterior (Priorizamos JSON local, sino Supabase)
        let previousState = getLatestLocalEconomy();
        if (previousState) {
            log('INFO [Economy-Runner]', `Fetched previous state from local JSON: ${previousState.date}`);
        } else {
            previousState = await getLatestEconomicIndicators();
            if (previousState) {
                log('INFO [Economy-Runner]', `Fetched previous state from Supabase fallback: ${previousState.date}`);
            } else {
                log('INFO [Economy-Runner]', 'No previous state found locally or in Supabase. This seems to be the first run.');
            }
        }

        // 2. Pedir a Gemini los datos de hoy pasándole el estado anterior como contexto
        const newGeminiData = await fetchEconomicIndicators(previousState);
        
        if (!newGeminiData && !previousState) {
            log('WARN [Economy-Runner]', 'Gemini failed and no previous state exists. Aborting.');
            return;
        }

        // 3. Merge (Last-Value-Carried-Forward)
        const finalData = { date: todayStr };
        let updatedCount = 0;
        let carriedCount = 0;

        for (const key of INDICATOR_KEYS) {
            const geminiVal = newGeminiData ? newGeminiData[key] : null;
            const prevVal = previousState ? previousState[key] : null;

            if (geminiVal !== null && geminiVal !== undefined) {
                finalData[key] = geminiVal;
                if (geminiVal !== prevVal) updatedCount++;
            } else {
                finalData[key] = prevVal !== undefined ? prevVal : null;
                carriedCount++;
            }
        }

        log('INFO [Economy-Runner]', `Merge complete: ${updatedCount} keys updated by Gemini, ${carriedCount} keys carried forward from previous state.`);

        // 4. Guardar en JSON Local
        saveLocalJson(finalData, todayStr);

        log('INFO [Economy-Runner]', '--- Economy Automation finished successfully ---');
    } catch (error) {
        log('ERROR [Economy-Runner]', `Error during economy automation: ${error.message}`);
    }
}

export function start() {
    log('INFO [Economy-Runner]', 'Scheduling economy scraper to run on Fridays and Saturdays at 18:30...');
    // Ejecutar a las 18:30 los Viernes (5) y Sábados (6)
    cron.schedule('30 18 * * 5,6', () => {
        runEconomyAutomation();
    }, {
        timezone: TIMEZONE
    });
}

// Permitir ejecución directa desde la terminal
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    runEconomyAutomation();
}
