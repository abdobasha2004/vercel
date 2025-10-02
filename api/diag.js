// /api/diag.js
import chromium from "@sparticuz/chromium";

export const config = {
  runtime: "nodejs",  // ← must be "nodejs" here (Node 20 is chosen in dashboard)
  memory: 256,
  maxDuration: 10
};

export default async function handler(req, res) {
  try {
    const exec = await chromium.executablePath().catch(() => null);
    const chromiumPkg = await import("@sparticuz/chromium/package.json");
    res
      .status(200)
      .setHeader("content-type", "application/json")
      .send(JSON.stringify({
        node: process.versions.node,
        edge_runtime: !!process.env.VERCEL_EDGE_FUNCTIONS,
        chromium_version: chromiumPkg.version,
        chromium_headless: chromium.headless,
        chromium_executablePath: exec,
        chromium_args_sample: (chromium.args || []).slice(0, 6)
      }, null, 2));
  } catch (e) {
    res.status(500).json({ error: "diag_failed", message: String(e) });
  }
}
