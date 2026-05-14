// ====================================================
//  server.js — Carousel Builder server
//  - Serves index.html (UI) on /
//  - POST /api/render — generates carousel PNGs from JSON
// ====================================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const { spawn } = require('child_process');
const { drawSlide } = require('./lib/draw-node');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json({ limit: '20mb' }));

// ===== Serve static UI =====
app.use(express.static(__dirname, {
  index: 'index.html',
  extensions: ['html']
}));

// ===== Health check =====
app.get('/api/health', (req, res) => {
  res.json({ ok: true, version: '2.0.0', time: new Date().toISOString() });
});

// ===== Default options (mirror UI DEFAULT_OPTS) =====
const DEFAULT_OPTS = {
  theme: 'dark',
  accent: '#D4FA27',
  fontId: 'mont',
  grid: true,
  nickname: '@andre',
  showNickname: true,
  showSwipe: true,
  showProgress: true,
  swipeFilled: false
};

// ===== Render endpoint =====
//
// Body: {
//   slides: [{ type, eyebrow, headline, body, cta, stat, theme, ... }],
//   opts:   { theme, accent, fontId, nickname, ... }   // optional, merged with defaults
//   meta:   { topic, ... }                              // optional
//   format: 'pngs' | 'base64'                           // default: 'base64'
// }
//
// Response (format=base64, default):
// { ok: true, slides: [{ index, base64 }], meta: { ... } }
//
// Response (format=pngs):
// streams a multipart-like JSON with base64 PNGs
// (for now, only base64 mode)
//
app.post('/api/render', async (req, res) => {
  const startTs = Date.now();
  try {
    const body = req.body || {};
    if (!body.slides || !Array.isArray(body.slides) || body.slides.length === 0) {
      return res.status(400).json({ ok: false, error: 'Body must contain non-empty "slides" array' });
    }
    const slides = body.slides;
    const opts = Object.assign({}, DEFAULT_OPTS, body.opts || {});
    const total = slides.length;
    const out = [];

    for (let i = 0; i < total; i++) {
      const slide = slides[i];
      const canvas = await drawSlide(slide, opts, i, total);
      const buf = await canvas.toBuffer('image/png');
      out.push({ index: i + 1, base64: buf.toString('base64') });
    }

    return res.json({
      ok: true,
      meta: body.meta || {},
      count: total,
      duration_ms: Date.now() - startTs,
      slides: out
    });
  } catch (err) {
    console.error('[/api/render] error:', err);
    return res.status(500).json({ ok: false, error: err.message, stack: err.stack });
  }
});

// ===== Trigger orchestrator (Claude → Builder → Telegram) =====
// POST /api/generate?brand=tatiana
//
// Auth: header X-Auth-Token must match env GENERATE_AUTH_TOKEN
//       (set in Railway Variables; if not set — endpoint is disabled)
//
// Body: { brand: "tatiana" | "quanta", dry?: true }  (also can pass via query)
//
// Triggers the same flow as scripts/generate.js but as HTTP request.
app.post('/api/generate', async (req, res) => {
  const requiredToken = process.env.GENERATE_AUTH_TOKEN;
  if (!requiredToken) {
    return res.status(503).json({ ok: false, error: 'GENERATE_AUTH_TOKEN not configured in env' });
  }
  const got = req.header('X-Auth-Token') || req.query.token;
  if (got !== requiredToken) {
    return res.status(401).json({ ok: false, error: 'Invalid X-Auth-Token' });
  }

  const brand = (req.body && req.body.brand) || req.query.brand;
  if (!brand) return res.status(400).json({ ok: false, error: '"brand" is required' });
  const dry = (req.body && req.body.dry) || req.query.dry === '1';

  try {
    const { spawn } = require('child_process');
    const args = ['scripts/generate.js', '--brand=' + brand];
    const env = Object.assign({}, process.env);
    if (dry) env.DRY_RUN = '1';

    let stdout = '', stderr = '';
    const child = spawn(process.execPath, args, { cwd: __dirname, env });
    child.stdout.on('data', d => { stdout += d.toString(); process.stdout.write(d); });
    child.stderr.on('data', d => { stderr += d.toString(); process.stderr.write(d); });
    const exitCode = await new Promise((r) => child.on('close', r));

    return res.json({
      ok: exitCode === 0,
      exitCode,
      brand,
      dry,
      stdout: stdout.slice(-4000),
      stderr: stderr.slice(-2000)
    });
  } catch (err) {
    console.error('[/api/generate] error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ===== Example POST endpoint =====
// GET /api/example — returns sample JSON body for quick testing
app.get('/api/example', (req, res) => {
  res.json({
    description: 'Sample request body for POST /api/render',
    body: {
      meta: { topic: 'Тестовая карусель', brand: 'tatiana' },
      opts: {
        theme: 'dark', accent: '#D4FA27', fontId: 'mont',
        nickname: '@doctor.chernyshova', grid: true,
        showNickname: true, showSwipe: true, showProgress: true
      },
      slides: [
        {
          type: 'cover',
          eyebrow: 'ВЫПУСК · 01',
          headline: 'Заголовок твоей *карусели*',
          body: 'Подзаголовок 1-2 строки',
          cta: null
        },
        {
          type: 'body',
          eyebrow: 'ПРОБЛЕМА',
          headline: 'ОСНОВНОЙ ЗАГОЛОВОК',
          body: 'тело слайда в нижнем регистре',
          cta: 'дальше — главное 👇'
        },
        {
          type: 'cta',
          eyebrow: 'ШАГ ДАЛЬШЕ',
          headline: 'Забери шаблон',
          body: 'Напиши слово в TG — пришлю гайд',
          cta: 'Подписаться'
        }
      ]
    },
    curl: 'curl -X POST http://localhost:8080/api/render -H "Content-Type: application/json" -d @body.json'
  });
});

// ===== Reset brand state (clears posted topics) =====
// POST /api/reset-state?brand=quanta&token=...
app.post('/api/reset-state', (req, res) => {
  const requiredToken = process.env.GENERATE_AUTH_TOKEN;
  if (!requiredToken) {
    return res.status(503).json({ ok: false, error: 'GENERATE_AUTH_TOKEN not configured' });
  }
  const got = req.header('X-Auth-Token') || req.query.token;
  if (got !== requiredToken) {
    return res.status(401).json({ ok: false, error: 'Invalid X-Auth-Token' });
  }
  const brand = (req.body && req.body.brand) || req.query.brand;
  if (!brand) return res.status(400).json({ ok: false, error: '"brand" is required' });

  const fs = require('fs');
  const stateDir = fs.existsSync('/data') ? '/data' : path.join(__dirname, 'output');
  const stateFile = path.join(stateDir, brand + '-state.json');
  try {
    if (fs.existsSync(stateFile)) {
      fs.writeFileSync(stateFile, JSON.stringify({ posted_titles: [] }, null, 2));
      return res.json({ ok: true, message: 'state cleared', brand, stateFile });
    }
    return res.json({ ok: true, message: 'no state file existed', brand, stateFile });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ===== Cron scheduler =====
//
// Env-driven cron jobs. Each var defines a schedule + brand.
//   CRON_TATIANA="0 9,14,19 * * *"   → запуск 9:00, 14:00, 19:00 каждый день
//   CRON_QUANTA="30 11,16,21 * * *"  → запуск 11:30, 16:30, 21:30
//   TZ="Europe/Madrid"               → таймзона (по умолчанию UTC)
//
// Если переменная не задана — для этого бренда cron не запускается.
function runGenerate(brand) {
  console.log(`[cron] firing generate for brand=${brand} at ${new Date().toISOString()}`);
  const args = ['scripts/generate.js', '--brand=' + brand];
  const child = spawn(process.execPath, args, { cwd: __dirname, env: process.env });
  child.stdout.on('data', d => process.stdout.write(d));
  child.stderr.on('data', d => process.stderr.write(d));
  child.on('close', code => console.log(`[cron] brand=${brand} exit=${code}`));
}

// Accept either:
//   - real cron syntax: "0 9,14,19 * * *"
//   - human-friendly: "09:00, 14:00, 19:00"  (all entries must share the same minutes)
function parseFlexibleSchedule(str) {
  if (!str) return null;
  const trimmed = str.trim();
  if (cron.validate(trimmed)) return trimmed;
  const matches = trimmed.match(/(\d{1,2}):(\d{2})/g) || [];
  if (matches.length === 0) return null;
  const times = matches.map(m => {
    const [h, mn] = m.split(':');
    return { h: parseInt(h, 10), m: parseInt(mn, 10) };
  });
  const uniqMins = [...new Set(times.map(t => t.m))];
  if (uniqMins.length !== 1) return null; // mixed minutes — not supported here
  const hours = [...new Set(times.map(t => t.h))].sort((a, b) => a - b).join(',');
  return `${uniqMins[0]} ${hours} * * *`;
}

function setupCron(envName, brand) {
  const raw = process.env[envName];
  if (!raw) return;
  const schedule = parseFlexibleSchedule(raw);
  if (!schedule || !cron.validate(schedule)) {
    console.error(`[cron] invalid schedule for ${envName}: "${raw}" (expected cron syntax or HH:MM, HH:MM, ...)`);
    return;
  }
  cron.schedule(schedule, () => runGenerate(brand), {
    timezone: process.env.TZ || 'UTC'
  });
  console.log(`[cron] scheduled brand=${brand} at "${schedule}" TZ=${process.env.TZ || 'UTC'}` +
    (schedule !== raw ? ` (auto-converted from "${raw}")` : ''));
}

setupCron('CRON_TATIANA', 'tatiana');
setupCron('CRON_QUANTA', 'quanta');

// ===== Start =====
app.listen(PORT, () => {
  console.log('[carousel-builder] listening on port ' + PORT);
  console.log('  UI:        http://localhost:' + PORT + '/');
  console.log('  Health:    http://localhost:' + PORT + '/api/health');
  console.log('  Example:   http://localhost:' + PORT + '/api/example');
  console.log('  Render:    POST http://localhost:' + PORT + '/api/render');
});
