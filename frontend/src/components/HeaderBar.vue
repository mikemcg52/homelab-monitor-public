<template>
  <header class="header">
    <div class="header-left">
      <div class="logo">HOMELAB<span class="logo-dot">·</span>MONITOR</div>
      <div class="tagline mono">ops dashboard v1.0</div>
    </div>

    <div class="header-center">
      <div v-if="error" class="status-pill red">
        <span class="dot red" />
        <span>BACKEND UNREACHABLE</span>
      </div>
      <div v-else-if="isStale" class="status-pill amber">
        <span class="dot amber pulse" />
        <span>STALE — last update {{ formatRelative(lastUpdated) }}</span>
      </div>
      <div v-else class="status-pill green">
        <span class="dot green pulse" />
        <span>LIVE — updated {{ formatRelative(lastUpdated) }}</span>
      </div>
    </div>

    <div class="header-right mono">
      <div class="time-display">{{ currentTime }}</div>
      <div class="refresh-info text-muted">POLL / 30s</div>
    </div>
  </header>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { formatRelative } from '../composables/useMonitor.js'

defineProps({
  lastUpdated: Date,
  isStale:     Boolean,
  loading:     Boolean,
  error:       String,
})

const currentTime = ref('')
let timer = null

function tick() {
  currentTime.value = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  })
}

onMounted(() => { tick(); timer = setInterval(tick, 1000) })
onUnmounted(() => clearInterval(timer))
</script>

<style scoped>
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 100;
  gap: 20px;
}

.logo {
  font-family: var(--font-display);
  font-size: 22px;
  letter-spacing: 0.12em;
  color: var(--text);
}
.logo-dot { color: var(--accent); }

.tagline {
  font-size: 11px;
  color: var(--text-2);
  letter-spacing: 0.1em;
  margin-top: 1px;
}

.header-center {
  flex: 1;
  display: flex;
  justify-content: center;
}

.status-pill {
  display: flex;
  align-items: center;
  gap: 7px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  padding: 5px 12px;
  border-radius: 20px;
  border: 1px solid;
}
.status-pill.green { color: var(--green); border-color: var(--green-dim); background: rgba(34,197,94,0.06); }
.status-pill.amber { color: var(--amber); border-color: var(--amber-dim); background: rgba(245,158,11,0.06); }
.status-pill.red   { color: var(--red);   border-color: var(--red-dim);   background: rgba(239,68,68,0.06); }

.header-right {
  text-align: right;
}

.time-display {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--text);
}
.refresh-info {
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--text-2);
}
</style>
