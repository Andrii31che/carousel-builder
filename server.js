// ====================================================
//  server.js — Carousel Builder server
//  - Serves index.html (UI) on /
//  - POST /api/render — generates carousel PNGs from JSON
// ====================================================

const express = require('express');
const cors = require('cors');
const path = require('path');
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

// ===== Start =====
app.listen(PORT, () => {
  console.log('[carousel-builder] listening on port ' + PORT);
  console.log('  UI:        http://localhost:' + PORT + '/');
  console.log('  Health:    http://localhost:' + PORT + '/api/health');
  console.log('  Example:   http://localhost:' + PORT + '/api/example');
  console.log('  Render:    POST http://localhost:' + PORT + '/api/render');
});
