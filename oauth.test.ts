import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";

process.env.ENABLE_OAUTH = "true";
process.env.OAUTH_SECRET = "x".repeat(40);
process.env.PUBLIC_URL = "https://mcp.example.test";
const { mountOAuth, requireAuth, sign, verify } = await import("../src/oauth.js");

test("sign/verify round trip, type and tamper checks", () => {
  const t = sign({ t: "access", exp: Math.floor(Date.now() / 1000) + 60 });
  assert.ok(verify(t, "access"));
  assert.equal(verify(t, "refresh"), null);
  assert.equal(verify(t.slice(0, -2) + "xx", "access"), null);
  assert.equal(verify(sign({ t: "access", exp: 1 }), "access"), null);
});

test("full OAuth flow: register, authorize, token, protected call, refresh", async () => {
  const app = express();
  app.use(express.json());
  mountOAuth(app);
  app.post("/mcp", requireAuth, (_req, res) => res.json({ ok: true }));
  const srv = app.listen(0);
  const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  try {
    assert.equal((await fetch(`${url}/mcp`, { method: "POST" })).status, 401);

    const reg = await (await fetch(`${url}/register`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ redirect_uris: ["https://client.example/cb"], client_name: "t" }),
    })).json();

    const verifier = "v".repeat(50);
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const auth = new URL(`${url}/authorize`);
    Object.entries({ client_id: reg.client_id, redirect_uri: "https://client.example/cb", response_type: "code",
      code_challenge: challenge, code_challenge_method: "S256", state: "s1" }).forEach(([k, v]) => auth.searchParams.set(k, v));
    const r = await fetch(auth, { redirect: "manual" });
    assert.equal(r.status, 302);
    const loc = new URL(r.headers.get("location")!);
    assert.equal(loc.searchParams.get("state"), "s1");
    const code = loc.searchParams.get("code")!;

    const tokenReq = (body: Record<string, string>) =>
      fetch(`${url}/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });

    assert.equal((await tokenReq({ grant_type: "authorization_code", code, redirect_uri: "https://client.example/cb", code_verifier: "wrong" })).status, 400);
    const tok = await (await tokenReq({ grant_type: "authorization_code", code, redirect_uri: "https://client.example/cb", code_verifier: verifier, client_id: reg.client_id })).json();
    assert.ok(tok.access_token);

    const ok = await fetch(`${url}/mcp`, { method: "POST", headers: { authorization: `Bearer ${tok.access_token}` } });
    assert.equal(ok.status, 200);

    const ref = await (await tokenReq({ grant_type: "refresh_token", refresh_token: tok.refresh_token })).json();
    assert.ok(ref.access_token);

    const bad = await fetch(`${url}/authorize?client_id=${reg.client_id}&redirect_uri=https://evil.example/cb&response_type=code`);
    assert.equal(bad.status, 400);
  } finally {
    srv.close();
  }
});
