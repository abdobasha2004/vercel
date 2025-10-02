// api/make.js — text-safe version (absolute <tspan y>, local font, one family)
import { Resvg } from '@resvg/resvg-js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const WIDTH = 1080;
const HEIGHT = 1080;

// Resolve local font path: put Tajawal-Regular.ttf next to this file (api/Tajawal-Regular.ttf)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCAL_FONT_PATH = path.join(__dirname, 'Tajawal-Regular.ttf');

// --- utils ---
const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function wrapArabic(text, maxPerLine, maxLines = 3) {
  const words = String(text || '').trim().split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (t.length <= maxPerLine) line = t;
    else {
      if (line) lines.push(line);
      line = w;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

async function fetchAsDataUrl(url, fallbackMime = 'application/octet-stream') {
  const r = await fetch(url, { headers: { 'user-agent': 'NGmisrRaster/1.0' } });
  if (!r.ok) throw new Error(`fetch ${url} -> ${r.status}`);
  const ct = r.headers.get('content-type') || fallbackMime;
  const ab = new Uint8Array(await r.arrayBuffer());
  return `data:${ct};base64,${Buffer.from(ab).toString('base64')}`;
}

// --- SVG builder (no dy; each line has its own absolute y) ---
function buildSVG({ bgDataUrl, title, w, h, fs, lh, debug }) {
  const maxCharsPerLine = Math.max(16, Math.round(w / 36)); // crude measure that worked for you
  const lines = wrapArabic(title, maxCharsPerLine, 3);

  const bandH = Math.round(h * 0.24);
  const bandY = Math.round(h * 0.60);
  const cx = Math.floor(w / 2);

  // Line metrics
  const lineH = Math.round(fs * lh);
  // Center block of N lines vertically within the band
  const blockHeight = (lines.length - 1) * lineH;
  const baseY = Math.round(bandY + bandH / 2 - blockHeight / 2);

  const tspans = lines.map((ln, i) => {
    const y = baseY + i * lineH;
    return `<tspan x="${cx}" y="${y}">${esc(ln)}</tspan>`;
  }).join('');

  // brand below
  const brandGapTop = 50, brand1Size = 22, brand2Size = 20, brandGap = 6;
  const lastLineY = baseY + (lines.length - 1) * lineH;
  const brandYStart = lastLineY + brandGapTop;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xml:lang="ar">
  <image href="${bgDataUrl}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>
  <rect x="0" y="${bandY}" width="${w}" height="${bandH}" fill="#D32D2D"/>
  <rect x="0" y="${bandY}" width="${w}" height="8" fill="#000" opacity="0.18"/>

  <!-- HEADLINE (absolute positioned tspans) -->
  <text
    font-family="Tajawal" font-weight="400" font-size="${fs}"
    direction="rtl" unicode-bidi="plaintext"
    text-anchor="middle" fill="#ffffff"
    stroke="rgba(0,0,0,0.75)" stroke-width="2">
    ${tspans}
  </text>

  <!-- BRAND -->
  <text x="${cx}" y="${brandYStart}"
        font-family="Tajawal" font-weight="400" font-size="${brand1Size}"
        text-anchor="middle" direction="rtl"
        fill="#ffffff" stroke="rgba(0,0,0,0.5)" stroke-width="1.2">نجوم مصرية ®</text>
  <text x="${cx}" y="${brandYStart + brand1Size + brandGap}"
        font-family="Tajawal" font-weight="400" font-size="${brand2Size}"
        text-anchor="middle"
        fill="#ffffff" stroke="rgba(0,0,0,0.5)" stroke-width="1.2">www.ngmisr.com</text>

  <!-- BADGE -->
  <g transform="translate(${w - 220}, 60)">
    <rect x="0" y="0" rx="10" ry="10" width="180" height="64" fill="#E53935"/>
    <text x="90" y="43"
          font-family="Tajawal" font-weight="400" font-size="36"
          text-anchor="middle" fill="#ffffff" stroke="rgba(0,0,0,0.6)" stroke-width="1.5">عاجل</text>
  </g>

  ${debug ? `<text x="24" y="46" font-family="Tajawal" font-size="28" fill="#00ff6a" stroke="#000" stroke-width="0.5">DBG</text>` : ''}
</svg>`;
}

// --- render (load font locally; register with same exact family: "Tajawal")
async function renderPng({ bg, title, w, fs, lh, debug }) {
  const bgDataUrl = await fetchAsDataUrl(bg, 'image/jpeg');

  // Read local font bytes — no network, no CF blocking
  const tajawalBytes = new Uint8Array(await readFile(LOCAL_FONT_PATH));

  const svg = buildSVG({
    bgDataUrl,
    title: title || 'اختبار',
    w: Number(w) || WIDTH,
    h: HEIGHT,
    fs: Number(fs) || 48,
    lh: Number(lh) || 1.25,
    debug
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: Number(w) || WIDTH },
    background: null,
    font: {
      loadSystemFonts: false,
      defaultFontFamily: 'Tajawal',
      sansSerifFamily: 'Tajawal',
      serifFamily: 'Tajawal',
      monospaceFamily: 'Tajawal',
      // Support across resvg-js versions:
      fontFiles: [{ name: 'Tajawal', data: tajawalBytes, weight: 400, style: 'normal' }],
      fonts:     [{ name: 'Tajawal', data: tajawalBytes }]
    }
  });

  return resvg.render().asPng();
}

// --- handler
export default async function handler(req, res) {
  try {
    const { bg, title, w, fs, lh, debug } = req.query || {};
    if (!bg) return res.status(400).send('bg required');
    const png = await renderPng({ bg, title, w, fs, lh, debug: debug === '1' });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-cache');
    res.status(200).send(Buffer.from(png));
  } catch (e) {
    res.status(500).json({ error: 'compose_failed', message: String(e) });
  }
}
