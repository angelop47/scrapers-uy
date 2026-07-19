import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';
import { log } from '../../logger.js';
import { callMinimax } from '../../lib/minimax-client.js';
import { buildSearchContext } from '../../lib/minimax-search.js';

dotenv.config({ path: path.join(process.cwd(), '.env') });

export const EconomyIndicatorsSchema = z.object({
  inflation_annual_pct: z.number().nullable(),
  unemployment_pct: z.number().nullable(),
  country_risk_points: z.number().nullable(),
  gdp_usd_billions: z.number().nullable(),
  external_debt_pct_gdp: z.number().nullable(),
  bcu_reserves_usd_millions: z.number().nullable(),
  minimum_wage_uyu: z.number().nullable(),
  poverty_rate_pct: z.number().nullable(),
  fiscal_deficit_pct_gdp: z.number().nullable(),
});

export type EconomyIndicators = z.infer<typeof EconomyIndicatorsSchema>;

// Espejo de gemini-economy.ts usando MiniMax M3 en lugar de Google Gemini.
// Los prompts son IDÉNTICOS al original. Se omite `tools: [{ googleSearch: {} }]`
// porque MiniMax M3 no expone esa herramienta nativa.

export async function fetchEconomicIndicators(
  previousState: EconomyIndicators | null,
): Promise<EconomyIndicators | null> {
  log(
    'INFO [Minimax-Economy]',
    'Asking MiniMax M3 to search for the latest macroeconomic indicators...',
  );

  // Búsqueda previa en la web: MiniMax M3 no decide cuándo buscar como Gemini,
  // así que inyectamos resultados relevantes como contexto antes del prompt principal.
  const searchQueries = [
    'Uruguay INE inflación anual 2026',
    'Uruguay BCU PIB deuda externa reservas 2026',
    'Uruguay salario mínimo nacional MEF 2026',
    'Uruguay riesgo país UBI BEVSA 2026',
  ];
  log(
    'INFO [Minimax-Economy]',
    `Buscando en web: ${searchQueries.length} queries...`,
  );
  const searchContext = await buildSearchContext(searchQueries, 3);

  const previousContext = previousState
    ? `ESTADO ACTUAL CONOCIDO (Última ejecución):\n${JSON.stringify(previousState, null, 2)}\n\nINSTRUCCIÓN VITAL: Utiliza estos valores como base. SOLO debes cambiar un valor si encuentras en Google un reporte oficial MÁS RECIENTE que demuestre que el indicador se actualizó. Si las noticias o los datos que encuentras coinciden o son más viejos, devuelve null para no sobrescribir sin motivo.`
    : '';

  const systemPrompt = `Eres un economista riguroso y asistente de recolección de datos de Uruguay.
Tu trabajo es usar la herramienta de búsqueda de Google para encontrar los valores oficiales *más recientes* para 9 indicadores específicos.

Fuentes de confianza obligatorias:
- INE (ine.gub.uy) para Inflación, Desempleo, Pobreza.
- BCU (bcu.gub.uy) para PBI, Deuda Externa, Reservas.
- MEF para Déficit Fiscal.
- BEVSA o República AFAP para Riesgo País (UBI).
- MTSS para Salario Mínimo.

INSTRUCCIONES ESTRICTAS PARA EVITAR INCONSISTENCIAS:
1. DEBES realizar búsquedas de Google.
2. ${previousContext}
3. Si los resultados de búsqueda son contradictorios, confusos, o de fuentes no oficiales (como diarios o blogs poco confiables), DEVUELVE null. Es preferible devolver null que un dato incorrecto.
4. Extrae SOLO el número (sin el símbolo de % o USD).
5. Devuelve UN SOLO OBJETO JSON con las 9 claves solicitadas. Ningún texto extra.`;

  const userPrompt = `Por favor busca los datos vigentes para Uruguay y devuelve un JSON con las siguientes claves exactas y sus valores numéricos:
- inflation_annual_pct (Inflación interanual %)
- unemployment_pct (Tasa de desempleo %)
- country_risk_points (Riesgo País o UBI en puntos básicos)
- gdp_usd_billions (PBI en miles de millones de dólares USD)
- external_debt_pct_gdp (Deuda externa como % del PBI)
- bcu_reserves_usd_millions (Activos de reserva del BCU en millones de dólares USD)
- minimum_wage_uyu (Salario Mínimo Nacional vigente en Pesos Uruguayos UYU)
- poverty_rate_pct (Tasa de pobreza %)
- fiscal_deficit_pct_gdp (Déficit fiscal del sector público global como % del PBI)

Recuerda: si no encuentras el dato exacto, pon null. 
IMPORTANTE: Devuelve ÚNICAMENTE el JSON crudo, sin bloques de código markdown (sin \`\`\`json).`;

  const maxRetries = 3;
  let attempt = 0;
  const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

  while (attempt < maxRetries) {
    try {
      const modelName = process.env.MINIMAX_MODEL || 'MiniMax-M3';
      log(
        'INFO [Minimax-Economy]',
        `Trying with model: ${modelName} (Attempt ${attempt + 1})`,
      );

      let aiContent = await callMinimax(
        [
          {
            role: 'system',
            content: `${systemPrompt}\n\nA continuación tenés resultados actualizados de búsqueda web para ayudarte a responder. Priorizá las fuentes oficiales (INE, BCU, MEF) presentes en estos resultados sobre otros datos:\n\n${searchContext}`,
          },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.1, jsonMode: true },
      );

      if (!aiContent) throw new Error('Empty response from MiniMax M3');

      // Limpiar posibles bloques markdown si el modelo se equivoca
      aiContent = aiContent
        .replace(/^```json/g, '')
        .replace(/^```/g, '')
        .replace(/```$/g, '')
        .trim();

      const parsedJson = JSON.parse(aiContent);

      // Validar con Zod para asegurar integridad antes de devolver
      const parsed = EconomyIndicatorsSchema.safeParse(parsedJson);
      if (!parsed.success) {
        throw new Error(`Zod validation failed: ${parsed.error.message}`);
      }

      return parsed.data;
    } catch (e: any) {
      attempt++;
      log('ERROR [Minimax-Economy]', `Attempt ${attempt} failed: ${e.message}`);
      if (attempt >= maxRetries) {
        log(
          'WARN [Minimax-Economy]',
          'Failed to fetch economy stats from MiniMax M3 after all retries. Returning nulls.',
        );
        return null; // El orquestador manejará el null y usará los valores previos 100%
      }
      const waitTime = 15000;
      await delay(waitTime);
    }
  }
  return null;
}
