import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequestOptions {
  temperature?: number;
  jsonMode?: boolean;
  maxTokens?: number;
  /** Activa el plugin `web` de OpenRouter (búsqueda nativa del proveedor). */
  webSearch?: boolean;
}

/**
 * Único punto de acceso al LLM de los scrapers. Habla con cualquier endpoint
 * chat-completions compatible con OpenAI (por defecto OpenRouter), así que
 * cambiar de modelo es cambiar una variable de entorno, sin tocar código.
 *
 * Variables de entorno:
 *   LLM_API_KEY  → API key (obligatoria).
 *   LLM_MODEL    → Slug del modelo. Default: anthropic/claude-haiku-5.5
 *   LLM_API_URL  → Base URL sin slash final. Default:
 *                  https://openrouter.ai/api/v1
 *
 * `webSearch` usa el plugin `web` de OpenRouter; con otro endpoint se ignora.
 */
const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'anthropic/claude-haiku-5.5';
const WEB_SEARCH_MAX_RESULTS = 5;

export function getLLMModel(): string {
  return process.env.LLM_MODEL || DEFAULT_MODEL;
}

export async function callLLM(
  messages: LLMMessage[],
  options: LLMRequestOptions = {},
): Promise<string> {
  const apiKey = process.env.LLM_API_KEY || '';
  const baseUrl = (process.env.LLM_API_URL || DEFAULT_BASE_URL).replace(
    /\/$/,
    '',
  );

  if (!apiKey) {
    throw new Error('LLM_API_KEY is not set in environment variables');
  }

  const body: Record<string, unknown> = {
    model: getLLMModel(),
    messages,
    temperature: options.temperature ?? 0.2,
  };

  if (options.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  if (options.maxTokens) {
    body.max_tokens = options.maxTokens;
  }

  if (options.webSearch) {
    body.plugins = [{ id: 'web', max_results: WEB_SEARCH_MAX_RESULTS }];
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
      `OpenRouter API error ${response.status}: ${errorText.slice(0, 500)}`,
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('OpenRouter returned an empty response');
  }

  // Limpiamos zero-width chars y bloques <think> por si el modelo configurado
  // expone su razonamiento en el contenido.
  const cleaned = content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/[​-‍﻿]/g, '')
    .trim();

  if (!options.jsonMode) {
    return cleaned;
  }

  // En modo JSON quitamos wrappers markdown y, si el modelo appenda texto
  // extra después del JSON (notas, fuentes), extraemos el primer
  // objeto/array válido respetando strings y nesting.
  const unwrapped = cleaned
    .replace(/^\s*```json\s*/i, '')
    .replace(/^\s*```\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  return extractFirstJson(unwrapped) ?? unwrapped;
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
