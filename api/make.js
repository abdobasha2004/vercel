// /api/make.js
// Renders a 1080x1080 PNG with background + Arabic headline in a red band + "عاجل" badge.
// Uses headless Chromium (Sparticuz) so Arabic shaping & @font-face render correctly.

import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { readFile } from "node:fs/promises";

export const config = {
  runtime: "nodejs",   // ← must be "nodejs" here
  memory: 1536,
  maxDuration: 20
};

const WIDTH = 1080;
const HEIGHT = 1080;

const DEFAULT_FONT_FAMILY = "Tajawal";
const DEFAULT_FONT_WEIGHT = 400;
const DEFAULT_FONT_SIZE = 64;     // base headline size
const DEFAULT_LINE_HEIGHT = 1.12; // tighter lines to fill band
const DEFAULT_TEXT_WIDTH = 1000;  // px (increase → less side padding)

function escapeHtml(s = "") {
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function buildHtml({ bg, title, fontDataUrl, fontFamily, fontWeight, fontSize, lineHeight, textWidth }) {
  const bandH = Math.round(HEIGHT * 0.24);
  const bandY = Math.round(HEIGHT * 0.60);

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' data: blob:; img-src * data: blob:; style-src 'unsafe-inline' data:; font-src data:; script-src 'none';" />
  <style>
    @font-face {
      font-family: '${fontFamily}';
      src: url('${fontDataUrl}') format('truetype');
      font-weight: ${fontWeight};
      font-style: normal;
      font-display: swap;
    }
    html, body {
      margin: 0; padding: 0;
      width: ${WIDTH}px; height: ${HEIGHT}px;
      overflow: hidden; background: transparent;
    }
    .stage {
      position: relative;
      width: ${WIDTH}px; height: ${HEIGHT}px;
      background-image: url("${bg}");
      background-size: cover;
      background-position: center;
    }
    .band { position:absolute; left:0; top:${bandY}px; width:100%; height:${bandH}px; background:#D32D2D; }
    .band-shadow { position:absolute; left:0; top:${bandY}px; width:100%; height:8px; background:rgba(0,0,0,0.18); }
    .headline {
      position:absolute; inset:${bandY}px 0 auto 0; height:${bandH}px;
      display:grid; place-items:center; text-align:center; color:#fff; direction:rtl; unicode-bidi:plaintext;
    }
    .headline-inner {
      font-family:'${fontFamily}', sans-serif; font-weight:${fontWeight};
      font-size:${fontSize}px; line-height:${lineHeight};
      max-width:${textWidth}px; padding:0 8px; overflow-wrap:break-word; word-break:break-word; white-space:normal;
    }
    .brand {
      position:absolute; top:${bandY + Math.floor(bandH/2) + 44}px; left:0; width:100%;
      text-align:center; color:#fff; opacity:.95; font-family:'${fontFamily}', sans-serif; direction:rtl;
    }
    .brand .line1 { font-size:22px; }
    .brand .line2 { font-size:20px; margin-top:6px; }
    .badge {
      position:absolute; right:40px; top:60px; width:180px; height:64px; background:#E53935; border-radius:10px; display:grid; place-items:center;
    }
    .badge span { color:#fff; font-size:36px; font-family:'${fontFamily}', sans-serif; font-weight:${fontWeight}; }
  </style>
</head>
<body>
  <div class="stage">
    <div class="band-shadow"></div>
    <div class="band"></div>

    <div class="headline">
      <div class="headline-inner">${escapeHtml(title)}</div>
    </div>

    <div class="brand">
      <div class="line1">نجوم مصرية ®</div>
      <div class="line2">www.ngmisr.com</div>
    </div>

    <div class="badge"><span>عاجل</span></div>
  </div>
</body>
</html>`;
}

function j(res, code, obj) {
  res.status(code).setHeader("content-type", "application/json").send(JSON.stringify(obj));
}

export default async function handler(req, res) {
  try {
    const { searchParams } = new URL(req.url, "http://localhost");
    const bg = searchParams.get("bg");
    const title = searchParams.get("title") || "اختبار";
    if (!bg) return j(res, 400, { error: "bg_required" });

    // Tunables
    const fs = parseInt(searchParams.get("fs") || `${DEFAULT_FONT_SIZE}`, 10);
    const w  = parseInt(searchParams.get("w")  || `${DEFAULT_TEXT_WIDTH}`, 10);
    const lh = parseFloat(searchParams.get("lh") || `${DEFAULT_LINE_HEIGHT}`);

    // Read font file from repo (no vercel.json include needed when you read via import.meta.url)
    const fontBytes = await readFile(new URL("../fonts/Tajawal-Regular.ttf", import.meta.url));
    const fontDataUrl = `data:font/ttf;base64,${Buffer.from(fontBytes).toString("base64")}`;

    const html = buildHtml({
      bg, title,
      fontDataUrl,
      fontFamily: DEFAULT_FONT_FAMILY,
      fontWeight: DEFAULT_FONT_WEIGHT,
      fontSize: fs,
      lineHeight: lh,
      textWidth: w
    });

    const executablePath = await chromium.executablePath();
    if (!executablePath) {
      return j(res, 500, {
        error: "no_chromium",
        hint: "Ensure this function is Serverless (not Edge). Check /api/diag."
      });
    }

    const browser = await puppeteer.launch({
      executablePath,
      headless: chromium.headless,
      args: [
        ...chromium.args,
        "--no-sandbox", "--disable-setuid-sandbox",
        "--disable-dev-shm-usage", "--disable-gpu",
        `--window-size=${WIDTH},${HEIGHT}`
      ],
      defaultViewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 },
      ignoreHTTPSErrors: true
    });

    const page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "networkidle0" });

    const png = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT }
    });

    await browser.close();

    res.setHeader("content-type", "image/png");
    res.setHeader("cache-control", "no-store");
    res.status(200).send(png);
  } catch (e) {
    return j(res, 500, { error: "compose_failed", message: String(e) });
  }
}
