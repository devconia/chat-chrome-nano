/**
 * session.js — Estado del chat multi-turno.
 * Gestiona la sesión activa, el historial de mensajes y los parámetros del modelo.
 * No sabe nada del DOM.
 */

import { createSession, destroySession, sendMultimodal } from './nano.js';

/** @type {{ temperature: number, topK: number, systemPrompt: string }} */
export const params = {
  temperature: 0.8,
  topK: 40,
  systemPrompt: '',
};

/** @type {Array<{ role: 'user'|'assistant', content: string, id: string }>} */
export let history = [];

/** @type {object|null} sesión activa de LanguageModel */
let activeSession = null;

/**
 * Adjunto pendiente para el próximo mensaje.
 * @type {{ file: File, blob: Blob, type: 'image'|'audio', previewUrl: string } | null}
 */
export let pendingAttachment = null;

/**
 * Establece el adjunto pendiente.
 * @param {File} file
 * @param {'image'|'audio'} type
 */
export async function setAttachment(file, type) {
  // Revocar URL anterior si existe
  if (pendingAttachment?.previewUrl) URL.revokeObjectURL(pendingAttachment.previewUrl);
  const buffer = await file.arrayBuffer();
  const blob = new Blob([buffer], { type: file.type });
  const previewUrl = URL.createObjectURL(blob);
  pendingAttachment = { file, blob, type, previewUrl };
}

/** Limpia el adjunto pendiente y revoca la URL de objeto. */
export function clearAttachment() {
  if (pendingAttachment?.previewUrl) URL.revokeObjectURL(pendingAttachment.previewUrl);
  pendingAttachment = null;
}

/** Genera un ID único para cada mensaje. */
function uid() {
  return Math.random().toString(36).slice(2, 9);
}

/**
 * Inicializa (o reinicia) la sesión de chat.
 * Destruye la sesión anterior si existe.
 */
export async function initSession() {
  destroySession(activeSession);
  activeSession = null;
  activeSession = await createSession(params);
  return activeSession;
}

/**
 * Devuelve la sesión activa, creándola si no existe.
 */
export async function getOrCreateSession() {
  if (!activeSession) {
    activeSession = await createSession(params);
  }
  return activeSession;
}

/**
 * Destruye la sesión activa y limpia el historial.
 */
export function resetSession() {
  destroySession(activeSession);
  activeSession = null;
  history = [];
}

/**
 * Agrega un mensaje al historial.
 * @param {'user'|'assistant'} role
 * @param {string} content
 * @returns {{ role: string, content: string, id: string }} el mensaje creado
 */
export function addMessage(role, content) {
  const msg = { role, content, id: uid() };
  history.push(msg);
  return msg;
}

/**
 * Actualiza el contenido de un mensaje existente por su id.
 * @param {string} id
 * @param {string} content
 */
export function updateMessage(id, content) {
  const msg = history.find(m => m.id === id);
  if (msg) msg.content = content;
}

/**
 * Devuelve info de tokens de la sesión activa.
 * @returns {{ tokensSoFar: number|null, maxTokens: number|null }}
 */
export function getTokenInfo() {
  if (!activeSession) return { tokensSoFar: null, maxTokens: null };
  return {
    tokensSoFar: activeSession.tokensSoFar ?? null,
    maxTokens: activeSession.maxTokens ?? null,
  };
}

/**
 * Envía un mensaje con streaming.
 *
 * La API de Chrome entrega deltas (solo el texto nuevo por chunk),
 * así que acumulamos manualmente y pasamos el texto completo al callback.
 *
 * @param {string} text
 * @param {function(string): void} onChunk — callback con el texto acumulado hasta ese momento
 * @returns {Promise<string>} texto final completo
 */
export async function sendMessage(text, onChunk) {
  const session = await getOrCreateSession();
  const stream = session.promptStreaming(text);
  let accumulated = '';
  for await (const chunk of stream) {
    accumulated += chunk;   // chunk es delta, sumamos
    onChunk(accumulated);
  }
  return accumulated;
}

/**
 * Envía un mensaje multimodal (imagen o audio) con streaming.
 * Usa el adjunto pendiente y lo limpia al terminar.
 *
 * @param {string} text — pregunta del usuario (puede estar vacía)
 * @param {function(string): void} onChunk
 * @returns {Promise<string>} texto final
 */
export async function sendMultimodalMessage(text, onChunk) {
  if (!pendingAttachment) throw new Error('No hay adjunto pendiente.');
  const { blob, type } = pendingAttachment;
  clearAttachment();
  return sendMultimodal(blob, type, text, params, onChunk);
}
