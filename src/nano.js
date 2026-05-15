/**
 * nano.js — Wrapper de la Chrome Built-in AI (window.LanguageModel).
 * Todo lo que toca la API del navegador vive aquí.
 * Si Chrome cambia la API, solo tocas este archivo.
 */

/** Devuelve el objeto API o null si no existe. */
export function getAPI() {
  return window.LanguageModel ?? window.ai?.languageModel ?? null;
}

/**
 * Verifica disponibilidad del modelo.
 * @returns {'available'|'downloadable'|'unavailable'|'error'} estado normalizado
 */
export async function checkAvailability() {
  const api = getAPI();
  if (!api) return 'unavailable';
  try {
    const status = await api.availability();
    if (status === 'available' || status === 'readily') return 'available';
    if (status === 'downloadable' || status === 'after-download') return 'downloadable';
    return 'unavailable';
  } catch (e) {
    return 'error';
  }
}

/**
 * Crea una nueva sesión de LanguageModel.
 * @param {{ temperature: number, topK: number, systemPrompt?: string }} opts
 * @returns {Promise<object>} sesión activa
 */
export async function createSession({ temperature = 0.8, topK = 40, systemPrompt = '' } = {}) {
  const api = getAPI();
  if (!api) throw new Error('LanguageModel API no disponible en este navegador.');
  const opts = { temperature, topK };
  if (systemPrompt) opts.systemPrompt = systemPrompt;
  return api.create(opts);
}

/**
 * Destruye una sesión de forma segura.
 * @param {object|null} session
 */
export function destroySession(session) {
  if (!session) return;
  try { session.destroy(); } catch (_) { /* ignorar */ }
}

/**
 * Obtiene información del modelo creando una sesión temporal.
 * @param {{ temperature: number, topK: number }} params
 * @returns {Promise<object>} objeto con maxTokens, tokensSoFar, tokensLeft, status
 */
export async function getModelInfo(params) {
  const api = getAPI();
  if (!api) throw new Error('API no disponible');
  const status = await api.availability();
  const s = await createSession(params);
  const info = {
    status,
    maxTokens: s.maxTokens ?? null,
    tokensSoFar: s.tokensSoFar ?? 0,
    tokensLeft: s.tokensLeft ?? null,
  };
  destroySession(s);
  return info;
}

/**
 * Envía un prompt multimodal (imagen o audio + texto) con streaming.
 * Crea una sesión one-shot porque la API multimodal no soporta historial con blobs.
 *
 * Formato correcto según la spec W3C (abril 2026):
 *   LanguageModelMessageContent = { type, value }   ← "value", NO "content"
 *   La sesión debe declarar expectedInputs para tipos no-texto.
 *
 * @param {Blob} blob
 * @param {'image'|'audio'} mediaType
 * @param {string} text
 * @param {{ temperature: number, topK: number, systemPrompt?: string }} sessionParams
 * @param {function(string): void} onChunk
 * @returns {Promise<string>}
 */
export async function sendMultimodal(blob, mediaType, text, sessionParams, onChunk) {
  const api = getAPI();
  if (!api) throw new Error('LanguageModel API no disponible.');

  const opts = {
    temperature: sessionParams.temperature,
    topK: sessionParams.topK,
    // Declarar el tipo de entrada esperado para que Chrome cargue el módulo multimodal
    expectedInputs: [{ type: mediaType }],
  };
  if (sessionParams.systemPrompt) opts.systemPrompt = sessionParams.systemPrompt;

  const session = await api.create(opts);
  try {
    const message = {
      role: 'user',
      content: [
        { type: mediaType, value: blob },           // ← "value", no "content"
        { type: 'text',    value: text || defaultPrompt(mediaType) },
      ],
    };

    const stream = session.promptStreaming([message]);
    let accumulated = '';
    for await (const chunk of stream) {
      accumulated += chunk;
      onChunk(accumulated);
    }
    return accumulated;
  } finally {
    destroySession(session);
  }
}

/** Prompt por defecto según el tipo de media. */
function defaultPrompt(mediaType) {
  if (mediaType === 'image') return 'Describe detalladamente el contenido de esta imagen. Si hay texto, extráelo completo.';
  if (mediaType === 'audio') return 'Transcribe el audio completo. Si no hay voz, describe los sonidos.';
  return 'Analiza este contenido.';
}
