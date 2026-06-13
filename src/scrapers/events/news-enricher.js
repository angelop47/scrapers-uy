import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { log } from '../../logger.js';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_TOKEN });

export async function enrichNewsContent(newsArray) {
    if (!newsArray || newsArray.length === 0) return [];

    log('INFO [News-Enricher]', `Comenzando enriquecimiento profundo de ${newsArray.length} noticias...`);
    
    const enrichedNewsArray = [];

    for (const news of newsArray) {
        log('INFO [News-Enricher]', `Investigando y expandiendo: "${news.title}"...`);
        
        const systemPrompt = `Eres un historiador y experto en geopolítica y política uruguaya.
Tu tarea es tomar un evento reciente de alto impacto y redactar un registro histórico en profundidad (content) utilizando tu conocimiento y buscando información adicional actualizada en la web.

DIRECTRICES PARA EL CONTENIDO:
- Tono y Estilo: El texto debe ser ESTRICTAMENTE neutral, enciclopédico y factual. No es un artículo para enganchar lectores, es un registro histórico objetivo.
- ESTÁ PROHIBIDO usar lenguaje amarillista, exagerado o sensacionalista. Limítate a describir los hechos de forma aséptica.
- Debes incluir: Contexto histórico o antecedentes, desarrollo completo de los hechos, y las posibles repercusiones o impacto a largo plazo en Uruguay.
- El formato de salida DEBE SER EXCLUSIVAMENTE MARKDOWN válido, estructurado usando subtítulos (##), listas con viñetas cuando sea útil y párrafos legibles.
- Evita introducciones innecesarias o hablar con el usuario (Ej: "Aquí tienes el artículo..."). Comienza directamente con el contenido Markdown.
- Solo debes generar el contenido a insertar en el campo "content" del objeto final, NO generes un objeto JSON.`;

        const userPrompt = `Título de la Noticia: ${news.title}
Resumen Original: ${news.description}
(Puede haber una categoría de contexto asociada: ${news.category_id})

Por favor, investiga a fondo este evento en internet para enriquecer y expandir los detalles y redacta el artículo completo en formato Markdown siguiendo las directrices.`;

        let attempt = 0;
        const maxRetries = 3;
        const delay = ms => new Promise(res => setTimeout(res, ms));
        
        let enrichedContent = news.content; // Fallback al original si falla repetidas veces

        while (attempt < maxRetries) {
            try {
                const modelName = attempt < 2 ? 'gemini-3.5-flash' : 'gemini-2.5-flash';
                log('INFO [News-Enricher]', `Intentando enriquecer con modelo: ${modelName}`);

                const response = await ai.models.generateContent({
                    model: modelName,
                    contents: [
                        { role: 'user', parts: [{ text: systemPrompt }, { text: userPrompt }] }
                    ],
                    config: {
                        tools: [{ googleSearch: {} }],
                        temperature: 0.3
                    }
                });

                if (response.text) {
                    enrichedContent = response.text.trim();
                    log('SUCCESS [News-Enricher]', `Contenido expandido exitosamente para: "${news.title}"`);
                    break;
                } else {
                    throw new Error("La respuesta fue vacía.");
                }
            } catch (error) {
                attempt++;
                log('WARNING [News-Enricher]', `Intento ${attempt} fallido al enriquecer "${news.title}": ${error.message}`);
                if (attempt >= maxRetries) {
                    log('ERROR [News-Enricher]', `No se pudo enriquecer "${news.title}" después de ${maxRetries} intentos. Se usará el contenido original.`, true);
                } else {
                    const waitTime = 60000; // 60 segundos
                    log('INFO [News-Enricher]', `Reintentando en ${waitTime/1000} segundos... (${attempt}/${maxRetries})`);
                    await delay(waitTime);
                }
            }
        }

        // Devolvemos el objeto de la noticia actualizado
        enrichedNewsArray.push({
            ...news,
            content: enrichedContent,
            isEnriched: enrichedContent !== news.content // si cambió, se enriqueció
        });
        
        // Pequeño delay entre noticias para no saturar la API
        if (newsArray.length > 1) await delay(5000);
    }

    log('INFO [News-Enricher]', 'Enriquecimiento completado.');
    return enrichedNewsArray;
}
