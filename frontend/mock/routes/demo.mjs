import { randomUUID } from "node:crypto";
import { now } from "../store.mjs";

const part = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

// README 17.3. The mock has no Admin SDK to sign a custom token, so it is unsigned: only the Firebase Auth emulator takes it.
export function register(route, store) {
  route("POST", "/api/demo/session", (req, res) => {
    const uid = `demo-${randomUUID().slice(0, 8)}`;
    const roles = ["resident", "volunteer"];
    store.accounts.push({
      uid, email: `${uid}@example.test`, firstName: "Demo", lastName: "Visitor", displayName: "Demo visitor",
      dateOfBirth: "1990-01-01", roles, createdAt: now().toISOString(), address: { street: "123 4 Ave SW", postalCode: "T2P1J9" },
      postalCode: "T2P1J9", preferredPostalCodes: ["T2P1J9"],
    });
    store.termsAcceptances ??= [];
    store.termsAcceptances.push({
      termsAcceptanceId: randomUUID(), accountId: uid, termsDocumentId: store.terms.at(-1)?.termsDocumentId,
      type: "AT_REGISTRATION", acceptedAt: now().toISOString(),
    });
    // Firebase checks the token against the real clock, not the mock clock
    const seconds = Math.floor(Date.now() / 1000);
    const customToken = `${part({ alg: "none", typ: "JWT" })}.${part({
      aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
      iat: seconds, exp: seconds + 3600, uid, claims: { roles },
    })}.`;
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ customToken }));
  });
}
