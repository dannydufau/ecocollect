// Mock of the User Service: U1, U2, U4, U6, U7, U8, U9, U10 and R3 (contract 5.1 and 5.4).
import { randomUUID } from "node:crypto";
import { currentUser, now, sendError } from "../store.mjs";

const DAY = 24 * 60 * 60 * 1000;
const USERNAME = /^[a-z0-9_-]{3,50}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POSTAL_CODE = /^T[0-9][A-Z][0-9][A-Z][0-9]$/;

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

function isText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function checkAddress(address, fields) {
  if (!address || typeof address !== "object") {
    fields.address = "Enter your street address and postal code.";
    return;
  }
  if (!isText(address.street)) fields["address.street"] = "Enter your street.";
  if (!POSTAL_CODE.test(address.postalCode)) fields["address.postalCode"] = "Enter a Calgary postal code like T2P1J9.";
}

function checkCodes(codes, fields) {
  if (!Array.isArray(codes) || codes.length > 3 || new Set(codes).size !== codes.length || !codes.every((code) => POSTAL_CODE.test(code))) {
    fields.preferredPostalCodes = "Give up to 3 different Calgary postal codes.";
  }
}

function ageOn(birth, today) {
  const years = today.getUTCFullYear() - birth.getUTCFullYear();
  const birthday = Date.UTC(today.getUTCFullYear(), birth.getUTCMonth(), birth.getUTCDate());
  return today.getTime() < birthday ? years - 1 : years;
}

function checkBirthDate(value, fields) {
  const birth = new Date(`${value}T00:00:00Z`);
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(birth.getTime())) fields.dateOfBirth = "Enter a valid date.";
  else if (birth > now()) fields.dateOfBirth = "The birth date can't be in the future.";
  else if (ageOn(birth, now()) < 18) fields.dateOfBirth = "You must be 18 or older.";
}

function checkNewAccount(body) {
  const fields = {};
  if (!body || typeof body !== "object" || Array.isArray(body)) return { body: "Send the registration details." };
  if (!USERNAME.test(body.username)) fields.username = "Use 3 to 50 lowercase letters, digits, _ or -.";
  if (typeof body.email !== "string" || !EMAIL.test(body.email)) fields.email = "Enter a valid email address.";
  if (typeof body.password !== "string" || body.password.length < 6) fields.password = "Use at least 6 characters.";
  for (const name of ["firstName", "lastName", "publicName", "termsDocumentId"]) if (!isText(body[name])) fields[name] = "This is required.";
  if (!["resident", "volunteer"].includes(body.role)) fields.role = "Choose resident or volunteer.";
  checkBirthDate(body.dateOfBirth, fields);
  if (body.role === "resident") checkAddress(body.address, fields);
  if (body.preferredPostalCodes !== undefined) checkCodes(body.preferredPostalCodes, fields);
  return fields;
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

  route("POST", "/api/accounts", (req, res, { body }) => {
    const fields = checkNewAccount(body);
    if (Object.keys(fields).length) return sendError(res, 400, "validation_error", "Check the registration details.", fields);
    if (body.termsDocumentId !== store.terms.at(-1)?.termsDocumentId) {
      return sendError(res, 409, "terms_outdated", "The terms have changed. Please read and accept them again.");
    }
    if (store.accounts.some((account) => account.uid === body.username)) return sendError(res, 409, "username_taken", "This username is already taken.");
    if (store.accounts.some((account) => account.email.toLowerCase() === body.email.toLowerCase())) {
      return sendError(res, 409, "email_taken", "An account with this email already exists.");
    }
    const resident = body.role === "resident";
    store.accounts.push({
      uid: body.username, email: body.email, firstName: body.firstName, lastName: body.lastName, displayName: body.publicName,
      dateOfBirth: body.dateOfBirth, roles: [body.role], createdAt: now().toISOString(),
      address: resident ? { street: body.address.street, postalCode: body.address.postalCode } : undefined,
      postalCode: resident ? body.address.postalCode : undefined,
      preferredPostalCodes: resident ? [] : (body.preferredPostalCodes ?? []),
    });
    store.termsAcceptances ??= [];
    store.termsAcceptances.push({
      termsAcceptanceId: randomUUID(), accountId: body.username, termsDocumentId: body.termsDocumentId,
      type: "AT_REGISTRATION", acceptedAt: now().toISOString(),
    });
    send(res, 201, { accountId: body.username, roles: [body.role] });
  });
}
