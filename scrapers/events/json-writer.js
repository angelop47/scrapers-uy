import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { log } from '../../logger.js';

export function getTodayLocalNewsTitles() {
    const date = new Date().toISOString().split('T')[0];
    const outputDir = path.join(process.cwd(), 'noticias');
    const filePath = path.join(outputDir, `${date}.json`);
    
    if (!fs.existsSync(filePath)) return [];
    
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        return data.map(item => item.title);
    } catch (e) {
        log('ERROR [JSON-Writer]', `Error reading daily JSON: ${e.message}`, true);
        return [];
    }
}

export function writeJsonFile(newsArray) {
    if (!newsArray || newsArray.length === 0) return null;

    const date = new Date().toISOString().split('T')[0];
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
        tags: Array.isArray(news.tags) ? news.tags : [],
        image_url: news.image_url || null
    }));

    const combinedData = [...existingData, ...newsWithIds];

    fs.writeFileSync(filePath, JSON.stringify(combinedData, null, 2), 'utf-8');
    
    return filePath;
}
