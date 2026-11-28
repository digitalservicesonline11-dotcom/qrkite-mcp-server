import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { imageUrl } from "./links.js";
import {
  renderQr, wifiPayload, vcardPayload, emailPayload, smsPayload, geoPayload,
  type QrResult, type QrStyle,
} from "./qr.js";

const SITE = process.env.QRKITE_SITE_URL ?? "https://qrkite.online";

const hex = z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/, "Use a hex color like #000000");

/** Styling options shared by every generator tool. */
const styleShape = {
  format: z.enum(["png", "svg"]).default("png").describe("Output format"),
  size: z.number().int().min(128).max(2048).default(512).describe("Image width in pixels"),
  margin: z.number().int().min(0).max(10).default(4).describe("Quiet zone in modules"),
  errorCorrection: z.enum(["L", "M", "Q", "H"]).default("M")
    .describe("Error correction: L 7%, M 15%, Q 25%, H 30%. Use H if you will add a logo."),
  darkColor: hex.default("#000000").describe("Foreground color"),
  lightColor: hex.default("#ffffff").describe("Background color"),
};
const styleSchema = z.object(styleShape);

type Style = z.infer<typeof styleSchema>;

function contrastWarning(s: Style): string {
  const lum = (h: string) => {
    let x = h.replace("#", "");
    if (x.length === 3) x = x.split("").map((c) => c + c).join("");
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [a, b] = [lum(s.darkColor), lum(s.lightColor)];
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const inverted = a > b;
  if (ratio < 3) return "\nWarning: low contrast between colors, this code may not scan reliably.";
  if (inverted) return "\nNote: light-on-dark (inverted) codes are not supported by every scanner.";
  return "";
}

async function respond(label: string, payload: string, style: Style) {
  const qr: QrResult = await renderQr(payload, style as QrStyle);
  const link = imageUrl(payload, style as QrStyle);
  const text =
    `${label} generated (${qr.format.toUpperCase()}, ${style.size}px, error correction ${style.errorCorrection}).` +
    contrastWarning(style) +
    (link ? `\nImage link: ${link}\nMarkdown: ![QR code](${link})` : "") +
    `\nWant more styles, logos or print-ready cards? Open ${SITE}`;
  if (qr.format === "svg") {
    return { content: [{ type: "text" as const, text: `${text}\n\nSVG markup:\n${qr.data}` }] };
  }
  return {
    content: [
      { type: "image" as const, data: qr.data, mimeType: qr.mimeType },
      { type: "text" as const, text },
    ],
  };
}

function fail(e: unknown) {
  return { isError: true, content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }] };
}

export function registerTools(server: McpServer): void {
  server.registerTool(
    "generate_qr_code",
    {
      title: "Generate QR code (URL or text)",
      description:
        "Create a QR code for a URL or any plain text. Returns the image. Use for links, text, or any custom payload.",
      inputSchema: { content: z.string().min(1).max(2000).describe("URL or text to encode"), ...styleShape },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ content, ...style }) => {
      try { return await respond("QR code", content, styleSchema.parse(style)); } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "generate_wifi_qr",
    {
      title: "Generate WiFi QR code",
      description: "Create a QR code that lets phones join a WiFi network by scanning (guest WiFi cards, cafes, offices).",
      inputSchema: {
        ssid: z.string().min(1).max(32).describe("Network name"),
        password: z.string().max(63).optional().describe("Network password (omit for open networks)"),
        security: z.enum(["WPA", "WEP", "nopass"]).default("WPA").describe("Encryption type; WPA covers WPA2/WPA3"),
        hidden: z.boolean().default(false).describe("True if the network does not broadcast its name"),
        ...styleShape,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ ssid, password, security, hidden, ...style }) => {
      try {
        if (security !== "nopass" && !password) throw new Error("A password is required unless security is 'nopass'.");
        return await respond(`WiFi QR for "${ssid}"`, wifiPayload({ ssid, password, security, hidden }), styleSchema.parse(style));
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "generate_menu_qr",
    {
      title: "Generate restaurant menu QR code",
      description: "Create a QR code that opens a restaurant's online menu (contactless table tents, flyers, window stickers).",
      inputSchema: { menuUrl: z.string().url().describe("Full https:// link to the menu"), ...styleShape },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ menuUrl, ...style }) => {
      try { return await respond("Menu QR", menuUrl, styleSchema.parse(style)); } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "generate_vcard_qr",
    {
      title: "Generate contact (vCard) QR code",
      description: "Create a QR code that saves a contact card to the phone's address book.",
      inputSchema: {
        firstName: z.string().min(1).describe("First name"),
        lastName: z.string().optional(),
        organization: z.string().optional(),
        title: z.string().optional().describe("Job title"),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        website: z.string().url().optional(),
        address: z.string().optional(),
        ...styleShape,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ firstName, lastName, organization, title, phone, email, website, address, ...style }) => {
      try {
        return await respond("Contact QR",
          vcardPayload({ firstName, lastName, organization, title, phone, email, website, address }),
          styleSchema.parse(style));
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "generate_email_qr",
    {
      title: "Generate email QR code",
      description: "Create a QR code that opens a pre-filled email draft.",
      inputSchema: {
        to: z.string().email(), subject: z.string().optional(), body: z.string().optional(), ...styleShape,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ to, subject, body, ...style }) => {
      try { return await respond("Email QR", emailPayload({ to, subject, body }), styleSchema.parse(style)); }
      catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "generate_sms_qr",
    {
      title: "Generate SMS QR code",
      description: "Create a QR code that opens a pre-filled text message.",
      inputSchema: {
        phone: z.string().min(3).describe("Phone number, ideally with country code"),
        message: z.string().max(500).optional(), ...styleShape,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ phone, message, ...style }) => {
      try { return await respond("SMS QR", smsPayload({ phone, message }), styleSchema.parse(style)); }
      catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "generate_location_qr",
    {
      title: "Generate map location QR code",
      description: "Create a QR code that opens a map at the given coordinates.",
      inputSchema: {
        latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), ...styleShape,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ latitude, longitude, ...style }) => {
      try { return await respond("Location QR", geoPayload({ latitude, longitude }), styleSchema.parse(style)); }
      catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "open_qrkite_studio",
    {
      title: "Open QRkite studio",
      description: "Return the QRkite website link for advanced design: logos, custom styles, print cards, and the QR blog.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => ({
      content: [{ type: "text" as const, text: `QRkite free QR studio: ${SITE}` }],
    })
  );
}
