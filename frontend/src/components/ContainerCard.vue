<template>
  <div class="container-row" :class="rowClass">
    <!-- Status dot -->
    <span class="dot" :class="dotColor" />

    <!-- Name -->
    <span class="c-name mono">{{ container.name }}</span>

    <!-- Uptime -->
    <span class="c-uptime mono text-muted">{{ formatUptime(container.uptimeSeconds) }}</span>

    <!-- CPU -->
    <span class="c-metric mono" :class="gaugeColor(container.cpuPercent, 60, 80)">
      {{ container.cpuPercent != null ? container.cpuPercent.toFixed(1) : '—' }}%
    </span>

    <!-- Mem -->
    <span class="c-metric mono" :class="gaugeColor(container.memoryPercent, 70, 85)">
      {{ container.memoryPercent != null ? container.memoryPercent.toFixed(1) : '—' }}%
    </span>

    <!-- Error/warn badges -->
    <span v-if="container.errorCount > 0" class="badge red err-badge">
      {{ container.errorCount }} err
    </span>
    <span v-else-if="container.warnCount > 0" class="badge amber err-badge">
      {{ container.warnCount }} warn
    </span>
    <span v-else class="err-spacer" />

    <!-- Staleness indicator -->
    <span v-if="stale" class="badge amber">stale</span>
    <span v-else class="badge green">current</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { formatUptime, gaugeColor, isStaleContainer } from '../composables/useMonitor.js'

const props = defineProps({ container: Object })

const stale = computed(() => isStaleContainer(props.container))

const dotColor = computed(() => {
  if (props.container.state === 'running') return 'green'
  if (props.container.state === 'restarting') return 'amber'
  return 'red'
})

const rowClass = computed(() => {
  if (props.container.errorCount > 0) return 'has-errors'
  if (props.container.warnCount > 0) return 'has-warnings'
  if (props.container.state !== 'running') return 'not-running'
  return ''
})
</script>

<style scoped>
.container-row {
  display: grid;
  grid-template-columns: 8px 1fr 28px 36px 36px 44px 50px;
  align-items: center;
  gap: 4px;
  padding: 3px 2px 3px 6px;
  border-radius: 3px;
  border: 1px solid transparent;
  overflow: visible;
  transition: background 0.1s, border-color 0.1s;
}
.container-row:hover {
  background: var(--card);
  border-color: var(--border);
}
.container-row.has-errors {
  background: rgba(239,68,68,0.04);
  border-color: rgba(239,68,68,0.15);
}
.container-row.has-warnings {
  background: rgba(245,158,11,0.04);
  border-color: rgba(245,158,11,0.12);
}
.container-row.not-running { opacity: 0.5; }

.c-name {
  font-size: 11px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.c-uptime {
  font-size: 10px;
  text-align: right;
}
.c-metric {
  font-size: 10px;
  text-align: right;
}
.err-badge { font-size: 10px; padding: 0 4px; }
.err-spacer { display: inline-block; width: 46px; }
</style>
