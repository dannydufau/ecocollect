import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { api, ApiError, ApiTimeoutError } from "./api";
import { queryKeys } from "./query-keys";
import type { RequestDetail } from "./types";
import { useRequestAction, useRequestDetail } from "./use-request";

vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("firebase/auth", () => ({ signOut: vi.fn() }));
const serverDate = new Date("2026-11-15T18:00:00Z");
const detail = (refreshAt: string | null = null): RequestDetail => ({
    requestId: "r1", category: { categoryId: "laptops", name: "Computers/Laptops", wasteType: "Computers" },
    quantity: 2, estimatedWeightKg: 5, status: "Assigned", createdAt: "2026-11-14T18:00:00Z",
    expiresAt: "2026-11-16T18:00:00Z", postalCode: "T2P1J9", windows: [], photoUrl: null,
    viewer: "owner", allowedActions: ["confirm_collected"], refreshAt,
});
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
async function tick(ms = 0) {
    await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}
beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-01-01T00:00:00Z"));
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
    vi.spyOn(api, "getWithMeta").mockResolvedValue({ data: detail(), serverDate });
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); vi.useRealTimers(); });

it("returns the detail and refreshes from the server clock rather than the device clock", async () => {
    vi.mocked(api.getWithMeta).mockResolvedValue({ data: detail("2026-11-15T18:01:00Z"), serverDate });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useRequestDetail("r1"), { wrapper });
    await tick();
    expect(result.current.data?.requestId).toBe("r1");
    expect(api.getWithMeta).toHaveBeenCalledWith("/api/requests/r1", { signal: expect.any(AbortSignal) });
    await tick(59999);
    expect(invalidate).not.toHaveBeenCalled();
    await tick(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["request", "r1"] });
});
it.each(["2026-11-15T18:00:01Z", "2026-11-15T17:59:59Z"])("waits at least five seconds for refreshAt %s", async refreshAt => {
    vi.mocked(api.getWithMeta).mockResolvedValue({ data: detail(refreshAt), serverDate });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderHook(() => useRequestDetail("r1"), { wrapper });
    await tick(); await tick(4999);
    expect(invalidate).not.toHaveBeenCalled();
    await tick(1);
    expect(invalidate).toHaveBeenCalledOnce();
});
it("clears the timer on unmount", async () => {
    vi.mocked(api.getWithMeta).mockResolvedValue({ data: detail("2026-11-15T18:01:00Z"), serverDate });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { unmount } = renderHook(() => useRequestDetail("r1"), { wrapper });
    await tick(); unmount(); await tick(60000);
    expect(invalidate).not.toHaveBeenCalled();
});
it("replaces the timer when another response arrives", async () => {
    vi.mocked(api.getWithMeta).mockResolvedValueOnce({ data: detail("2026-11-15T18:01:00Z"), serverDate }).mockResolvedValue({ data: detail("2026-11-15T18:02:00Z"), serverDate });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useRequestDetail("r1"), { wrapper });
    await tick(); await tick(10000);
    await act(async () => { await result.current.refetch(); });
    await tick(); await tick(50000);
    expect(invalidate).not.toHaveBeenCalled();
    await tick(70000);
    expect(invalidate).toHaveBeenCalledOnce();
});
it("resets the timer even if a new response contains the same values", async () => {
    vi.mocked(api.getWithMeta).mockResolvedValue({ data: detail("2026-11-15T18:01:00Z"), serverDate });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useRequestDetail("r1"), { wrapper });
    await tick(); await tick(10000);
    await act(async () => { await result.current.refetch(); });
    await tick(); await tick(50000);
    expect(invalidate).not.toHaveBeenCalled();
    await tick(10000);
    expect(invalidate).toHaveBeenCalledOnce();
});
it("clears the previous request's timer when the id changes", async () => {
    vi.mocked(api.getWithMeta).mockResolvedValueOnce({ data: detail("2026-11-15T18:01:00Z"), serverDate }).mockResolvedValue({ data: { ...detail(), requestId: "r2" }, serverDate });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { rerender } = renderHook(({ id }) => useRequestDetail(id), { wrapper, initialProps: { id: "r1" } });
    await tick(); rerender({ id: "r2" }); await tick(); await tick(60000);
    expect(invalidate).not.toHaveBeenCalled();
});
it.each([null, "invalid"])("does not schedule a timer for refreshAt %s", async refreshAt => {
    vi.mocked(api.getWithMeta).mockResolvedValue({ data: detail(refreshAt), serverDate });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderHook(() => useRequestDetail("r1"), { wrapper });
    await tick(); await tick(60000);
    expect(invalidate).not.toHaveBeenCalled();
});
it("handles a refresh more than the browser timer limit away", async () => {
    const delay = 30 * 86400000;
    vi.mocked(api.getWithMeta).mockResolvedValue({ data: detail(new Date(serverDate.getTime() + delay).toISOString()), serverDate });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderHook(() => useRequestDetail("r1"), { wrapper });
    await tick(); await tick(delay - 1);
    expect(invalidate).not.toHaveBeenCalled();
    await tick(1);
    expect(invalidate).toHaveBeenCalledOnce();
});
it.each([[404, "request_unavailable", true], [404, "not_found", false], [403, "forbidden", false]])("handles %s %s", async (status, code, unavailable) => {
    vi.mocked(api.getWithMeta).mockRejectedValue(new ApiError(status as number, { error: { code, message: "Not available" } }));
    const { result } = renderHook(() => useRequestDetail("r1"), { wrapper });
    await tick();
    expect(result.current.unavailable).toBe(unavailable);
});
it("invalidates the request and supplied lists after a successful action", async () => {
    const call = vi.fn().mockResolvedValue({});
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useRequestAction("r1", call, [queryKeys.myRequests]), { wrapper });
    act(() => result.current.run({ reason: "Changed plans" })); await tick();
    expect(call).toHaveBeenCalledWith({ reason: "Changed plans" }, expect.anything());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["request", "r1"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["requests", "mine"] });
    expect(result.current.message).toBeNull();
    expect(result.current.isPending).toBe(false);
});
it("keeps the friendly 409 message while invalidating the request and lists", async () => {
    const call = vi.fn().mockRejectedValue(new ApiError(409, { error: { code: "window_ended", message: "Ended" } }));
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useRequestAction("r1", call, [queryKeys.myRequests, queryKeys.volunteerRequests]), { wrapper });
    act(() => result.current.run(undefined)); await tick();
    expect(result.current.message).toBe("The pickup window has ended. Confirm the collection or report a missed pickup.");
    expect(invalidate).toHaveBeenCalledTimes(3);
    expect(result.current.isPending).toBe(false);
});
it("invalidates the request when the action gets a 404", async () => {
    const call = vi.fn().mockRejectedValue(new ApiError(404, { error: { code: "request_unavailable", message: "Gone" } }));
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useRequestAction("r1", call), { wrapper });
    act(() => result.current.run(undefined)); await tick();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["request", "r1"] });
});
it("returns the error so forms can read the field errors", async () => {
    const fields = { "windows[0]": "must start in the future" };
    const call = vi.fn().mockRejectedValue(new ApiError(400, { error: { code: "validation_failed", message: "Some fields are invalid.", details: { fields } } }));
    const { result } = renderHook(() => useRequestAction("r1", call), { wrapper });
    act(() => result.current.run(undefined)); await tick();
    expect((result.current.error as ApiError).fields).toEqual({ "windows[0]": "This pickup window has already started. Please choose a later one." });
});
it.each([
    [{ reason: "must be at most 500 characters", windowId: "must be an active window of this request that has not started" }, "This pickup window has started or is no longer offered. Please choose another one."],
    [{ reason: "must be at most 500 characters" }, "Please check the highlighted fields."],
])("says the field errors a dialog has no input for, without invalidating data: %j", async (fields, message) => {
    const call = vi.fn().mockRejectedValue(new ApiError(400, { error: { code: "validation_failed", message: "Some fields are invalid.", details: { fields } } }));
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useRequestAction("r1", call), { wrapper });
    act(() => result.current.run(undefined)); await tick();
    expect(result.current.message).toBe(message);
    expect(invalidate).not.toHaveBeenCalled();
});
it("stays pending while sending and clears an earlier error on the next attempt", async () => {
    let finish!: (value: unknown) => void;
    const call = vi.fn().mockRejectedValueOnce(new ApiError(409, { error: { code: "not_open", message: "Closed" } })).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { result } = renderHook(() => useRequestAction("r1", call), { wrapper });
    act(() => result.current.run(undefined)); await tick();
    expect(result.current.message).not.toBeNull();
    act(() => result.current.run(undefined)); await tick();
    expect(result.current.isPending).toBe(true);
    expect(result.current.message).toBeNull();
    await act(async () => finish({})); await tick();
    expect(result.current.isPending).toBe(false);
});
it("ignores a second synchronous run before React re-renders, and allows retry after failure", async () => {
    let fail!: (error: unknown) => void;
    const call = vi.fn()
        .mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }))
        .mockResolvedValueOnce({});
    const { result } = renderHook(() => useRequestAction("r1", call), { wrapper });
    act(() => {
        result.current.run(undefined);
        result.current.run(undefined);
    });
    await tick();
    expect(call).toHaveBeenCalledTimes(1);
    await act(async () => fail(new TypeError("Failed to fetch"))); await tick();
    expect(result.current.isPending).toBe(false);
    act(() => result.current.run(undefined)); await tick();
    expect(call).toHaveBeenCalledTimes(2);
});
it("refreshes the request and lists and warns about unknown outcome when a write times out", async () => {
    const call = vi.fn().mockRejectedValue(new ApiTimeoutError());
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useRequestAction("r1", call, [queryKeys.myRequests]), { wrapper });
    act(() => result.current.run(undefined)); await tick();
    expect(result.current.message).toMatch(/refreshing the status/i);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["request", "r1"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["requests", "mine"] });
});
