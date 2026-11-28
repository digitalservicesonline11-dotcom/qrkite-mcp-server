import QRCode from "qrcode";

export type QrFormat = "png" | "svg";
export type ErrorCorrection = "L" | "M" | "Q" | "H";

export interface QrStyle {
  format: QrFormat;
  size: number; // pixels (PNG) / viewport width (SVG)
  margin: number; // quiet zone in modules
  errorCorrection: ErrorCorrection;
  darkColor: string;
  lightColor: string;
}

export interface QrResult {
  format: QrFormat;
  mimeType: string;
  /** base64 for PNG, raw markup for SVG */
  data: string;
}

export const MAX_PAYLOAD_CHARS = 2000;

export async function renderQr(payload: string, style: QrStyle): Promise<QrResult> {
  if (!payload) throw new Error("Nothing to encode: the content is empty.");
  if (payload.length > MAX_PAYLOAD_CHARS) {
    throw new Error(`Content is too long (${payload.length} chars, max ${MAX_PAYLOAD_CHARS}).`);
  }
  const opts = {
    errorCorrectionLevel: style.errorCorrection,
    margin: style.margin,
    width: style.size,
    color: { dark: style.darkColor, light: style.lightColor },
  };
  if (style.format === "svg") {
    const svg = await QRCode.toString(payload, { ...opts, type: "svg" });
    return { format: "svg", mimeType: "image/svg+xml", data: svg };
  }
  const buf = await QRCode.toBuffer(payload, { ...opts, type: "png" });
  return { format: "png", mimeType: "image/png", data: buf.toString("base64") };
}

/* ---------- Payload builders ---------- */

const escWifi = (s: string) => s.replace(/([\\;,:"])/g, "\\$1");

export function wifiPayload(a: {
  ssid: string;
  password?: string;
  security: "WPA" | "WEP" | "nopass";
  hidden?: boolean;
}): string {
  const pass = a.security === "nopass" ? "" : `P:${escWifi(a.password ?? "")};`;
  return `WIFI:T:${a.security};S:${escWifi(a.ssid)};${pass}${a.hidden ? "H:true;" : ""};`;
}

const escV = (s: string) => s.replace(/([\\;,])/g, "\\$1").replace(/\n/g, "\\n");

export function vcardPayload(c: {
  firstName: string;
  lastName?: string;
  organization?: string;
  title?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
}): string {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${escV(c.lastName ?? "")};${escV(c.firstName)};;;`,
    `FN:${escV([c.firstName, c.lastName].filter(Boolean).join(" "))}`,
  ];
  if (c.organization) lines.push(`ORG:${escV(c.organization)}`);
  if (c.title) lines.push(`TITLE:${escV(c.title)}`);
  if (c.phone) lines.push(`TEL:${escV(c.phone)}`);
  if (c.email) lines.push(`EMAIL:${escV(c.email)}`);
  if (c.website) lines.push(`URL:${c.website}`);
  if (c.address) lines.push(`ADR:;;${escV(c.address)};;;;`);
  lines.push("END:VCARD");
  return lines.join("\n");
}

export function emailPayload(a: { to: string; subject?: string; body?: string }): string {
  const q: string[] = [];
  if (a.subject) q.push(`subject=${encodeURIComponent(a.subject)}`);
  if (a.body) q.push(`body=${encodeURIComponent(a.body)}`);
  return `mailto:${a.to}${q.length ? "?" + q.join("&") : ""}`;
}

export function smsPayload(a: { phone: string; message?: string }): string {
  return `SMSTO:${a.phone}:${a.message ?? ""}`;
}

export function geoPayload(a: { latitude: number; longitude: number }): string {
  return `geo:${a.latitude},${a.longitude}`;
}
