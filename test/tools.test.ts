import test from "node:test";
import assert from "node:assert/strict";
import { registerTools } from "../src/tools.js";

type Handler = (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: { type: string }[] }>;
type Registered = { config: { annotations?: Record<string, unknown> }; handler: Handler };

// Minimal stand-in for McpServer that records every registered tool.
const tools = new Map<string, Registered>();
const fakeServer = {
  registerTool(name: string, config: { annotations?: Record<string, unknown> }, handler: Handler) {
    tools.set(name, { config, handler });
  },
};
registerTools(fakeServer as never);

// A minimal valid input for each tool.
const samples: Record<string, Record<string, unknown>> = {
  generate_qr_code: { content: "https://qrkite.online" },
  generate_wifi_qr: { ssid: "Cafe", password: "secret123", security: "WPA", hidden: false },
  generate_menu_qr: { menuUrl: "https://example.com/menu" },
  generate_vcard_qr: { firstName: "Dana", lastName: "Levi", phone: "+972501234567" },
  generate_email_qr: { to: "hello@example.com", subject: "Hi" },
  generate_sms_qr: { phone: "+972501234567", message: "Hello" },
  generate_location_qr: { latitude: 32.92, longitude: 35.08 },
  open_qrkite_studio: {},
};

test("all 8 tools are registered", () => {
  assert.deepEqual([...tools.keys()].sort(), Object.keys(samples).sort());
});

for (const [name, input] of Object.entries(samples)) {
  test(`${name} declares all four hints`, () => {
    const a = tools.get(name)?.config.annotations;
    assert.ok(a, `${name} has no annotations`);
    for (const key of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"]) {
      assert.equal(typeof a[key], "boolean", `${name}: ${key} must be true or false`);
    }
  });

  test(`${name} returns a result without error`, async () => {
    const result = await tools.get(name)!.handler(input);
    assert.notEqual(result.isError, true);
    assert.ok(result.content.length > 0);
  });
}
