import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, expect, it } from "vitest";
import { seed, store } from "../store.mjs";
import { register } from "./accounts.mjs";
import { register as registerResident } from "./resident.mjs";
import { register as registerRewards } from "./rewards.mjs";

type Handler = (req: IncomingMessage, res: ServerResponse, context: { body?: unknown; params: Record<string, string> }) => void;
const data = store as unknown as { accounts: { uid: string; deactivatedAt?: string }[]; awards: { accountId: string; points: number }[] };
let routes: Map<string, Handler>;

function call(method: string, path: string, { user = "demo-resident-1", body, params = {} }: { user?: string; body?: unknown; params?: Record<string, string> } = {}) {
    const response = {
        status: 0, text: "", headers: {} as Record<string, string>,
        setHeader(name: string, value: string) { this.headers[name] = value; },
        writeHead(status: number) { this.status = status; return this; },
        end(text?: string) { this.text = text ?? ""; return this; },
    };
    routes.get(`${method} ${path}`)!({ headers: user ? { authorization: `Bearer ${user}` } : {} } as IncomingMessage, response as unknown as ServerResponse, { body, params });
    return { status: response.status, body: response.text ? JSON.parse(response.text) : undefined, headers: response.headers };
}

beforeEach(() => {
    seed();
    routes = new Map();
    const add = (method: string, path: string, handler: Handler) => routes.set(`${method} ${path}`, handler);
    registerResident(() => {}, store);
    registerRewards(() => {}, store);
    register(add, store);
});

it("seeds a resident only account, one with both roles and a deactivated one", () => {
    expect(call("GET", "/api/profile", { user: "demo-resident-1" }).body.roles).toEqual(["resident"]);
    expect(call("GET", "/api/profile", { user: "demo-resident-5" }).body.roles).toEqual(["resident", "volunteer"]);
    expect(data.accounts.filter(account => account.deactivatedAt)).toHaveLength(1);
});

it("returns the own profile with the address and no volunteer codes for a resident", () => {
    const { status, body } = call("GET", "/api/profile");
    expect(status).toBe(200);
    expect(body).toMatchObject({
        accountId: "demo-resident-1", email: "demo-resident-1@example.test", publicName: "Riley R.",
        address: { street: "123 4 Ave SW", city: "Calgary", postalCode: "T2P1J9" }, preferredPostalCodes: [],
    });
    expect(body.createdAt).toMatch(/Z$/);
});

it("gives a volunteer only account no address", () => {
    expect(call("GET", "/api/profile", { user: "demo-volunteer-1" }).body).toMatchObject({ address: null, preferredPostalCodes: ["T2P1J9"] });
});

it("answers 401 without a login or for a deactivated account, and 404 for an unknown account", () => {
    expect(call("GET", "/api/profile", { user: "" }).status).toBe(401);
    expect(call("GET", "/api/profile", { user: "demo-deactivated-1" }).status).toBe(401);
    expect(call("GET", "/api/profile", { user: "nobody" }).status).toBe(404);
});

it("shows a public profile without any private details", () => {
    const { status, body } = call("GET", "/api/public/profiles/:accountId", { user: "", params: { accountId: "demo-resident-5" } });
    expect(status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["accountId", "memberSince", "publicName", "roles"]);
    expect(body.roles).toEqual(["resident", "volunteer"]);
});

it.each(["demo-deactivated-1", "nobody"])("hides the public profile of %s with a 404", accountId => {
    expect(call("GET", "/api/public/profiles/:accountId", { user: "", params: { accountId } }).status).toBe(404);
});

it("adds up the EcoPoints of an account and gives zero for an unknown one", () => {
    data.awards.length = 0;
    data.awards.push({ accountId: "demo-volunteer-1", points: 13.1 }, { accountId: "demo-volunteer-1", points: 0.2 });
    expect(call("GET", "/api/public/profiles/:accountId/stats", { user: "", params: { accountId: "demo-volunteer-1" } }).body).toEqual({ accountId: "demo-volunteer-1", ecopoints: 13.3 });
    expect(call("GET", "/api/public/profiles/:accountId/stats", { user: "", params: { accountId: "nobody" } }).body).toEqual({ accountId: "nobody", ecopoints: 0 });
});
