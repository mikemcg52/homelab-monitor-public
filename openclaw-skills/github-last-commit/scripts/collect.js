#!/usr/bin/env node
/**
 * github-last-commit/scripts/collect.js
 *
 * Fetches the latest commit for each registered homelab GitHub repo.
 * All repos are private — requires GITHUB_TOKEN env var with repo scope.
 *
 * Usage:
 *   GITHUB_TOKEN=ghp_... node scripts/collect.js
 *
 * Output: JSON array to stdout, one entry per repo.
 */

import https from 'https';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const TIMEOUT_MS   = 10000;

if (!GITHUB_TOKEN) {
  console.error('GITHUB_TOKEN env var is required');
  process.exit(1);
}

// Repos to track — maps repo slug to the containers it serves
const REPOS = [
  '.../...',
  '.../...',
];

// ── HTTP helper ───────────────────────────────────────────────────────────────

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept':        'application/vnd.github.v3+json',
        'User-Agent':    'homelab-monitor/1.0',
      },
      timeout: TIMEOUT_MS,
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: ${data.message || body.slice(0, 100)}`));
          } else {
            resolve(data);
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${body.slice(0, 100)}`));
        }
      });
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('Connection timed out')); });
    req.on('error', reject);
  });
}

// ── Collector ─────────────────────────────────────────────────────────────────

async function fetchRepo(repo) {
  try {
    // Try master first, fall back to main
    let data;
    try {
      data = await fetchJson(`https://api.github.com/repos/${repo}/commits/master`);
    } catch (err) {
      if (err.message.includes('404') || err.message.includes('409') || err.message.includes('422')) {
        data = await fetchJson(`https://api.github.com/repos/${repo}/commits/main`);
      } else {
        throw err;
      }
    }

    return {
      repo,
      sha:         data.sha?.slice(0, 8) || null,
      committedAt: data.commit?.author?.date || null,
      message:     data.commit?.message?.split('\n')[0] || null,  // first line only
      author:      data.commit?.author?.name || null,
    };

  } catch (err) {
    return {
      repo,
      sha:         null,
      committedAt: null,
      message:     null,
      author:      null,
      error:       err.message,
    };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const results = await Promise.all(REPOS.map(fetchRepo));
console.log(JSON.stringify(results, null, 2));
