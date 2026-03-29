/**
 * routes/monitor.js — all /api/monitor/* endpoints
 */

import { Router } from 'express';
import {
  insertSnapshot,
  getLatestSnapshot,
  getSnapshotHistory,
  pruneOldSnapshots,
  insertEvent,
  getEvents,
  deleteEvent,
  clearAllEvents,
} from '../db.js';

const router = Router();

// ── Auth middleware ───────────────────────────────────────────────────────────

function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || key !== process.env.MONITOR_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ── Snapshot endpoints ────────────────────────────────────────────────────────

// POST /api/monitor/ingest — receive snapshot from OpenClaw
router.post('/ingest', requireApiKey, (req, res) => {
  const payload = req.body;

  if (!payload || !payload.collectedAt) {
    return res.status(400).json({ error: 'Missing collectedAt in payload' });
  }

  insertSnapshot(payload.collectedAt, payload);

  // Prune old snapshots on every ingest (cheap operation)
  const pruned = pruneOldSnapshots();
  if (pruned > 0) {
    console.log(`Pruned ${pruned} old snapshot(s)`);
  }

  res.status(201).json({ ok: true });
});

// GET /api/monitor/snapshot — latest snapshot
router.get('/snapshot', (req, res) => {
  const snapshot = getLatestSnapshot();
  if (!snapshot) {
    return res.status(404).json({ error: 'No snapshots yet' });
  }
  res.json(snapshot);
});

// GET /api/monitor/history?limit=N — recent snapshots
router.get('/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  res.json(getSnapshotHistory(limit));
});

// ── Event endpoints ───────────────────────────────────────────────────────────

// POST /api/monitor/events — receive agent event
router.post('/events', requireApiKey, (req, res) => {
  const { agent, type, description, metadata } = req.body;

  if (!agent || !type || !description) {
    return res.status(400).json({ error: 'Missing required fields: agent, type, description' });
  }

  const occurredAt = req.body.occurredAt || new Date().toISOString();
  insertEvent(occurredAt, agent, type, description, metadata);

  res.status(201).json({ ok: true });
});

// GET /api/monitor/events?limit=N — recent events
router.get('/events', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(getEvents(limit));
});

// DELETE /api/monitor/events — clear all events (no auth — internal dashboard only)
router.delete('/events', (req, res) => {
  clearAllEvents();
  res.json({ ok: true });
});

// DELETE /api/monitor/events/:id — delete single event
router.delete('/events/:id', (req, res) => {
  deleteEvent(parseInt(req.params.id));
  res.json({ ok: true });
});

// ── Chat proxy ──────────────────────────────────────────────────────────────

router.post('/chat', async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });

  const gatewayUrl   = process.env.OPENCLAW_GATEWAY_URL;
  const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  if (!gatewayUrl || !gatewayToken) {
    return res.status(503).json({ error: 'OpenClaw gateway not configured' });
  }

  // Inject latest snapshot as system context
  const snapshot = getLatestSnapshot();
  const systemPrompt = snapshot
    ? `You are a homelab assistant with access to live infrastructure data and the ability to run commands on homelab machines.

SSH ACCESS: You have SSH access to the following hosts using key ~/.ssh/openclaw_collector:
- apps VM:    ...@...
- infra VM:   ...@...  (this machine)
- ci-runner:  ...@...
- Orin NX:    jetson@...
- Orin Nano:  jetson@...
- Nano 4GB:   jetson@...
- Nano 2GB:   jetson@...

When asked to investigate a problem, use your exec tool to SSH in and run relevant commands (df -h, docker system df, docker logs, journalctl, etc.). Be concise and actionable in your findings.

Current snapshot collected at ${snapshot.collectedAt}:
${JSON.stringify(snapshot.payload, null, 2)}`
    : 'You are a homelab assistant with SSH access to homelab machines. No snapshot data is currently available.';

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: message },
  ];

  // Set up SSE stream
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Heartbeat every 15s to prevent proxy/browser timeouts
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    const response = await fetch(`${gatewayUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${gatewayToken}`,
      },
      body: JSON.stringify({ model: 'openclaw', messages, stream: true }),
      signal: AbortSignal.timeout(300000), // 5 min for long tool-use operations
    });

    if (!response.ok) {
      const text = await response.text();
      send('error', { error: `Gateway error: ${response.status} ${text}` });
      clearInterval(heartbeat);
      return res.end();
    }

    // Stream SSE chunks from gateway to client
    const decoder = new TextDecoder();
    let buffer = '';

    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          send('done', {});
          clearInterval(heartbeat);
          return res.end();
        }
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) send('chunk', { delta });
        } catch { /* skip malformed chunks */ }
      }
    }

    send('done', {});
  } catch (err) {
    send('error', { error: `Gateway unreachable: ${err.message}` });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

// ── Health check ──────────────────────────────────────────────────────────────

router.get('/health', (req, res) => {
  const snapshot = getLatestSnapshot();
  res.json({
    ok:             true,
    lastSnapshotAt: snapshot?.collectedAt || null,
  });
});

export default router;
