import { test } from "node:test";
import assert from "node:assert/strict";
import { renderQr, wifiPayload, emailPayload, vcardPayload } from "../src/qr.js";

const style = { format: "png", size: 256, margin: 4, errorCorrection: "M", darkColor: "#000000", lightColor: "#ffffff" } as const;

test("wifi payload escapes special characters", () => {
  assert.equal(
    wifiPayload({ ssid: "My;Net", password: 'pa:ss"', security: "WPA" }),
    'WIFI:T:WPA;S:My\\;Net;P:pa\\:ss\\";;'
  );
});

test("open wifi has no password", () => {
  assert.equal(wifiPayload({ ssid: "Cafe", security: "nopass" }), "WIFI:T:nopass;S:Cafe;;");
});

test("email payload encodes fields", () => {
  assert.equal(emailPayload({ to: "a@b.com", subject: "Hi there" }), "mailto:a@b.com?subject=Hi%20there");
});

test("vcard contains required lines", () => {
  const v = vcardPayload({ firstName: "Ann", lastName: "Lee", phone: "123" });
  assert.match(v, /BEGIN:VCARD/);
  assert.match(v, /FN:Ann Lee/);
  assert.match(v, /END:VCARD/);
});

test("png output is a valid PNG", async () => {
  const r = await renderQr("https://qrkite.online", style);
  const bytes = Buffer.from(r.data, "base64");
  assert.equal(bytes.subarray(1, 4).toString(), "PNG");
});

test("svg output is svg", async () => {
  const r = await renderQr("hello", { ...style, format: "svg" });
  assert.match(r.data, /<svg/);
});

test("too-long content is rejected", async () => {
  await assert.rejects(renderQr("x".repeat(5000), style), /too long/);
});

import { imageUrl } from "../src/links.js";
test("imageUrl builds an encoded link", () => {
  const u = imageUrl("hello world", style, "https://x.test");
  assert.ok(u!.startsWith("https://x.test/qr.png?content=hello+world"));
  assert.ok(u!.includes("dark=%23000000"));
});
