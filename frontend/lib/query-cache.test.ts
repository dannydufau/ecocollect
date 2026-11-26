import { QueryClient } from "@tanstack/react-query";
import { expect, it } from "vitest";
import { dropCacheIfUserChanged } from "./query-cache";

function clientWithList() {
    const client = new QueryClient();
    client.setQueryData(["requests", "mine"], [{ requestId: "r1" }]);
    return client;
}

it("keeps the cache on the first sign-in of the tab, so a request already on its way is not cut off", () => {
    const client = clientWithList();
    dropCacheIfUserChanged(client, null, "alice");
    expect(client.getQueryData(["requests", "mine"])).toBeDefined();
});

it("drops the cache when another person signs in", () => {
    const client = clientWithList();
    dropCacheIfUserChanged(client, "alice", "bob");
    expect(client.getQueryData(["requests", "mine"])).toBeUndefined();
});

it("drops the cache when the person signs out", () => {
    const client = clientWithList();
    dropCacheIfUserChanged(client, "alice", null);
    expect(client.getQueryData(["requests", "mine"])).toBeUndefined();
});

it("keeps the cache when the same person is reported again", () => {
    const client = clientWithList();
    dropCacheIfUserChanged(client, "alice", "alice");
    expect(client.getQueryData(["requests", "mine"])).toBeDefined();
});
