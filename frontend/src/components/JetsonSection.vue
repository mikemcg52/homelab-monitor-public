<template>
  <div>
    <div class="section-header display">JETSON FARM</div>
    <div class="jetson-grid">
      <div
        v-for="device in jetsons"
        :key="device.host"
        class="card jetson-card"
        :class="{ unreachable: !device.reachable, hot: isTempHot(device) }"
      >
        <div class="device-header">
          <div>
            <div class="device-name display">{{ device.host }}</div>
            <div class="device-ip mono text-muted">{{ device.ip }}</div>
          </div>
          <div v-if="!device.reachable" class="badge red">offline</div>
          <div v-else class="temp-display" :class="tempColor(device.temperatureCelsius)">
            {{ device.temperatureCelsius != null ? `${device.temperatureCelsius}°C` : '—' }}
          </div>
        </div>

        <div v-if="device.reachable" class="device-metrics">
          <!-- CPU -->
          <div class="metric-row">
            <span class="metric-label">CPU</span>
            <span class="metric-val" :class="gaugeColor(device.cpuPercent)">{{ device.cpuPercent ?? '—' }}%</span>
            <div class="gauge flex-gauge">
              <div class="gauge-fill" :class="gaugeColor(device.cpuPercent)" :style="{ width: `${device.cpuPercent || 0}%` }" />
            </div>
          </div>
          <!-- GPU -->
          <div class="metric-row">
            <span class="metric-label">GPU</span>
            <span class="metric-val text-purple">{{ device.gpuPercent ?? '—' }}%</span>
            <div class="gauge flex-gauge">
              <div class="gauge-fill" style="background: var(--purple)" :style="{ width: `${device.gpuPercent || 0}%` }" />
            </div>
          </div>
          <!-- MEM -->
          <div class="metric-row">
            <span class="metric-label">MEM</span>
            <span class="metric-val" :class="gaugeColor(device.memoryPercent)">{{ device.memoryPercent ?? '—' }}%</span>
            <div class="gauge flex-gauge">
              <div class="gauge-fill" :class="gaugeColor(device.memoryPercent)" :style="{ width: `${device.memoryPercent || 0}%` }" />
            </div>
          </div>
          <!-- DISK -->
          <div class="metric-row">
            <span class="metric-label">DISK</span>
            <span class="metric-val" :class="gaugeColor(device.diskPercent, 75, 90)">{{ device.diskPercent ?? '—' }}%</span>
            <div class="gauge flex-gauge">
              <div class="gauge-fill" :class="gaugeColor(device.diskPercent, 75, 90)" :style="{ width: `${device.diskPercent || 0}%` }" />
            </div>
          </div>
          <!-- MEM detail -->
          <div class="mem-detail mono text-muted">
            {{ device.memoryUsedMB }}MB / {{ device.memoryTotalMB }}MB
          </div>
        </div>

        <div v-else class="unreachable-msg mono">
          <span class="dot red" /> offline since {{ formatRelative(device.lastSeenAt) }}
        </div>
      </div>
      <div v-if="!jetsons.length" class="text-muted mono" style="font-size:12px">no jetson data</div>
    </div>
  </div>
</template>

<script setup>
import { gaugeColor, formatRelative } from '../composables/useMonitor.js'

defineProps({ jetsons: { type: Array, default: () => [] } })

function isTempHot(device) {
  return device.reachable && device.temperatureCelsius >= 70
}

function tempColor(temp) {
  if (temp == null) return 'text-muted'
  if (temp >= 70) return 'text-red'
  if (temp >= 55) return 'text-amber'
  return 'text-green'
}
</script>

<style scoped>
.jetson-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}

.jetson-card {
  border-left: 3px solid var(--accent-dim);
}
.jetson-card.unreachable { border-left-color: var(--red); opacity: 0.5; }
.jetson-card.hot { border-left-color: var(--red); }

.device-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}
.device-name { font-size: 14px; letter-spacing: 0.06em; }
.device-ip { font-size: 11px; margin-top: 2px; color: var(--text-2); }

.temp-display {
  font-family: var(--font-mono);
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
}

.device-metrics { display: flex; flex-direction: column; gap: 6px; }

.metric-row {
  display: grid;
  grid-template-columns: 32px 36px 1fr;
  align-items: center;
  gap: 6px;
}
.metric-label {
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--text-2);
  font-family: var(--font-mono);
  text-transform: uppercase;
}
.metric-val {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  text-align: right;
}
.flex-gauge { flex: 1; }

.mem-detail {
  font-size: 11px;
  color: var(--text-2);
  margin-top: 4px;
}

.unreachable-msg {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--red);
}
</style>
