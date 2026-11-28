import type { QrStyle } from "./qr.js";

/** Public base URL of this server (no trailing slash). Needed so tool results can include image links. */
export const PUBLIC_URL = (process.env.PUBLIC_URL ?? "").replace(/\/+$/, "");

export function imageUrl(payload: string, style: QrStyle, base: string = PUBLIC_URL): string | null {
  if (!base) return null;
  const p = new URLSearchParams({
    content: payload,
    size: String(style.size),
    margin: String(style.margin),
    ec: style.errorCorrection,
    dark: style.darkColor,
    light: style.lightColor,
  });
  return `${base}/qr.${style.format}?${p.toString()}`;
}
