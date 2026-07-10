// upload-data.js — push the freshly-built data.json into the Passd Supabase
// project's app_data table (the gated source of truth once the paywall is live).
// Reads credentials from .passd-backend.env at the repo root (gitignored):
//   SUPABASE_URL=https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=eyJ...
// Called by scripts/weekly-refresh.ps1 (when the env file exists) and
// scripts/deploy-backend.ps1. Exits 0 with a note when not configured.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

function readEnv() {
  const p = path.join(ROOT, '.passd-backend.env');
  if (!fs.existsSync(p)) return null;
  const env = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

(async () => {
  const env = readEnv();
  if (!env || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('upload-data: .passd-backend.env not configured — skipping (site stays on bundled data)');
    return;
  }
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data.json'), 'utf8'));
  if (!raw || !Array.isArray(raw.properties) || raw.properties.length === 0) {
    console.error('upload-data: data.json empty or malformed — refusing to upload');
    process.exit(1);
  }
  const res = await fetch(env.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/app_data', {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify([{ key: 'passed_in', generated: raw.generated, payload: raw, updated_at: new Date().toISOString() }]),
  });
  if (!res.ok) {
    console.error('upload-data: FAILED', res.status, await res.text());
    process.exit(1);
  }
  console.log('upload-data: OK —', raw.properties.length, 'properties, generated', raw.generated);
})();
