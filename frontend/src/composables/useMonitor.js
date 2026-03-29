/**
 * useMonitor.js — polls the backend for snapshot and events data
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'

const POLL_INTERVAL = 30000    // 30 seconds
const STALE_THRESHOLD = 120000 // 2 minutes

export function useMonitor() {
  const snapshot  = ref(null)
  const events    = ref([])
  const loading   = ref(true)
  const error     = ref(null)
  let pollTimer   = null

  const lastUpdated = computed(() => {
    if (!snapshot.value?.collectedAt) return null
    return new Date(snapshot.value.collectedAt)
  })

  const isStale = computed(() => {
    if (!lastUpdated.value) return false
    return Date.now() - lastUpdated.value.getTime() > STALE_THRESHOLD
  })

  const proxmox = computed(() => snapshot.value?.payload?.proxmox || [])
  const vms     = computed(() => snapshot.value?.payload?.vms     || [])
  const jetsons = computed(() => snapshot.value?.payload?.jetsons || [])

  async function fetchData() {
    try {
      const [snapRes, eventsRes] = await Promise.all([
        fetch('/api/monitor/snapshot'),
        fetch('/api/monitor/events?limit=50'),
      ])

      if (snapRes.ok) {
        snapshot.value = await snapRes.json()
      } else if (snapRes.status !== 404) {
        error.value = `Snapshot fetch failed: ${snapRes.status}`
      }

      if (eventsRes.ok) {
        events.value = await eventsRes.json()
      }

      error.value = null
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    fetchData()
    pollTimer = setInterval(fetchData, POLL_INTERVAL)
  })

  onUnmounted(() => {
    clearInterval(pollTimer)
  })

  async function fetchEvents() {
    try {
      const res = await fetch('/api/monitor/events?limit=50')
      if (res.ok) events.value = await res.json()
    } catch { /* ignore */ }
  }

  return { snapshot, events, loading, error, lastUpdated, isStale, proxmox, vms, jetsons, fetchEvents }
}

// ── Utility functions used by components ──────────────────────────────────────

export function formatUptime(seconds) {
  if (!seconds) return '—'
  if (seconds < 3600)  return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}

export function formatBytes(gb) {
  if (gb == null) return '—'
  return `${gb}G`
}

export function gaugeColor(pct, warnAt = 70, critAt = 90) {
  if (pct == null) return ''
  if (pct >= critAt) return 'red'
  if (pct >= warnAt) return 'amber'
  return 'green'
}

export function isStaleContainer(container) {
  if (!container.lastCommitAt || !container.uptimeSeconds) return false
  const commitAge = (Date.now() - new Date(container.lastCommitAt).getTime()) / 1000
  // Container has been up longer than since the last commit → may be stale
  return container.uptimeSeconds > commitAge + 300 // 5min grace
}

export function formatTime(isoString) {
  if (!isoString) return '—'
  const d = new Date(isoString)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function formatRelative(isoString) {
  if (!isoString) return '—'
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}
