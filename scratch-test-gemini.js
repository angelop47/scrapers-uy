import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_TOKEN });

async function test() {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: 'Busca las ultimas noticias sobre la economia en Uruguay y dame un resumen en formato json',
            config: {
                tools: [{ googleSearch: {} }]
            }
        });
        console.log("Success! Length of text:", response.text.length);
    } catch (e) {
        console.error(e);
    }
}
test();
