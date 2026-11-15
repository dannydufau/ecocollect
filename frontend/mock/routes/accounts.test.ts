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

const termsId = () => (store as unknown as { terms: { termsDocumentId: string }[] }).terms.at(-1)!.termsDocumentId;
const newResident = (overrides = {}) => ({
    username: "sam_s", email: "sam@example.test", password: "secret1", firstName: "Sam", lastName: "S", publicName: "Sam S.",
    dateOfBirth: "1995-06-15", role: "resident", address: { street: "5 6 St SW", postalCode: "T2P1J9" }, termsDocumentId: termsId(), ...overrides,
});
const signUp = (body: unknown) => call("POST", "/api/accounts", { user: "", body });

it("registers a resident, who can then read their own profile", () => {
    expect(signUp(newResident())).toMatchObject({ status: 201, body: { accountId: "sam_s", roles: ["resident"] } });
    expect(call("GET", "/api/profile", { user: "sam_s" }).body).toMatchObject({ email: "sam@example.test", address: { postalCode: "T2P1J9" }, preferredPostalCodes: [] });
});

it("registers a volunteer with preferred postal codes and no address", () => {
    const result = signUp(newResident({ username: "vol_v", role: "volunteer", address: undefined, preferredPostalCodes: ["T2P1J9", "T3A0B1"] }));
    expect(result.status).toBe(201);
    expect(call("GET", "/api/profile", { user: "vol_v" }).body).toMatchObject({ address: null, preferredPostalCodes: ["T2P1J9", "T3A0B1"] });
});

it("refuses a taken username or email with 409", () => {
    expect(signUp(newResident({ username: "demo-resident-1" })).body.error.code).toBe("username_taken");
    expect(signUp(newResident({ email: "DEMO-RESIDENT-1@example.test" })).body.error.code).toBe("email_taken");
});

it("refuses outdated terms with 409", () => {
    expect(signUp(newResident({ termsDocumentId: "old" })).body.error.code).toBe("terms_outdated");
});

it("gives 400 with a message per field for age under 18, a non-Calgary postal code and a future birth date", () => {
    const under18 = new Date(Date.now() - 17 * 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    expect(signUp(newResident({ dateOfBirth: under18 })).body.error.details.fields).toHaveProperty("dateOfBirth");
    expect(signUp(newResident({ dateOfBirth: "2999-01-01" })).body.error.details.fields.dateOfBirth).toMatch(/future/);
    expect(signUp(newResident({ address: { street: "5 6 St SW", postalCode: "M5V2T6" } })).body.error.details.fields).toHaveProperty("address.postalCode");
});

it("gives 400 for a resident without an address, a bad username, a short password and 4 postal codes", () => {
    const fields = signUp(newResident({ address: undefined, username: "Sam S", password: "123", role: "resident", preferredPostalCodes: ["T2P1J9", "T2P1J9"] })).body.error.details.fields;
    expect(Object.keys(fields).sort()).toEqual(["address", "password", "preferredPostalCodes", "username"]);
    const four = signUp(newResident({ role: "volunteer", preferredPostalCodes: ["T2P1J9", "T2P1J8", "T2P1J7", "T2P1J6"] }));
    expect(four.body.error.details.fields).toHaveProperty("preferredPostalCodes");
});

it("does not create an account when the checks fail", () => {
    const before = data.accounts.length;
    signUp(newResident({ password: "1" }));
    signUp(newResident({ username: "demo-resident-1" }));
    expect(data.accounts).toHaveLength(before);
});

const patch = (body: unknown, user = "demo-resident-2") => call("PATCH", "/api/profile", { user, body });

it("changes only the fields that are sent", () => {
    expect(patch({ publicName: "Rosa the Great" })).toMatchObject({ status: 200, body: { publicName: "Rosa the Great", address: { postalCode: "T3A0B1" } } });
    expect(patch({ address: { street: "9 10 Ave SE", postalCode: "T2G0A1" } }).body.address).toEqual({ street: "9 10 Ave SE", city: "Calgary", postalCode: "T2G0A1" });
    expect(call("GET", "/api/public/profiles/:accountId", { user: "", params: { accountId: "demo-resident-2" } }).body.publicName).toBe("Rosa the Great");
});

it("replaces the preferred postal codes of a volunteer and refuses a fourth one", () => {
    expect(patch({ preferredPostalCodes: ["T2P1J9", "T3A0B1"] }, "demo-volunteer-1").body.preferredPostalCodes).toEqual(["T2P1J9", "T3A0B1"]);
    const fourth = patch({ preferredPostalCodes: ["T2P1J9", "T2P1J8", "T2P1J7", "T2P1J6"] }, "demo-volunteer-1");
    expect(fourth.status).toBe(400);
    expect(fourth.body.error.details.fields).toHaveProperty("preferredPostalCodes");
});

it("gives 403 role_required for an address on a volunteer or codes on a resident", () => {
    expect(patch({ address: { street: "1 2 St", postalCode: "T2P1J9" } }, "demo-volunteer-1")).toMatchObject({ status: 403, body: { error: { code: "role_required" } } });
    expect(patch({ preferredPostalCodes: [] }).body.error.code).toBe("role_required");
});

it("locks the address while the resident has an Open or Assigned request", () => {
    const result = patch({ address: { street: "9 10 Ave SE", postalCode: "T2G0A1" } }, "demo-resident-1");
    expect(result).toMatchObject({ status: 409, body: { error: { code: "address_locked" } } });
    expect(patch({ publicName: "Riley" }, "demo-resident-1").status).toBe(200);
});

it("gives 400 for an unknown field, an empty name and a bad address", () => {
    expect(patch({ email: "x@example.test" }).body.error.details.fields).toHaveProperty("email");
    expect(patch({ publicName: " " }).status).toBe(400);
    expect(patch({ address: { street: "", postalCode: "m5v2t6" } }).body.error.details.fields).toHaveProperty("address.postalCode");
});

const addRole = (body: unknown, user: string) => call("POST", "/api/profile/roles", { user, body });

it("adds the volunteer role to a resident and the resident role to a volunteer", () => {
    expect(addRole({ role: "volunteer", termsDocumentId: termsId(), preferredPostalCodes: ["T2P1J9"] }, "demo-resident-2").body).toEqual({ roles: ["resident", "volunteer"] });
    expect(call("GET", "/api/profile", { user: "demo-resident-2" }).body.preferredPostalCodes).toEqual(["T2P1J9"]);
    const resident = addRole({ role: "resident", termsDocumentId: termsId(), address: { street: "1 2 St SW", postalCode: "T2P1J9" } }, "demo-volunteer-2");
    expect(resident.body.roles).toEqual(["volunteer", "resident"]);
    expect(call("GET", "/api/profile", { user: "demo-volunteer-2" }).body.address).toMatchObject({ street: "1 2 St SW" });
});

it("needs an address to activate the resident role, and refuses a role the account has or old terms", () => {
    expect(addRole({ role: "resident", termsDocumentId: termsId() }, "demo-volunteer-2").body.error.details.fields).toHaveProperty("address");
    expect(addRole({ role: "resident", termsDocumentId: termsId(), address: { street: "1 2 St", postalCode: "T2P1J9" } }, "demo-resident-2").body.error.code).toBe("role_already_active");
    expect(addRole({ role: "volunteer", termsDocumentId: "old" }, "demo-resident-2").body.error.code).toBe("terms_outdated");
});

it("does not change the demo accounts for the next test", () => {
    expect(call("GET", "/api/profile", { user: "demo-resident-2" }).body.roles).toEqual(["resident"]);
});

const deactivate = (user: string) => call("DELETE", "/api/profile", { user });

it("refuses to deactivate an account that owns an Open request or has an unfinished pickup", () => {
    expect(deactivate("demo-resident-1")).toMatchObject({ status: 409, body: { error: { code: "active_work" } } });
    expect(deactivate("demo-volunteer-1").body.error.code).toBe("active_work");
});

it("deactivates an account without work, clears the cookie and hides the public profile", () => {
    const result = deactivate("demo-resident-3");
    expect(result.status).toBe(204);
    expect(result.headers["Set-Cookie"]).toMatch(/Max-Age=0/);
    expect(call("GET", "/api/profile", { user: "demo-resident-3" }).status).toBe(401);
    expect(call("GET", "/api/public/profiles/:accountId", { user: "", params: { accountId: "demo-resident-3" } }).status).toBe(404);
});

const startSession = (body: unknown) => call("POST", "/api/session", { user: "", body });

it("starts a session by setting an HttpOnly cookie with the ID token", () => {
    const result = startSession({ idToken: "demo-resident-1" });
    expect(result.status).toBe(204);
    expect(result.headers["Set-Cookie"]).toMatch(/^session=demo-resident-1; .*HttpOnly/);
});

it("gives a cookie to a Firebase user the mock does not know", () => {
    expect(startSession({ idToken: "someone-new" }).status).toBe(204);
});

it("refuses a session without a token or for a deactivated account", () => {
    expect(startSession({}).body.error.details.fields).toHaveProperty("idToken");
    expect(startSession({ idToken: "demo-deactivated-1" }).status).toBe(401);
});

it("ends the session by clearing the cookie", () => {
    const result = call("DELETE", "/api/session", { user: "" });
    expect(result.status).toBe(204);
    expect(result.headers["Set-Cookie"]).toMatch(/^session=; .*Max-Age=0/);
});
