# QRkite Connector for Claude, ChatGPT and Gemini

An [MCP](https://modelcontextprotocol.io) server that lets **Claude**, **ChatGPT** and **Gemini** users generate QR codes through **QRkite** ([qrkite.online](https://qrkite.online)). Once connected, a user can simply ask: *"Make a WiFi QR code for my cafe"* and get the image back in the chat.

Two ways to use it with ChatGPT are included: a **custom MCP app** (Developer mode) and a **Custom GPT with Actions** (REST + OpenAPI).

## What it does

| Tool | Purpose |
|---|---|
| `generate_qr_code` | QR for any URL or text |
| `generate_wifi_qr` | Scan-to-join WiFi (WPA/WEP/open, hidden networks) |
| `generate_menu_qr` | Restaurant menu link |
| `generate_vcard_qr` | Contact card (vCard 3.0) |
| `generate_email_qr` | Pre-filled email |
| `generate_sms_qr` | Pre-filled text message |
| `generate_location_qr` | Map coordinates |
| `open_qrkite_studio` | Link to qrkite.online for logos, custom styles and print cards |

Every generator accepts: `format` (png/svg), `size` (128-2048), `margin`, `errorCorrection` (L/M/Q/H), `darkColor`, `lightColor`. Low-contrast color combinations produce a warning.

> **How it works:** QR codes are generated inside this server with the `qrcode` library, so the connector does not depend on a QRkite API. Results always point users back to your site. If you later add a public API to qrkite.online, you can call it from `src/tools.ts`.

---

## Installation: all stages

### Stage 1: Get the code onto GitHub
1. Create an empty repository on GitHub (e.g. `qrkite-mcp`), no README or license.
2. In this folder run:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: QRkite MCP connector"
   git branch -M main
   git remote add origin https://github.com/<your-username>/qrkite-mcp.git
   git push -u origin main
   ```
3. The included GitHub Action (`.github/workflows/ci.yml`) will type-check, test and build on every push.

### Stage 2: Run it locally and test
Requires **Node.js 18+**.
```bash
npm install
npm test
npm run build
npm start            # listens on http://localhost:3000/mcp
```
Check it: open `http://localhost:3000/health`, it should return `{"status":"ok"}`.

Optional: inspect the tools with the official inspector:
```bash
npx @modelcontextprotocol/inspector
```
Choose transport **Streamable HTTP** and URL `http://localhost:3000/mcp`.

### Stage 3: Deploy to a public HTTPS URL
Claude's custom connectors need a **public https:// URL**. A localhost address will not work from claude.ai. Note that a standard shared Hostinger plan (static/PHP hosting) cannot run a Node.js server. Pick one of these:

**Option A: Render / Railway / Fly.io (easiest)**
1. Connect your GitHub repo.
2. Build command: `npm ci && npm run build`. Start command: `npm start`.
3. Set environment variables (see `.env.example`).
4. You get an HTTPS URL such as `https://qrkite-mcp.onrender.com`.

**Option B: Hostinger VPS (or any VPS) with Docker**
```bash
git clone https://github.com/<your-username>/qrkite-mcp.git && cd qrkite-mcp
docker build -t qrkite-mcp .
docker run -d --restart unless-stopped -p 3000:3000 \
  -e MCP_PATH=/mcp/<long-random-string> qrkite-mcp
```
Then put a reverse proxy with HTTPS in front (Caddy is simplest):
```
mcp.qrkite.online {
    reverse_proxy localhost:3000
}
```
and add a DNS **A record** for `mcp.qrkite.online` pointing to the VPS IP.

### Stage 4: Secure the endpoint
This server has no user accounts and only generates QR images, but you should still avoid an easily guessable public URL. Set `MCP_PATH` to a long random path:
```bash
MCP_PATH=/mcp/$(openssl rand -hex 24)
```
Your connector URL then becomes `https://mcp.qrkite.online/mcp/<random>`. Treat that URL as a secret if you want to limit use, or leave `/mcp` to make the connector public.

### Stage 5: Add the connector in Claude
**For yourself (Claude.ai / Claude app):**
1. Go to **Settings, Connectors**.
2. Choose **Add custom connector**.
3. Enter a name (`QRkite`) and your server URL, e.g. `https://mcp.qrkite.online/mcp`.
4. Save, then enable the connector in a chat (tools / "+" menu).
5. Test: *"Create a WiFi QR code for network Cafe with password secret123."*

On Team/Enterprise plans an owner adds the connector once under organization connector settings, and members then enable it.

**Local desktop alternative (no hosting needed, Claude Desktop only):**
```bash
npm install && npm run build
```
Then add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "qrkite": {
      "command": "node",
      "args": ["/absolute/path/to/qrkite-mcp/dist/stdio.js"]
    }
  }
}
```
Restart Claude Desktop.

### Stage 6: Let other people use it
- Publish the repo on GitHub and put the connector URL plus these steps on a page of qrkite.online (for example a "Use QRkite in Claude" page).
- To list it in a connector directory, check Anthropic's current submission requirements first, as they change.

### Stage 7: Connect ChatGPT (option 1: custom MCP app)
Uses the same server and URL as Claude. ChatGPT needs a public **HTTPS** remote server (no local stdio).
1. Set `PUBLIC_URL` (e.g. `https://mcp.qrkite.online`) in your deployment so each result includes a direct image link. ChatGPT may not render inline MCP images, so the link/markdown is the reliable way to show the QR.
2. In ChatGPT on the web open **Settings, Apps** (or *Apps & Connectors*), then **Advanced settings** and turn on **Developer mode**. OpenAI has moved this toggle before; if you can't find it, check Settings, Security.
3. Choose **Create** (custom app/connector), enter name `QRkite`, paste `https://mcp.qrkite.online/mcp` (your `MCP_PATH`), and set authentication to **None**.
4. Start a new chat, select the QRkite app from the tools menu, and test: *"Create a QR code for https://qrkite.online"*.
5. Availability depends on your plan and may change: Developer mode and custom apps are limited to certain paid plans, and on Business/Enterprise/Edu an admin must enable them. Check OpenAI's current docs.

### Stage 8: Connect ChatGPT (option 2: Custom GPT with Actions)
Works for building your own shareable GPT ("QRkite QR Maker"). Requires a plan that can create GPTs.
1. Make sure `PUBLIC_URL` is set. Open `https://mcp.qrkite.online/openapi.yaml` in a browser and confirm the server URL inside is your public address.
2. In ChatGPT go to **Explore GPTs, Create**, then the **Configure** tab.
3. Name: `QRkite QR Maker`. Paste these **Instructions**:
   ```
   You create QR codes using the QRkite action. When the user asks for a QR code, build the exact
   content to encode (a URL, text, or WIFI:T:WPA;S:<ssid>;P:<password>;; for WiFi), call createQrCode,
   then show the image by outputting the `markdown` field from the response and give the PNG and SVG links.
   Remind users that colors need strong contrast to scan, and mention https://qrkite.online for logos and print cards.
   Never claim a QR code was created without calling the action.
   ```
4. Under **Actions, Create new action**, choose **Import from URL**, paste `https://mcp.qrkite.online/openapi.yaml`, and set authentication to **None**.
5. Add a **privacy policy URL** (required to publish or share a GPT with actions), for example your Privacy Policy page on qrkite.online.
6. Test in the preview pane, then **Create** and choose who can use it (only me, link, or public).

### Stage 9: Connect Gemini
Gemini's MCP support differs by product, and Google changes it often, so check Google's current docs for your account.

**A. Gemini CLI (works today with the server as is)**
1. Deploy the server (Stage 3) and note the URL, e.g. `https://mcp.qrkite.online/mcp`.
2. Add it with one command:
   ```bash
   gemini mcp add --transport http qrkite https://mcp.qrkite.online/mcp
   ```
   or edit `~/.gemini/settings.json`:
   ```json
   { "mcpServers": { "qrkite": { "httpUrl": "https://mcp.qrkite.online/mcp" } } }
   ```
3. Start `gemini`, run `/mcp` to see the 8 tools, then ask: *"Make a QR code for my menu https://example.com/menu"*.
4. Antigravity (Google's newer agent client) manages MCP servers in a similar way. Reports say some consumer accounts must move from Gemini CLI to the Antigravity CLI, so check which one you have.

**B. Gemini CLI extension (one-command install for other people)**
1. Edit the URL in `gemini-extension.json` to your own server.
2. Push the repo to GitHub, then users run:
   ```bash
   gemini extensions install https://github.com/<your-username>/qrkite-mcp
   ```
   `GEMINI.md` is loaded as extra context so Gemini knows when to use the tools.

**C. Gemini app (gemini.google.com), "Connected apps / custom apps"**
Reports say the Gemini app can add a custom app from a remote MCP URL, but only for certain accounts (personal account, 18+, US, English, with Keep Activity on) and that it requires **OAuth**, so a server with no authentication is rejected. This repo includes a built-in OAuth layer that auto-approves (the tools expose no private data, so OAuth is just the handshake):
1. Generate a secret: `openssl rand -hex 32`.
2. Set these on your server, then redeploy:
   ```
   ENABLE_OAUTH=true
   OAUTH_SECRET=<the secret>
   PUBLIC_URL=https://mcp.qrkite.online
   ```
3. Check `https://mcp.qrkite.online/.well-known/oauth-authorization-server` returns JSON.
4. In Gemini: **Settings, Connected apps, Add a custom app**, paste `https://mcp.qrkite.online/mcp`, click Next and approve in the browser.
5. Ask Gemini for a QR code. Gemini asks you to confirm actions.
OAuth mode also works for Claude and ChatGPT (choose OAuth/default auth there instead of None). The OAuth flow is covered by automated tests, but I could not test it against the live Gemini app, so treat step 4 as untested until you try it.

**D. Gemini API (your own app or script)**
```bash
cd examples && npm i @google/genai @modelcontextprotocol/sdk
GEMINI_API_KEY=your-key MCP_URL=https://mcp.qrkite.online/mcp node gemini-api.mjs "QR code for https://qrkite.online"
```
The script connects to the MCP server and hands its tools to Gemini through the SDK. Set `GEMINI_MODEL` to any current Gemini model. With OAuth enabled the example needs a token; for scripts keep OAuth off or use the REST endpoint `/api/qr` (see OpenAPI file) with Gemini function calling.

**E. Gemini Enterprise (organizations)**
An admin can register a remote MCP server (for example under Connected apps, Add MCP Server, or as a custom MCP server data store, depending on edition). Use the same server URL; enterprise setups usually expect OAuth, so enable it as in option C. Hosting on Google Cloud Run is a good fit (`gcloud run deploy --source .` uses the included Dockerfile).

### Privacy notes
- The image links contain the encoded content in the URL (for example a WiFi password), and URLs can end up in server logs and chat history. Do not use the connector for secrets you want kept private, or leave `PUBLIC_URL` unset to disable links for MCP results.
- The server stores nothing: every request is generated on the fly. OAuth tokens are signed, not stored, so they cannot be revoked individually; rotate `OAUTH_SECRET` to invalidate all of them.

---

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `MCP_PATH` | `/mcp` | MCP endpoint path (make it random for private use) |
| `QRKITE_SITE_URL` | `https://qrkite.online` | Site link shown in results |
| `PUBLIC_URL` | (empty) | Public https address of this server; enables image links and fills in `openapi.yaml` |
| `ENABLE_OAUTH` | `false` | `true` turns on the built-in auto-approve OAuth layer (needed for the Gemini app) |
| `OAUTH_SECRET` | (empty) | 32+ character secret used to sign tokens; required with `ENABLE_OAUTH` |
| `RATE_LIMIT_PER_MIN` | `60` | Requests per IP per minute on `/qr.*` and `/api/qr` |

## Project structure
```
src/qr.ts        QR rendering and payload builders (WiFi, vCard, email, SMS, geo)
src/tools.ts     MCP tool definitions
src/server.ts    Server factory
src/index.ts     HTTP entry point (MCP at /mcp, health at /health)
src/http-api.ts  REST endpoints: /qr.png, /qr.svg, /api/qr, /openapi.yaml (ChatGPT Actions)
src/links.ts     Builds direct image links
src/oauth.ts     Optional stateless OAuth 2.1 (registration, PKCE, refresh) for Gemini app
gemini-extension.json, GEMINI.md   Gemini CLI extension files
examples/        Gemini API example
openapi.yaml     OpenAPI spec for Custom GPT Actions
src/stdio.ts     stdio entry point, for Claude Desktop local use
test/            Unit tests
Dockerfile       Container image
```

## Development
```bash
npm run dev        # watch mode
npm test
npm run typecheck
```

## Troubleshooting
- **Claude can't connect:** the URL must be public HTTPS and end with your `MCP_PATH`. Test with `curl https://your-host/health`.
- **Scanning fails:** use high contrast (dark on light), keep `margin` at 4 or more, and use `errorCorrection` H if you add a logo.
- **ChatGPT shows no image:** set `PUBLIC_URL` and make sure the image link opens in a browser. In a Custom GPT, the instructions must tell it to output the `markdown` field.
- **ChatGPT has no Developer mode / Create button:** your plan or workspace may not allow custom apps; ask your admin or use the Custom GPT option.
- **"Content is too long":** the limit is 2000 characters per code.

## License
MIT
