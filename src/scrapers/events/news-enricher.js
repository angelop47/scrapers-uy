import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { log } from '../../logger.js';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_TOKEN });

export async function enrichNewsContent(newsArray) {
    if (!newsArray || newsArray.length === 0) return [];

    log('INFO [News-Enricher]', `Starting deep enrichment of ${newsArray.length} news...`);
    
    const enrichedNewsArray = [];

    for (const news of newsArray) {
        log('INFO [News-Enricher]', `Investigating and expanding: "${news.title}"...`);
        
        const systemPrompt = `Eres un historiador y experto en geopolítica y política uruguaya.
Tu tarea es tomar un evento reciente de alto impacto y redactar un registro histórico en profundidad (content) utilizando tu conocimiento y buscando información adicional actualizada en la web.

DIRECTRICES PARA EL CONTENIDO:
- Tono y Estilo: El texto debe ser ESTRICTAMENTE neutral, enciclopédico y factual. No es un artículo para enganchar lectores, es un registro histórico objetivo.
- ESTÁ PROHIBIDO usar lenguaje amarillista, exagerado o sensacionalista. Limítate a describir los hechos de forma aséptica.
- Debes incluir: Contexto histórico o antecedentes, desarrollo completo de los hechos, y las posibles repercusiones o impacto a largo plazo en Uruguay.
- El formato de salida DEBE SER EXCLUSIVAMENTE MARKDOWN válido, estructurado usando subtítulos (##), listas con viñetas cuando sea útil y párrafos legibles.
- **Tablas y Datos Estructurados**: Si el evento contiene cifras estadísticas, series numéricas comparativas o datos estructurados, debes representarlos obligatoriamente utilizando tablas Markdown estándar (por ejemplo, con alineaciones como \`| Variable | Antes | Después |\` y \`| :--- | :---: | :---: |\`). Si la información recopilada o el contenido original ya incluye una tabla, **mantén la tabla intacta y conserva exactamente su formato Markdown**, sin convertirla en texto plano, párrafos o listas.
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
                log('INFO [News-Enricher]', `Trying to enrich with model: ${modelName}`);

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
                    log('SUCCESS [News-Enricher]', `Content successfully expanded for: "${news.title}"`);
                    break;
                } else {
                    throw new Error("La respuesta fue vacía.");
                }
            } catch (error) {
                attempt++;
                log('WARNING [News-Enricher]', `Attempt ${attempt} failed while enriching "${news.title}": ${error.message}`);
                if (attempt >= maxRetries) {
                    log('ERROR [News-Enricher]', `Could not enrich "${news.title}" after ${maxRetries} attempts. Original content will be used.`, true);
                } else {
                    // Exponential backoff: 60s, 120s, 240s...
                    const baseWaitTime = 60000; // 60 segundos base
                    const waitTime = baseWaitTime * Math.pow(2, attempt - 1);
                    log('INFO [News-Enricher]', `Retrying in ${waitTime/1000} seconds... (${attempt}/${maxRetries})`);
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

    log('INFO [News-Enricher]', 'Enrichment completed.');
    return enrichedNewsArray;
}
