/**
 * ui.js — Capa de presentación.
 * Maneja el DOM, los event listeners y la actualización de la pantalla.
 * No sabe nada de Gemini. Recibe funciones y las conecta al DOM.
 */

// ─── Refs ────────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

// ─── Estado de UI ────────────────────────────────────────────────────────────

let isGenerating = false;
let isRecording = false;

// ─── Status bar ──────────────────────────────────────────────────────────────

export function setStatus(state, msg) {
  $('statusDot').className = 'status-dot ' + state;
  $('statusText').textContent = msg;
}

// ─── Sidebar / Conversaciones ─────────────────────────────────────────────────

export function renderConversationList(conversations, onSelect, onDelete) {
  const list = $('convList');
  list.innerHTML = '';
  conversations.forEach(conv => {
    const item = document.createElement('div');
    item.className = 'conv-item' + (conv.active ? ' active' : '');
    item.dataset.id = conv.id;
    item.innerHTML = `
      <svg class="conv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"/>
      </svg>
      <span class="conv-title">${escapeHtml(conv.title)}</span>
      <button class="conv-delete" data-id="${conv.id}" title="Eliminar" aria-label="Eliminar conversación">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/>
        </svg>
      </button>
    `;
    item.addEventListener('click', e => {
      if (e.target.closest('.conv-delete')) {
        e.stopPropagation();
        onDelete(conv.id);
      } else {
        onSelect(conv.id);
      }
    });
    list.appendChild(item);
  });
}

// ─── Mensajes ─────────────────────────────────────────────────────────────────

export function renderMessages(messages) {
  const container = $('messages');
  container.innerHTML = '';
  if (messages.length === 0) {
    renderWelcome();
    return;
  }
  messages.forEach(msg => appendMessageElement(msg.role, msg.content, msg.id));
  scrollToBottom();
}

function renderWelcome() {
  const container = $('messages');
  container.innerHTML = `
    <div class="welcome">
      <div class="welcome-logo">
        <svg viewBox="0 0 41 41" fill="none" xmlns="http://www.w3.org/2000/svg" width="40" height="40">
          <path d="M21.5 0C10.178 0 1 9.178 1 20.5S10.178 41 21.5 41 42 31.822 42 20.5 32.822 0 21.5 0Z" fill="currentColor" opacity="0.15"/>
          <path d="M21.5 8a12.5 12.5 0 1 0 0 25 12.5 12.5 0 0 0 0-25Zm0 4a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17Z" fill="currentColor" opacity="0.6"/>
          <circle cx="21.5" cy="20.5" r="4" fill="currentColor"/>
        </svg>
      </div>
      <h1 class="welcome-title">Gemini Nano</h1>
      <p class="welcome-sub">IA local en tu navegador · Sin internet · Sin servidores</p>
      <div class="welcome-suggestions">
        <button class="suggestion-chip" data-prompt="Explícame qué es la inteligencia artificial en términos simples">¿Qué es la IA?</button>
        <button class="suggestion-chip" data-prompt="Escribe un poema corto sobre el amanecer">Escribe un poema</button>
        <button class="suggestion-chip" data-prompt="Dame 5 ideas creativas para un proyecto de programación">Ideas de proyectos</button>
        <button class="suggestion-chip" data-prompt="¿Cuáles son las mejores prácticas para escribir código limpio?">Código limpio</button>
      </div>
    </div>
  `;
}

/**
 * @param {'user'|'assistant'} role
 * @param {string} content
 * @param {string} id
 * @param {{ voice?: boolean }} opts
 */
export function appendMessageElement(role, content, id, opts = {}) {
  const container = $('messages');
  const welcome = container.querySelector('.welcome');
  if (welcome) welcome.remove();

  const wrapper = document.createElement('div');
  wrapper.className = `message-wrapper ${role}`;
  wrapper.dataset.id = id;

  if (role === 'assistant') {
    wrapper.innerHTML = `
      <div class="msg-avatar assistant-avatar" aria-hidden="true">
        <svg viewBox="0 0 41 41" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18">
          <path d="M21.5 0C10.178 0 1 9.178 1 20.5S10.178 41 21.5 41 42 31.822 42 20.5 32.822 0 21.5 0Z" fill="currentColor" opacity="0.4"/>
          <circle cx="21.5" cy="20.5" r="6" fill="currentColor"/>
        </svg>
      </div>
      <div class="msg-body">
        <div class="msg-content assistant" id="msg-${id}">${formatContent(content)}</div>
        <div class="msg-actions">
          <button class="msg-action-btn copy-btn" data-id="${id}" title="Copiar" aria-label="Copiar respuesta">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  } else {
    const voiceBadge = opts.voice
      ? `<span class="voice-badge" title="Mensaje de voz" aria-label="Mensaje de voz">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="11" height="11">
             <path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"/>
           </svg>
         </span>`
      : '';
    wrapper.innerHTML = `
      <div class="msg-body user-body">
        <div class="msg-content user" id="msg-${id}">${voiceBadge}${escapeHtml(content)}</div>
      </div>
    `;
  }

  container.appendChild(wrapper);
  scrollToBottom();
  return document.getElementById(`msg-${id}`);
}

export function updateMessageElement(id, content, streaming = false) {
  const el = document.getElementById(`msg-${id}`);
  if (!el) return;
  el.innerHTML = formatContent(content) + (streaming ? '<span class="cursor" aria-hidden="true"></span>' : '');
}

function scrollToBottom() {
  const container = $('messages');
  container.scrollTop = container.scrollHeight;
}

// ─── Input ────────────────────────────────────────────────────────────────────

export function setGenerating(val) {
  isGenerating = val;
  const btn = $('sendBtn');
  const input = $('chatInput');
  if (val) {
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
        <rect x="6" y="6" width="12" height="12" rx="2"/>
      </svg>`;
    btn.title = 'Detener';
    btn.setAttribute('aria-label', 'Detener generación');
    input.disabled = true;
  } else {
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
        <path d="M3.478 2.405a.75.75 0 0 0-.926.94l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.405Z"/>
      </svg>`;
    btn.title = 'Enviar';
    btn.setAttribute('aria-label', 'Enviar mensaje');
    input.disabled = false;
    input.focus();
  }
}

export function clearInput() {
  const input = $('chatInput');
  input.value = '';
  input.style.height = 'auto';
}

// ─── Micrófono ────────────────────────────────────────────────────────────────

export function setRecordingState(recording) {
  isRecording = recording;
  const btn = $('voiceBtn');
  if (!btn) return;
  if (recording) {
    btn.classList.add('recording');
    btn.title = 'Detener grabación';
    btn.setAttribute('aria-label', 'Detener grabación');
    btn.setAttribute('aria-pressed', 'true');
  } else {
    btn.classList.remove('recording');
    btn.title = 'Dictar mensaje';
    btn.setAttribute('aria-label', 'Dictar mensaje');
    btn.setAttribute('aria-pressed', 'false');
  }
}

export function showInterimTranscript(interim, final) {
  const bubble = $('voiceBubble');
  const liveEl = $('voiceBubbleLive');
  const textEl = $('voiceBubbleText');
  if (!liveEl || !textEl) return;

  // Asegurar que el bubble esté visible
  if (bubble && !bubble.classList.contains('visible')) {
    bubble.classList.add('visible');
  }

  // Texto confirmado en el área principal del bubble
  textEl.textContent = final;

  // Texto parcial (interim) en el área de vivo, en gris itálico
  if (interim) {
    liveEl.textContent = interim;
  } else if (final) {
    liveEl.textContent = '';
  } else {
    liveEl.textContent = '🎙️ Escuchando...';
  }
}

/**
 * Muestra el bubble de voz.
 *
 * Modo live (liveMode=true): muestra el bubble sin acciones, solo el texto en vivo.
 * Modo final (liveMode=false/omitido): muestra el texto final con botones Editar/Enviar/Descartar.
 *
 * @param {string} text
 * @param {function|null} onEdit
 * @param {function|null} onSend
 * @param {function|null} onDiscard
 * @param {boolean} liveMode
 */
export function showVoiceBubble(text, onEdit, onSend, onDiscard, liveMode = false) {
  const bubble = $('voiceBubble');
  if (!bubble) return;

  // IMPORTANTE: Always make the bubble visible when this function is called
  bubble.classList.add('visible');

  const liveEl   = $('voiceBubbleLive');
  const textEl   = $('voiceBubbleText');
  const actionsEl = bubble.querySelector('.voice-bubble-actions');

  if (liveMode) {
    // Durante la grabación: mostrar indicador de escucha, ocultar acciones
    liveEl.textContent = '🎙️ Escuchando...';
    textEl.textContent = '';
    actionsEl.style.display = 'none';
    return;
  }

  // Modo final: texto transcrito + acciones
  liveEl.textContent = '';
  textEl.textContent = text;
  actionsEl.style.display = 'flex';

  // Clonar botones para limpiar listeners anteriores
  const editBtn    = $('voiceBubbleEdit');
  const sendBtn    = $('voiceBubbleSend');
  const discardBtn = $('voiceBubbleDiscard');

  const newEdit    = editBtn.cloneNode(true);
  const newSend    = sendBtn.cloneNode(true);
  const newDiscard = discardBtn.cloneNode(true);

  editBtn.replaceWith(newEdit);
  sendBtn.replaceWith(newSend);
  discardBtn.replaceWith(newDiscard);

  if (onEdit)    newEdit.addEventListener('click',    () => { hideVoiceBubble(); onEdit(text); });
  if (onSend)    newSend.addEventListener('click',    () => { hideVoiceBubble(); onSend(text); });
  if (onDiscard) newDiscard.addEventListener('click', () => { hideVoiceBubble(); onDiscard(); });
}

/** Oculta el bubble de voz y resetea su contenido interno. */
export function hideVoiceBubble() {
  const bubble = $('voiceBubble');
  if (!bubble) return;
  bubble.classList.remove('visible');

  // Limpiar contenido para que no quede estado sucio al reabrir
  const liveEl    = $('voiceBubbleLive');
  const textEl    = $('voiceBubbleText');
  if (liveEl) liveEl.textContent = '';
  if (textEl) textEl.textContent = '';
  // No tocamos actionsEl.style aquí — showVoiceBubble lo gestiona en cada modo
}

// ─── Sidebar helpers ──────────────────────────────────────────────────────────

export function toggleSidebar() {
  $('sidebar').classList.toggle('open');
  $('sidebarOverlay').classList.toggle('visible');
}

export function closeSidebar() {
  $('sidebar').classList.remove('open');
  $('sidebarOverlay').classList.remove('visible');
}

// ─── Token info ───────────────────────────────────────────────────────────────

export function updateTokenInfo(info) {
  const el = $('tokenInfo');
  if (!el) return;
  if (info.tokensSoFar !== null && info.maxTokens !== null) {
    const pct = Math.round((info.tokensSoFar / info.maxTokens) * 100);
    el.textContent = `${info.tokensSoFar} / ${info.maxTokens} tokens (${pct}%)`;
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

// ─── Adjuntos (imagen) ────────────────────────────────────────────────────────

export function showAttachmentPreview(attachment, onRemove) {
  const preview = $('attachmentPreview');
  if (!preview) return;

  preview.innerHTML = `
    <div class="attach-preview-inner">
      <img src="${attachment.previewUrl}" alt="Imagen adjunta" class="attach-img-thumb">
      <div class="attach-info">
        <span class="attach-name">${escapeHtml(attachment.file.name)}</span>
        <span class="attach-size">${formatFileSize(attachment.file.size)}</span>
      </div>
      <button class="attach-remove" aria-label="Quitar imagen">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>
  `;

  preview.classList.add('visible');
  preview.querySelector('.attach-remove').addEventListener('click', () => {
    clearAttachmentPreview();
    onRemove();
  });
}

export function clearAttachmentPreview() {
  const preview = $('attachmentPreview');
  if (!preview) return;
  preview.classList.remove('visible');
  preview.innerHTML = '';
  const imgInput = $('imageFileInput');
  if (imgInput) imgInput.value = '';
}

export function appendUserMessageWithAttachment(type, previewUrl, fileName, text, id) {
  const container = $('messages');
  const welcome = container.querySelector('.welcome');
  if (welcome) welcome.remove();

  const wrapper = document.createElement('div');
  wrapper.className = 'message-wrapper user';
  wrapper.dataset.id = id;

  const mediaHtml = `<img src="${previewUrl}" alt="${escapeHtml(fileName)}" class="msg-attached-img">`;
  const textHtml = text
    ? `<div class="msg-content user" id="msg-${id}">${escapeHtml(text)}</div>`
    : `<div id="msg-${id}" style="display:none"></div>`;

  wrapper.innerHTML = `
    <div class="msg-body user-body">
      ${mediaHtml}
      ${textHtml}
    </div>
  `;

  container.appendChild(wrapper);
  scrollToBottom();
}

// ─── Settings modal ───────────────────────────────────────────────────────────

export function openSettings() {
  $('settingsModal').classList.add('open');
}

export function closeSettings() {
  $('settingsModal').classList.remove('open');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatContent(text) {
  if (!text) return '';

  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const langLabel = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : '';
    return `<div class="code-block">${langLabel}<pre><code>${escapeHtml(code.trim())}</code></pre></div>`;
  });

  text = text.replace(/`([^`]+)`/g, (_, code) => `<code class="inline-code">${escapeHtml(code)}</code>`);
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  text = text.replace(/^- (.+)$/gm, '<li>$1</li>');
  text = text.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  text = text.replace(/\n/g, '<br>');

  return text;
}

// ─── Event bindings ───────────────────────────────────────────────────────────

export function bindEvents(handlers) {
  const {
    onSend,
    onStop,
    onNewChat,
    onRetryAvailability,
    onSuggestionClick,
    onCopyMessage,
    onSettingsSave,
    onSidebarToggle,
    onImageAttach,
    onVoiceToggle,
  } = handlers;

  // Enviar
  $('sendBtn').addEventListener('click', () => {
    if (isGenerating) onStop();
    else onSend();
  });

  // Enter para enviar, Shift+Enter para nueva línea
  $('chatInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isGenerating) onSend();
    }
  });

  // Auto-resize textarea
  $('chatInput').addEventListener('input', () => {
    const el = $('chatInput');
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  });

  // Nueva conversación
  $('newChatBtn').addEventListener('click', onNewChat);
  $('newChatBtnMobile').addEventListener('click', () => { onNewChat(); closeSidebar(); });

  // Reintentar
  $('retryBtn').addEventListener('click', onRetryAvailability);

  // Sugerencias y copiar (delegación)
  $('messages').addEventListener('click', e => {
    const chip = e.target.closest('.suggestion-chip');
    if (chip) onSuggestionClick(chip.dataset.prompt);

    const copyBtn = e.target.closest('.copy-btn');
    if (copyBtn) onCopyMessage(copyBtn.dataset.id);
  });

  // Adjuntar imagen
  $('attachImageBtn').addEventListener('click', () => $('imageFileInput').click());
  $('imageFileInput').addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (file) onImageAttach(file);
  });

  // Micrófono
  $('voiceBtn').addEventListener('click', () => onVoiceToggle());

  // Settings
  $('settingsBtn').addEventListener('click', openSettings);
  $('settingsClose').addEventListener('click', closeSettings);
  $('settingsModal').addEventListener('click', e => {
    if (e.target === $('settingsModal')) closeSettings();
  });
  $('settingsSave').addEventListener('click', () => {
    const temp = parseFloat($('settingsTemp').value);
    const topK = parseInt($('settingsTopK').value);
    const sysPrompt = $('settingsSysPrompt').value.trim();
    onSettingsSave({ temperature: temp, topK, systemPrompt: sysPrompt });
    closeSettings();
  });

  $('settingsTemp').addEventListener('input', () => {
    $('settingsTempVal').textContent = parseFloat($('settingsTemp').value).toFixed(1);
  });
  $('settingsTopK').addEventListener('input', () => {
    $('settingsTopKVal').textContent = $('settingsTopK').value;
  });

  // Sidebar móvil
  $('sidebarToggleBtn').addEventListener('click', () => { toggleSidebar(); onSidebarToggle?.(); });
  $('sidebarOverlay').addEventListener('click', closeSidebar);
}

// ─── Settings sync ────────────────────────────────────────────────────────────

export function syncSettingsUI(p) {
  $('settingsTemp').value = p.temperature;
  $('settingsTempVal').textContent = p.temperature.toFixed(1);
  $('settingsTopK').value = p.topK;
  $('settingsTopKVal').textContent = p.topK;
  $('settingsSysPrompt').value = p.systemPrompt ?? '';
}
