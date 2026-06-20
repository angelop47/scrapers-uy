import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';
import { log } from '../../logger.js';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_TOKEN || '' });

export const StatItemSchema = z.object({
  mandate_id: z.string(),
  date: z.string(),
  title: z.string(),
  description: z.string(),
  indicator: z.string(),
  value: z.number(),
  unit: z.string(),
  trend: z.enum(['up', 'down', 'stable']),
  trend_is_good: z.boolean(),
  source: z.string()
});

export type StatItem = z.infer<typeof StatItemSchema>;

export async function fetchStatsWithGemini(mandateId: string, recentTitles: string[] = []): Promise<StatItem[]> {
  log('INFO [Gemini-Stats]', 'Asking Gemini to search for new mandate statistics...');

  const systemPrompt = `Eres un asistente automatizado de recolección de datos económicos y gubernamentales de Uruguay.
Tu trabajo es usar la herramienta de búsqueda de Google para encontrar los indicadores y estadísticas oficiales más recientes publicadas en Uruguay (ej. Inflación, Desempleo, Salario Real, PIB, Aprobación Presidencial).
Fuentes de confianza a consultar:
- Instituto Nacional de Estadística (INE - ine.gub.uy)
- Banco Central del Uruguay (BCU - bcu.gub.uy)
- Ministerio de Economía y Finanzas (MEF - mef.gub.uy)
- Portales gubernamentales (gub.uy) o encuestadoras reconocidas (Cifra, Equipos, Factum, Opción) para aprobación.

DIRECTRICES ESTRICTAS:
- Solo devuelve datos que sean RECIENTES (del mes o trimestre actual/anterior).
- Si no encuentras ningún dato nuevo o relevante que merezca ser guardado hoy, devuelve un arreglo vacío [].
- La salida debe ser ÚNICAMENTE un ARREGLO JSON válido (Array de objetos), sin markdown extra ni texto adicional (sin \`\`\`json).

Estructura de CADA objeto del arreglo:
{
  "mandate_id": "${mandateId}",
  "date": "Fecha del dato en formato YYYY-MM-DD (String)",
  "title": "Título corto de la métrica (ej. 'Inflación de Octubre')",
  "description": "Breve explicación de qué representa el dato y contexto.",
  "indicator": "Nombre estandarizado (ej. 'inflation', 'unemployment', 'gdp_growth', 'approval_rating')",
  "value": Valor numérico (Number, usar punto para decimales, ej: 4.5),
  "unit": "Unidad de medida (ej. '%', 'millones USD', 'puntos')",
  "trend": "Tendencia respecto a la medición anterior. Solo valores permitidos: 'up', 'down', 'stable'",
  "trend_is_good": Booleano (true si la tendencia es positiva/buena para el país, false si es negativa/mala),
  "source": "URL o nombre exacto de la fuente de donde obtuviste el dato"
}`;

  const localContextText = recentTitles.length > 0 ?
    `\n\nATENCIÓN: Ya hemos guardado recientemente las siguientes estadísticas. NO VUELVAS A REPETIR NINGUNA DE ESTAS, busca únicamente información DIFERENTE:\n${recentTitles.map(t => `- ${t}`).join('\n')}` : '';

  const userPrompt = `Busca los datos macroeconómicos, estadísticos o de aprobación gubernamental más recientes publicados en Uruguay. Limítate a buscar en las fuentes oficiales o encuestadoras confiables mencionadas. Devuelve solo un JSON válido con los datos nuevos encontrados. Si no hay publicaciones nuevas recientes o si todas las recientes ya están en el contexto proveído, devuelve [].${localContextText}`;

  const maxRetries = 3;
  let attempt = 0;
  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

  while (attempt < maxRetries) {
    try {
      const modelName = attempt < 2 ? 'gemini-3.5-flash' : 'gemini-2.5-flash';
      log('INFO [Gemini-Stats]', `Trying with model: ${modelName}`);

      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          { role: 'user', parts: [{ text: systemPrompt }, { text: userPrompt }] }
        ],
        config: {
          tools: [{ googleSearch: {} }],
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      });

      const aiContent = response.text || '[]';
      const parsedJson = JSON.parse(aiContent);
      const rawArray = Array.isArray(parsedJson) ? parsedJson : [parsedJson];

      const validation = z.array(StatItemSchema).safeParse(rawArray);
      if (!validation.success) {
        throw new Error(`Zod validation failed: ${validation.error.message}`);
      }

      return validation.data;
    } catch (e: any) {
      attempt++;
      log('ERROR [Gemini-Stats]', `Attempt ${attempt} failed: ${e.message}`);
      if (attempt >= maxRetries) {
        log('WARN [Gemini-Stats]', 'Failed to fetch stats from Gemini after all retries. Returning empty array.');
        return [];
      }
      const waitTime = 30000;
      await delay(waitTime);
    }
  }
  return [];
}
