import { afterEach, expect, it, vi } from "vitest";
import { roleOf, saveReturnTo, takeReturnTo } from "./return-to";

afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
});

it("saves an allowed page and gives it back once", () => {
    saveReturnTo("/resident/requests/r1?tab=x");
    expect(takeReturnTo()).toBe("/resident/requests/r1?tab=x");
    expect(takeReturnTo()).toBeNull();
});

it("saves exact resident and volunteer list pages and identifies their role", () => {
    saveReturnTo("/resident");
    expect(takeReturnTo()).toBe("/resident");
    saveReturnTo("/volunteer?postalCodes=T2P1J9");
    expect(takeReturnTo()).toBe("/volunteer?postalCodes=T2P1J9");
    expect(roleOf("/resident")).toBe("resident");
    expect(roleOf("/volunteer")).toBe("volunteer");
});

it.each(["/stats", "/login", "/ecopointsx", "//evil.com", "https://evil.com", "/resident//evil.com"])(
    "does not save %s", (path) => {
        saveReturnTo(path);
        expect(sessionStorage.getItem("returnTo")).toBeNull();
    });

it("ignores a bad stored value and clears it", () => {
    sessionStorage.setItem("returnTo", "https://evil.com");
    expect(takeReturnTo()).toBeNull();
    expect(sessionStorage.getItem("returnTo")).toBeNull();
});

it("tells which role a page belongs to", () => {
    expect(roleOf("/resident/requests/r1")).toBe("resident");
    expect(roleOf("/volunteer/x")).toBe("volunteer");
    expect(roleOf("/ecopoints")).toBeNull();
});

it("works when storage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => saveReturnTo("/ecopoints")).not.toThrow();
    expect(takeReturnTo()).toBeNull();
});
