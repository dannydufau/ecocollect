import type { Auth, User } from "firebase/auth";

// Signed-in test mode for browser tests and screenshots (README "Signed-in test mode").
// The flag is fixed when the app is built. Never set it for a deployed build.
export const isE2E = process.env.NEXT_PUBLIC_E2E === "true";

const localHosts = ["localhost", "127.0.0.1", "[::1]"];

// Even if a flagged build is deployed by mistake, anywhere but this machine still signs in with Firebase.
export function e2eActive(): boolean {
  return isE2E && typeof location !== "undefined" && localHosts.includes(location.hostname);
}

const ACCOUNT_KEY = "e2e-account";

// Stands in for the Firebase auth object. The mock API reads the token as the account id, so the id is the token.
export function fakeAuth(): Auth {
  const accountId = sessionStorage.getItem(ACCOUNT_KEY) ?? "demo-resident-1";
  const listeners = new Set<(user: User | null) => void>();
  let current: User | null = null;

  // The mock's profile has the roles. A real login gets them from the token claims.
  const ready = fetch("/api/profile", { headers: { Authorization: `Bearer ${accountId}` } })
    .then((res) => res.json())
    .then(({ roles }) => {
      current = {
        uid: accountId,
        getIdToken: async () => accountId,
        getIdTokenResult: async () => ({ claims: { roles } }),
      } as unknown as User;
    })
    .catch((err) => console.warn("Could not load the test account", err));

  return {
    get currentUser() {
      return current;
    },
    authStateReady: () => ready,
    onAuthStateChanged(callback: (user: User | null) => void) {
      listeners.add(callback);
      void ready.then(() => callback(current));
      return () => listeners.delete(callback);
    },
    async signOut() {
      sessionStorage.removeItem(ACCOUNT_KEY);
      current = null;
      listeners.forEach((callback) => callback(null));
    },
  } as unknown as Auth;
}
