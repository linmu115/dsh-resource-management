import { createServer } from "node:http";
import { once } from "node:events";

import { afterEach, describe, expect, it } from "vitest";

import { createManagementHttpHandler } from "../src/host/http-route.js";
import { ResponseCompletionScheduler } from "../src/host/response-completion.js";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("response completion scheduler", () => {
  it("runs deferred host work only after a complete JSON response", async () => {
    const order: string[] = [];
    const scheduler = new ResponseCompletionScheduler();
    const service = {
      execute: async () => {
        order.push("handler");
        scheduler.defer(() => { order.push("deferred"); });
        return { ok: true, message: "queued" };
      },
    };
    const server = createServer(createManagementHttpHandler(service, scheduler));
    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("test server did not bind a TCP port");

    const response = await fetch(`http://127.0.0.1:${address.port}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ method: "execute", params: {} }),
    });
    await expect(response.json()).resolves.toEqual({
      ok: true,
      value: { ok: true, message: "queued" },
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(order).toEqual(["handler", "deferred"]);
  });

  it("rejects scheduling outside a management response", () => {
    const scheduler = new ResponseCompletionScheduler();
    expect(() => scheduler.defer(() => undefined)).toThrow(/while handling a management request/);
  });
});
