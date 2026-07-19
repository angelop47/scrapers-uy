import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

export interface MinimaxMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface MinimaxRequestOptions {
  temperature?: number;
  jsonMode?: boolean;
  maxTokens?: number;
}

export interface MinimaxClientConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/**
 * Cliente ligero para invocar Minimax M3 sobre un endpoint
 * chat-completions compatible con OpenAI.
 *
 * Variables de entorno:
 *   MINIMAX_TOKEN     → API key (obligatoria).
 *   MINIMAX_API_URL   → Base URL sin slash final. Default:
 *                       https://api.minimaxi.chat/v1
 *   MINIMAX_MODEL     → Nombre del modelo. Default: MiniMax-M3
 */
const DEFAULT_BASE_URL = 'https://api.minimaxi.chat/v1';
const DEFAULT_MODEL = 'MiniMax-M3';

export function getMinimaxConfig(): MinimaxClientConfig {
  return {
    apiKey: process.env.MINIMAX_TOKEN || '',
    baseUrl: (process.env.MINIMAX_API_URL || DEFAULT_BASE_URL).replace(
      /\/$/,
      '',
    ),
    model: process.env.MINIMAX_MODEL || DEFAULT_MODEL,
  };
}

export async function callMinimax(
  messages: MinimaxMessage[],
  options: MinimaxRequestOptions = {},
): Promise<string> {
  const { apiKey, baseUrl, model } = getMinimaxConfig();

  if (!apiKey) {
    throw new Error('MINIMAX_TOKEN is not set in environment variables');
  }

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: options.temperature ?? 0.2,
  };

  if (options.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  if (options.maxTokens) {
    body.max_tokens = options.maxTokens;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Minimax API error ${response.status}: ${errorText.slice(0, 500)}`,
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  let content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Minimax returned an empty response');
  }

  // MiniMax M3 prepende dos tipos de "ruido" que rompe el parseo:
  //   1. <think>...</think>: chain-of-thought estilo DeepSeek R1.
  //   2. <]minimax[>[<]tool_call>{...}</tool_call>: el modelo intenta
  //      llamar tools que no le dimos (web_search, etc.) y emite los
  //      artefactos en su respuesta.
  // También limpiamos zero-width chars y wrappers markdown para JSON-mode.
  // Importante: tolerar whitespace antes del ``` (después de strippear
  // think blocks suele quedar un \n inicial).
  let raw = content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?\]?minimax\[?>/gi, '')
    .replace(/<\/?\]?tool_call\[?>/gi, '')
    .replace(/<\/?\]?tool_response\[?>/gi, '')
    .replace(/\{"name":\s*"[^"]+",\s*"arguments":\s*\{[^}]*\}\s*\}/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/^\s*```json\s*/i, '')
    .replace(/^\s*```\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  // Si el modelo appenda texto extra después del JSON (ej. notas, fuentes
  // o markdown residual), extraemos el primer objeto/array JSON válido
  // respetando strings y nesting.
  content = extractFirstJson(raw) ?? raw;

  // Defensa contra meta-conversación pura. Cuando el prompt pide "buscar en
  // Google" pero no hay tools disponibles, MiniMax M3 a veces arranca con
  // "I'll search..." / "Let me look..." en vez de dar una respuesta. Eso
  // rompe JSON.parse en los scrapers. Lanzamos para forzar reintento.
  if (/^(?:I'll|Let me|I (?:need|should))\s+(?:search|research|look|find|check)/i.test(content)) {
    throw new Error(
      'Minimax returned search meta-conversation instead of a real answer (no tool available, retry triggered)',
    );
  }

  return content;
}

/**
 * Extrae el primer objeto o array JSON válido de un string, respetando
 * strings con comillas escapadas y anidamiento. Si no encuentra ninguno
 * devuelve null.
 */
function extractFirstJson(text: string): string | null {
  const firstOpen = text.search(/[\[{]/);
  if (firstOpen === -1) return null;

  const openChar = text[firstOpen];
  const closeChar = openChar === '[' ? ']' : '}';
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = firstOpen; i < text.length; i++) {
    const c = text[i];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (c === '\\') {
        escape = true;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }

    if (c === '"') {
      inString = true;
    } else if (c === openChar) {
      depth++;
    } else if (c === closeChar) {
      depth--;
      if (depth === 0) {
        return text.substring(firstOpen, i + 1);
      }
    }
  }

  return null;
}
