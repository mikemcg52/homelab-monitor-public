/**
 * server.js — Express app entry point
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import monitorRouter from './routes/monitor.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dir, '../public');

const PORT = process.env.PORT || 3010;

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Mount routes
app.use('/api/monitor', monitorRouter);

// Serve frontend in production
if (existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
  app.get('/', (req, res) => res.sendFile(join(PUBLIC_DIR, 'index.html')));
} else {
  app.get('/', (req, res) => res.json({ service: 'homelab-monitor', status: 'ok' }));
}

app.listen(PORT, () => {
  console.log(`homelab-monitor backend running on port ${PORT}`);
});
