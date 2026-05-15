# Gemini Nano Chat

Chat de IA local que corre directamente en el navegador usando la **Chrome Built-in AI (Prompt API)**. Sin servidores, sin API keys, sin internet. El modelo vive en tu Chrome.

---

## Requisitos

- **Chrome 127+** (Canary o Dev recomendado para tener la API más estable)
- Flags activados en `chrome://flags`:
  - `#optimization-guide-on-device-model` → **Enabled BypassPerfRequirement**
  - `#prompt-api-for-gemini-nano` → **Enabled**
- Verificar en DevTools que el modelo esté disponible:
  ```js
  await LanguageModel.availability() // debe retornar "available"
  ```
- **Node.js 18+** y **pnpm** para desarrollo local

---

## Instalación y desarrollo

```bash
pnpm install
pnpm dev
```

```bash
pnpm build    # build de producción en /dist
pnpm preview  # previsualizar el build
```

El proyecto usa **Vite** como bundler. No hay frameworks — vanilla JS con ES modules.

---

## Estructura del proyecto

```
gemini-nano-tool/
├── index.html              # Shell HTML, define todo el DOM estático
├── public/
│   ├── favicon.svg
│   └── icons.svg
└── src/
    ├── main.js             # Punto de entrada — conecta los tres módulos
    ├── nano.js             # Wrapper de la Chrome Built-in AI
    ├── session.js          # Estado del chat, historial y sesión activa
    ├── ui.js               # Capa de presentación y event bindings
    └── style.css           # Estilos globales (dark theme, componentes)
```

### Separación de responsabilidades

La arquitectura sigue una separación estricta en tres capas:

| Módulo | Responsabilidad | Sabe del DOM | Sabe de la API |
|---|---|---|---|
| `nano.js` | Wrapper de `window.LanguageModel` | No | Sí |
| `session.js` | Historial, sesión activa, adjuntos | No | Importa nano.js |
| `ui.js` | DOM, eventos, renders | Sí | No |
| `main.js` | Orquestador, lógica de negocio | Mínimo | Importa todo |

Si Chrome cambia la API, **solo se toca `nano.js`**.

---

## Módulos en detalle

### `nano.js`

Abstrae toda la interacción con `window.LanguageModel`:

- `getAPI()` — detecta `window.LanguageModel` o `window.ai.languageModel`
- `checkAvailability()` — normaliza los estados de la API (`available`, `downloadable`, `unavailable`, `error`)
- `createSession(opts)` — crea una sesión con `temperature`, `topK` y `systemPrompt` opcionales
- `destroySession(session)` — destruye de forma segura (ignora errores)
- `getModelInfo(params)` — devuelve `maxTokens`, `tokensSoFar`, `tokensLeft` y `status`
- `sendMultimodal(blob, mediaType, text, sessionParams, onChunk)` — envío multimodal con streaming. Usa `expectedInputs` para que Chrome cargue el módulo correcto. El formato de contenido sigue la spec W3C abril 2026: `{ type, value }` (no `content`)

### `session.js`

Gestiona el estado del chat sin tocar el DOM:

- `params` — objeto mutable con `temperature`, `topK`, `systemPrompt`
- `history` — array de mensajes `{ role, content, id }`
- `getOrCreateSession()` — lazy: crea la sesión solo cuando se necesita
- `resetSession()` — destruye la sesión activa y limpia el historial
- `addMessage(role, content)` / `updateMessage(id, content)` — gestión del historial
- `sendMessage(text, onChunk)` — streaming de texto. La API entrega **deltas** (solo el texto nuevo por chunk), se acumula manualmente antes de pasar al callback
- `sendMultimodalMessage(text, onChunk)` — consume el `pendingAttachment` y lo limpia
- `setAttachment(file, type)` / `clearAttachment()` — gestión del adjunto pendiente con `URL.createObjectURL`

### `ui.js`

Toda la lógica de presentación. Exporta funciones puras que `main.js` llama:

- `setStatus(state, msg)` — actualiza el status bar (`ok`, `err`, `spin`)
- `renderMessages(messages)` / `appendMessageElement(role, content, id, opts)` — renderizado de mensajes con soporte de markdown básico (código, bold, italic, listas)
- `updateMessageElement(id, content, streaming)` — actualiza un mensaje en vivo con cursor parpadeante
- `setGenerating(val)` — cambia el botón de enviar a "stop" durante la generación
- `setRecordingState(recording)` — aplica el estado visual al botón de micrófono
- `showInterimTranscript(interim, final)` — actualiza el voice bubble durante la grabación
- `showVoiceBubble(text, onEdit, onSend, onDiscard, liveMode)` — dos modos:
  - `liveMode=true`: muestra el indicador "🎙️ Escuchando..." sin acciones
  - `liveMode=false`: muestra el texto final con botones Editar / Enviar / Descartar
- `hideVoiceBubble()` — oculta y limpia el bubble (textos y estado interno)
- `bindEvents(handlers)` — registra todos los event listeners del DOM en un solo lugar
- `showAttachmentPreview` / `clearAttachmentPreview` — preview de imagen adjunta
- `openSettings` / `closeSettings` / `syncSettingsUI` — modal de configuración

### `main.js`

Orquestador. Contiene la lógica de negocio que conecta los módulos:

- **Gestión de conversaciones** — array de conversaciones con historial independiente, selección, creación y borrado
- **Web Speech API** — `initSpeechRecognition`, `startRecording`, `stopRecording`, `handleVoiceToggle`
- **Flujo de envío** — `handleSend` (texto + adjunto), `handleSendVoice` (desde bubble de voz)
- **Settings** — `handleSettingsSave` resetea la sesión con los nuevos parámetros

---

## Funcionalidades implementadas

### Chat multi-turno
Conversaciones con historial persistente en memoria. Múltiples conversaciones en el sidebar, cada una con su propio historial. La sesión de `LanguageModel` se crea de forma lazy y se destruye al cambiar de conversación o modificar los parámetros.

### Streaming de respuestas
Las respuestas se muestran en tiempo real con un cursor parpadeante. La API entrega deltas, `session.js` los acumula y `ui.js` actualiza el DOM en cada chunk.

### Entrada por voz (Web Speech API)
Dictado de mensajes usando `SpeechRecognition`:
- Transcripción en tiempo real con resultados interim (texto gris itálico) y final (texto confirmado)
- El voice bubble aparece inmediatamente al iniciar la grabación con el indicador "🎙️ Escuchando..."
- Al detener, el bubble cambia a modo final con tres acciones:
  - **Editar** — mueve el texto al textarea para modificarlo antes de enviar
  - **Enviar** — envía directamente como mensaje de voz (con badge de micrófono)
  - **Descartar** — cierra el bubble sin hacer nada
- Si se inicia una nueva grabación con el bubble visible, se resetea limpiamente
- `r.continuous = true` con reinicio automático en `onend` para no cortar por silencio

### Adjuntos de imagen
Soporte multimodal para imágenes. La imagen se convierte a `Blob`, se crea una sesión one-shot con `expectedInputs: [{ type: 'image' }]` y se envía junto al texto. La sesión one-shot es necesaria porque la API multimodal no soporta historial con blobs.

### Configuración del modelo
Modal con sliders para `temperature` (0–2) y `top-K` (1–128), y textarea para el system prompt. Al guardar, la sesión se destruye y se recrea con los nuevos parámetros.

### Contador de tokens
Muestra `tokensSoFar / maxTokens` después de cada respuesta, obtenido de la sesión activa.

---

## Flujo de datos

```
Usuario escribe / habla
        │
        ▼
    main.js (handleSend / handleSendVoice)
        │
        ├─► session.js (addMessage, sendMessage / sendMultimodalMessage)
        │       │
        │       └─► nano.js (createSession, promptStreaming, sendMultimodal)
        │               │
        │               └─► window.LanguageModel (Chrome Built-in AI)
        │
        └─► ui.js (appendMessageElement, updateMessageElement, updateTokenInfo)
```

---

## Bugs corregidos

### Voice bubble — reset al regresar a grabar
`hideVoiceBubble` solo quitaba la clase `visible` pero no limpiaba los textos ni el estado interno. Al volver a grabar con un bubble en modo "final" visible, los textos anteriores quedaban. Ahora `hideVoiceBubble` limpia `liveEl.textContent` y `textEl.textContent` al ocultar.

### Voice bubble — texto en vivo no visible durante grabación
Dos causas combinadas:
1. `showVoiceBubble` en modo live usaba `liveEl.textContent || '🎙️ Escuchando...'` — si el elemento tenía texto vacío, no asignaba nada. Corregido a asignación directa.
2. `startRecording` llamaba `showInterimTranscript('', '')` justo después de `showVoiceBubble`, sobreescribiendo el indicador con vacío. Esa llamada redundante fue eliminada.

### Voice bubble — botones Editar/Enviar/Descartar no funcionaban
El bloque CSS de `.vb-discard:hover` tenía propiedades extra con una llave mal cerrada (copy-paste accidental del `.voice-badge`). Eso hacía que todos los estilos de `#settingsModal` y los que seguían quedaran dentro de ese bloque, rompiendo el layout del modal y los estilos del bubble. Corregido a una sola línea.

---

## Pendiente / Ideas para continuar

- [ ] **Persistencia** — guardar conversaciones en `localStorage` o `IndexedDB`
- [ ] **Soporte de audio multimodal** — la API ya tiene `sendMultimodal` preparado para `type: 'audio'`
- [ ] **Cambio de idioma** — exponer `r.lang` en el modal de settings para cambiar el idioma de dictado
- [ ] **Export de conversación** — botón para descargar el historial como `.txt` o `.md`
- [ ] **Markdown completo** — el parser actual es básico (regex); considerar una librería como `marked`
- [ ] **Temas** — variables CSS ya preparadas para un tema claro
- [ ] **PWA** — agregar `manifest.json` y service worker para instalación offline
- [ ] **Tests** — `nano.js` y `session.js` son puros y fáciles de testear con Vitest

---

## Notas de la API

La Chrome Built-in AI está en desarrollo activo. Puntos a tener en cuenta:

- **`window.LanguageModel`** es el nombre actual (mayo 2026). Versiones anteriores usaban `window.ai.languageModel`. `nano.js` detecta ambos.
- **Formato multimodal**: `{ type, value }` — el campo es `value`, no `content`. Cambió en la spec W3C de abril 2026.
- **`expectedInputs`**: necesario declararlo al crear la sesión para que Chrome cargue el módulo multimodal correcto.
- **Streaming**: la API entrega deltas (solo el texto nuevo), no el acumulado. `session.js` lo acumula manualmente.
- **Sesiones**: cada sesión tiene un contexto de tokens limitado. Al llegar al límite, la sesión falla — considera resetear o crear una nueva.
