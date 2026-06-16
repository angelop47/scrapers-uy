import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { log } from './logger.js';

const PORT = process.env.PORT || 3000;

export function start() {
    const app = express();

    app.use(cors());
    app.use(express.static('public'));

    app.get('/', (req, res) => {
        res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
    });

    app.get('/stats', (req, res) => {
        res.sendFile(path.join(process.cwd(), 'public', 'stats.html'));
    });

    app.get('/indicadores', (req, res) => {
        res.sendFile(path.join(process.cwd(), 'public', 'indicadores.html'));
    });

    app.get('/api/events', (req, res) => {
        const outputDir = path.join(process.cwd(), 'noticias');
        let allEvents = [];

        if (fs.existsSync(outputDir)) {
            try {
                const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.json'));
                for (const file of files) {
                    const content = fs.readFileSync(path.join(outputDir, file), 'utf-8');
                    const data = JSON.parse(content);
                    if (Array.isArray(data)) {
                        const dataWithSource = data.map(ev => ({ ...ev, sourceFile: file }));
                        allEvents = allEvents.concat(dataWithSource);
                    }
                }
            } catch (e) {
                console.error('Error leyendo eventos:', e.message);
            }
        }

        allEvents.sort((a, b) => {
            if (a.sourceFile !== b.sourceFile) {
                return b.sourceFile.localeCompare(a.sourceFile);
            }
            return new Date(b.date).getTime() - new Date(a.date).getTime();
        });

        res.json(allEvents);
    });

    app.get('/api/stats', (req, res) => {
        const statsDir = path.join(process.cwd(), 'stats');
        let allStats = [];

        if (fs.existsSync(statsDir)) {
            try {
                const files = fs.readdirSync(statsDir).filter(f => f.endsWith('.json'));
                for (const file of files) {
                    const content = fs.readFileSync(path.join(statsDir, file), 'utf-8');
                    const data = JSON.parse(content);
                    if (Array.isArray(data)) {
                        const dataWithSource = data.map(st => ({ ...st, sourceFile: file }));
                        allStats = allStats.concat(dataWithSource);
                    }
                }
            } catch (e) {
                console.error('Error leyendo stats:', e.message);
            }
        }

        allStats.sort((a, b) => {
            if (a.sourceFile && b.sourceFile && a.sourceFile !== b.sourceFile) {
                return b.sourceFile.localeCompare(a.sourceFile);
            }
            return new Date(b.date).getTime() - new Date(a.date).getTime();
        });

        res.json(allStats);
    });

    app.get('/api/economy', (req, res) => {
        const economyDir = path.join(process.cwd(), 'economy');
        let allEconomy = [];

        if (fs.existsSync(economyDir)) {
            try {
                const files = fs.readdirSync(economyDir).filter(f => f.endsWith('.json'));
                for (const file of files) {
                    const content = fs.readFileSync(path.join(economyDir, file), 'utf-8');
                    const data = JSON.parse(content);
                    allEconomy.push(data);
                }
            } catch (e) {
                console.error('Error leyendo economy:', e.message);
            }
        }

        allEconomy.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        res.json(allEconomy);
    });

    app.use((req, res) => {
        res.status(404).json({ error: 'Ruta no encontrada' });
    });

    app.listen(PORT, () => {
        log('INFO [Server]', `API HTTP corriendo con Express en http://localhost:${PORT}/api/events`);
    });
}
