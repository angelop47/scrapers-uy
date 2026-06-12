import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { log } from '../../logger.js';

// Cargar .env desde el directorio raíz
dotenv.config({ path: path.join(process.cwd(), '.env') });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_TOKEN });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export async function generateMostRelevantNews(newsList, localTitles = []) {
    log('INFO [Gemini]', 'Fetching context from Supabase...');
    const { data: recentEvents, error } = await supabase
        .from('timeline_events')
        .select('title, description, category_id, date')
        .order('date', { ascending: false })
        .limit(10);

    if (error) {
        log('ERROR [Gemini]', `Error fetching context: ${error.message}`, true);
    }

    const contextEventsText = recentEvents && recentEvents.length > 0 ?
        recentEvents.map(e => `- [${e.date}] ${e.title} (${e.category_id}): ${e.description}`).join('\n') :
        'Sin contexto previo.';

    const localContextText = localTitles.length > 0 ?
        `\n\nAdemás, HOY ya se generaron las siguientes noticias localmente (NO REPETIR NINGUNA DE ESTAS):\n${localTitles.map(t => `- ${t}`).join('\n')}` : '';

    const newsText = newsList.map((n, i) => `${i + 1}. [${n.source}] ${n.title}\nResumen: ${n.contentSnippet}`).join('\n\n');

    log('INFO [Gemini]', 'Analyzing news with Gemini...');

    const systemPrompt = `Eres un editor periodístico experto y analista de geopolítica y política uruguaya. Tu objetivo es encontrar las noticias más relevantes del día para agregarlas a una "Línea de Tiempo" de hitos históricos de Uruguay.
    
REGLA ESTRICTA: Las noticias elegidas DEBEN ser de alto impacto e importancia directa para URUGUAY. Si es un evento internacional, sólo califica si afecta directamente a Uruguay de manera significativa. No incluyas noticias intrascendentes.

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
  "image_url": null
}`;

    const userPrompt = `Aquí están las noticias recopiladas de las últimas 24 horas:\n\n${newsText}\n\nAnalízalas bajo el criterio estricto de que DEBEN importar significativamente para Uruguay. Selecciona entre 1 y 3 noticias que cumplan esto (ya sea de impacto nacional en Uruguay o de impacto global directo sobre el país), redactalas con rigor periodístico desde cero, y devuélvelas estrictamente en el formato de ARREGLO JSON solicitado. Asegúrate de usar una category_id válida permitida y no repetir noticias del contexto. Si ninguna noticia tiene la relevancia histórica requerida para Uruguay, devuelve un arreglo vacío [].`;

    const maxRetries = 4;
    let attempt = 0;
    const delay = ms => new Promise(res => setTimeout(res, ms));

    while (attempt < maxRetries) {
        try {
            const modelName = attempt < 2 ? 'gemini-2.5-flash' : 'gemini-2.0-flash';
            log('INFO [Gemini]', `Intentando con modelo: ${modelName}`);
            
            const response = await ai.models.generateContent({
                model: modelName,
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { text: systemPrompt },
                            { text: userPrompt }
                        ]
                    }
                ],
                config: {
                    temperature: 0.2,
                    responseMimeType: "application/json"
                }
            });

            const aiContent = response.text || '[]';
            const parsed = JSON.parse(aiContent);
            return Array.isArray(parsed) ? parsed : [parsed];
        } catch (e) {
            attempt++;
            log('ERROR [Gemini]', `Attempt ${attempt} failed: ${e.message}`, true);
            if (attempt >= maxRetries) {
                throw new Error('La IA no devolvió un JSON válido o la API falló después de todos los reintentos y fallbacks');
            }
            const waitTime = 30000; // 30 segundos
            log('INFO [Gemini]', `Retrying in ${waitTime/1000} seconds... (${attempt}/${maxRetries})`);
            await delay(waitTime);
        }
    }
}
