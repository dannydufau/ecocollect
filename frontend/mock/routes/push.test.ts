import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, expect, it } from "vitest";
import { mockResponse } from "@/test/mock-response";
import { seed, store } from "../store.mjs";
import { register } from "./push.mjs";

type Handler = (req: IncomingMessage, res: ServerResponse, context: { body?: unknown }) => void;
const stored = () => (store as unknown as { pushSubscriptions: { uid: string; endpoint: string }[] }).pushSubscriptions;
let handlers: Map<string, Handler>;

function call(method: string, body: unknown, user: string | null = "demo-resident-1") {
    const response = mockResponse();
    const headers = user ? { authorization: `Bearer ${user}` } : {};
    handlers.get(method)!({ headers } as IncomingMessage, response as unknown as ServerResponse, { body });
    return { status: response.status, body: response.text ? JSON.parse(response.text) : null };
}

const subscription = { endpoint: "https://push.example.test/abc", keys: { p256dh: "p", auth: "a" }, expirationTime: null };

beforeEach(() => {
    seed();
    handlers = new Map();
    register((method: string, _path: string, handler: Handler) => handlers.set(method, handler), store);
});

it("saves a valid subscription", () => {
    expect(call("POST", subscription)).toEqual({ status: 201, body: null });
    expect(stored()).toEqual([{ uid: "demo-resident-1", ...subscription }]);
});

it("keeps one entry when the same endpoint is sent twice", () => {
    call("POST", subscription);
    call("POST", { ...subscription, keys: { p256dh: "p2", auth: "a2" } });
    expect(stored()).toHaveLength(1);
    expect(stored()[0]).toMatchObject({ keys: { p256dh: "p2", auth: "a2" } });
});

it("returns 400 with fields for a bad body", () => {
    const result = call("POST", { endpoint: "not a url", keys: { p256dh: "" } });
    expect(result.status).toBe(400);
    expect(Object.keys(result.body.error.details.fields)).toEqual(["endpoint", "keys.p256dh", "keys.auth"]);
    expect(stored()).toHaveLength(0);
});

it("returns 401 without a login", () => {
    expect(call("POST", subscription, null).status).toBe(401);
    expect(call("DELETE", { endpoint: subscription.endpoint }, null).status).toBe(401);
});

it("removes a subscription on DELETE", () => {
    call("POST", subscription);
    expect(call("DELETE", { endpoint: subscription.endpoint }).status).toBe(204);
    expect(stored()).toHaveLength(0);
});

it("returns 204 for an unknown endpoint and 400 without one", () => {
    expect(call("DELETE", { endpoint: "https://push.example.test/nope" }).status).toBe(204);
    expect(call("DELETE", {}).status).toBe(400);
});
