import { NotFoundException } from '@nestjs/common';

export type Capability = 'SCRIPT' | 'IMAGE';

export type RequestFormat =
  | 'claude_messages'
  | 'openai_chat'
  | 'gemini_image'
  | 'openai_image'
  | 'pexels_photo';

export interface ProviderEntry {
  provider: string;
  capability: Capability;
  models: string[];
  baseUrl: string;           // may contain {model} placeholder
  auth: {
    mode: 'header' | 'query';
    name: string;            // header name or query param name
    valueTemplate: string;   // '{key}' or 'Bearer {key}'
  };
  extraHeaders?: Record<string, string>;
  requestFormat: RequestFormat;
  responseExtract: string;   // dot-path hint used by n8n Code nodes
}

// Registry covers only HTTP providers called by n8n workflow nodes.
// Veo3 is SDK-based (google-genai in python_worker) — not included here.
// Edge TTS is a local library — not included here.
// Add entries only when a provider is actually used (CLAUDE.md: no speculative abstractions).
const PROVIDER_REGISTRY: ProviderEntry[] = [
  // ── Anthropic Claude — SCRIPT ──────────────────────────────────────────────
  {
    provider: 'anthropic',
    capability: 'SCRIPT',
    models: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
    baseUrl: 'https://api.anthropic.com/v1/messages',
    auth: {
      mode: 'header',
      name: 'x-api-key',
      valueTemplate: '{key}',
    },
    extraHeaders: {
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    requestFormat: 'claude_messages',
    responseExtract: 'content[0].text',
  },

  // ── Google Gemini — SCRIPT (via OpenAI-compatible endpoint) ────────────────
  {
    provider: 'google',
    capability: 'SCRIPT',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    auth: {
      mode: 'header',
      name: 'Authorization',
      valueTemplate: 'Bearer {key}',
    },
    requestFormat: 'openai_chat',
    responseExtract: 'choices[0].message.content',
  },

  // ── OpenAI — SCRIPT ────────────────────────────────────────────────────────
  {
    provider: 'openai',
    capability: 'SCRIPT',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1', 'gpt-5'],
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    auth: {
      mode: 'header',
      name: 'Authorization',
      valueTemplate: 'Bearer {key}',
    },
    requestFormat: 'openai_chat',
    responseExtract: 'choices[0].message.content',
  },

  // ── Google Gemini — IMAGE (Nano Banana, native generateContent endpoint) ───
  {
    provider: 'google',
    capability: 'IMAGE',
    models: ['gemini-2.5-flash-image', 'gemini-3.1-flash-image'],
    // {model} is replaced at runtime by resolveProviderUrl()
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
    auth: {
      mode: 'query',
      name: 'key',
      valueTemplate: '{key}',
    },
    requestFormat: 'gemini_image',
    responseExtract: 'candidates[0].content.parts',
  },

  // ── OpenAI — IMAGE ─────────────────────────────────────────────────────────
  {
    provider: 'openai',
    capability: 'IMAGE',
    models: ['gpt-image-2', 'gpt-image-1'],
    baseUrl: 'https://api.openai.com/v1/images/generations',
    auth: {
      mode: 'header',
      name: 'Authorization',
      valueTemplate: 'Bearer {key}',
    },
    requestFormat: 'openai_image',
    responseExtract: 'data[0].b64_json',
  },

  // ── Pexels stock photos — IMAGE ───────────────────────────────────────────
  {
    provider: 'pexels',
    capability: 'IMAGE',
    models: ['pexels-stock'],
    baseUrl: 'https://api.pexels.com/v1/search',
    auth: {
      mode: 'header',
      name: 'Authorization',
      valueTemplate: '{key}',
    },
    requestFormat: 'pexels_photo',
    responseExtract: 'photos[0].src',
  },

  // ── Gemini session (Pro/Ultra via browser cookies) — SCRIPT ───────────────
  // No API key: the python_worker drives the logged-in web session with stored
  // cookies. n8n calls the worker, which returns an OpenAI-shaped response.
  {
    provider: 'gemini_session',
    capability: 'SCRIPT',
    models: ['gemini-veo', 'gemini-2.5-pro', 'gemini-2.5-flash'],
    baseUrl: 'http://python_worker:8000/api/v1/gemini-session/chat',
    auth: { mode: 'header', name: 'x-session', valueTemplate: '{key}' },
    requestFormat: 'openai_chat',
    responseExtract: 'choices[0].message.content',
  },

  // ── Gemini session — IMAGE ─────────────────────────────────────────────────
  {
    provider: 'gemini_session',
    capability: 'IMAGE',
    models: ['gemini-veo', 'gemini-2.5-flash-image'],
    baseUrl: 'http://python_worker:8000/api/v1/gemini-session/image',
    auth: { mode: 'header', name: 'x-session', valueTemplate: '{key}' },
    requestFormat: 'gemini_image',
    responseExtract: 'candidates[0].content.parts',
  },
];

/**
 * Lookup a provider entry by (provider, capability, optional model).
 *
 * Throws NotFoundException if no matching entry — intentional fail-fast so
 * misconfigured projects surface immediately rather than silently using a
 * wrong provider.
 */
export function getProviderConfig(
  provider: string,
  capability: Capability,
  model?: string,
): ProviderEntry {
  const entry = PROVIDER_REGISTRY.find(
    (e) => e.provider === provider && e.capability === capability,
  );

  if (!entry) {
    throw new NotFoundException(
      `No provider registry entry for provider="${provider}" capability="${capability}". ` +
        `Available: ${PROVIDER_REGISTRY.map((e) => `${e.provider}/${e.capability}`).join(', ')}`,
    );
  }

  if (model && !entry.models.includes(model)) {
    throw new NotFoundException(
      `Model "${model}" not listed for provider="${provider}" capability="${capability}". ` +
        `Supported: ${entry.models.join(', ')}`,
    );
  }

  return entry;
}

/**
 * Resolve the final baseUrl by substituting {model} placeholder.
 * Returns baseUrl unchanged if no placeholder present.
 */
export function resolveProviderUrl(entry: ProviderEntry, model: string): string {
  return entry.baseUrl.replace('{model}', model);
}

/**
 * Build the auth value for a given entry + key.
 * Used by source.service when constructing the providers payload for n8n.
 */
export function buildAuthValue(entry: ProviderEntry, key: string): string {
  return entry.auth.valueTemplate.replace('{key}', key);
}
