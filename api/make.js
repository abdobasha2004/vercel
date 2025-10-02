// api/make.js — renders text via @resvg/resvg-js; errors if font missing so you can see it
import { Resvg } from '@resvg/resvg-js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const WIDTH = 1080;
const HEIGHT = 1080;

// resolve local font (must exist at: api/Tajawal-Regular.ttf)
// and be included via vercel.json -> includeFiles
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCAL_FONT_PATH = path.join(__dirname, 'Tajawal-Regular.ttf');

const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function wrap(text, maxPerLine, maxLines = 3) {
  const words = String(text||'').trim().split(/\s+/);
  const lines = []; let line='';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (t.length <= maxPerLine) line = t;
    else { if (line) lines.push(line); line = w; if (lines.length === maxLines-1) break; }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

async function toDataUrl(url, fallbackMime='application/octet-stream') {
  const r = await fetch(url, { headers: { 'user-agent': 'NGmisrRaster/1.0' } });
  if (!r.ok) throw new Error(`fetch ${url} -> ${r.status}`);
  const ct = r.headers.get('content-type') || fallbackMime;
  const ab = new Uint8Array(await r.arrayBuffer());
  return `data:${ct};base64,${Buffer.from(ab).toString('base64')}`;
}

function buildSVG({ bgDataUrl, title, w, h, fs, lh }) {
  const lines = wrap(title, Math.max(16, Math.round(w/36)), 3);

  const bandH = Math.round(h*0.24);
  const bandY = Math.round(h*0.60);
  const cx = Math.floor(w/2);

  // absolute line positions (no dy)
  const lineH = Math.round(fs*lh);
  const blockH = (lines.length - 1) * lineH;
  const baseY = Math.round(bandY + bandH/2 - blockH/2);

  const tspans = lines.map((ln, i) =>
    `<tspan x="${cx}" y="${baseY + i*lineH}">${esc(ln)}</tspan>`
  ).join('');

  const brandGapTop=50, brand1Size=22, brand2Size=20, brandGap=6;
  const lastLineY = baseY + (lines.length-1)*lineH;
  const brandYStart = lastLineY + brandGapTop;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xml:lang="ar">
  <image href="${bgDataUrl}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>
  <rect x="0" y="${bandY}" width="${w}" height="${bandH}" fill="#D32D2D"/>
  <rect x="0" y="${bandY}" width="${w}" height="8" fill="#000" opacity="0.18"/>

  <!-- HEADLINE -->
  <text font-family="Tajawal" font-weight="400" font-size="${fs}"
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
</svg>`;
}

async function renderPng({ bg, title, w, fs, lh }) {
  const bgDataUrl = await toDataUrl(bg, 'image/jpeg');

  // read local font; if it’s missing, throw 500 (so you see it)
  let fontBytes;
  try {
    fontBytes = new Uint8Array(await readFile(LOCAL_FONT_PATH));
  } catch {
    const err = new Error('FONT_NOT_FOUND: Did you commit api/Tajawal-Regular.ttf and includeFiles in vercel.json?');
    err.code = 'FONT_NOT_FOUND';
    throw err;
  }
  if (!fontBytes.length) {
    const err = new Error('FONT_EMPTY: Bundled font is zero bytes.');
    err.code = 'FONT_EMPTY';
    throw err;
  }

  const svg = buildSVG({
    bgDataUrl,
    title: title || 'اختبار',
    w: Number(w) || WIDTH,
    h: HEIGHT,
    fs: Number(fs) || 48,
    lh: Number(lh) || 1.25
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
      // Both keys for compatibility across resvg-js versions
      fontFiles: [{ name: 'Tajawal', data: fontBytes, weight: 400, style: 'normal' }],
      fonts:     [{ name: 'Tajawal', data: fontBytes }]
    }
  });

  return resvg.render().asPng();
}

export default async function handler(req, res) {
  try {
    const { bg, title, w, fs, lh } = req.query || {};
    if (!bg) return res.status(400).send('bg required');
    const png = await renderPng({ bg, title, w, fs, lh });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-cache');
    res.status(200).send(Buffer.from(png));
  } catch (e) {
    // fail LOUDLY so you can see the reason
    res.status(500).json({ error: 'compose_failed', code: e.code || null, message: String(e) });
  }
}
