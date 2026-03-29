/**
 * db.js — SQLite setup, queries, and pruning
 *
 * Tables:
 *   snapshots — full homelab snapshots from OpenClaw (pruned after 7 days)
 *   events    — agent activity events (tennis watcher, OpenClaw, Manticore, etc.)
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(__dir, '../../data');

// Ensure data directory exists
mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, 'monitor.db'));

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// ── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS snapshots (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    collected_at TEXT NOT NULL,
    received_at  TEXT NOT NULL,
    payload      TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_snapshots_collected_at
    ON snapshots (collected_at DESC);

  CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    occurred_at TEXT NOT NULL,
    agent       TEXT NOT NULL,
    type        TEXT NOT NULL,
    description TEXT NOT NULL,
    metadata    TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_events_occurred_at
    ON events (occurred_at DESC);
`);

// ── Snapshots ─────────────────────────────────────────────────────────────────

export function insertSnapshot(collectedAt, payload) {
  const stmt = db.prepare(
    'INSERT INTO snapshots (collected_at, received_at, payload) VALUES (?, ?, ?)'
  );
  return stmt.run(collectedAt, new Date().toISOString(), JSON.stringify(payload));
}

export function getLatestSnapshot() {
  const row = db.prepare(
    'SELECT * FROM snapshots ORDER BY collected_at DESC LIMIT 1'
  ).get();
  if (!row) return null;
  return {
    id:          row.id,
    collectedAt: row.collected_at,
    receivedAt:  row.received_at,
    payload:     JSON.parse(row.payload),
  };
}

export function getSnapshotHistory(limit = 10) {
  const rows = db.prepare(
    'SELECT * FROM snapshots ORDER BY collected_at DESC LIMIT ?'
  ).all(Math.min(limit, 100));
  return rows.map(row => ({
    id:          row.id,
    collectedAt: row.collected_at,
    receivedAt:  row.received_at,
    payload:     JSON.parse(row.payload),
  }));
}

export function pruneOldSnapshots() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const result = db.prepare(
    'DELETE FROM snapshots WHERE collected_at < ?'
  ).run(cutoff);
  return result.changes;
}

// ── Events ────────────────────────────────────────────────────────────────────

export function insertEvent(occurredAt, agent, type, description, metadata = null) {
  const stmt = db.prepare(
    'INSERT INTO events (occurred_at, agent, type, description, metadata) VALUES (?, ?, ?, ?, ?)'
  );
  return stmt.run(
    occurredAt,
    agent,
    type,
    description,
    metadata ? JSON.stringify(metadata) : null
  );
}

export function deleteEvent(id) {
  return db.prepare('DELETE FROM events WHERE id = ?').run(id);
}

export function clearAllEvents() {
  return db.prepare('DELETE FROM events').run();
}

export function getEvents(limit = 50) {
  const rows = db.prepare(
    'SELECT * FROM events ORDER BY occurred_at DESC LIMIT ?'
  ).all(Math.min(limit, 200));
  return rows.map(row => ({
    id:          row.id,
    occurredAt:  row.occurred_at,
    agent:       row.agent,
    type:        row.type,
    description: row.description,
    metadata:    row.metadata ? JSON.parse(row.metadata) : null,
  }));
}
