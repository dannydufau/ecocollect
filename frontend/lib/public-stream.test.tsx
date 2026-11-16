import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePublicStream } from "./public-stream";

// A fake EventSource that remembers what it was opened with and lets the test send events
class FakeSource {
    static all: FakeSource[] = [];
    listeners = new Map<string, () => void>();
    close = vi.fn();
    constructor(public url: string) { FakeSource.all.push(this); }
    addEventListener(name: string, listener: () => void) { this.listeners.set(name, listener); }
    emit(name: string) { this.listeners.get(name)?.(); }
}

beforeEach(() => {
    FakeSource.all = [];
    vi.stubGlobal("EventSource", FakeSource);
});
afterEach(() => vi.unstubAllGlobals());

it("opens the stream of one profile", () => {
    renderHook(() => usePublicStream({ profile: "abc" }, vi.fn()));
    expect(FakeSource.all.map(source => source.url)).toEqual(["/api/public/events?profile=abc"]);
});

it("encodes the account id", () => {
    renderHook(() => usePublicStream({ profile: "a b&c" }, vi.fn()));
    expect(FakeSource.all[0].url).toBe("/api/public/events?profile=a%20b%26c");
});

it("opens the stats stream", () => {
    renderHook(() => usePublicStream({ stats: true }, vi.fn()));
    expect(FakeSource.all.map(source => source.url)).toEqual(["/api/public/events?stats"]);
});

it("calls onChange for a profile update and for a stats update", () => {
    const onChange = vi.fn();
    renderHook(() => usePublicStream({ profile: "abc" }, onChange));
    FakeSource.all[0].emit("public-profile-updated");
    expect(onChange).toHaveBeenCalledTimes(1);
    FakeSource.all[0].emit("stats-updated");
    expect(onChange).toHaveBeenCalledTimes(2);
});

it("closes the stream on unmount", () => {
    const { unmount } = renderHook(() => usePublicStream({ stats: true }, vi.fn()));
    expect(FakeSource.all[0].close).not.toHaveBeenCalled();
    unmount();
    expect(FakeSource.all[0].close).toHaveBeenCalledTimes(1);
});

it("calls the newest onChange without reopening the stream", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ onChange }) => usePublicStream({ stats: true }, onChange), { initialProps: { onChange: first } });
    rerender({ onChange: second });
    FakeSource.all[0].emit("stats-updated");
    expect(FakeSource.all).toHaveLength(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
});

it("opens a new stream when the profile changes and closes the old one", () => {
    const { rerender } = renderHook(({ profile }) => usePublicStream({ profile }, vi.fn()), { initialProps: { profile: "a" } });
    rerender({ profile: "b" });
    expect(FakeSource.all.map(source => source.url)).toEqual(["/api/public/events?profile=a", "/api/public/events?profile=b"]);
    expect(FakeSource.all[0].close).toHaveBeenCalledTimes(1);
});

it.each([{}, { profile: "abc", stats: true }])("throws in development unless exactly one of profile and stats is given: %j", options => {
    vi.stubEnv("NODE_ENV", "development");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => usePublicStream(options, vi.fn()))).toThrow("exactly one of profile or stats");
    vi.unstubAllEnvs();
});
