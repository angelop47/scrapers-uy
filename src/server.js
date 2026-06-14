import http from 'http';
import fs from 'fs';
import path from 'path';
import { log } from './logger.js';

const PORT = process.env.PORT || 3000;

export function start() {
    const server = http.createServer((req, res) => {
        // CORS Headers para permitir llamadas desde el frontend
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        if (req.method === 'GET' && req.url === '/') {
            const htmlPath = path.join(process.cwd(), 'public', 'index.html');
            if (fs.existsSync(htmlPath)) {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(fs.readFileSync(htmlPath));
            } else {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>UI no encontrada</h1><p>Falta la carpeta public/index.html</p>');
            }
            return;
        }

        if (req.method === 'GET' && req.url === '/events') {
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

            // Ordenar por archivo (más reciente primero) y luego por fecha
            allEvents.sort((a, b) => {
                if (a.sourceFile !== b.sourceFile) {
                    return b.sourceFile.localeCompare(a.sourceFile);
                }
                return new Date(b.date).getTime() - new Date(a.date).getTime();
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(allEvents));
        } else if (req.method === 'GET' && req.url === '/stats') {
            const statsDir = path.join(process.cwd(), 'stats');
            let allStats = [];

            if (fs.existsSync(statsDir)) {
                try {
                    const files = fs.readdirSync(statsDir).filter(f => f.endsWith('.json'));
                    for (const file of files) {
                        const content = fs.readFileSync(path.join(statsDir, file), 'utf-8');
                        const data = JSON.parse(content);
                        if (Array.isArray(data)) {
                            allStats = allStats.concat(data);
                        }
                    }
                } catch (e) {
                    console.error('Error leyendo stats:', e.message);
                }
            }

            // Ordenar de más reciente a más antiguo
            allStats.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(allStats));
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Ruta no encontrada' }));
        }
    });

    server.listen(PORT, () => {
        log('INFO [Server]', `API HTTP corriendo. Endpoint de noticias en http://localhost:${PORT}/events`);
    });
}
