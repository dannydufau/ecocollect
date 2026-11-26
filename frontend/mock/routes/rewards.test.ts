import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockResponse } from "@/test/mock-response";
import { seed, store } from "../store.mjs";
import { windowStart } from "../detail.mjs";
import { register as registerResident } from "./resident.mjs";
import { awardCancellation, register } from "./rewards.mjs";

type Request = {
    requestId: string; residentUid: string; quantity: number; estimatedWeightKg: number; status: string;
};
type Assignment = {
    assignmentId: string; requestId: string; volunteerId: string;
    window: { date: string; startHour: number }; collectedAt: string | null; endedAt: string | null; endReason: string | null;
};
const mockStore = store as unknown as { requests: Request[]; assignments: Assignment[]; awards: { assignmentId: string; points: number }[] };
let handler: (req: IncomingMessage, res: ServerResponse) => void;
const HOUR = 60 * 60 * 1000;

function read(user = "demo-volunteer-1") {
    const response = mockResponse();
    handler({ headers: user ? { authorization: `Bearer ${user}` } : {} } as IncomingMessage, response as unknown as ServerResponse);
    return { status: response.status, body: JSON.parse(response.text) };
}

function cancelledAssignment() {
    const assignment = mockStore.assignments.find(item => !item.endedAt)!;
    assignment.endReason = "Resident_Cancelled";
    assignment.endedAt = new Date(windowStart(assignment.window.date, assignment.window.startHour).getTime() - 2 * HOUR).toISOString();
    const request = mockStore.requests.find(item => item.requestId === assignment.requestId)!;
    request.quantity = 2;
    request.estimatedWeightKg = 3;
    request.status = "Cancelled";
    return { assignment, request };
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-20T18:00:00Z"));
    seed();
    registerResident(() => {}, store);
    register((_method: string, _path: string, routeHandler: typeof handler) => { handler = routeHandler; }, store);
});

afterEach(() => vi.useRealTimers());

describe("EcoPoints mock", () => {
    it("seeds delivery and cancellation awards and returns the caller's totals", () => {
        const volunteer = read();
        expect(volunteer.status).toBe(200);
        expect(volunteer.body).toMatchObject({ total: 52, asResident: 0, asVolunteer: 52 });
        expect(volunteer.body.awards.map((award: { kind: string }) => award.kind)).toEqual(["DELIVERY", "CANCELLATION"]);
        expect(read("demo-resident-1").body).toMatchObject({ total: 13, asResident: 13, asVolunteer: 0 });
        expect(read("demo-resident-2").body).toEqual({ total: 0, asResident: 0, asVolunteer: 0, awards: [] });
    });

    it("hides request details for cancellation awards and uses assignment ending time", () => {
        const awards = read().body.awards;
        const cancellation = awards.find((award: { kind: string }) => award.kind === "CANCELLATION");
        expect(cancellation).toMatchObject({ categoryName: null, quantity: null, estimatedWeightKg: null, points: 26, formula: "VOLUNTEER" });
        const assignment = mockStore.assignments.find(item => item.assignmentId === cancellation.assignmentId)!;
        expect(cancellation.awardedAt).toBe(assignment.endedAt);
        expect(Object.keys(cancellation).sort()).toEqual([
            "awardId", "kind", "earnedAs", "points", "formula", "requestId", "assignmentId", "categoryName", "quantity", "estimatedWeightKg", "awardedAt",
        ].sort());
    });

    it("gives 18 points for cancelling two items at three kg and avoids duplicate awards", () => {
        const { assignment } = cancelledAssignment();
        const first = awardCancellation(store, assignment);
        expect(first!.points).toBe(18);
        expect(awardCancellation(store, assignment)).toBe(first);
        expect(mockStore.awards.filter(award => award.assignmentId === assignment.assignmentId)).toHaveLength(1);
    });

    it("gives no cancellation points when the volunteer owns the request", () => {
        const { assignment, request } = cancelledAssignment();
        request.residentUid = assignment.volunteerId;
        const count = mockStore.awards.length;
        expect(awardCancellation(store, assignment)).toBeNull();
        expect(mockStore.awards).toHaveLength(count);
    });

    it("gives no award at or before the cancellation cutoff or after the window ends", () => {
        const { assignment } = cancelledAssignment();
        const start = windowStart(assignment.window.date, assignment.window.startHour).getTime();
        for (const ended of [start - 25 * HOUR, start - 24 * HOUR, start + HOUR]) {
            assignment.endedAt = new Date(ended).toISOString();
            expect(awardCancellation(store, assignment)).toBeNull();
        }
    });

    it("keeps fractional points and totals without floating-point drift", () => {
        const { assignment, request } = cancelledAssignment();
        request.quantity = 1;
        request.estimatedWeightKg = 1.1;
        expect(awardCancellation(store, assignment)!.points).toBe(7.4);
        expect(read().body.total).toBe(59.4);
    });

    it("adds new delivery awards for both roles, including self-delivery, only once", () => {
        const assignment = mockStore.assignments.find(item => !item.endedAt)!;
        const request = mockStore.requests.find(item => item.requestId === assignment.requestId)!;
        request.residentUid = "demo-resident-5";
        request.status = "Delivered";
        assignment.volunteerId = "demo-resident-5";
        assignment.endReason = "Delivered";
        assignment.collectedAt = new Date().toISOString();
        assignment.endedAt = new Date(Date.now() + HOUR).toISOString();
        const first = read("demo-resident-5").body;
        expect(first).toMatchObject({ total: 39, asResident: 13, asVolunteer: 26 });
        expect(first.awards).toHaveLength(2);
        expect(read("demo-resident-5").body).toEqual(first);
    });

    it("rejects anonymous requests", () => {
        expect(read("")).toMatchObject({ status: 401, body: { error: { code: "unauthorized" } } });
    });
});
