<template>
  <div>
    <div class="section-header display">HARDWARE</div>

    <!-- Proxmox nodes -->
    <div class="proxmox-grid">
    <div v-for="node in nodes" :key="node.node" class="card hw-card proxmox-card" :class="{ unreachable: !node.reachable }">
      <div class="hw-header">
        <div class="hw-name display">{{ node.node }}</div>
        <div class="badge" :class="node.reachable ? 'green' : 'red'">{{ node.status }}</div>
        <div class="hw-sub mono">proxmox · {{ node.cpuCount }} cores</div>
      </div>
      <div v-if="node.reachable" class="proxmox-body">
        <!-- Left: host metrics -->
        <div class="metric-grid">
          <div class="metric">
            <div class="metric-label">CPU</div>
            <div class="metric-value" :class="gaugeColor(node.cpuPercent, 70, 85)">{{ node.cpuPercent ?? '—' }}%</div>
            <div class="gauge"><div class="gauge-fill" :class="gaugeColor(node.cpuPercent, 70, 85)" :style="{ width: `${node.cpuPercent}%` }" /></div>
          </div>
          <div class="metric">
            <div class="metric-label">MEM</div>
            <div class="metric-value" :class="gaugeColor(node.memoryPercent)">{{ node.memoryPercent ?? '—' }}%</div>
            <div class="gauge"><div class="gauge-fill" :class="gaugeColor(node.memoryPercent)" :style="{ width: `${node.memoryPercent}%` }" /></div>
            <div class="metric-sub">{{ node.memoryUsedGB }}/{{ node.memoryTotalGB }}G</div>
          </div>
          <div class="metric">
            <div class="metric-label">DISK</div>
            <div class="metric-value" :class="gaugeColor(node.diskPercent, 75, 90)">{{ node.diskPercent ?? '—' }}%</div>
            <div class="gauge"><div class="gauge-fill" :class="gaugeColor(node.diskPercent, 75, 90)" :style="{ width: `${node.diskPercent}%` }" /></div>
            <div class="metric-sub">{{ node.diskUsedGB }}/{{ node.diskTotalGB }}G</div>
          </div>
          <div class="metric">
            <div class="metric-label">UP</div>
            <div class="metric-value text-accent">{{ formatUptime(node.uptimeSeconds) }}</div>
          </div>
        </div>
        <!-- Right: VM list -->
        <div v-if="node.vms?.length" class="vm-list">
          <!-- Legend -->
          <div class="vm-row vm-legend">
            <span />
            <span class="mono" style="font-size:9px;letter-spacing:0.1em;color:var(--text-3)">NAME</span>
            <div class="vm-stat-cols">
              <span>CPU</span>
              <span>MEM</span>
              <span>DISK</span>
            </div>
          </div>
          <div v-for="vm in node.vms" :key="vm.vmid" class="vm-row">
            <span class="dot" :class="vm.status === 'running' ? 'green' : ''" />
            <span class="vm-name mono">{{ vm.name }}</span>
            <div v-if="vm.status === 'running'" class="vm-stat-cols mono">
              <span :class="gaugeColor(vm.cpuPercent, 70, 85)">{{ vm.cpuPercent != null ? vm.cpuPercent + '%' : '—' }}</span>
              <span :class="gaugeColor(vm.memoryPercent)">{{ vm.memoryPercent != null ? vm.memoryPercent + '%' : '—' }}</span>
              <span v-if="vm.diskPercent != null" :class="gaugeColor(vm.diskPercent, 75, 90)">{{ vm.diskPercent }}%</span>
              <span v-else class="text-muted">{{ vm.diskAllocatedGB }}G</span>
            </div>
            <div v-else class="vm-stat-cols mono text-muted">
              <span>—</span><span>—</span><span>{{ vm.diskAllocatedGB }}G</span>
            </div>
          </div>
        </div>
      </div>
      <div v-if="!node.reachable" class="unreachable-msg mono"><span class="dot red" /> unreachable</div>
    </div>
    </div><!-- end proxmox-grid -->

    <!-- Jetson devices in 2-column grid -->
    <div class="jetson-grid">
    <div v-for="device in jetsons" :key="device.host" class="card hw-card jetson-card" :class="{ unreachable: !device.reachable, hot: isTempHot(device) }">
      <div class="hw-header">
        <div>
          <div class="hw-name display">{{ device.host }}</div>
          <div class="hw-sub mono">{{ device.ip }} · jetson</div>
        </div>
        <div v-if="!device.reachable" class="badge red">offline</div>
        <div v-else class="temp-badge" :class="tempColor(device.temperatureCelsius)">
          {{ device.temperatureCelsius != null ? `${device.temperatureCelsius}°C` : '—' }}
        </div>
      </div>
      <div v-if="device.reachable" class="jetson-metrics">
        <div class="jmetric">
          <span class="metric-label">CPU</span>
          <span class="jval" :class="gaugeColor(device.cpuPercent)">{{ device.cpuPercent ?? '—' }}%</span>
          <div class="gauge jgauge"><div class="gauge-fill" :class="gaugeColor(device.cpuPercent)" :style="{ width: `${device.cpuPercent || 0}%` }" /></div>
        </div>
        <div class="jmetric">
          <span class="metric-label">GPU</span>
          <span class="jval text-purple">{{ device.gpuPercent ?? '—' }}%</span>
          <div class="gauge jgauge"><div class="gauge-fill" style="background:var(--purple)" :style="{ width: `${device.gpuPercent || 0}%` }" /></div>
        </div>
        <div class="jmetric">
          <span class="metric-label">MEM</span>
          <span class="jval" :class="gaugeColor(device.memoryPercent)">{{ device.memoryPercent ?? '—' }}%</span>
          <div class="gauge jgauge"><div class="gauge-fill" :class="gaugeColor(device.memoryPercent)" :style="{ width: `${device.memoryPercent || 0}%` }" /></div>
        </div>
        <div class="jmetric">
          <span class="metric-label">DISK</span>
          <span class="jval" :class="gaugeColor(device.diskPercent, 75, 90)">{{ device.diskPercent ?? '—' }}%</span>
          <div class="gauge jgauge"><div class="gauge-fill" :class="gaugeColor(device.diskPercent, 75, 90)" :style="{ width: `${device.diskPercent || 0}%` }" /></div>
        </div>
      </div>
      <div v-else class="unreachable-msg mono"><span class="dot red" /> offline</div>
    </div>
    </div><!-- end jetson-grid -->

    <div v-if="!nodes.length && !jetsons.length" class="text-muted mono" style="font-size:12px">no hardware data</div>
  </div>
</template>

<script setup>
import { gaugeColor, formatUptime, formatRelative } from '../composables/useMonitor.js'

defineProps({
  nodes:   { type: Array, default: () => [] },
  jetsons: { type: Array, default: () => [] },
})

function isTempHot(device) {
  return device.reachable && device.temperatureCelsius >= 70
}

function tempColor(temp) {
  if (temp == null) return 'text-muted'
  if (temp >= 70) return 'hot'
  if (temp >= 55) return 'warm'
  return 'cool'
}
</script>

<style scoped>
.hw-card {
  margin-bottom: 8px;
}
.hw-card:last-child { margin-bottom: 0; }

.jetson-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
  margin-top: 8px;
}
.jetson-grid .hw-card {
  margin-bottom: 0;
}

.proxmox-grid {
  display: grid;
  grid-template-columns: minmax(300px, 680px);
  gap: 8px;
  margin-bottom: 8px;
}
.proxmox-grid .hw-card { margin-bottom: 0; }

.proxmox-body {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 16px;
  align-items: stretch;
}

.vm-list {
  border-left: 1px solid var(--border);
  padding-left: 12px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.vm-row {
  display: grid;
  grid-template-columns: 8px 110px 1fr;
  align-items: center;
  gap: 5px;
  padding: 2px 0;
}
.vm-name {
  font-size: 11px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.vm-stat-cols {
  display: grid;
  grid-template-columns: 36px 36px 42px;
  gap: 4px;
  font-size: 10px;
  color: var(--text-2);
}
.vm-legend .vm-stat-cols {
  font-size: 9px;
  letter-spacing: 0.08em;
  color: var(--text-3);
}

.proxmox-card { border-left: 3px solid var(--accent); }
.jetson-card  { border-left: 3px solid var(--accent-dim); }
.hw-card.unreachable { border-left-color: var(--red); opacity: 0.6; }
.hw-card.hot         { border-left-color: var(--red); }

.hw-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.hw-name {
  font-size: 15px;
  letter-spacing: 0.06em;
  color: var(--text);
}
.hw-sub {
  font-size: 10px;
  color: var(--text-2);
  margin-left: auto;
}

/* Proxmox metrics grid */
.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}
.metric-sub {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-2);
  margin-top: 2px;
}

/* Temperature badge */
.temp-badge {
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 700;
  line-height: 1;
}
.temp-badge.cool { color: var(--green); }
.temp-badge.warm { color: var(--amber); }
.temp-badge.hot  { color: var(--red); }

/* Jetson metrics */
.jetson-metrics {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.jmetric {
  display: grid;
  grid-template-columns: 32px 34px 1fr;
  align-items: center;
  gap: 6px;
}
.jval {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  text-align: right;
}
.jgauge { flex: 1; }

.unreachable-msg {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--red);
}
</style>
