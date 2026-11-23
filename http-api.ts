import { readFileSync } from "node:fs";
import type { Express, NextFunction, Request, Response } from "express";
import { z } from "zod";
import { renderQr, type QrStyle } from "./qr.js";
import { PUBLIC_URL, imageUrl } from "./links.js";

const hex = z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/);

const query = z.object({
  content: z.string().min(1).max(2000),
  size: z.coerce.number().int().min(128).max(2048).default(512),
  margin: z.coerce.number().int().min(0).max(10).default(4),
  ec: z.enum(["L", "M", "Q", "H"]).default("M"),
  dark: hex.default("#000000"),
  light: hex.default("#ffffff"),
});

const toStyle = (q: z.infer<typeof query>, format: "png" | "svg"): QrStyle => ({
  format, size: q.size, margin: q.margin, errorCorrection: q.ec, darkColor: q.dark, lightColor: q.light,
});

/** Tiny in-memory rate limiter (per IP, per minute). */
function rateLimit(max: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = req.ip ?? "unknown";
    const h = hits.get(key);
    if (!h || h.reset < now) hits.set(key, { n: 1, reset: now + 60_000 });
    else if (++h.n > max) return res.status(429).json({ error: "Too many requests, try again in a minute." });
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    next();
  };
}

const baseOf = (req: Request) => PUBLIC_URL || `${req.protocol}://${req.get("host")}`;

/** REST endpoints used by ChatGPT Custom GPT Actions and for direct image links. */
export function mountApi(app: Express): void {
  app.set("trust proxy", 1);
  const limiter = rateLimit(Number(process.env.RATE_LIMIT_PER_MIN ?? 60));

  const image = (format: "png" | "svg") => async (req: Request, res: Response) => {
    const parsed = query.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
    try {
      const r = await renderQr(parsed.data.content, toStyle(parsed.data, format));
      res.set("Cache-Control", "public, max-age=86400");
      res.type(r.mimeType).send(format === "png" ? Buffer.from(r.data, "base64") : r.data);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  };
  app.get("/qr.png", limiter, image("png"));
  app.get("/qr.svg", limiter, image("svg"));

  // JSON endpoint for Custom GPT Actions: returns links the GPT can show as an image.
  app.get("/api/qr", limiter, async (req, res) => {
    const parsed = query.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
    try {
      const base = baseOf(req);
      await renderQr(parsed.data.content, toStyle(parsed.data, "png")); // validate early
      const png = imageUrl(parsed.data.content, toStyle(parsed.data, "png"), base)!;
      const svg = imageUrl(parsed.data.content, toStyle(parsed.data, "svg"), base)!;
      res.json({
        imageUrl: png,
        svgUrl: svg,
        markdown: `![QR code](${png})`,
        studio: process.env.QRKITE_SITE_URL ?? "https://qrkite.online",
      });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // OpenAPI spec with this server's address filled in.
  app.get("/openapi.yaml", (req, res) => {
    const spec = readFileSync(new URL("../openapi.yaml", import.meta.url), "utf8").replaceAll("__SERVER_URL__", baseOf(req));
    res.type("text/yaml").send(spec);
  });
}
