import { timingSafeEqual } from 'crypto';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { log, getDailyLogPath } from './logger.js';
import { scrape as scrapeDolar } from './scrapers/dolar.js';
import { scrape as scrapePetroleo } from './scrapers/petroleo.js';
import { runNewsAutomation } from './generate-news.js';
import { runStatsAutomation } from './scrapers/stats/stats-runner.js';
import { runEconomyAutomation } from './scrapers/economy/economy-runner.js';

const PORT = process.env.PORT || 3000;

function hasValidApiToken(req: Request): boolean {
  const expected = process.env.AUTOMATION_API_TOKEN?.trim();
  const provided = req.header('x-api-token')?.trim();
  if (!expected || !provided) return false;

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

function requireApiToken(req: Request, res: Response, next: NextFunction): void {
  if (!process.env.AUTOMATION_API_TOKEN?.trim()) {
    res.status(503).json({ error: 'AUTOMATION_API_TOKEN no está configurado.' });
    return;
  }
  if (!hasValidApiToken(req)) {
    res.status(401).json({ error: 'No autorizado.' });
    return;
  }
  next();
}

export function start(): void {
  const app = express();

  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Origin not allowed by CORS'));
    },
    allowedHeaders: ['Content-Type', 'x-api-token'],
  }));
  app.use(express.static('public'));
  app.use('/api/run', requireApiToken);

  app.get('/', (req: Request, res: Response) => {
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
  });

  app.get('/stats', (req: Request, res: Response) => {
    res.sendFile(path.join(process.cwd(), 'public', 'stats.html'));
  });

  app.get('/indicadores', (req: Request, res: Response) => {
    res.sendFile(path.join(process.cwd(), 'public', 'indicadores.html'));
  });

  app.get('/panel', (req: Request, res: Response) => {
    res.sendFile(path.join(process.cwd(), 'public', 'panel.html'));
  });

  app.post('/api/run/dolar', async (req: Request, res: Response) => {
    try {
      await scrapeDolar();
      res.json({
        success: true,
        message: 'Scraper de dólar ejecutado correctamente',
      });
    } catch (error: any) {
      console.error('Error in /api/run/dolar:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/run/petroleo', async (req: Request, res: Response) => {
    try {
      await scrapePetroleo();
      res.json({
        success: true,
        message: 'Scraper de petróleo ejecutado correctamente',
      });
    } catch (error: any) {
      console.error('Error in /api/run/petroleo:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/run/noticias', async (req: Request, res: Response) => {
    try {
      await runNewsAutomation();
      res.json({
        success: true,
        message: 'Generador de noticias ejecutado correctamente',
      });
    } catch (error: any) {
      console.error('Error in /api/run/noticias:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/run/stats', async (req: Request, res: Response) => {
    try {
      await runStatsAutomation();
      res.json({
        success: true,
        message: 'Generador de estadísticas ejecutado correctamente',
      });
    } catch (error: any) {
      console.error('Error in /api/run/stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/run/economy', async (req: Request, res: Response) => {
    try {
      await runEconomyAutomation();
      res.json({
        success: true,
        message: 'Generador de economía ejecutado correctamente',
      });
    } catch (error: any) {
      console.error('Error in /api/run/economy:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/logs', requireApiToken, (req: Request, res: Response) => {
    try {
      const logPath = getDailyLogPath();
      if (!fs.existsSync(logPath)) {
        return res.json({ logs: 'No logs available for today.' });
      }
      const content = fs.readFileSync(logPath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      const lastLines = lines.slice(-100).join('\n');
      res.json({ logs: lastLines });
    } catch (error) {
      res.status(500).json({ error: 'Failed to read logs' });
    }
  });

  app.get('/api/events', (req: Request, res: Response) => {
    const outputDir = path.join(process.cwd(), 'noticias');
    let allEvents: any[] = [];

    if (fs.existsSync(outputDir)) {
      try {
        const files = fs
          .readdirSync(outputDir)
          .filter((f) => f.endsWith('.json'));
        for (const file of files) {
          const content = fs.readFileSync(path.join(outputDir, file), 'utf-8');
          const data = JSON.parse(content);
          if (Array.isArray(data)) {
            const dataWithSource = data.map((ev) => ({
              ...ev,
              sourceFile: file,
            }));
            allEvents = allEvents.concat(dataWithSource);
          }
        }
      } catch (e: any) {
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

  app.get('/api/stats', (req: Request, res: Response) => {
    const statsDir = path.join(process.cwd(), 'stats');
    let allStats: any[] = [];

    if (fs.existsSync(statsDir)) {
      try {
        const files = fs
          .readdirSync(statsDir)
          .filter((f) => f.endsWith('.json'));
        for (const file of files) {
          const content = fs.readFileSync(path.join(statsDir, file), 'utf-8');
          const data = JSON.parse(content);
          if (Array.isArray(data)) {
            const dataWithSource = data.map((st) => ({
              ...st,
              sourceFile: file,
            }));
            allStats = allStats.concat(dataWithSource);
          }
        }
      } catch (e: any) {
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

  app.get('/api/economy', (req: Request, res: Response) => {
    const economyDir = path.join(process.cwd(), 'economy');
    let allEconomy: any[] = [];

    if (fs.existsSync(economyDir)) {
      try {
        const files = fs
          .readdirSync(economyDir)
          .filter((f) => f.endsWith('.json'));
        for (const file of files) {
          const content = fs.readFileSync(path.join(economyDir, file), 'utf-8');
          const data = JSON.parse(content);
          allEconomy.push(data);
        }
      } catch (e: any) {
        console.error('Error leyendo economy:', e.message);
      }
    }

    allEconomy.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    res.json(allEconomy);
  });

  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Ruta no encontrada' });
  });

  app.listen(PORT, () => {
    log(
      'INFO [Server]',
      `API HTTP corriendo con Express en http://localhost:${PORT}/api/events`,
    );
  });
}
