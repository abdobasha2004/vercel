// api/make.js — Vercel: SVG→PNG via @resvg/resvg-js with font bytes + embedded @font-face
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
  const ab = await r.arrayBuffer();
  const b64 = Buffer.from(new Uint8Array(ab)).toString('base64');
  return `data:${ct};base64,${b64}`;
}

async function fetchBytes(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'NGmisrRaster/1.0' } });
  if (!r.ok) throw new Error(`fetch ${url} -> ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

function buildSVG({ bgDataUrl, title, w, h, fs, lh, fontDataUrl, debug }) {
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

  return `
<svg xmlns="http://www.w3.org/2000/svg" xml:lang="ar" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <style>
      /* Embed the same font in the SVG (belt + suspenders) */
      @font-face{
        font-family:'TajawalNG';
        src:url('${fontDataUrl}') format('truetype');
        font-weight:400; font-style:normal; font-display:swap;
      }
      .headline, .brand, .badge {
        font-family: TajawalNG, sans-serif; /* generic maps to Tajawal in Resvg options too */
        font-weight:400;
      }
    </style>
  </defs>

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

  ${debug ? `<text x="20" y="40" fill="#0f0" font-family="sans-serif" font-size="28">DBG</text>` : '' }
</svg>`;
}

// ---------- renderer ----------
async function renderPng({ bg, title, w, fs, lh, debug }) {
  // 1) background bitmap as data URL
  const bgDataUrl = await fetchAsDataUrl(bg, 'image/jpeg');

  // 2) font bytes for Resvg + also embedded as data: in SVG
  const tajawalBytes = await fetchBytes(TAJAWAL_TTF);
  const tajawalDataUrl = `data:font/ttf;base64,${Buffer.from(tajawalBytes).toString('base64')}`;

  // 3) SVG
  const svg = buildSVG({
    bgDataUrl,
    title: title || 'اختبار',
    w: Number(w) || WIDTH,
    h: HEIGHT,
    fs: Number(fs) || 32,
    lh: Number(lh) || 1.25,
    fontDataUrl: tajawalDataUrl,
    debug
  });

  // 4) Render with explicit font mapping
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: Number(w) || WIDTH },
    background: null,
    font: {
      loadSystemFonts: false,
      defaultFontFamily: 'TajawalNG',
      sansSerifFamily: 'TajawalNG',
      serifFamily: 'TajawalNG',
      monospaceFamily: 'TajawalNG',
      // Accept across resvg-js versions:
      // Newer versions:
      fontFiles: [{ name: 'TajawalNG', data: tajawalBytes, weight: 400, style: 'normal' }],
      // Back-compat (older builds ignore unknown keys; newer ignore this one):
      fonts: [{ name: 'TajawalNG', data: tajawalBytes }]
    }
  });

  return resvg.render().asPng();
}

// ---------- handler ----------
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
