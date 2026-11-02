import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';
import { log } from '../../logger.js';
import { callLLM, getLLMModel } from '../../lib/llm-client.js';

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

// Indicadores económicos vía el LLM configurado en `src/lib/llm-client.ts`.
//
// Diseño: el modelo NO decide si algo "cambió". Devuelve, por cada indicador,
// el último valor oficial que encuentre junto con su período y fuente; el
// runner se encarga de mezclar con el estado anterior. Antes se le pedía
// devolver `null` si el dato "no era más reciente", pero el modelo no conocía
// el período de los valores guardados, así que ante la duda devolvía `null` y
// el reporte salía idéntico semana tras semana.

const INDICATOR_KEYS = Object.keys(
  EconomyIndicatorsSchema.shape,
) as (keyof EconomyIndicators)[];

const FindingSchema = z.object({
  value: z.number().nullable(),
  period: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
});

const ResponseSchema = z.object(
  Object.fromEntries(INDICATOR_KEYS.map((k) => [k, FindingSchema])) as Record<
    keyof EconomyIndicators,
    typeof FindingSchema
  >,
);

// Cambios relativos mayores a esto se loguean como advertencia (se aceptan igual).
const SUSPICIOUS_CHANGE_RATIO = 0.25;
const MAX_SEARCHES = 10;

export async function fetchEconomicIndicators(
  previousState: EconomyIndicators | null,
): Promise<EconomyIndicators | null> {
  log(
    'INFO [LLM-Economy]',
    'Asking the LLM to search for the latest macroeconomic indicators...',
  );

  const previousContext = previousState
    ? `\nVALORES GUARDADOS DE LA ÚLTIMA EJECUCIÓN (solo como referencia; pueden estar desactualizados):\n${JSON.stringify(previousState, null, 2)}\n`
    : '';

  const systemPrompt = `Eres un economista riguroso y asistente de recolección de datos de Uruguay.
Tu trabajo es buscar en la web el último valor oficial publicado de 9 indicadores y reportar, para cada uno, de qué período es y de dónde lo sacaste.

Fuentes de confianza obligatorias:
- INE (ine.gub.uy) para Inflación, Desempleo, Pobreza.
- BCU (bcu.gub.uy) para PBI, Deuda Externa, Reservas.
- MEF (mef.gub.uy) para Déficit Fiscal.
- BEVSA o República AFAP para Riesgo País (UBI).
- MTSS / gub.uy para Salario Mínimo.

INSTRUCCIONES ESTRICTAS:
1. Busca cada indicador por separado en su fuente oficial; usa varias búsquedas. No respondas de memoria.
2. Devuelve SIEMPRE el último valor oficial que encuentres, aunque coincida con el guardado. No compares con los valores guardados: eso lo hace el sistema.${previousContext}
3. Si no encuentras el dato en una fuente oficial, o los resultados son contradictorios o provienen de diarios/blogs, devuelve value: null. Es preferible null a un dato incorrecto.
4. "value" es SOLO el número (sin %, USD ni separadores de miles; punto decimal).
5. "period" es el período al que corresponde el dato (ej. "2026-09", "2026-T2", "2026-10-30"). "source" es la URL de donde lo tomaste.
6. Devuelve UN SOLO OBJETO JSON, sin texto extra ni bloques de código markdown.`;

  const userPrompt = `Busca los datos vigentes para Uruguay y devuelve un objeto JSON con estas claves exactas. Cada clave debe ser un objeto {"value": number|null, "period": string|null, "source": string|null}:
- inflation_annual_pct (Inflación interanual %)
- unemployment_pct (Tasa de desempleo %)
- country_risk_points (Riesgo País o UBI en puntos básicos)
- gdp_usd_billions (PBI en miles de millones de dólares USD)
- external_debt_pct_gdp (Deuda externa como % del PBI)
- bcu_reserves_usd_millions (Activos de reserva del BCU en millones de dólares USD)
- minimum_wage_uyu (Salario Mínimo Nacional vigente en Pesos Uruguayos UYU)
- poverty_rate_pct (Tasa de pobreza %)
- fiscal_deficit_pct_gdp (Déficit fiscal del sector público global como % del PBI)`;

  const maxRetries = 3;
  let attempt = 0;
  const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

  while (attempt < maxRetries) {
    try {
      log(
        'INFO [LLM-Economy]',
        `Trying with model: ${getLLMModel()} (Attempt ${attempt + 1})`,
      );

      const aiContent = await callLLM(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        {
          temperature: 0.1,
          jsonMode: true,
          webSearch: { maxUses: MAX_SEARCHES },
        },
      );

      if (!aiContent) throw new Error('Empty response from LLM');

      const parsed = ResponseSchema.safeParse(JSON.parse(aiContent));
      if (!parsed.success) {
        throw new Error(`Zod validation failed: ${parsed.error.message}`);
      }

      const result = {} as EconomyIndicators;
      for (const key of INDICATOR_KEYS) {
        const { value, period, source } = parsed.data[key];
        result[key] = value;

        const prev = previousState?.[key] ?? null;
        const detail = `${key}: ${value} (período: ${period ?? '?'}, fuente: ${source ?? '?'}; guardado: ${prev})`;
        const jump =
          value !== null && prev
            ? Math.abs(value - prev) / Math.abs(prev)
            : 0;

        if (value === null) {
          log('INFO [LLM-Economy]', `Sin dato oficial -> ${detail}`);
        } else if (jump > SUSPICIOUS_CHANGE_RATIO) {
          log('WARN [LLM-Economy]', `Cambio grande, verificar -> ${detail}`);
        } else {
          log('INFO [LLM-Economy]', detail);
        }
      }

      return result;
    } catch (e: any) {
      attempt++;
      log('ERROR [LLM-Economy]', `Attempt ${attempt} failed: ${e.message}`);
      if (attempt >= maxRetries) {
        log(
          'WARN [LLM-Economy]',
          'Failed to fetch economy stats from the LLM after all retries. Returning nulls.',
        );
        return null; // El orquestador manejará el null y usará los valores previos 100%
      }
      const waitTime = 15000;
      await delay(waitTime);
    }
  }
  return null;
}
