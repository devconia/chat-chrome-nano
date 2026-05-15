/**
 * main.js — Punto de entrada.
 * Importa los tres módulos y los conecta entre sí.
 */

import { checkAvailability } from './nano.js';
import {
  params,
  history,
  resetSession,
  addMessage,
  updateMessage,
  sendMessage,
  sendMultimodalMessage,
  getTokenInfo,
  pendingAttachment,
  setAttachment,
  clearAttachment,
} from './session.js';
import {
  setStatus,
  renderConversationList,
  renderMessages,
  appendMessageElement,
  appendUserMessageWithAttachment,
  updateMessageElement,
  setGenerating,
  clearInput,
  updateTokenInfo,
  syncSettingsUI,
  bindEvents,
  showAttachmentPreview,
  clearAttachmentPreview,
  setRecordingState,
  showInterimTranscript,
  showVoiceBubble,
  hideVoiceBubble,
} from './ui.js';

// ─── Web Speech API ───────────────────────────────────────────────────────────

/** @type {SpeechRecognition|null} */
let recognition = null;
let isRecording = false;
let finalTranscript = '';  // texto confirmado acumulado en esta sesión de grabación
let voiceMessage = false;  // flag para marcar el próximo mensaje como de voz

function initSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;

  const r = new SR();
  r.continuous = true;       // no para al detectar silencio
  r.interimResults = true;   // resultados parciales en tiempo real
  r.lang = 'es-ES';          // idioma por defecto; se puede cambiar en settings

  r.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) {
        finalTranscript += t;
      } else {
        interim += t;
      }
    }
    // Actualizar el textarea con el texto final + interim visual
    showInterimTranscript(interim, finalTranscript);
  };

  r.onerror = e => {
    console.warn('SpeechRecognition error:', e.error);
    if (e.error === 'not-allowed') {
      setStatus('err', 'Micrófono bloqueado — permite el acceso en el navegador');
    }
    stopRecording();
  };

  r.onend = () => {
    // Si aún está marcado como grabando (paró solo por silencio), reiniciar
    if (isRecording) {
      try { r.start(); } catch (_) { stopRecording(); }
    }
  };

  return r;
}

function startRecording() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    setStatus('err', 'Web Speech API no disponible en este navegador');
    return;
  }

  // Si hay un bubble anterior visible, lo cerramos y empezamos limpio
  hideVoiceBubble();

  finalTranscript = '';
  voiceMessage = true;

  recognition = initSpeechRecognition();
  if (!recognition) return;

  // Mostrar el bubble en modo "grabando" antes de que llegue el primer resultado
  showVoiceBubble('', null, null, null, true); // modo live: sin acciones todavía

  try {
    recognition.start();
    isRecording = true;
    setRecordingState(true);
  } catch (e) {
    console.warn('No se pudo iniciar grabación:', e);
    hideVoiceBubble();
  }
}

function stopRecording() {
  isRecording = false;
  setRecordingState(false);

  if (recognition) {
    try { recognition.stop(); } catch (_) {}
    recognition = null;
  }

  const text = finalTranscript.trim();

  if (!text) {
    // Nada transcrito — cerrar el bubble y listo
    hideVoiceBubble();
    return;
  }

  // Actualizar el bubble al modo "finalizado" con las acciones
  showVoiceBubble(
    text,
    // Editar → mueve el texto al textarea
    (t) => {
      const input = document.getElementById('chatInput');
      input.value = t;
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 200) + 'px';
      input.focus();
      voiceMessage = false;
    },
    // Enviar directo
    (t) => {
      voiceMessage = true;
      handleSendVoice(t);
    },
    // Descartar
    () => {
      voiceMessage = false;
    },
  );
}

function handleVoiceToggle() {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

// ─── Estado de conversaciones ─────────────────────────────────────────────────

/** @type {Array<{ id: string, title: string, messages: Array }>} */
let conversations = [];
let activeConvId = null;
let stopRequested = false;

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function createConversation() {
  const id = uid();
  const conv = { id, title: 'Nueva conversación', messages: [] };
  conversations.unshift(conv);
  return conv;
}

function getActiveConv() {
  return conversations.find(c => c.id === activeConvId) ?? null;
}

function saveCurrentHistory() {
  const conv = getActiveConv();
  if (conv) conv.messages = [...history];
}

function renderSidebar() {
  renderConversationList(
    conversations.map(c => ({ ...c, active: c.id === activeConvId })),
    selectConversation,
    deleteConversation,
  );
}

function selectConversation(id) {
  saveCurrentHistory();
  activeConvId = id;
  const conv = getActiveConv();
  if (!conv) return;

  // Restaurar historial en session.js
  resetSession();
  conv.messages.forEach(m => addMessage(m.role, m.content));

  renderMessages(history);
  renderSidebar();
}

function deleteConversation(id) {
  conversations = conversations.filter(c => c.id !== id);
  if (activeConvId === id) {
    startNewChat();
  } else {
    renderSidebar();
  }
}

// ─── Nueva conversación ───────────────────────────────────────────────────────

function startNewChat() {
  saveCurrentHistory();
  resetSession();
  const conv = createConversation();
  activeConvId = conv.id;
  renderMessages([]);
  renderSidebar();
  updateTokenInfo({ tokensSoFar: null, maxTokens: null });
}

// ─── Enviar mensaje ───────────────────────────────────────────────────────────

async function handleSend() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  const hasAttachment = !!pendingAttachment;

  // Si está grabando, detener primero y usar ese texto
  if (isRecording) stopRecording();

  // Necesita texto O adjunto
  if (!text && !hasAttachment) return;

  // Capturar si fue mensaje de voz y resetear el flag
  const wasVoice = voiceMessage;
  voiceMessage = false;

  clearInput();

  // Snapshot del adjunto
  const attachment = pendingAttachment
    ? { type: pendingAttachment.type, previewUrl: pendingAttachment.previewUrl, file: pendingAttachment.file }
    : null;

  clearAttachmentPreview();

  // Título de la conversación
  const conv = getActiveConv();
  const label = text || '🖼️ Imagen';
  if (conv && conv.messages.length === 0) {
    conv.title = label.slice(0, 40) + (label.length > 40 ? '…' : '');
    renderSidebar();
  }

  // Bubble del usuario
  const userMsg = addMessage('user', text);
  if (attachment) {
    appendUserMessageWithAttachment(attachment.type, attachment.previewUrl, attachment.file.name, text, userMsg.id);
  } else {
    appendMessageElement('user', text, userMsg.id, { voice: wasVoice });
  }

  // Placeholder del asistente
  const assistantMsg = addMessage('assistant', '');
  appendMessageElement('assistant', '', assistantMsg.id);

  setGenerating(true);
  stopRequested = false;

  try {
    const sender = hasAttachment ? sendMultimodalMessage : sendMessage;

    await sender(text, chunk => {
      if (stopRequested) return;
      updateMessage(assistantMsg.id, chunk);
      updateMessageElement(assistantMsg.id, chunk, true);
    });

    updateMessageElement(assistantMsg.id, assistantMsg.content, false);
    updateTokenInfo(getTokenInfo());
  } catch (e) {
    const errText = 'Error: ' + e.message;
    updateMessage(assistantMsg.id, errText);
    updateMessageElement(assistantMsg.id, errText, false);
  } finally {
    setGenerating(false);
    saveCurrentHistory();
  }
}

function handleStop() {
  stopRequested = true;
  setGenerating(false);
}

// ─── Envío directo desde bubble de voz ───────────────────────────────────────

async function handleSendVoice(text) {
  if (!text) return;

  const conv = getActiveConv();
  if (conv && conv.messages.length === 0) {
    conv.title = text.slice(0, 40) + (text.length > 40 ? '…' : '');
    renderSidebar();
  }

  const userMsg = addMessage('user', text);
  appendMessageElement('user', text, userMsg.id, { voice: true });

  const assistantMsg = addMessage('assistant', '');
  appendMessageElement('assistant', '', assistantMsg.id);

  setGenerating(true);
  stopRequested = false;
  voiceMessage = false;

  try {
    await sendMessage(text, chunk => {
      if (stopRequested) return;
      updateMessage(assistantMsg.id, chunk);
      updateMessageElement(assistantMsg.id, chunk, true);
    });
    updateMessageElement(assistantMsg.id, assistantMsg.content, false);
    updateTokenInfo(getTokenInfo());
  } catch (e) {
    const errText = 'Error: ' + e.message;
    updateMessage(assistantMsg.id, errText);
    updateMessageElement(assistantMsg.id, errText, false);
  } finally {
    setGenerating(false);
    saveCurrentHistory();
  }
}

// ─── Adjuntos ─────────────────────────────────────────────────────────────────

async function handleImageAttach(file) {
  await setAttachment(file, 'image');
  showAttachmentPreview(
    { type: 'image', previewUrl: pendingAttachment.previewUrl, file: pendingAttachment.file },
    handleAttachRemove,
  );
}

function handleAttachRemove() {
  clearAttachment();
  clearAttachmentPreview();
}

// ─── Sugerencias ──────────────────────────────────────────────────────────────

function handleSuggestion(prompt) {
  const input = document.getElementById('chatInput');
  input.value = prompt;
  handleSend();
}

// ─── Copiar mensaje ───────────────────────────────────────────────────────────

async function handleCopy(id) {
  const msg = history.find(m => m.id === id);
  if (!msg) return;
  try {
    await navigator.clipboard.writeText(msg.content);
    // Feedback visual breve
    const btn = document.querySelector(`.copy-btn[data-id="${id}"]`);
    if (btn) {
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>`;
      setTimeout(() => {
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/></svg>`;
      }, 1500);
    }
  } catch (_) { /* clipboard no disponible */ }
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function handleSettingsSave({ temperature, topK, systemPrompt }) {
  params.temperature = temperature;
  params.topK = topK;
  params.systemPrompt = systemPrompt;
  // La próxima sesión usará los nuevos params automáticamente
  // (session.js crea sesión lazy con getOrCreateSession)
  resetSession();
  // Restaurar historial actual
  const conv = getActiveConv();
  if (conv) conv.messages.forEach(m => addMessage(m.role, m.content));
}

// ─── Disponibilidad ───────────────────────────────────────────────────────────

async function verifyAvailability() {
  setStatus('spin', 'Verificando Gemini Nano...');
  const result = await checkAvailability();
  if (result === 'available') {
    setStatus('ok', 'Gemini Nano listo ✓');
  } else if (result === 'downloadable') {
    setStatus('spin', 'Descargando modelo... puede tardar unos minutos.');
  } else if (result === 'unavailable') {
    setStatus('err', 'No disponible — activa los flags en chrome://flags');
  } else {
    setStatus('err', 'Error al verificar. ¿Estás en Chrome con los flags activados?');
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init() {
  // Crear primera conversación
  const conv = createConversation();
  activeConvId = conv.id;
  renderSidebar();
  renderMessages([]);
  syncSettingsUI(params);

  // Conectar eventos
  bindEvents({
    onSend: handleSend,
    onStop: handleStop,
    onNewChat: startNewChat,
    onRetryAvailability: verifyAvailability,
    onSuggestionClick: handleSuggestion,
    onCopyMessage: handleCopy,
    onSettingsSave: handleSettingsSave,
    onImageAttach: handleImageAttach,
    onVoiceToggle: handleVoiceToggle,
  });

  // Verificar disponibilidad al arrancar
  verifyAvailability();
}

init();
