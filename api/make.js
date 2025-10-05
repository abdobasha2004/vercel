// api/make.js — Rasterize CF /canvas.svg using puppeteer-core + @sparticuz/chromium
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

function required(param, name) {
  if (!param) throw new Error(`Missing required query param: ${name}`);
  return param;
}

export default async function handler(req, res) {
  let browser;
  try {
    const { bg, title, w, fs, lh } = req.query || {};
    // Build your CF SVG URL (this is your working endpoint that draws text correctly)
    const svgUrl = new URL('https://br.ngmisr.com/canvas.svg');
    svgUrl.searchParams.set('bg', required(bg, 'bg'));
    svgUrl.searchParams.set('title', required(title, 'title'));
    // (w/fs/lh aren’t needed by your CF SVG right now; add if you wire them there)

    const width = Math.min(Math.max(parseInt(w || '1080', 10), 320), 2000);
    const height = 1080;

    const executablePath = await chromium.executablePath();
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width, height, deviceScaleFactor: 1 },
      executablePath,
      headless: chromium.headless,   // 'shell' on Vercel
      ignoreHTTPSErrors: true
    });

    const page = await browser.newPage();

    // Important for SVG-only pages: set the viewport size explicitly and wait for network to be idle
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto(svgUrl.toString(), { waitUntil: 'networkidle2', timeout: 30000 });

    // Ensure background is transparent (the SVG has full-bleed image anyway)
    await page.evaluate(() => {
      document.body.style.margin = '0';
      document.documentElement.style.background = 'transparent';
      document.body.style.background = 'transparent';
    });

    // Clip to the full viewport (which matches your SVG size)
    const pngBuffer = await page.screenshot({
      type: 'png',
      captureBeyondViewport: false,
      clip: { x: 0, y: 0, width, height }
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-cache');
    res.status(200).send(pngBuffer);
  } catch (e) {
    res.status(500).json({ error: 'compose_failed', message: String(e) });
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
}
