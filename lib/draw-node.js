// ====================================================
//  draw-node.js — Carousel slide rendering for Node.js
//  Mirrors browser drawSlide(), but uses @napi-rs/canvas
// ====================================================

const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

// Register fonts (once at module load)
// @napi-rs/canvas matches by family name + weight, so we register multiple
// static-weight files under the same family name.
const fontsDir = path.join(__dirname, '..', 'fonts');
function reg(file, family) {
  try {
    const p = path.join(fontsDir, file);
    GlobalFonts.registerFromPath(p, family);
  } catch (e) {
    console.error('Font reg fail:', file, e.message);
  }
}
reg('Montserrat-Medium.ttf',     'Montserrat');
reg('Montserrat-ExtraBold.ttf',  'Montserrat');
reg('Montserrat-Black.ttf',      'Montserrat');
reg('PlayfairDisplay-Regular.ttf', 'PlayfairDisplay');
reg('PlayfairDisplay-Bold.ttf',    'PlayfairDisplay');
reg('PlayfairDisplay-Black.ttf',   'PlayfairDisplay');
reg('Inter-Medium.ttf',  'Inter');
reg('Inter-Black.ttf',   'Inter');
reg('Anton.ttf',         'Anton');
reg('Oswald-Regular.ttf','Oswald');
reg('Oswald-Bold.ttf',   'Oswald');
reg('Manrope-Regular.ttf','Manrope');
reg('Manrope-Medium.ttf', 'Manrope');
reg('Manrope-Bold.ttf',   'Manrope');
reg('NotoColorEmoji.ttf', 'NotoColorEmoji');

// ===== CONSTANTS (mirrored from browser) =====

const THEMES = {
  dark:     { bg: '#0F0F10', text: '#FFFFFF', body: 'rgba(255,255,255,0.92)', muted: 'rgba(255,255,255,0.55)', progressBg: 'rgba(255,255,255,0.18)', grid: 'rgba(255,255,255,0.04)' },
  light:    { bg: '#F4F1EC', text: '#0F0F10', body: 'rgba(15,15,16,0.85)', muted: 'rgba(15,15,16,0.45)', progressBg: 'rgba(15,15,16,0.15)', grid: 'rgba(15,15,16,0.05)' },
  noir:     { bg: '#050505', text: '#FFFFFF', body: 'rgba(255,255,255,0.95)', muted: 'rgba(255,255,255,0.45)', progressBg: 'rgba(255,255,255,0.15)', grid: 'rgba(255,255,255,0.03)' },
  paper:    { bg: '#F5EDD8', text: '#2C1810', body: 'rgba(44,24,16,0.88)', muted: 'rgba(44,24,16,0.5)', progressBg: 'rgba(44,24,16,0.18)', grid: 'rgba(44,24,16,0.06)' },
  cream:    { bg: '#FBF6E9', text: '#1A1612', body: 'rgba(26,22,18,0.88)', muted: 'rgba(26,22,18,0.5)', progressBg: 'rgba(26,22,18,0.18)', grid: 'rgba(26,22,18,0.05)' },
  ocean:    { bg: '#0A1929', text: '#E0F2FE', body: 'rgba(224,242,254,0.92)', muted: 'rgba(224,242,254,0.55)', progressBg: 'rgba(224,242,254,0.18)', grid: 'rgba(224,242,254,0.04)' },
  forest:   { bg: '#0F1F14', text: '#E8F5E9', body: 'rgba(232,245,233,0.92)', muted: 'rgba(232,245,233,0.55)', progressBg: 'rgba(232,245,233,0.18)', grid: 'rgba(232,245,233,0.04)' },
  blush:    { bg: '#FAE5E0', text: '#3D1E1A', body: 'rgba(61,30,26,0.85)', muted: 'rgba(61,30,26,0.5)', progressBg: 'rgba(61,30,26,0.18)', grid: 'rgba(61,30,26,0.05)' },
  mint:     { bg: '#E6F5EC', text: '#0E2418', body: 'rgba(14,36,24,0.85)', muted: 'rgba(14,36,24,0.5)', progressBg: 'rgba(14,36,24,0.18)', grid: 'rgba(14,36,24,0.05)' },
  lavender: { bg: '#EDE5F5', text: '#1F1438', body: 'rgba(31,20,56,0.85)', muted: 'rgba(31,20,56,0.5)', progressBg: 'rgba(31,20,56,0.18)', grid: 'rgba(31,20,56,0.05)' },
  charcoal: { bg: '#1A1D24', text: '#F5F5F5', body: 'rgba(245,245,245,0.92)', muted: 'rgba(245,245,245,0.55)', progressBg: 'rgba(245,245,245,0.18)', grid: 'rgba(245,245,245,0.04)' },
  vintage:  { bg: '#E8DDC9', text: '#3D2817', body: 'rgba(61,40,23,0.88)', muted: 'rgba(61,40,23,0.5)', progressBg: 'rgba(61,40,23,0.18)', grid: 'rgba(61,40,23,0.06)' }
};

const FONT_SETS = {
  mont:      { display: 'Montserrat',     body: 'Montserrat',     weights: { display: '800', body: '500' } },
  editorial: { display: 'PlayfairDisplay', body: 'Manrope',        weights: { display: '900', body: '400' } },
  modern:    { display: 'Inter',          body: 'Inter',          weights: { display: '900', body: '500' } },
  bold:      { display: 'Anton',          body: 'Manrope',        weights: { display: '400', body: '500' } },
  classic:   { display: 'Oswald',         body: 'Manrope',        weights: { display: '700', body: '500' } }
};

// ===== HELPERS =====

function pad2(n) { return String(n).padStart(2, '0'); }

function rgbaFromHex(hex, alpha) {
  if (alpha == null) alpha = 1;
  const s = (hex || '').replace('#', '');
  if (s.length !== 6) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function luminance(hex) {
  const s = (hex || '').replace('#', '');
  if (s.length !== 6) return 0;
  const r = parseInt(s.slice(0, 2), 16) / 255;
  const g = parseInt(s.slice(2, 4), 16) / 255;
  const b = parseInt(s.slice(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function contrastText(bg) { return luminance(bg) > 0.5 ? '#0a0a0a' : '#FFFFFF'; }

function effectiveAccent(accent, bg) {
  const la = luminance(accent), lb = luminance(bg);
  if (Math.abs(la - lb) < 0.15) return lb > 0.5 ? '#0a0a0a' : '#FFFFFF';
  return accent;
}

function roundRect(ctx, x, y, w, hh, r) {
  if (r < 0) r = 0;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + hh - r);
  ctx.arcTo(x + w, y + hh, x + w - r, y + hh, r);
  ctx.lineTo(x + r, y + hh);
  ctx.arcTo(x, y + hh, x, y + hh - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function tokenizeAccent(text) {
  if (!text) return [];
  return text.split(/(\*[^*]+\*)/g).filter(s => s !== '');
}

function wrapAccentText(ctx, text, maxWidth) {
  if (!text) return [];
  const paragraphs = String(text).split('\n');
  const allLines = [];
  for (const para of paragraphs) {
    if (para.trim() === '') {
      allLines.push([{ text: '', accent: false, w: 0 }]);
      continue;
    }
    const tokens = tokenizeAccent(para);
    const words = [];
    for (const tok of tokens) {
      const isAccent = tok.length > 1 && tok.charAt(0) === '*' && tok.charAt(tok.length - 1) === '*';
      const tt = isAccent ? tok.slice(1, -1) : tok;
      const parts = tt.split(/(\s+)/g).filter(s => s !== '');
      for (const p of parts) {
        words.push({ text: p, accent: isAccent });
      }
    }
    let curLine = [];
    let curW = 0;
    for (const word of words) {
      const ww = ctx.measureText(word.text).width;
      const isSpace = /^\s+$/.test(word.text);
      if (isSpace) {
        if (curLine.length > 0 && curW + ww <= maxWidth) {
          curLine.push({ text: word.text, accent: word.accent, w: ww });
          curW += ww;
        }
        continue;
      }
      if (curW + ww > maxWidth && curLine.length > 0) {
        while (curLine.length && /^\s+$/.test(curLine[curLine.length - 1].text)) curLine.pop();
        allLines.push(curLine);
        curLine = [{ text: word.text, accent: word.accent, w: ww }];
        curW = ww;
      } else {
        curLine.push({ text: word.text, accent: word.accent, w: ww });
        curW += ww;
      }
    }
    if (curLine.length > 0) {
      while (curLine.length && /^\s+$/.test(curLine[curLine.length - 1].text)) curLine.pop();
      allLines.push(curLine);
    }
  }
  return allLines;
}

function drawWrappedAccent(ctx, lines, x, y, lineH, normalColor, accentColor, highlight, fontSize) {
  let cy = y;
  for (const line of lines) {
    // Phase 1: highlight markers (drawn BEFORE text)
    if (highlight === 'marker') {
      let cx2 = x;
      const padX = 6;
      const padTop = (fontSize || lineH * 0.85) * 0.42;
      const padBot = (fontSize || lineH * 0.85) * 0.08;
      for (const seg of line) {
        if (seg.accent && seg.text.trim().length > 0) {
          ctx.save();
          ctx.fillStyle = accentColor;
          ctx.globalAlpha = 0.45;
          ctx.fillRect(cx2 - padX, cy + padTop, seg.w + padX * 2, (fontSize || lineH * 0.85) - padTop + padBot);
          ctx.restore();
        }
        cx2 += seg.w;
      }
    }
    // Phase 2: actual text
    let cx = x;
    for (const seg of line) {
      if (seg.accent) {
        // In marker mode, accent text becomes high-contrast (dark on light marker)
        ctx.fillStyle = highlight === 'marker' ? '#0F0F10' : accentColor;
      } else {
        ctx.fillStyle = normalColor;
      }
      ctx.fillText(seg.text, cx, cy);
      cx += seg.w;
    }
    cy += lineH;
  }
  return cy;
}

// ===== SLIDE RENDERING =====

async function drawSlide(slide, opts, index, total) {
  const W = 1080, H = 1350;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'top';

  const themeKey = (slide.theme && slide.theme !== 'default') ? slide.theme : opts.theme;
  const theme = THEMES[themeKey] || THEMES.dark;
  const fonts = FONT_SETS[opts.fontId] || FONT_SETS.mont;

  // 1. Background
  let img = null;
  if (slide.coverImage) {
    try { img = await loadImage(slide.coverImage); } catch (e) { img = null; }
  }
  const hasImage = !!img;
  if (hasImage) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const ir = img.width / img.height;
    const cr = W / H;
    let dw, dh, dx, dy;
    if (ir > cr) { dh = H; dw = H * ir; dx = (W - dw) / 2; dy = 0; }
    else { dw = W; dh = W / ir; dx = 0; dy = (H - dh) / 2; }
    ctx.drawImage(img, dx, dy, dw, dh);
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    const gStr = slide.gradientStrength != null ? slide.gradientStrength : 80;
    grad.addColorStop(0, `rgba(0,0,0,${Math.min(0.6, gStr / 200)})`);
    grad.addColorStop(0.5, `rgba(0,0,0,${gStr / 150})`);
    grad.addColorStop(1, `rgba(0,0,0,${Math.min(0.95, gStr / 100)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, H);
  }

  // 2. Grid
  if (opts.grid && !hasImage) {
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= W; gx += 80) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    for (let gy = 0; gy <= H; gy += 80) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }
  }

  // 2.5. Background emoji decoration
  if (slide.bgEmoji && opts.showBgEmoji !== false) {
    const sz = slide.bgEmojiSize || 480;
    const op = slide.bgEmojiOpacity != null ? slide.bgEmojiOpacity : 0.18;
    ctx.save();
    ctx.globalAlpha = op;
    ctx.font = `${sz}px NotoColorEmoji, "Apple Color Emoji", "Segoe UI Emoji"`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    try { ctx.fillText(slide.bgEmoji, W - 40, 220); } catch (e) {}
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  }

  const textColor = hasImage ? '#FFFFFF' : theme.text;
  const bodyColor = hasImage ? 'rgba(255,255,255,0.92)' : theme.body;
  const mutedColor = hasImage ? 'rgba(255,255,255,0.75)' : theme.muted;
  const accentEff = hasImage ? opts.accent : effectiveAccent(opts.accent, theme.bg);
  const ctaTextC = contrastText(opts.accent);

  // 3. Top: accent line + counter
  const TOP_Y = 80;
  ctx.fillStyle = accentEff;
  ctx.fillRect(72, TOP_Y, 240, 3);
  ctx.font = `500 22px ${fonts.body}`;
  ctx.fillStyle = mutedColor;
  ctx.textAlign = 'right';
  ctx.fillText(`${pad2(index + 1)} / ${pad2(total)}`, W - 72, TOP_Y - 8);
  ctx.textAlign = 'left';

  // 4. Compute layout
  const PAD = 72;
  const CW = W - PAD * 2;
  const isCover = slide.type === 'cover';
  const isStat = slide.type === 'stat';
  const isCta = slide.type === 'cta';

  const SZ = {
    eyebrow: 24, headlineCover: 88, headline: 72, body: 36,
    statValue: 240, statLabel: 34, cta: 36, footer: 24, swipe: 24
  };

  const units = [];

  if (slide.eyebrow) {
    const ebText = slide.eyebrow;
    const ebFont = `700 ${SZ.eyebrow}px ${fonts.body}, NotoColorEmoji`;
    units.push({
      group: 'text',
      height: SZ.eyebrow * 1.2 + 20,
      draw(y) {
        ctx.font = ebFont;
        ctx.fillStyle = accentEff;
        ctx.textAlign = 'left';
        ctx.fillText(String(ebText).toUpperCase(), PAD, y);
      }
    });
  }

  if (isStat && slide.stat && slide.stat.value) {
    const vSize = SZ.statValue;
    const vFont = `${fonts.weights.display} ${vSize}px ${fonts.display}`;
    const vText = String(slide.stat.value);
    units.push({
      group: 'text',
      height: vSize * 0.95,
      draw(y) {
        ctx.font = vFont;
        ctx.fillStyle = accentEff;
        ctx.textAlign = 'left';
        ctx.fillText(vText, PAD, y);
      }
    });
    if (slide.stat.label) {
      const labFont = `${fonts.weights.body} ${SZ.statLabel}px ${fonts.body}`;
      ctx.font = labFont;
      const labLines = wrapAccentText(ctx, slide.stat.label, CW);
      const lh1 = SZ.statLabel * 1.35;
      units.push({
        group: 'text',
        height: labLines.length * lh1,
        draw(y) {
          ctx.font = labFont;
          drawWrappedAccent(ctx, labLines, PAD, y, lh1, bodyColor, accentEff);
        }
      });
    }
  }

  const highlight = opts.highlightStyle || 'color';

  if (slide.headline) {
    const hSize = isCover ? SZ.headlineCover : SZ.headline;
    // Cover headlines use heaviest weight available
    const hWeight = isCover ? '900' : fonts.weights.display;
    // Fallback to NotoColorEmoji for glyphs not present in main font (e.g. 🎯)
    const hFont = `${hWeight} ${hSize}px ${fonts.display}, NotoColorEmoji`;
    ctx.font = hFont;
    const hLines = wrapAccentText(ctx, slide.headline, CW);
    const lh2 = hSize * 1.05;
    units.push({
      group: 'text',
      height: hLines.length * lh2,
      draw(y) {
        ctx.font = hFont;
        drawWrappedAccent(ctx, hLines, PAD, y, lh2, textColor, accentEff, highlight, hSize);
      }
    });
  }

  if (slide.body && !isStat) {
    const bFont = `${fonts.weights.body} ${SZ.body}px ${fonts.body}, NotoColorEmoji`;
    ctx.font = bFont;
    const bLines = wrapAccentText(ctx, slide.body, CW);
    const lh3 = SZ.body * 1.4;
    units.push({
      group: 'text',
      height: bLines.length * lh3,
      draw(y) {
        ctx.font = bFont;
        drawWrappedAccent(ctx, bLines, PAD, y, lh3, bodyColor, accentEff, highlight, SZ.body);
      }
    });
  }

  if (isStat && slide.body) {
    const sFont = `${fonts.weights.body} 28px ${fonts.body}`;
    ctx.font = sFont;
    const sLines = wrapAccentText(ctx, slide.body, CW);
    const lh4 = 28 * 1.4;
    units.push({
      group: 'text',
      height: sLines.length * lh4,
      draw(y) {
        ctx.font = sFont;
        drawWrappedAccent(ctx, sLines, PAD, y, lh4, mutedColor, accentEff, highlight, 28);
      }
    });
  }

  if (isCta && slide.cta) {
    const ctaText = String(slide.cta);
    const cFont = `700 ${SZ.cta}px ${fonts.body}`;
    ctx.font = cFont;
    const tw = ctx.measureText(ctaText).width;
    const bh = 88, bpx = 44;
    const bw = Math.min(CW, tw + bpx * 2);
    units.push({
      group: 'cta',
      height: bh + 24,
      draw(y) {
        roundRect(ctx, PAD, y, bw, bh, bh / 2);
        ctx.fillStyle = accentEff;
        ctx.fill();
        ctx.font = cFont;
        ctx.fillStyle = ctaTextC;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(ctaText, PAD + bpx, y + bh / 2);
        ctx.textBaseline = 'top';
      }
    });
  }

  const GAP_TEXT = 30, GAP_GROUP = 50;
  let totalH = 0;
  for (let u = 0; u < units.length; u++) {
    totalH += units[u].height;
    if (u < units.length - 1) {
      totalH += units[u].group === units[u + 1].group ? GAP_TEXT : GAP_GROUP;
    }
  }

  const CONTENT_TOP = 200, CONTENT_BOTTOM = H - 220;
  const CONTENT_H = CONTENT_BOTTOM - CONTENT_TOP;
  let startY;
  const pos = slide.position || 'auto';
  if (pos === 'top') startY = CONTENT_TOP;
  else if (pos === 'bottom') startY = CONTENT_BOTTOM - totalH;
  else if (pos === 'middle') startY = CONTENT_TOP + (CONTENT_H - totalH) / 2;
  else {
    if (isCover) startY = CONTENT_BOTTOM - totalH;
    else if (isStat) startY = CONTENT_TOP + (CONTENT_H - totalH) / 2;
    else startY = CONTENT_TOP + (CONTENT_H - totalH) * 0.45;
  }
  startY = Math.max(CONTENT_TOP, Math.min(CONTENT_BOTTOM - totalH, startY));

  // 5. Backdrop
  const backdropStyle = slide.backdropStyle || 'none';
  if (backdropStyle !== 'none' && units.length > 0) {
    let yScan = startY;
    let by1 = null, by2 = null;
    for (let v = 0; v < units.length; v++) {
      if (units[v].group === 'text') {
        if (by1 === null) by1 = yScan;
        by2 = yScan + units[v].height;
      }
      yScan += units[v].height;
      if (v < units.length - 1) {
        yScan += units[v].group === units[v + 1].group ? GAP_TEXT : GAP_GROUP;
      }
    }
    if (by1 !== null && by2 !== null) {
      const padX = 36, padY = 28;
      const bx = PAD - padX;
      const byT = by1 - padY;
      const bw2 = CW + padX * 2;
      const bh2 = (by2 - by1) + padY * 2;
      const opacityDefault = backdropStyle === 'quote' ? 25 : 20;
      const op = (slide.backdropOpacity != null ? slide.backdropOpacity : opacityDefault) / 100;
      if (backdropStyle === 'quote') {
        ctx.fillStyle = rgbaFromHex(opts.accent, op);
        roundRect(ctx, bx, byT, bw2, bh2, 16);
        ctx.fill();
        ctx.fillStyle = accentEff;
        ctx.fillRect(bx, byT, 10, bh2);
      } else {
        ctx.fillStyle = rgbaFromHex(opts.accent, op);
        roundRect(ctx, bx, byT, bw2, bh2, 20);
        ctx.fill();
      }
    }
  }

  // 6. Draw units
  let cy = startY;
  for (let w2 = 0; w2 < units.length; w2++) {
    units[w2].draw(cy);
    cy += units[w2].height;
    if (w2 < units.length - 1) {
      cy += units[w2].group === units[w2 + 1].group ? GAP_TEXT : GAP_GROUP;
    }
  }

  // 7. Footer
  const FOOTER_Y = H - 100;
  if (opts.showNickname && opts.nickname) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = accentEff;
    ctx.beginPath();
    ctx.arc(PAD + 6, FOOTER_Y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `500 ${SZ.footer}px ${fonts.body}`;
    ctx.fillStyle = mutedColor;
    ctx.fillText(opts.nickname, PAD + 28, FOOTER_Y);
  }
  if (opts.showSwipe && index < total - 1 && !isCta) {
    const sText = 'ЛИСТАЙ →';
    ctx.font = `700 ${SZ.swipe}px ${fonts.body}`;
    const stw = ctx.measureText(sText).width;
    const sbh = 64, sbpx = 28;
    const sbw = stw + sbpx * 2;
    const sbx = W - PAD - sbw;
    const sby = FOOTER_Y - sbh / 2;
    if (opts.swipeFilled) {
      roundRect(ctx, sbx, sby, sbw, sbh, sbh / 2);
      ctx.fillStyle = accentEff;
      ctx.fill();
      ctx.fillStyle = ctaTextC;
    } else {
      roundRect(ctx, sbx, sby, sbw, sbh, sbh / 2);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = accentEff;
      ctx.stroke();
      ctx.fillStyle = accentEff;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sText, sbx + sbw / 2, sby + sbh / 2);
  }
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  // 8. Progress bar
  if (opts.showProgress) {
    const pbY = H - 24, pbX = PAD, pbW = W - PAD * 2, pbH = 4;
    ctx.fillStyle = theme.progressBg;
    roundRect(ctx, pbX, pbY, pbW, pbH, 2);
    ctx.fill();
    const filled = ((index + 1) / total) * pbW;
    ctx.fillStyle = accentEff;
    roundRect(ctx, pbX, pbY, filled, pbH, 2);
    ctx.fill();
  }

  return canvas;
}

module.exports = { drawSlide };
