import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import express, { type Express, type NextFunction, type Request, type Response } from "express";

/**
 * Minimal, stateless OAuth 2.1 layer for MCP clients that insist on OAuth (e.g. the Gemini app).
 * It auto-approves every request: the QR tools expose no private data, so OAuth here is only
 * the handshake the client requires. Features: dynamic client registration, authorization code + PKCE (S256),
 * refresh tokens. All state lives in HMAC-signed tokens, so nothing is stored on the server.
 * Enable with ENABLE_OAUTH=true, OAUTH_SECRET (32+ chars) and PUBLIC_URL.
 */

export const oauthEnabled = () => process.env.ENABLE_OAUTH === "true";
const secret = () => process.env.OAUTH_SECRET ?? "";
const base = () => (process.env.PUBLIC_URL ?? "").replace(/\/+$/, "");
const mcpPath = () => process.env.MCP_PATH ?? "/mcp";
const now = () => Math.floor(Date.now() / 1000);

export function assertOAuthConfig(): void {
  if (!oauthEnabled()) return;
  if (secret().length < 32) throw new Error("ENABLE_OAUTH=true requires OAUTH_SECRET with at least 32 characters.");
  if (!base().startsWith("https://") && !base().startsWith("http://localhost")) {
    throw new Error("ENABLE_OAUTH=true requires PUBLIC_URL (public https address of this server).");
  }
}

/* ---------- signed tokens ---------- */
const mac = (body: string) => createHmac("sha256", secret()).update(body).digest();

export function sign(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(body).toString("base64url")}`;
}

export function verify<T extends Record<string, any>>(token: string | undefined, type: string): T | null {
  if (!token || !secret()) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = mac(body);
  const got = Buffer.from(sig, "base64url");
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (p.t !== type) return null;
    if (typeof p.exp === "number" && p.exp < now()) return null;
    return p as T;
  } catch {
    return null;
  }
}

const pkceOk = (verifier: string, challenge: string) =>
  createHash("sha256").update(verifier).digest("base64url") === challenge;

/* ---------- auth middleware for the MCP endpoint ---------- */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!oauthEnabled()) return next();
  const m = /^Bearer (.+)$/i.exec(req.get("authorization") ?? "");
  if (m && verify(m[1], "access")) return next();
  res
    .status(401)
    .set("WWW-Authenticate", `Bearer resource_metadata="${base()}/.well-known/oauth-protected-resource"`)
    .json({ error: "unauthorized", error_description: "Valid bearer token required." });
}

/* ---------- endpoints ---------- */
export function mountOAuth(app: Express): void {
  if (!oauthEnabled()) return;
  assertOAuthConfig();

  const cors = (req: Request, res: Response, next: NextFunction) => {
    res.set({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    });
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  };
  app.use(["/.well-known", "/register", "/token"], cors);

  const protectedResource = (_req: Request, res: Response) =>
    res.json({
      resource: `${base()}${mcpPath()}`,
      authorization_servers: [base()],
      bearer_methods_supported: ["header"],
    });
  app.get("/.well-known/oauth-protected-resource", protectedResource);
  app.get(`/.well-known/oauth-protected-resource${mcpPath()}`, protectedResource);

  app.get("/.well-known/oauth-authorization-server", (_req, res) =>
    res.json({
      issuer: base(),
      authorization_endpoint: `${base()}/authorize`,
      token_endpoint: `${base()}/token`,
      registration_endpoint: `${base()}/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["qr"],
    })
  );

  // Dynamic client registration: the client_id itself is a signed record of the redirect URIs.
  app.post("/register", (req, res) => {
    const uris = req.body?.redirect_uris;
    if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10 || !uris.every((u) => typeof u === "string" && URL.canParse(u))) {
      return res.status(400).json({ error: "invalid_redirect_uri" });
    }
    const name = typeof req.body.client_name === "string" ? req.body.client_name.slice(0, 100) : "client";
    res.status(201).json({
      client_id: sign({ t: "client", uris, name }),
      client_name: name,
      redirect_uris: uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
  });

  app.get("/authorize", (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const client = verify<{ uris: string[] }>(q.client_id, "client");
    if (!client || !q.redirect_uri || !client.uris.includes(q.redirect_uri)) {
      return res.status(400).type("text").send("Invalid client or redirect_uri.");
    }
    const back = new URL(q.redirect_uri);
    if (q.state) back.searchParams.set("state", q.state);
    if (q.response_type !== "code" || !q.code_challenge || q.code_challenge_method !== "S256") {
      back.searchParams.set("error", "invalid_request");
      back.searchParams.set("error_description", "response_type=code and PKCE S256 are required");
      return res.redirect(back.toString());
    }
    back.searchParams.set(
      "code",
      sign({ t: "code", cid: q.client_id, uri: q.redirect_uri, ch: q.code_challenge, exp: now() + 300 })
    );
    res.redirect(back.toString()); // auto-approve
  });

  app.post("/token", express.urlencoded({ extended: false }), (req, res) => {
    const b = req.body as Record<string, string | undefined>;
    const issue = () => ({
      access_token: sign({ t: "access", exp: now() + 86_400 }),
      token_type: "Bearer",
      expires_in: 86_400,
      refresh_token: sign({ t: "refresh", exp: now() + 90 * 86_400 }),
      scope: "qr",
    });
    const bad = (error: string) => res.status(400).json({ error });

    if (b.grant_type === "authorization_code") {
      const c = verify<{ cid: string; uri: string; ch: string }>(b.code, "code");
      if (!c || c.uri !== b.redirect_uri || (b.client_id && c.cid !== b.client_id)) return bad("invalid_grant");
      if (!b.code_verifier || !pkceOk(b.code_verifier, c.ch)) return bad("invalid_grant");
      return res.json(issue());
    }
    if (b.grant_type === "refresh_token") {
      if (!verify(b.refresh_token, "refresh")) return bad("invalid_grant");
      return res.json(issue());
    }
    return bad("unsupported_grant_type");
  });
}
