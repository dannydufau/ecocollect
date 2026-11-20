import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, expect, it } from "vitest";
import { seed, store } from "../store.mjs";
import { register as registerResident } from "./resident.mjs";
import { register } from "./demo.mjs";

let handler: (req: IncomingMessage, res: ServerResponse) => void;
const accounts = () => (store as unknown as { accounts: { uid: string; roles: string[] }[] }).accounts;

beforeEach(() => {
    seed();
    registerResident(() => {}, store);
    register((_method: string, _path: string, routeHandler: typeof handler) => { handler = routeHandler; }, store);
});

it("answers 200 with a custom token for a new account with both roles, without a login", () => {
    const response = {
        status: 0, text: "",
        writeHead(status: number) { this.status = status; return this; },
        end(text: string) { this.text = text; return this; },
    };
    handler({ headers: {} } as IncomingMessage, response as unknown as ServerResponse);
    expect(response.status).toBe(200);
    const { customToken } = JSON.parse(response.text);
    const claims = JSON.parse(Buffer.from(customToken.split(".")[1], "base64url").toString());
    expect(claims.uid).toMatch(/^demo-/);
    expect(accounts().find(account => account.uid === claims.uid)?.roles).toEqual(["resident", "volunteer"]);
});
