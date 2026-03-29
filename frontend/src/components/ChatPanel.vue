<template>
  <!-- Toggle button in header area -->
  <button class="chat-toggle" :class="{ active: open }" @click="open = !open" title="Ask OpenClaw">
    <span class="toggle-icon">🦞</span>
    <span class="toggle-label mono">ASK</span>
  </button>

  <!-- Slide-down panel -->
  <Transition name="panel">
    <div v-if="open" class="chat-panel">
      <div class="chat-header">
        <span class="display">OPENCLAW ASSISTANT</span>
        <span class="mono text-muted" style="font-size:10px">live snapshot context</span>
        <button class="close-btn" @click="open = false">✕</button>
      </div>

      <!-- Messages -->
      <div class="messages" ref="messagesEl">
        <div v-if="!history.length" class="hint mono text-muted">
          Ask about your homelab — "what's running?", "anything unhealthy?", "why is X erroring?"
        </div>
        <div v-for="(msg, i) in history" :key="i" class="message" :class="msg.role">
          <div class="msg-role mono">{{ msg.role === 'user' ? 'YOU' : 'OPENCLAW' }}</div>
          <div class="msg-content">{{ msg.content }}</div>
        </div>
        <div v-if="loading" class="message assistant">
          <div class="msg-role mono">OPENCLAW</div>
          <div class="msg-content thinking mono">thinking<span class="dots">...</span></div>
        </div>
        <div v-if="error" class="error-msg mono">{{ error }}</div>
      </div>

      <!-- Input -->
      <div class="chat-input">
        <input
          ref="inputEl"
          v-model="input"
          class="mono"
          placeholder="Ask a question..."
          :disabled="loading"
          @keydown.enter.prevent="send"
        />
        <button class="send-btn mono" :disabled="loading || !input.trim()" @click="send">
          {{ loading ? '...' : '→' }}
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, nextTick, watch } from 'vue'

const open      = ref(false)
const input     = ref('')
const history   = ref([])
const loading   = ref(false)
const error     = ref(null)
const messagesEl = ref(null)
const inputEl    = ref(null)

watch(open, (val) => {
  if (val) nextTick(() => inputEl.value?.focus())
})

async function send() {
  const message = input.value.trim()
  if (!message || loading.value) return

  input.value = ''
  error.value = null
  history.value.push({ role: 'user', content: message })
  loading.value = true

  // Add empty assistant message to stream into
  history.value.push({ role: 'assistant', content: '' })
  await scrollToBottom()

  try {
    const res = await fetch('/api/monitor/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        history: history.value.slice(0, -2), // exclude user + empty assistant
      }),
    })

    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({}))
      error.value = data.error || 'Request failed'
      history.value.pop() // remove empty assistant message
      loading.value = false
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop()

      for (const line of lines) {
        if (line.startsWith(': ')) continue // heartbeat comment
        if (!line.startsWith('data: ')) continue
        const raw = line.slice(6).trim()
        try {
          const evt = JSON.parse(raw)
          if (evt.delta) {
            // Stream chunk into last assistant message
            history.value[history.value.length - 1].content += evt.delta
            await scrollToBottom()
          } else if (evt.error) {
            error.value = evt.error
            history.value.pop()
          }
        } catch { /* skip */ }
      }
    }
  } catch (err) {
    error.value = `Connection failed: ${err.message}`
    history.value.pop()
  } finally {
    loading.value = false
    await scrollToBottom()
  }
}

async function scrollToBottom() {
  await nextTick()
  if (messagesEl.value) {
    messagesEl.value.scrollTop = messagesEl.value.scrollHeight
  }
}
</script>

<style scoped>
.chat-toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 5px 10px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  color: var(--text-2);
}
.chat-toggle:hover,
.chat-toggle.active {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(56,189,248,0.06);
}
.toggle-icon { font-size: 14px; line-height: 1; }
.toggle-label { font-size: 11px; letter-spacing: 0.08em; }

/* Panel */
.chat-panel {
  position: fixed;
  bottom: 0;
  right: 20px;
  width: 420px;
  max-height: 520px;
  background: var(--surface);
  border: 1px solid var(--border-hi);
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  display: flex;
  flex-direction: column;
  z-index: 200;
  box-shadow: 0 -4px 24px rgba(0,0,0,0.4);
}

.chat-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  font-family: var(--font-display);
  font-size: 13px;
  letter-spacing: 0.1em;
  color: var(--text);
}
.close-btn {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--text-2);
  cursor: pointer;
  font-size: 13px;
  padding: 0;
  line-height: 1;
}
.close-btn:hover { color: var(--red); }

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hint {
  font-size: 11px;
  color: var(--text-3);
  text-align: center;
  padding: 20px 0;
  line-height: 1.6;
}

.message {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.message.user { align-items: flex-end; }
.message.assistant { align-items: flex-start; }

.msg-role {
  font-size: 9px;
  letter-spacing: 0.1em;
  color: var(--text-3);
}

.msg-content {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text);
  max-width: 88%;
  padding: 7px 10px;
  border-radius: 6px;
  white-space: pre-wrap;
}
.message.user .msg-content {
  background: rgba(56,189,248,0.1);
  border: 1px solid rgba(56,189,248,0.2);
}
.message.assistant .msg-content {
  background: var(--card);
  border: 1px solid var(--border);
}

.thinking {
  font-size: 12px;
  color: var(--text-2);
}
.dots {
  animation: blink 1s step-start infinite;
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}

.error-msg {
  font-size: 11px;
  color: var(--red);
  padding: 4px 8px;
  background: rgba(239,68,68,0.08);
  border: 1px solid var(--red-dim);
  border-radius: 4px;
}

.chat-input {
  display: flex;
  gap: 6px;
  padding: 10px 14px;
  border-top: 1px solid var(--border);
}
.chat-input input {
  flex: 1;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 6px 10px;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 12px;
  outline: none;
  transition: border-color 0.15s;
}
.chat-input input:focus { border-color: var(--accent); }
.chat-input input:disabled { opacity: 0.5; }

.send-btn {
  background: var(--accent-dim);
  border: 1px solid var(--accent);
  color: var(--accent);
  border-radius: 4px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  transition: background 0.15s;
}
.send-btn:hover:not(:disabled) { background: rgba(56,189,248,0.2); }
.send-btn:disabled { opacity: 0.4; cursor: default; }

/* Transition */
.panel-enter-active, .panel-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.panel-enter-from, .panel-leave-to {
  transform: translateY(20px);
  opacity: 0;
}
</style>
