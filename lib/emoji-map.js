// ====================================================
//  emoji-map.js — Microsoft Fluent 3D Emoji lookup
// ====================================================
//
// Provides which emoji codepoints have a Fluent 3D PNG in our `fonts/fluent-emoji/`
// folder. Codepoints are uppercased hex strings without '0x' prefix.
//
// Source: https://github.com/microsoft/fluentui-emoji (MIT License)

const FLUENT_EMOJI_SET = new Set([
  '1F525', // 🔥 Fire
  '2764',  // ❤️ Red heart
  '1F499', // 💙 Blue heart
  '1F381', // 🎁 Wrapped gift
  '1F3AF', // 🎯 Bullseye / direct hit
  '1F48E', // 💎 Gem stone
  '2705',  // ✅ Check mark button
  '274C',  // ❌ Cross mark
  '1F33F', // 🌿 Herb
  '2618',  // ☘️ Shamrock
  '1F331', // 🌱 Seedling
  '26A0',  // ⚠️ Warning
  '1F4CB', // 📋 Clipboard
  '1F4AA', // 💪 Flexed biceps
  '1F447', // 👇 Backhand index pointing down
  '1F449', // 👉 Backhand index pointing right
]);

// Check if a single character (or surrogate pair) is in our set.
// Returns the codepoint string ('1F525') if matched, null otherwise.
function getFluentCodepoint(str) {
  if (!str) return null;
  const cp = str.codePointAt(0);
  if (cp == null) return null;
  const hex = cp.toString(16).toUpperCase();
  // Some emojis come with variation selector U+FE0F appended (e.g. ❤️ = 2764 FE0F)
  // We strip that — use base codepoint
  return FLUENT_EMOJI_SET.has(hex) ? hex : null;
}

// Iterate the codepoints in a string (handles surrogate pairs correctly).
function* iterCodepoints(str) {
  for (let i = 0; i < str.length;) {
    const cp = str.codePointAt(i);
    yield { cp, char: String.fromCodePoint(cp), index: i };
    i += cp > 0xFFFF ? 2 : 1;
    // Skip variation selectors and ZWJ which follow
    while (i < str.length) {
      const next = str.codePointAt(i);
      if (next === 0xFE0F || next === 0x200D) {
        i += 1;
      } else {
        break;
      }
    }
  }
}

// Split a string into a stream of { type: 'text'|'emoji', value }
// Emojis are extracted as single-char tokens; text runs are kept together.
function splitTextWithEmoji(text) {
  if (!text) return [];
  const result = [];
  let buf = '';
  for (const { cp, char } of iterCodepoints(text)) {
    const hex = cp.toString(16).toUpperCase();
    if (FLUENT_EMOJI_SET.has(hex)) {
      if (buf) { result.push({ type: 'text', value: buf }); buf = ''; }
      result.push({ type: 'emoji', value: char, codepoint: hex });
    } else {
      buf += char;
    }
  }
  if (buf) result.push({ type: 'text', value: buf });
  return result;
}

module.exports = {
  FLUENT_EMOJI_SET,
  getFluentCodepoint,
  iterCodepoints,
  splitTextWithEmoji,
};
