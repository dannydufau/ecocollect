import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { seed, store } from "../store.mjs";
import { register as registerResident } from "./resident.mjs";
import { register } from "./terms.mjs";

let handler: (req: IncomingMessage, res: ServerResponse) => void;

function getTerms() {
    const response = {
        status: 0, text: "",
        writeHead(status: number) { this.status = status; return this; },
        end(text: string) { this.text = text; return this; },
    };
    handler({ headers: {} } as IncomingMessage, response as unknown as ServerResponse);
    return { status: response.status, body: JSON.parse(response.text) };
}

function load() {
    seed();
    registerResident(() => {}, store);
    register((_method: string, _path: string, routeHandler: typeof handler) => { handler = routeHandler; }, store);
}

beforeEach(() => seed());
afterEach(() => vi.unstubAllEnvs());

it("serves the same terms id that creating a request checks", () => {
    load();
    const current = (store as unknown as { terms: { termsDocumentId: string }[] }).terms.at(-1)!;
    expect(getTerms()).toMatchObject({ status: 200, body: { termsDocumentId: current.termsDocumentId } });
});

it("publishes a newer version when MOCK_TERMS_ID is set", () => {
    vi.stubEnv("MOCK_TERMS_ID", "terms_4");
    load();
    expect(getTerms().body.termsDocumentId).toBe("terms_4");
});
