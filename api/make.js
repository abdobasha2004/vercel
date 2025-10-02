// api/make.js — Vercel Serverless: SVG→PNG via @resvg/resvg-js (fonts wired in Resvg options)
import { Resvg } from '@resvg/resvg-js';

const WIDTH = 1080;
const HEIGHT = 1080;
const TAJAWAL_TTF = 'https://www.ngmisr.com/Tajawal-Regular.ttf';

// ---------- utils ----------
const esc = (s) =>
  String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function wrapArabic(text, maxPerLine, maxLines = 3) {
  const words = String(text || '').trim().split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (t.length <= maxPerLine) line = t;
    else { if (line) lines.push(line); line = w; if (lines.length === maxLines - 1) break; }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

async function fetchAsDataUrl(url, fallbackMime = 'application/octet-stream') {
  const r = await fetch(url, { headers: { 'user-agent': 'NGmisrRaster/1.0' } });
  if (!r.ok) throw new Error(`fetch ${url} -> ${r.status}`);
  const ct = r.headers.get('content-type') || fallbackMime;
  const ab = await r.arrayBuffer();
  const b64 = Buffer.from(new Uint8Array(ab)).toString('base64');
  return `data:${ct};base64,${b64}`;
}

function buildSVG({ bgDataUrl, title, w, h, fs, lh }) {
  const lines = wrapArabic(title, Math.max(16, Math.round(w / 36)), 3);
  const lineH = Math.round(fs * lh);
  const bandH = Math.round(h * 0.24);
  const bandY = Math.round(h * 0.60);
  const cx = Math.floor(w / 2);
  const cy = Math.floor(bandY + bandH / 2);
  const startDy = -((lines.length - 1) * lineH) / 2;

  const headline = lines
    .map((ln, i) => `<tspan x="${cx}" dy="${i === 0 ? startDy : lineH}">${esc(ln)}</tspan>`)
    .join('');

  const brandGapTop = 50, brand1Size = 22, brand2Size = 20, brandGap = 6;
  const brandYStart = cy + (lines.length * lineH / 2) + brandGapTop;

  // NOTE: we use generic family names (sans-serif) and map them to Tajawal via Resvg options.
  return `
<svg xmlns="http://www.w3.org/2000/svg" xml:lang="ar" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <style>
    .headline, .brand, .badge {
      font-family: sans-serif;
      font-weight: 400;
    }
  </style>

  <image href="${bgDataUrl}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>
  <rect x="0" y="${bandY}" width="${w}" height="${bandH}" fill="#D32D2D"/>
  <rect x="0" y="${bandY}" width="${w}" height="8" fill="#000" opacity="0.18"/>

  <text class="headline" x="${cx}" y="${cy}" direction="rtl" unicode-bidi="plaintext"
        text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="${fs}">
    ${headline}
  </text>

  <text class="brand" x="${cx}" y="${brandYStart}" text-anchor="middle" direction="rtl"
        fill="#fff" opacity="0.95" font-size="${brand1Size}">نجوم مصرية ®</text>
  <text class="brand" x="${cx}" y="${brandYStart + brand1Size + brandGap}" text-anchor="middle"
        fill="#fff" opacity="0.95" font-size="${brand2Size}">www.ngmisr.com</text>

  <g transform="translate(${w - 220}, 60)">
    <rect x="0" y="0" rx="10" ry="10" width="180" height="64" fill="#E53935"/>
    <text class="badge" x="90" y="43" fill="#fff" font-size="36" text-anchor="middle">عاجل</text>
  </g>
</svg>`;
}

// ---------- renderer ----------
async function renderPng({ bg, title, w, fs, lh }) {
  // 1) embed BG bitmap
  const bgDataUrl = await fetchAsDataUrl(bg, 'image/jpeg');

  // 2) fetch Tajawal font bytes (pass to Resvg options — no @font-face)
  const fontResp = await fetch(TAJAWAL_TTF, { headers: { 'user-agent': 'NGmisrRaster/1.0' } });
  if (!fontResp.ok) throw new Error(`font ${TAJAWAL_TTF} -> ${fontResp.status}`);
  const fontBytes = new Uint8Array(await fontResp.arrayBuffer());

  // 3) build SVG with generic font family names
  const svg = buildSVG({
    bgDataUrl,
    title: title || 'اختبار',
    w: Number(w) || WIDTH,
    h: HEIGHT,
    fs: Number(fs) || 48,
    lh: Number(lh) || 1.25
  });

  // 4) render to PNG; map all generic families to Tajawal
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: Number(w) || WIDTH },
    background: null,
    font: {
      loadSystemFonts: false,
      // Use Tajawal whenever SVG asks for these generics:
      defaultFontFamily: 'TajawalNG',
      sansSerifFamily: 'TajawalNG',
      serifFamily: 'TajawalNG',
      monospaceFamily: 'TajawalNG',
      // Provide the bytes + the name we reference above:
      fontFiles: [{ name: 'TajawalNG', data: fontBytes, weight: 400, style: 'normal' }]
      // Some versions use `fonts` or `fontBuffers`; the above `fontFiles` key
      // is accepted by current @resvg/resvg-js. If your lockfile pins an older
      // version, switch this line to:
      // fonts: [{ name: 'TajawalNG', data: fontBytes }]
    }
  });

  return resvg.render().asPng();
}

// ---------- handler ----------
export default async function handler(req, res) {
  try {
    const { bg, title, w, fs, lh } = req.query || {};
    if (!bg) return res.status(400).send('bg required');
    const png = await renderPng({ bg, title, w, fs, lh });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-cache');
    res.status(200).send(Buffer.from(png));
  } catch (e) {
    res.status(500).json({ error: 'compose_failed', message: String(e) });
  }
}
