<template>
  <div>
    <div class="section-header display">CONTAINERS</div>
    <div class="vm-list">
      <div v-for="vm in vms" :key="vm.host" class="vm-block">
        <div class="vm-header">
          <span class="dot" :class="vm.reachable ? 'green' : 'red'" />
          <span class="vm-name mono">{{ vm.host }}</span>
          <span class="vm-count text-muted mono">{{ vm.containers?.length || 0 }} containers</span>
        </div>
        <div v-if="!vm.reachable" class="unreachable-row">
          <span class="mono text-muted">unreachable — {{ vm.error || 'connection failed' }}</span>
        </div>
        <div v-else class="container-list">
          <ContainerCard
            v-for="container in vm.containers"
            :key="container.name"
            :container="container"
          />
        </div>
      </div>
      <div v-if="!vms.length" class="text-muted mono" style="font-size:12px">no vm data</div>
    </div>
  </div>
</template>

<script setup>
import ContainerCard from './ContainerCard.vue'
defineProps({ vms: { type: Array, default: () => [] } })
</script>

<style scoped>
.vm-list { display: flex; flex-direction: column; gap: 14px; }

.vm-block {}

.vm-header {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 6px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}
.vm-name { font-size: 12px; letter-spacing: 0.05em; color: var(--text); }
.vm-count { font-size: 10px; margin-left: auto; }

.container-list { display: flex; flex-direction: column; gap: 4px; overflow: visible; }

.unreachable-row {
  padding: 8px 0;
  font-size: 12px;
}
</style>
