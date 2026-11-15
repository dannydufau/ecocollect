import { beforeEach, describe, expect, it } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { currentUser, seed, sendError } from "./store.mjs";

const req = (headers: Record<string, string>) => ({ headers }) as unknown as IncomingMessage;
const jwt = (claims: object) => `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.y`;

beforeEach(seed);

describe("currentUser", () => {
    it("reads a bearer token and finds the demo account", () => {
        const user = currentUser(req({ authorization: "Bearer demo-volunteer-1" }));
        expect(user?.uid).toBe("demo-volunteer-1");
        expect(user?.roles).toEqual(["volunteer"]);
    });

    it("reads the session cookie", () => {
        const user = currentUser(req({ cookie: "a=1; session=demo-resident-1" }));
        expect(user?.uid).toBe("demo-resident-1");
    });

    it("takes the uid and roles from a JWT", () => {
        const user = currentUser(req({ authorization: `Bearer ${jwt({ user_id: "someone", roles: ["resident", "volunteer"] })}` }));
        expect(user).toMatchObject({ uid: "someone", roles: ["resident", "volunteer"] });
    });

    it("returns null without a token", () => {
        expect(currentUser(req({}))).toBeNull();
    });
});

describe("sendError", () => {
    function send(...args: [number, string, string, Record<string, string>?]) {
        let status = 0;
        let body = "";
        const res = {
            writeHead: (code: number) => { status = code; return { end: (text: string) => { body = text; } }; },
        } as unknown as ServerResponse;
        sendError(res, ...args);
        return { status, body: JSON.parse(body) };
    }

    it("sends the contract error format", () => {
        expect(send(409, "not_open", "Not open")).toEqual({ status: 409, body: { error: { code: "not_open", message: "Not open" } } });
    });

    it("puts field errors under details.fields", () => {
        const { body } = send(400, "validation_error", "Bad input", { quantity: "must be positive" });
        expect(body.error.details).toEqual({ fields: { quantity: "must be positive" } });
    });
});
