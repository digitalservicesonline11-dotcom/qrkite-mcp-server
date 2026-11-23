// Use the QRkite MCP server from your own app with the Gemini API.
//   cd examples && npm i @google/genai @modelcontextprotocol/sdk
//   GEMINI_API_KEY=... MCP_URL=https://mcp.qrkite.online/mcp node gemini-api.mjs "QR code for wifi Cafe, password secret123"
import { GoogleGenAI, mcpToTool } from "@google/genai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const mcpUrl = process.env.MCP_URL ?? "http://localhost:3000/mcp";
const prompt = process.argv[2] ?? "Create a QR code for https://qrkite.online";

const client = new Client({ name: "qrkite-gemini-example", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(mcpUrl)));

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const response = await ai.models.generateContent({
  model: process.env.GEMINI_MODEL ?? "gemini-flash-latest",
  contents: prompt,
  config: { tools: [mcpToTool(client)] }, // the SDK runs the tool calls for you
});

console.log(response.text);
await client.close();
