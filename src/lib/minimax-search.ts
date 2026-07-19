import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  date?: string;
}

export interface SearchResponse {
  organic: SearchResult[];
  related_searches?: Array<{ query: string }>;
  base_resp?: { status_code: number; status_msg: string };
}

/**
 * Cliente de búsqueda web para MiniMax Coding Plan.
 *
 * Endpoint: POST /v1/coding_plan/search
 * Body:     { "q": "<query>" }
 * Auth:     Bearer ${MINIMAX_TOKEN} (misma key que el chat)
 *
 * Variables de entorno:
 *   MINIMAX_TOKEN      → API key (obligatoria).
 *   MINIMAX_API_URL    → Base del chat (usada como default para search).
 *                        Default: https://api.minimaxi.chat/v1
 *   MINIMAX_SEARCH_URL → Override del endpoint COMPLETO de search.
 *                        Default: ${MINIMAX_API_URL}/coding_plan/search
 *
 * Para mejores resultados la query debería tener 3-5 palabras clave
 * e incluir el año actual para temas time-sensitive.
 */
const DEFAULT_SEARCH_PATH = '/coding_plan/search';

export async function searchMinimax(
  query: string,
  maxResults: number = 5,
): Promise<SearchResult[]> {
  const apiKey = process.env.MINIMAX_TOKEN || '';

  if (!apiKey) {
    throw new Error('MINIMAX_TOKEN is not set in environment variables');
  }

  if (!query || !query.trim()) {
    throw new Error('Search query is required');
  }

  // Si el usuario define MINIMAX_SEARCH_URL lo usamos tal cual (URL completa).
  // Si no, construimos a partir del host del chat + path estándar.
  const searchUrl =
    process.env.MINIMAX_SEARCH_URL ||
    `${(process.env.MINIMAX_API_URL || 'https://api.minimaxi.chat/v1').replace(/\/$/, '')}${DEFAULT_SEARCH_PATH}`;

  const response = await fetch(searchUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ q: query.trim() }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Minimax search API error ${response.status}: ${errorText.slice(0, 500)}`,
    );
  }

  const data = (await response.json()) as SearchResponse;

  if (data.base_resp && data.base_resp.status_code !== 0) {
    throw new Error(
      `Minimax search returned non-zero status: ${data.base_resp.status_code} ${data.base_resp.status_msg}`,
    );
  }

  const results = data.organic || [];
  return results.slice(0, maxResults);
}

/**
 * Helper que toma varios queries, hace las búsquedas en paralelo y devuelve
 * un string formateado listo para inyectar como contexto al modelo.
 * Si una búsqueda falla, seguimos con las que funcionaron.
 */
export async function buildSearchContext(
  queries: string[],
  maxResultsPerQuery: number = 4,
): Promise<string> {
  const settled = await Promise.allSettled(
    queries.map((q) => searchMinimax(q, maxResultsPerQuery)),
  );

  const blocks: string[] = [];
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    const res = settled[i];
    if (res.status === 'rejected') {
      blocks.push(`[Búsqueda "${q}" falló: ${res.reason?.message ?? 'error desconocido'}]`);
      continue;
    }
    const results = res.value;
    if (results.length === 0) {
      blocks.push(`[Búsqueda "${q}": sin resultados]`);
      continue;
    }
    blocks.push(
      `Resultados de búsqueda para "${q}":\n` +
        results
          .map(
            (r, idx) =>
              `${idx + 1}. ${r.title}\n   ${r.snippet}${r.date ? ` (${r.date})` : ''}\n   Fuente: ${r.link}`,
          )
          .join('\n'),
    );
  }

  return blocks.join('\n\n');
}
