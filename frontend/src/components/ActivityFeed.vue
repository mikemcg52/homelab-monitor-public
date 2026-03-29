<template>
  <div>
    <div class="feed-header">
      <div class="section-header display" style="margin-bottom:0;flex:1">ACTIVITY FEED</div>
      <button v-if="events.length" class="clear-btn mono" @click="clearAll">CLEAR ALL</button>
    </div>
    <div class="feed">
      <div v-if="!events.length" class="empty mono text-muted">no events yet</div>
      <div
        v-for="event in events"
        :key="event.id"
        class="event-row"
        :class="eventClass(event)"
      >
        <span class="event-time mono">{{ formatTime(event.occurredAt) }}</span>
        <span class="event-agent mono">{{ event.agent }}</span>
        <span class="event-type badge" :class="typeBadgeClass(event.type)">{{ event.type }}</span>
        <span class="event-desc">{{ event.description }}</span>
        <button class="del-btn mono" @click="deleteEvent(event.id)">✕</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { formatTime } from '../composables/useMonitor.js'

const props = defineProps({ events: { type: Array, default: () => [] } })
const emit  = defineEmits(['refresh'])

function eventClass(event) {
  if (event.type.includes('error') || event.type.includes('fail')) return 'is-error'
  if (event.type.includes('warn')) return 'is-warn'
  return ''
}

function typeBadgeClass(type) {
  if (type.includes('error') || type.includes('fail')) return 'red'
  if (type.includes('warn') || type.includes('stale') || type.includes('unreachable') || type.includes('temp') || type.includes('cpu')) return 'amber'
  if (type.includes('enroll') || type.includes('complete') || type.includes('success')) return 'green'
  return 'muted'
}

async function deleteEvent(id) {
  await fetch(`/api/monitor/events/${id}`, { method: 'DELETE' })
  emit('refresh')
}

async function clearAll() {
  await fetch('/api/monitor/events', { method: 'DELETE' })
  emit('refresh')
}
</script>

<style scoped>
.feed-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.clear-btn {
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--text-3);
  background: none;
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 2px 8px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}
.clear-btn:hover {
  color: var(--red);
  border-color: var(--red-dim);
}

.feed {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 340px;
  overflow-y: auto;
}

.empty {
  font-size: 12px;
  padding: 12px 0;
}

.event-row {
  display: grid;
  grid-template-columns: 44px 140px 110px 1fr 18px;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 4px;
  border: 1px solid transparent;
  transition: background 0.1s;
}
.event-row:hover {
  background: var(--card);
  border-color: var(--border);
}
.event-row:hover .del-btn { opacity: 1; }
.event-row.is-error { background: rgba(239,68,68,0.04); }
.event-row.is-warn  { background: rgba(245,158,11,0.04); }

.event-time {
  font-size: 11px;
  color: var(--text-2);
}
.event-agent {
  font-size: 11px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.event-type {
  font-size: 10px;
  padding: 1px 4px;
}
.event-desc {
  font-size: 12px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.del-btn {
  opacity: 0;
  background: none;
  border: none;
  color: var(--text-2);
  font-size: 11px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  transition: color 0.1s, opacity 0.1s;
}
.del-btn:hover { color: var(--red); }
</style>
