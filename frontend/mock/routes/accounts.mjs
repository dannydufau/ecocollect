// Mock of the User Service: U1, U2, U4, U6, U7, U8, U9, U10 and R3 (contract 5.1 and 5.4).
import { currentUser, now, sendError } from "../store.mjs";

const DAY = 24 * 60 * 60 * 1000;

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
}

// The demo accounts only have a uid, a public name, roles and a postal code. The profile needs more.
function fillProfiles(store) {
  for (const account of store.accounts) {
    const [first, last = "Demo"] = account.displayName.replace(".", "").split(" ");
    account.email ??= `${account.uid}@example.test`;
    account.firstName ??= first;
    account.lastName ??= last;
    account.dateOfBirth ??= "1990-01-01";
    account.createdAt ??= new Date(now().getTime() - 30 * DAY).toISOString();
    account.preferredPostalCodes ??= [];
    if (account.roles.includes("resident")) account.address ??= { street: "123 4 Ave SW", postalCode: account.postalCode };
  }
  // The public profile of a deactivated account must give 404 (FR05)
  if (!store.accounts.some((account) => account.deactivatedAt)) {
    store.accounts.push({
      uid: "demo-deactivated-1", displayName: "Dana D.", roles: ["resident"], postalCode: "T2P1J9",
      email: "demo-deactivated-1@example.test", firstName: "Dana", lastName: "D", dateOfBirth: "1990-01-01",
      createdAt: new Date(now().getTime() - 90 * DAY).toISOString(), preferredPostalCodes: [],
      address: { street: "123 4 Ave SW", postalCode: "T2P1J9" },
      deactivatedAt: new Date(now().getTime() - 10 * DAY).toISOString(),
    });
  }
}

function profileOf(account) {
  return {
    accountId: account.uid, email: account.email, firstName: account.firstName, lastName: account.lastName,
    publicName: account.displayName, dateOfBirth: account.dateOfBirth, roles: account.roles,
    address: account.address ? { street: account.address.street, city: "Calgary", postalCode: account.address.postalCode } : null,
    preferredPostalCodes: account.preferredPostalCodes, createdAt: account.createdAt,
  };
}

export function register(route, store) {
  fillProfiles(store);

  // The caller must be signed in with an active account
  function signedIn(req, res) {
    const user = currentUser(req);
    if (!user || user.account?.deactivatedAt) {
      sendError(res, 401, "unauthorized", "Please log in again.");
      return null;
    }
    if (!user.account) {
      sendError(res, 404, "profile_not_found", "There is no profile for this login.");
      return null;
    }
    return user.account;
  }

  route("GET", "/api/profile", (req, res) => {
    const account = signedIn(req, res);
    if (account) send(res, 200, profileOf(account));
  });

  route("GET", "/api/public/profiles/:accountId", (req, res, { params }) => {
    const account = store.accounts.find((item) => item.uid === params.accountId);
    if (!account || account.deactivatedAt) return sendError(res, 404, "profile_unavailable", "This profile is not available.");
    send(res, 200, { accountId: account.uid, publicName: account.displayName, roles: account.roles, memberSince: account.createdAt });
  });

  route("GET", "/api/public/profiles/:accountId/stats", (req, res, { params }) => {
    const points = store.awards.filter((award) => award.accountId === params.accountId).reduce((sum, award) => sum + Math.round(award.points * 100), 0);
    send(res, 200, { accountId: params.accountId, ecopoints: points / 100 });
  });
}
