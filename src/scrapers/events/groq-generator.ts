import { Groq } from 'groq-sdk';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';
import { TimelineEventSchema, TimelineEvent, RssNewsItem } from './types.js';

// Cargar .env desde el directorio raíz
dotenv.config({ path: path.join(process.cwd(), '.env') });

const groq = new Groq({
  apiKey: process.env.IA_TOKEN || ''
});

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_KEY || '');

export async function generateMostRelevantNews(newsList: RssNewsItem[], localTitles: string[] = []): Promise<TimelineEvent[]> {
  // 1. Obtener contexto desde Supabase (últimas 10 noticias)
  console.log('Fetching context from Supabase...');
  const { data: recentEvents, error } = await supabase
    .from('timeline_events')
    .select('title, description, category_id, date')
    .order('date', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching context:', error.message);
  }

  const contextEventsText = recentEvents && recentEvents.length > 0 ?
    recentEvents.map(e => `- [${e.date}] ${e.title} (${e.category_id}): ${e.description}`).join('\n') :
    'Sin contexto previo.';

  const localContextText = localTitles.length > 0 ?
    `\n\nAdemás, HOY ya se generaron las siguientes noticias localmente (NO REPETIR NINGUNA DE ESTAS):\n${localTitles.map(t => `- ${t}`).join('\n')}` : '';

  // 2. Preparar el listado de noticias recolectadas para el prompt
  const newsText = newsList.map((n, i) => `${i + 1}. [${n.source}] ${n.title}\nResumen: ${n.contentSnippet}`).join('\n\n');

  console.log('Analyzing news with Groq...');
  const systemPrompt = `Eres un editor periodístico experto y analista de geopolítica y política uruguaya. Tu objetivo es encontrar las noticias más relevantes del día para agregarlas a una "Línea de Tiempo" de hitos históricos de Uruguay.
    
REGLA ESTRICTA: Las noticias elegidas DEBEN ser de alto impacto e importancia directa para URUGUAY. Pregúntate siempre: "¿Si leo esta noticia en 2 o 3 años, seguirá siendo verdaderamente relevante? ¿Cambia en algo la línea del tiempo histórica de Uruguay?". Si la respuesta es no, descártala. Si es un evento internacional, sólo califica si afecta directamente a Uruguay de manera significativa a largo plazo. No incluyas noticias intrascendentes, del día a día, o polémicas pasajeras.

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
  "content": "Desarrollo completo y EXTENSO de la noticia en formato Markdown usando ## para subtítulos. Si la noticia es simple o no amerita un desarrollo largo, devuélvelo como un string vacío \"\" o null.",
  "tags": ["tag1", "tag2", "tag3"],
  "category_id": "DEBE ser EXTREMADAMENTE EXACTO y sólo uno de estos valores: business, crisis, culture, economic, entertainment, infrastructure, international, law, politics, social",
  "sources": ["Nombre de la fuente 1", "Nombre de la fuente 2"],
  "image_url": null
}`;

  const userPrompt = `Aquí están las noticias recopiladas de las últimas 24 horas:\n\n${newsText}\n\nAnalízalas bajo el criterio estricto de que DEBEN importar significativamente para Uruguay. Selecciona entre 1 y 3 noticias que cumplan esto (ya sea de impacto nacional en Uruguay o de impacto global directo sobre el país), asegurándote de que su relevancia perdurará en 2 o 3 años y que marcarán un hito en la línea del tiempo del país. Redactalas con rigor periodístico desde cero, y devuélvelas estrictamente en el formato de ARREGLO JSON solicitado. Asegúrate de usar una category_id válida permitida y no repetir noticias del contexto. Si ninguna noticia tiene el peso histórico necesario o no superan la prueba de relevancia a 2 o 3 años, devuelve un arreglo vacío [].`;

  const chatCompletion = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    model: 'llama-3.3-70b-versatile', // Modelo actualizado
    temperature: 0.2,
  });

  const aiContent = chatCompletion.choices[0]?.message?.content || '[]';

  try {
    const jsonMatch = aiContent.match(/\[[\s\S]*\]/);
    const jsonString = jsonMatch ? jsonMatch[0] : aiContent;
    const parsedJson = JSON.parse(jsonString);
    const rawArray = Array.isArray(parsedJson) ? parsedJson : [parsedJson];

    // Validate with Zod TimelineEventSchema
    const validation = z.array(TimelineEventSchema).safeParse(rawArray);
    if (!validation.success) {
      throw new Error(`Zod schema validation failed: ${validation.error.message}`);
    }

    return validation.data;
  } catch (e: any) {
    console.error('Error parsing Groq response:', e.message, aiContent);
    throw new Error('AI did not return a valid JSON conforming to the requested schema');
  }
}
