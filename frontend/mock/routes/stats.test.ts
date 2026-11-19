import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, expect, it } from "vitest";
import { seed, store } from "../store.mjs";
import { register as registerResident } from "./resident.mjs";
import { register } from "./stats.mjs";

type Request = { status: string; categoryId: string; quantity: number; estimatedWeightKg: number };
const requests = () => (store as unknown as { requests: Request[] }).requests;
let handler: (req: IncomingMessage, res: ServerResponse) => void;

// No cookie and no Authorization header: R2 is public
function getStats() {
    const response = {
        status: 0, text: "",
        writeHead(status: number) { this.status = status; return this; },
        end(text: string) { this.text = text; return this; },
    };
    handler({ headers: {} } as IncomingMessage, response as unknown as ServerResponse);
    return { status: response.status, body: JSON.parse(response.text) };
}

beforeEach(() => {
    seed();
    registerResident(() => {}, store);
    register((_method: string, path: string, routeHandler: typeof handler) => { if (path === "/api/public/stats") handler = routeHandler; }, store);
});

it("answers 200 with the R2 shape without a login", () => {
    const { status, body } = getStats();
    expect(status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["byWasteType", "deliveries", "ecopointsAwarded", "estimatedWeightKgDelivered", "itemsDelivered", "updatedAt"]);
    expect(body.byWasteType[0]).toEqual({ wasteType: expect.any(String), deliveries: expect.any(Number), itemsDelivered: expect.any(Number), estimatedWeightKgDelivered: expect.any(Number) });
    expect(Number.isNaN(Date.parse(body.updatedAt))).toBe(false);
});

it("counts a delivered request", () => {
    const before = getStats().body;
    requests().push({ ...requests()[0], status: "Delivered", categoryId: "phones", quantity: 4, estimatedWeightKg: 0.8 });
    const after = getStats().body;
    expect(after.deliveries).toBe(before.deliveries + 1);
    expect(after.itemsDelivered).toBe(before.itemsDelivered + 4);
    expect(after.byWasteType).toContainEqual({ wasteType: "Mobile Devices", deliveries: 1, itemsDelivered: 4, estimatedWeightKgDelivered: 0.8 });
});

it("falls back to sample numbers when nothing was delivered", () => {
    for (const request of requests()) if (request.status === "Delivered") request.status = "Open";
    const { body } = getStats();
    expect(body.deliveries).toBeGreaterThan(0);
    expect(body.byWasteType.length).toBeGreaterThan(0);
});
