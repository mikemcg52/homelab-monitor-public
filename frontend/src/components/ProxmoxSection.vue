<template>
  <div>
    <div class="section-header display">PROXMOX</div>
    <div class="proxmox-grid">
      <div v-for="node in nodes" :key="node.node" class="card proxmox-card" :class="{ unreachable: !node.reachable }">
        <div class="node-header">
          <div class="node-name display">{{ node.node }}</div>
          <div class="badge" :class="node.reachable ? 'green' : 'red'">
            {{ node.status || 'unknown' }}
          </div>
        </div>
        <div v-if="node.reachable" class="node-metrics">
          <div class="metric">
            <div class="metric-label">CPU</div>
            <div class="metric-value" :class="gaugeColor(node.cpuPercent, 70, 85)">
              {{ node.cpuPercent ?? '—' }}%
            </div>
            <div class="gauge">
              <div class="gauge-fill" :class="gaugeColor(node.cpuPercent, 70, 85)" :style="{ width: `${node.cpuPercent}%` }" />
            </div>
            <div class="metric-sub">{{ node.cpuCount }} cores</div>
          </div>
          <div class="metric">
            <div class="metric-label">MEM</div>
            <div class="metric-value" :class="gaugeColor(node.memoryPercent)">
              {{ node.memoryPercent ?? '—' }}%
            </div>
            <div class="gauge">
              <div class="gauge-fill" :class="gaugeColor(node.memoryPercent)" :style="{ width: `${node.memoryPercent}%` }" />
            </div>
            <div class="metric-sub">{{ node.memoryUsedGB }}/{{ node.memoryTotalGB }}G</div>
          </div>
          <div class="metric">
            <div class="metric-label">DISK</div>
            <div class="metric-value" :class="gaugeColor(node.diskPercent, 75, 90)">
              {{ node.diskPercent ?? '—' }}%
            </div>
            <div class="gauge">
              <div class="gauge-fill" :class="gaugeColor(node.diskPercent, 75, 90)" :style="{ width: `${node.diskPercent}%` }" />
            </div>
            <div class="metric-sub">{{ node.diskUsedGB }}/{{ node.diskTotalGB }}G</div>
          </div>
          <div class="metric">
            <div class="metric-label">UPTIME</div>
            <div class="metric-value text-accent">{{ formatUptime(node.uptimeSeconds) }}</div>
          </div>
        </div>
        <div v-else class="unreachable-msg">
          <span class="dot red" /> unreachable
        </div>
      </div>
      <div v-if="!nodes.length" class="card empty-card text-muted mono">no proxmox data</div>
    </div>
  </div>
</template>

<script setup>
import { gaugeColor, formatUptime } from '../composables/useMonitor.js'
defineProps({ nodes: { type: Array, default: () => [] } })
</script>

<style scoped>
.proxmox-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 10px;
}

.proxmox-card {
  border-left: 3px solid var(--accent);
}
.proxmox-card.unreachable { border-left-color: var(--red); opacity: 0.6; }

.node-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.node-name {
  font-size: 16px;
  letter-spacing: 0.08em;
  color: var(--text);
}

.node-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.metric-sub {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-2);
  margin-top: 2px;
}

.unreachable-msg {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--red);
}

.empty-card {
  font-size: 12px;
  text-align: center;
}
</style>
