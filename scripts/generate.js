#!/usr/bin/env node
// ====================================================
//  generate.js — Carousel Orchestrator
//
//  Usage:  node scripts/generate.js --brand=tatiana
//
//  What it does:
//  1. Reads brands/<brand>/system-prompt.md + style.md + topics.json + config.json
//  2. Picks the next unposted topic
//  3. Calls Claude API with brand-specific prompt and topic
//  4. Parses JSON carousel from Claude response
//  5. Calls Carousel Builder API to render PNGs
//  6. Saves PNGs to output/<brand>-<timestamp>/
//  7. Sends as media-group to Andre's Telegram via bot
//  8. Marks topic as posted in topics.json
//
//  Required env vars:
//    ANTHROPIC_API_KEY      — Anthropic API key
//    TELEGRAM_BOT_TOKEN     — Telegram bot token (from @BotFather)
//    TELEGRAM_CHAT_ID       — Andre's Telegram user id
//
//  Optional env vars:
//    BUILDER_API_URL        — default: prod Railway URL
//    CLAUDE_MODEL           — default: claude-sonnet-4-6
//    DRY_RUN                — if "1", skip Telegram + don't mark posted
// ====================================================

const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk').default;
const FormData = require('form-data');
const minimist = require('minimist');

const argv = minimist(process.argv.slice(2));
const brand = argv.brand;
if (!brand) {
  console.error('Usage: node scripts/generate.js --brand=tatiana');
  process.exit(1);
}

const ROOT = path.join(__dirname, '..');
const brandDir = path.join(ROOT, 'brands', brand);
if (!fs.existsSync(brandDir)) {
  console.error('Brand directory not found:', brandDir);
  process.exit(1);
}

function loadFile(relPath, optional = false) {
  const full = path.join(brandDir, relPath);
  if (!fs.existsSync(full)) {
    if (optional) return '';
    console.error('Missing file:', full);
    process.exit(1);
  }
  return fs.readFileSync(full, 'utf8');
}

const systemPrompt = loadFile('system-prompt.md');
const styleNote = loadFile('style.md', true);
const topics = JSON.parse(loadFile('topics.json'));
const config = JSON.parse(loadFile('config.json'));

const nextTopic = topics.find(t => !t.posted);
if (!nextTopic) {
  console.error(`[${brand}] No unposted topics left. Add more to brands/${brand}/topics.json`);
  process.exit(2);
}

const BUILDER_API_URL = process.env.BUILDER_API_URL ||
  'https://carousel-builder-production.up.railway.app/api/render';
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
const DRY_RUN = process.env.DRY_RUN === '1';

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY env var');
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildUserMessage(topic, cfg) {
  return `Тема для карусели: «${topic.title}»

Ответы на 6 вопросов перед стартом:

1. Исходник: ${topic.source || topic.title}
2. Тип карусели: ${topic.type || 'воронка'}
3. Кодовое слово: ${(topic.codeword || cfg.default_codeword).toUpperCase()}
   Лид-магнит: ${topic.lead_magnet || cfg.default_lead_magnet}
4. Уровень провокации: ${topic.provocation || 'средняя'}
5. Длина: ${topic.length || 'стандартная'}
6. Конкретный кейс пациентки / факт: ${topic.case || 'свободно подбери релевантный'}

Выдай карусель в виде JSON-блока в обратных кавычках. Без вступления, без пояснений. Только ` + '```json ... ```' + ` блок.`;
}

function extractJSON(text) {
  // First try fenced ```json ... ```
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (fenced) return fenced[1].trim();
  // Fallback: find first {...} block
  const braceStart = text.indexOf('{');
  const braceEnd = text.lastIndexOf('}');
  if (braceStart >= 0 && braceEnd > braceStart) {
    return text.slice(braceStart, braceEnd + 1);
  }
  return null;
}

async function callClaude() {
  const userMsg = buildUserMessage(nextTopic, config);
  console.log(`[${brand}] Topic: "${nextTopic.title}"`);
  console.log(`[${brand}] Calling Claude (${CLAUDE_MODEL})...`);
  const start = Date.now();

  const fullSystem = systemPrompt + (
    styleNote ? '\n\n=== ДОПОЛНИТЕЛЬНЫЙ STYLE GUIDE ===\n\n' + styleNote : ''
  );

  const resp = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8000,
    system: [
      { type: 'text', text: fullSystem, cache_control: { type: 'ephemeral' } }
    ],
    messages: [{ role: 'user', content: userMsg }]
  });
  const ms = Date.now() - start;

  const text = resp.content.map(c => c.text || '').join('\n');
  const cache = resp.usage;
  console.log(`[${brand}] Claude responded in ${ms}ms`,
    `input: ${cache.input_tokens}`,
    `output: ${cache.output_tokens}`,
    `cache_create: ${cache.cache_creation_input_tokens || 0}`,
    `cache_read: ${cache.cache_read_input_tokens || 0}`);

  const jsonRaw = extractJSON(text);
  if (!jsonRaw) {
    console.error('No JSON block found in Claude response:');
    console.error(text);
    throw new Error('No JSON block in Claude response');
  }
  try {
    return JSON.parse(jsonRaw);
  } catch (err) {
    console.error('Failed to parse JSON from Claude:', err.message);
    console.error('--- raw ---'); console.error(jsonRaw);
    throw err;
  }
}

async function callBuilderAPI(carousel) {
  console.log(`[${brand}] Rendering ${carousel.slides ? carousel.slides.length : 0} slides...`);
  const start = Date.now();
  const body = {
    meta: Object.assign({ topic: nextTopic.title, brand }, carousel.meta || {}),
    opts: config.opts || {},
    slides: carousel.slides || []
  };
  const resp = await fetch(BUILDER_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error('Builder API failed: ' + resp.status + ' ' + txt.slice(0, 500));
  }
  const data = await resp.json();
  console.log(`[${brand}] Rendered ${data.count} slides in ${Date.now() - start}ms`);
  return data;
}

function savePNGs(renderData) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.join(ROOT, 'output', `${brand}-${stamp}`);
  fs.mkdirSync(outDir, { recursive: true });
  const files = [];
  for (const s of renderData.slides) {
    const fname = `slide-${String(s.index).padStart(2, '0')}.png`;
    const full = path.join(outDir, fname);
    fs.writeFileSync(full, Buffer.from(s.base64, 'base64'));
    files.push(full);
  }
  console.log(`[${brand}] PNGs saved → ${outDir}`);
  return { outDir, files };
}

async function sendToTelegram(files, captionText) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.log(`[${brand}] TG creds not set — skipping Telegram delivery (DRY mode)`);
    return;
  }
  // Telegram media-group: max 10 photos per group
  const groups = [];
  for (let i = 0; i < files.length; i += 10) groups.push(files.slice(i, i + 10));

  for (let g = 0; g < groups.length; g++) {
    const group = groups[g];
    const form = new FormData();
    form.append('chat_id', chatId);
    const media = group.map((f, idx) => {
      const fieldName = `photo${g}_${idx}`;
      form.append(fieldName, fs.createReadStream(f), { filename: path.basename(f) });
      return {
        type: 'photo',
        media: 'attach://' + fieldName,
        caption: (g === 0 && idx === 0) ? captionText : undefined
      };
    });
    form.append('media', JSON.stringify(media));

    const url = `https://api.telegram.org/bot${token}/sendMediaGroup`;
    const resp = await new Promise((resolve, reject) => {
      form.submit(url, (err, res) => {
        if (err) return reject(err);
        let chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({
          status: res.statusCode,
          body: Buffer.concat(chunks).toString()
        }));
        res.on('error', reject);
      });
    });
    if (resp.status !== 200) {
      throw new Error('Telegram sendMediaGroup failed: ' + resp.status + ' ' + resp.body);
    }
    console.log(`[${brand}] TG group ${g + 1}/${groups.length} sent`);
  }
}

function markPosted() {
  const topicsPath = path.join(brandDir, 'topics.json');
  const refresh = JSON.parse(fs.readFileSync(topicsPath, 'utf8'));
  const idx = refresh.findIndex(t => t.title === nextTopic.title && !t.posted);
  if (idx >= 0) {
    refresh[idx].posted = true;
    refresh[idx].posted_at = new Date().toISOString();
    fs.writeFileSync(topicsPath, JSON.stringify(refresh, null, 2));
    console.log(`[${brand}] Topic marked as posted`);
  }
}

async function main() {
  if (DRY_RUN) console.log(`[${brand}] DRY_RUN mode — no TG send, no marking posted`);

  const carousel = await callClaude();
  console.log(`[${brand}] Claude returned ${carousel.slides ? carousel.slides.length : 0} slides`);

  const renderData = await callBuilderAPI(carousel);
  const { outDir, files } = savePNGs(renderData);

  const codeword = (nextTopic.codeword || config.default_codeword).toUpperCase();
  const caption = `🆕 ${config.name}\n📌 ${nextTopic.title}\n🔑 ${codeword}\n📦 ${files.length} слайдов`;

  if (!DRY_RUN) {
    await sendToTelegram(files, caption);
    markPosted();
  }

  console.log(`[${brand}] ✓ Done. Files in: ${outDir}`);
}

main().catch(err => {
  console.error(`[${brand}] FATAL:`, err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
