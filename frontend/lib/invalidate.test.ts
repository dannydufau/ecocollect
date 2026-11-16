import { describe, expect, it } from "vitest";
import { keysFor } from "./invalidate";

const mine = ["requests", "mine"];
const detail = ["request", "r1"];

describe("keysFor", () => {
    it.each([
        ["REQUEST_CREATED", [["notifications"], mine, detail]],
        ["REQUEST_ASSIGNED_RESIDENT", [["notifications"], mine, detail]],
        ["ASSIGNMENT_CANCELLED_BY_VOLUNTEER_RESIDENT", [["notifications"], mine, detail]],
        ["NEW_MATCHING_REQUEST", [["notifications"], ["requests", "available"]]],
        ["REQUEST_DELIVERED_VOLUNTEER", [["notifications"], ["requests", "volunteer"], detail]],
        ["ASSIGNMENT_CANCELLED_BY_RESIDENT_VOLUNTEER", [["notifications"], ["requests", "volunteer"], detail]],
        ["ECOPOINTS_AWARDED_ON_DELIVERY_RESIDENT", [["notifications"], ["ecopoints"]]],
        ["ECOPOINTS_AWARDED_ON_DELIVERY_VOLUNTEER", [["notifications"], ["ecopoints"]]],
        ["ECOPOINTS_AWARDED_ON_ASSIGNMENT_CANCELLATION_VOLUNTEER", [["notifications"], ["ecopoints"]]],
        ["SOMETHING_NEW", [["notifications"]]],
    ])("%s", (type, expected) => {
        expect(keysFor(type, "r1")).toEqual(expected);
    });

    it("leaves out the request detail when the notification has no request", () => {
        expect(keysFor("REQUEST_ASSIGNED_RESIDENT", null)).toEqual([["notifications"], mine]);
        expect(keysFor("REQUEST_DELIVERED_VOLUNTEER", null)).toEqual([["notifications"], ["requests", "volunteer"]]);
    });

    it("does not touch the request lists for an award", () => {
        expect(keysFor("ECOPOINTS_AWARDED_ON_DELIVERY_RESIDENT", "r1")).toEqual([["notifications"], ["ecopoints"]]);
    });
});
