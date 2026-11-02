import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { log } from '../../logger.js';
import { callLLM, getLLMModel } from '../../lib/llm-client.js';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { TimelineEventSchema, TimelineEvent, RssNewsItem } from './types.js';

// Cargar .env desde el directorio raíz
dotenv.config({ path: path.join(process.cwd(), '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_KEY || '',
);

// Selecciona las noticias más relevantes usando el LLM configurado en
// `src/lib/llm-client.ts` (variable LLM_MODEL). Esta etapa no usa búsqueda web.

export async function generateMostRelevantNews(
  newsList: RssNewsItem[],
  localTitles: string[] = [],
): Promise<TimelineEvent[]> {
  log('INFO [LLM-Generator]', 'Fetching context from Supabase...');
  const { data: recentEvents, error } = await supabase
    .from('timeline_events')
    .select('title, description, category_id, date')
    .order('date', { ascending: false })
    .limit(10);

  if (error) {
    log('ERROR [LLM-Generator]', `Error fetching context: ${error.message}`, true);
  }

  const contextEventsText =
    recentEvents && recentEvents.length > 0
      ? recentEvents
          .map(
            (e) =>
              `- [${e.date}] ${e.title} (${e.category_id}): ${e.description}`,
          )
          .join('\n')
      : 'Sin contexto previo.';

  const localContextText =
    localTitles.length > 0
      ? `\n\nAdemás, RECIENTEMENTE ya se generaron las siguientes noticias localmente (NO REPETIR NINGUNA DE ESTAS):\n${localTitles.map((t) => `- ${t}`).join('\n')}`
      : '';

  const newsText = newsList
    .map(
      (n, i) =>
        `${i + 1}. [${n.source}] ${n.title}\nResumen: ${n.contentSnippet}`,
    )
    .join('\n\n');

  log('INFO [LLM-Generator]', 'Analyzing news with the LLM...');

  const systemPrompt = `Eres un historiador y analista de geopolítica y política uruguaya. Tu objetivo es encontrar los eventos más relevantes del día para documentarlos en una "Línea de Tiempo" de hitos históricos de Uruguay.
    
REGLA ESTRICTA: Los eventos elegidos DEBEN ser de alto impacto e importancia directa para URUGUAY. Pregúntate siempre: "¿Si leo esta noticia en 2 o 3 años, seguirá siendo verdaderamente relevante? ¿Cambia en algo la línea del tiempo histórica de Uruguay?". Si la respuesta es no, descártala. Si es un evento internacional, sólo califica si afecta directamente a Uruguay de manera significativa a largo plazo. No incluyas eventos intrascendentes, del día a día, o polémicas pasajeras.

TONO Y ESTILO (MUY IMPORTANTE):
- El tono debe ser ESTRICTAMENTE neutral, enciclopédico y objetivo (estilo registro histórico o Wikipedia).
- NO uses lenguaje periodístico, amarillista, sensacionalista ni intentes "enganchar" al lector. Limítate a describir los hechos de forma aséptica y factual.
- **Tablas y Datos Estructurados**: Si la noticia incluye datos numéricos comparativos, cifras estadísticas o series históricas de datos, represéntalos obligatoriamente usando tablas en formato Markdown estándar (ej. \`| Variable | Antes | Después |\` y \`| :--- | :---: | :---: |\`). No conviertas tablas o datos estructurados en texto plano, listas o prosa.

Tienes como contexto los últimos eventos agregados a esta línea de tiempo para entender el nivel de relevancia que buscamos:
${contextEventsText}${localContextText}
(IMPORTANTE: Evita elegir una noticia que hable del mismo evento si ya se encuentra en este contexto).

Tu salida debe ser ÚNICAMENTE un ARREGLO JSON válido (Array de objetos) con la o las noticias más relevantes (mínimo 1, máximo 3), sin markdown extra al principio ni al final (sin bloques \`\`\`json). Si ninguna noticia tiene el peso histórico necesario para Uruguay, puedes devolver un arreglo vacío [].
Estructura de CADA objeto del arreglo:
{
  "title": "Título corto y directo del evento (String)",
  "date": "Fecha del evento en formato YYYY-MM-DD (String)",
  "description": "Un resumen corto de 1 o 2 párrafos para leer rápido (String)",
  "content": "Desarrollo completo y EXTENSO de la noticia en formato Markdown usando ## para subtítulos. Si la noticia es simple o no amerita un desarrollo largo, devuélvelo como un string vacío \\"\\" o null.",
  "tags": ["tag1", "tag2", "tag3"],
  "category_id": "DEBE ser EXTREMADAMENTE EXACTO y sólo uno de estos valores: business, crisis, culture, economic, entertainment, infrastructure, international, law, politics, social",
  "sources": ["Nombre de la fuente 1", "Nombre de la fuente 2"],
  "image_url": null
}`;

  const currentDate = DateTime.now().setZone('America/Montevideo').toISODate();
  const userPrompt = `Hoy es ${currentDate}. Aquí están las noticias recopiladas de las últimas 24 horas:\n\n${newsText}\n\nAnalízalas bajo el criterio estricto de que DEBEN importar significativamente para Uruguay. Selecciona entre 1 y 3 noticias que cumplan esto (ya sea de impacto nacional en Uruguay o de impacto global directo sobre el país), asegurándote de que su relevancia perdurará en 2 o 3 años y que marcarán un hito en la línea del tiempo del país. Redactalas con rigor periodístico desde cero, y devuélvelas estrictamente en el formato de ARREGLO JSON solicitado. Asegúrate de usar una category_id válida permitida y no repetir noticias del contexto. Si ninguna noticia tiene el peso histórico necesario o no superan la prueba de relevancia a 2 o 3 años, devuelve un arreglo vacío [].`;

  const maxRetries = 4;
  let attempt = 0;
  const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

  while (attempt < maxRetries) {
    try {
      log('INFO [LLM-Generator]', `Trying with model: ${getLLMModel()}`);

      const aiContent = await callLLM(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.2, jsonMode: true },
      );

      log(
        'INFO [LLM-Generator]',
        `Raw response received (length: ${aiContent.length})`,
      );

      const parsedJson = JSON.parse(aiContent);
      const rawArray = Array.isArray(parsedJson) ? parsedJson : [parsedJson];

      // Validate the raw output with Zod TimelineEventSchema
      const validation = z.array(TimelineEventSchema).safeParse(rawArray);

      if (!validation.success) {
        throw new Error(
          `Zod Schema validation failed: ${validation.error.message}`,
        );
      }

      const resultArray: TimelineEvent[] = validation.data;

      if (resultArray.length === 0) {
        log(
          'DEBUG [LLM-Generator]',
          `LLM returned 0 items. Raw text was: ${aiContent}`,
        );
      } else {
        log('INFO [LLM-Generator]', `LLM returned ${resultArray.length} items.`);
      }
      return resultArray;
    } catch (e: any) {
      attempt++;
      log('ERROR [LLM-Generator]', `Attempt ${attempt} failed: ${e.message}`, true);
      if (attempt >= maxRetries) {
        throw new Error(
          'AI did not return a valid JSON/Zod structure or API failed after all retries and fallbacks',
        );
      }
      // Exponential backoff: 60s, 120s, 240s...
      const baseWaitTime = 60000; // 60 segundos base
      const waitTime = baseWaitTime * Math.pow(2, attempt - 1);
      log(
        'INFO [LLM-Generator]',
        `Retrying in ${waitTime / 1000} seconds... (${attempt}/${maxRetries})`,
      );
      await delay(waitTime);
    }
  }

  return [];
}
