import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";
import { mountApi } from "./http-api.js";
import { mountOAuth, requireAuth, oauthEnabled } from "./oauth.js";

const PORT = Number(process.env.PORT ?? 3000);
const MCP_PATH = process.env.MCP_PATH ?? "/mcp";

const app = express();
app.use(express.json({ limit: "1mb" }));

mountApi(app);
mountOAuth(app); // no-op unless ENABLE_OAUTH=true

app.get("/health", (_req, res) => res.json({ status: "ok", service: "qrkite-mcp", oauth: oauthEnabled() }));

// Stateless mode: a fresh server + transport per request (simple and scales horizontally).
app.post(MCP_PATH, requireAuth, async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request failed:", err);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  }
});

const notAllowed = (_req: express.Request, res: express.Response) =>
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
app.get(MCP_PATH, notAllowed);
app.delete(MCP_PATH, notAllowed);

app.listen(PORT, () =>
  console.log(`QRkite MCP server listening on :${PORT}${MCP_PATH} (OAuth ${oauthEnabled() ? "on" : "off"})`)
);
