import { Groq } from 'groq-sdk';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Cargar .env desde el directorio raíz
dotenv.config({ path: path.join(process.cwd(), '.env') });

const groq = new Groq({
    apiKey: process.env.IA_TOKEN
});

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export async function generateMostRelevantNews(newsList, localTitles = []) {
    // 1. Obtener contexto desde Supabase (últimas 10 noticias)
    console.log('Obteniendo contexto desde Supabase...');
    const { data: recentEvents, error } = await supabase
        .from('timeline_events')
        .select('title, description, category_id, date')
        .order('date', { ascending: false })
        .limit(10);
        
    if (error) {
        console.error('Error al obtener contexto:', error.message);
    }

    const contextEventsText = recentEvents && recentEvents.length > 0 ? 
        recentEvents.map(e => `- [${e.date}] ${e.title} (${e.category_id}): ${e.description}`).join('\n') :
        'Sin contexto previo.';

    const localContextText = localTitles.length > 0 ? 
        `\n\nAdemás, HOY ya se generaron las siguientes noticias localmente (NO REPETIR NINGUNA DE ESTAS):\n${localTitles.map(t => `- ${t}`).join('\n')}` : '';

    // 2. Preparar el listado de noticias recolectadas para el prompt
    const newsText = newsList.map((n, i) => `${i+1}. [${n.source}] ${n.title}\nResumen: ${n.contentSnippet}`).join('\n\n');

    console.log('Analizando noticias con Groq...');
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
  "content": "Desarrollo completo y EXTENSO de la noticia en formato Markdown usando ## para subtítulos. Si la noticia es simple o no amerita un desarrollo largo, devuélvelo como un string vacío \"\" o null.",
  "tags": ["tag1", "tag2", "tag3"],
  "category_id": "DEBE ser EXTREMADAMENTE EXACTO y sólo uno de estos valores: business, crisis, culture, economic, entertainment, infrastructure, international, law, politics, social",
  "sources": ["Nombre de la fuente 1", "Nombre de la fuente 2"],
  "image_url": null
}`;

    const userPrompt = `Aquí están las noticias recopiladas de las últimas 24 horas:\n\n${newsText}\n\nAnalízalas bajo el criterio estricto de que DEBEN importar significativamente para Uruguay. Selecciona entre 1 y 3 noticias que cumplan esto (ya sea de impacto nacional en Uruguay o de impacto global directo sobre el país), redactalas con rigor periodístico desde cero, y devuélvelas estrictamente en el formato de ARREGLO JSON solicitado. Asegúrate de usar una category_id válida permitida y no repetir noticias del contexto. Si ninguna noticia tiene la relevancia histórica requerida para Uruguay, devuelve un arreglo vacío [].`;

    const chatCompletion = await groq.chat.completions.create({
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        model: 'llama-3.3-70b-versatile', // Modelo actualizado
        temperature: 0.2,
    });

    const aiContent = chatCompletion.choices[0]?.message?.content || '{}';
    
    try {
        const jsonMatch = aiContent.match(/\[[\s\S]*\]/);
        const jsonString = jsonMatch ? jsonMatch[0] : aiContent;
        const parsed = JSON.parse(jsonString);
        return Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
        console.error('Error parseando la respuesta de Groq:', aiContent);
        throw new Error('La IA no devolvió un JSON válido');
    }
}
