<template>
  <div class="layout">
    <HeaderBar
      :lastUpdated="lastUpdated"
      :isStale="isStale"
      :loading="loading"
      :error="error"
    />
    <ChatPanel />

    <div v-if="loading && !snapshot" class="loading-state">
      <span class="dot green pulse" />
      <span class="mono text-muted">waiting for first snapshot...</span>
    </div>

    <div v-else-if="!snapshot" class="loading-state">
      <span class="dot amber" />
      <span class="mono text-muted">no snapshots received yet</span>
    </div>

    <main v-else class="dashboard">
      <!-- Left: Containers -->
      <section class="col-left">
        <VMSection :vms="vms" />
      </section>

      <!-- Right: Hardware + Activity Feed -->
      <div class="col-right">
        <section class="section">
          <HardwareSection :nodes="proxmox" :jetsons="jetsons" />
        </section>
        <section class="section">
          <ActivityFeed :events="events" @refresh="fetchEvents" />
        </section>
      </div>
    </main>
  </div>
</template>

<script setup>
import { useMonitor } from './composables/useMonitor.js'
import HeaderBar      from './components/HeaderBar.vue'
import VMSection      from './components/VMSection.vue'
import HardwareSection from './components/HardwareSection.vue'
import ActivityFeed   from './components/ActivityFeed.vue'
import ChatPanel      from './components/ChatPanel.vue'

const { snapshot, events, loading, error, lastUpdated, isStale, proxmox, vms, jetsons, fetchEvents } = useMonitor()
</script>

<style scoped>
.layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.loading-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-2);
}

.dashboard {
  flex: 1;
  padding: 16px 16px 24px;
  display: grid;
  grid-template-columns: 520px 1fr;
  gap: 16px;
  max-width: 1600px;
  width: 100%;
  margin: 0 auto;
  align-items: start;
}

.col-left {
  min-width: 0;
  overflow: visible;
}

.col-right {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.section {}

@media (max-width: 1100px) {
  .dashboard {
    grid-template-columns: 1fr;
  }
}
</style>
