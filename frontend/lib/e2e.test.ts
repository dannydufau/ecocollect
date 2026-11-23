import { afterEach, expect, it, vi } from "vitest";

// The flag is read when the file loads, so each case sets it first and then imports a fresh copy.
async function load(flag: string | undefined, hostname: string) {
  vi.resetModules();
  if (flag === undefined) vi.unstubAllEnvs();
  else vi.stubEnv("NEXT_PUBLIC_E2E", flag);
  vi.stubGlobal("location", { hostname });
  return import("./e2e");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("is off when the flag is not set, even on localhost", async () => {
  expect((await load(undefined, "localhost")).e2eActive()).toBe(false);
});

it("is off when the flag is not exactly true", async () => {
  expect((await load("1", "localhost")).e2eActive()).toBe(false);
});

it.each(["localhost", "127.0.0.1", "[::1]"])("is on for %s when the flag is set", async (hostname) => {
  expect((await load("true", hostname)).e2eActive()).toBe(true);
});

it.each(["192.168.1.20", "ecocollect.example.com", "localhost.evil.com"])("is off for %s even with the flag", async (hostname) => {
  expect((await load("true", hostname)).e2eActive()).toBe(false);
});

it("signs in as the stored account with the roles from the mock, and signs out", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ roles: ["resident", "volunteer"] }) });
  vi.stubGlobal("fetch", fetchMock);
  sessionStorage.setItem("e2e-account", "demo-resident-5");
  const auth = (await load("true", "localhost")).fakeAuth();
  const seen: unknown[] = [];
  auth.onAuthStateChanged((user) => seen.push(user?.uid ?? null));
  await auth.authStateReady();

  expect(fetchMock).toHaveBeenCalledWith("/api/profile", { headers: { Authorization: "Bearer demo-resident-5" } });
  expect(await auth.currentUser?.getIdToken()).toBe("demo-resident-5");
  expect((await auth.currentUser?.getIdTokenResult())?.claims.roles).toEqual(["resident", "volunteer"]);

  await auth.signOut();
  expect(auth.currentUser).toBeNull();
  expect(sessionStorage.getItem("e2e-account")).toBeNull();
  expect(seen).toEqual(["demo-resident-5", null]);
});
