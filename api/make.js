// api/make.js — minimal, inline-text attrs, one family name, Resvg font injection
import { Resvg } from '@resvg/resvg-js';

const WIDTH = 1080;
const HEIGHT = 1080;
const TAJAWAL_TTF = 'https://www.ngmisr.com/Tajawal-Regular.ttf';

// ------- helpers
const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
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
async function fetchBytes(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'NGmisrRaster/1.0' } });
  if (!r.ok) throw new Error(`fetch ${url} -> ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}
async function fetchAsDataUrl(url, fallbackMime='application/octet-stream') {
  const r = await fetch(url, { headers: { 'user-agent': 'NGmisrRaster/1.0' } });
  if (!r.ok) throw new Error(`fetch ${url} -> ${r.status}`);
  const ct = r.headers.get('content-type') || fallbackMime;
  const ab = new Uint8Array(await r.arrayBuffer());
  return `data:${ct};base64,${Buffer.from(ab).toString('base64')}`;
}

// ------- SVG builder (all text props inline; family name must match Resvg registration)
function buildSVG({ bgDataUrl, title, w, h, fs, lh, debug }) {
  const lines = wrapArabic(title, Math.max(16, Math.round(w / 36)), 3);
  const lineH = Math.round(fs * lh);
  const bandH = Math.round(h * 0.24);
  const bandY = Math.round(h * 0.60);
  const cx = Math.floor(w / 2);
  const cy = Math.floor(bandY + bandH / 2);
  const startDy = -((lines.length - 1) * lineH) / 2;

  const headline = lines.map((ln, i) =>
    `<tspan x="${cx}" dy="${i === 0 ? startDy : lineH}">${esc(ln)}</tspan>`
  ).join('');

  const brandGapTop = 50, brand1Size = 22, brand2Size = 20, brandGap = 6;
  const brandYStart = cy + (lines.length * lineH / 2) + brandGapTop;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xml:lang="ar">
  <image href="${bgDataUrl}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>
  <rect x="0" y="${bandY}" width="${w}" height="${bandH}" fill="#D32D2D"/>
  <rect x="0" y="${bandY}" width="${w}" height="8" fill="#000" opacity="0.18"/>

  <!-- HEADLINE -->
  <text x="${cx}" y="${cy}"
        font-family="Tajawal" font-weight="400" font-size="${fs}"
        direction="rtl" unicode-bidi="plaintext"
        text-anchor="middle" dominant-baseline="middle"
        fill="#ffffff" stroke="rgba(0,0,0,0.75)" stroke-width="2">
    ${headline}
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

  ${debug ? `<text x="22" y="46" font-family="Tajawal" font-size="28" fill="#00ff6a" stroke="#000" stroke-width="0.5">DBG</text>` : ''}
</svg>`;
}

// ------- render
async function renderPng({ bg, title, w, fs, lh, debug }) {
  const bgDataUrl = await fetchAsDataUrl(bg, 'image/jpeg');

  // Load Tajawal and register under the SAME name used in SVG ("Tajawal")
  let tajawalBytes = null;
  try { tajawalBytes = await fetchBytes(TAJAWAL_TTF); }
  catch(e) { console.log('font fetch failed:', String(e)); }

  console.log('font-bytes', tajawalBytes ? tajawalBytes.length : 0); // appears in Vercel logs

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
      // supply bytes only if we fetched them; Resvg will otherwise have no fonts
      ...(tajawalBytes?.length
        ? {
            fontFiles: [{ name: 'Tajawal', data: tajawalBytes, weight: 400, style: 'normal' }],
            fonts:     [{ name: 'Tajawal', data: tajawalBytes }]
          }
        : {})
    }
  });

  return resvg.render().asPng();
}

// ------- handler
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
