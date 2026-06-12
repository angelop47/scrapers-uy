import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { log } from '../../logger.js';
import { DateTime } from 'luxon';

const TIMEZONE = 'America/Montevideo';

export function getRecentLocalNewsTitles(days = 7) {
    const outputDir = path.join(process.cwd(), 'noticias');
    if (!fs.existsSync(outputDir)) return [];

    let allTitles = [];
    try {
        const files = fs.readdirSync(outputDir);
        // Ordenar alfabéticamente inverso (por fecha) y tomar los últimos 'days'
        const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse().slice(0, days);
        
        for (const file of jsonFiles) {
            const filePath = path.join(outputDir, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(content);
            allTitles = allTitles.concat(data.map(item => item.title));
        }
    } catch (e) {
        log('ERROR [JSON-Writer]', `Error reading recent JSONs: ${e.message}`, true);
    }
    return allTitles;
}

export function writeJsonFile(newsArray) {
    if (!newsArray || newsArray.length === 0) return null;

    const date = DateTime.now().setZone(TIMEZONE).toISODate();
    const outputDir = path.join(process.cwd(), 'noticias');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const filePath = path.join(outputDir, `${date}.json`);
    let existingData = [];

    if (fs.existsSync(filePath)) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            existingData = JSON.parse(content);
        } catch (e) {
            log('ERROR [JSON-Writer]', `Error parsing existing JSON: ${e.message}`, true);
        }
    }

    // Agregar UUID a las nuevas noticias y estructurarlas bien
    const newsWithIds = newsArray.map(news => ({
        id: uuidv4(),
        ...news,
        isEnriched: news.isEnriched || false,
        tags: Array.isArray(news.tags) ? news.tags : [],
        image_url: news.image_url || null
    }));

    const combinedData = [...existingData, ...newsWithIds];

    fs.writeFileSync(filePath, JSON.stringify(combinedData, null, 2), 'utf-8');
    
    return filePath;
}

export function getRecentJsonFilesData(days = 3) {
    const outputDir = path.join(process.cwd(), 'noticias');
    if (!fs.existsSync(outputDir)) return [];

    let results = [];
    try {
        const files = fs.readdirSync(outputDir);
        const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse().slice(0, days);
        
        for (const file of jsonFiles) {
            const filePath = path.join(outputDir, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(content);
            results.push({ filePath, data });
        }
    } catch (e) {
        log('ERROR [JSON-Writer]', `Error reading recent JSONs data: ${e.message}`, true);
    }
    return results;
}

export function updateJsonFile(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
        log('ERROR [JSON-Writer]', `Error updating JSON file: ${e.message}`, true);
    }
}
