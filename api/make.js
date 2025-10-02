// api/main.js — Vercel Serverless: SVG→PNG via @resvg/resvg-js (no Chromium)
import { Resvg } from '@resvg/resvg-js';

const WIDTH = 1080;
const HEIGHT = 1080;

// Your font file (keep this — you already host it)
const TAJAWAL_TTF = 'https://www.ngmisr.com/Tajawal-Regular.ttf';

// ---------- utils ----------
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

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

function abToB64(ab) {
  return Buffer.from(new Uint8Array(ab)).toString('base64');
}

async function toDataUrl(url, fallbackMime = 'image/jpeg') {
  const r = await fetch(url, { headers: { 'user-agent': 'NGmisrRaster/1.0' }});
  if (!r.ok) throw new Error(`fetch ${url} -> ${r.status}`);
  const ct = r.headers.get('content-type') || fallbackMime;
  const ab = await r.arrayBuffer();
  return `data:${ct};base64,${abToB64(ab)}`;
}

// ---------- SVG builder ----------
function buildSVG({ bgDataUrl, title, w = WIDTH, h = HEIGHT, fs = 48, lh = 1.25, fontDataUrl }) {
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
  const brandArabic = `نجوم مصرية ®`;
  const brandDomain = `www.ngmisr.com`;
  const brandYStart = cy + (lines.length * lineH / 2) + brandGapTop;

  return `
<svg xmlns="http://www.w3.org/2000/svg" xml:lang="ar" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <style>
      @font-face{
        font-family:'TajawalBold';
        src:url('${fontDataUrl}') format('truetype');
        font-weight:700; font-style:normal; font-display:swap;
      }
      text{ font-family: TajawalBold, Arial, sans-serif; }
    </style>
  </defs>

  <image href="${bgDataUrl}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>
  <rect x="0" y="${bandY}" width="${w}" height="${bandH}" fill="#D32D2D"/>
  <rect x="0" y="${bandY}" width="${w}" height="8" fill="#000" opacity="0.18"/>

  <text x="${cx}" y="${cy}" direction="rtl" unicode-bidi="plaintext"
        text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="${fs}">
    ${headline}
  </text>

  <text x="${cx}" y="${brandYStart}" text-anchor="middle" direction="rtl"
        fill="#fff" opacity="0.95" font-size="${brand1Size}">${esc(brandArabic)}</text>
  <text x="${cx}" y="${brandYStart + brand1Size + brandGap}" text-anchor="middle"
        fill="#fff" opacity="0.95" font-size="${brand2Size}">${esc(brandDomain)}</text>

  <g transform="translate(${w - 220}, 60)">
    <rect x="0" y="0" rx="10" ry="10" width="180" heigh
