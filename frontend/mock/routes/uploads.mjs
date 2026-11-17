import { randomUUID } from "node:crypto";
import { currentUser, now, sendError } from "../store.mjs";

const MAX_BYTES = 10 * 1024 * 1024;
const EXTENSIONS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
}

function authenticate(req, res) {
  const user = currentUser(req);
  if (!req.headers.authorization?.startsWith("Bearer ") || !user || user.account?.deactivatedAt) {
    sendError(res, 401, "unauthorized", "Please log in again.");
    return null;
  }
  return user;
}

function validate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { body: "Send a request body." };
  const fields = {};
  for (const key of Object.keys(body)) {
    if (!["purpose", "requestId", "fileName", "contentType", "sizeBytes"].includes(key)) fields[key] = "This field is not allowed.";
  }
  if (!["item_photo", "delivery_evidence"].includes(body.purpose)) fields.purpose = "Choose item_photo or delivery_evidence.";
  if (body.purpose === "delivery_evidence" && (typeof body.requestId !== "string" || !body.requestId)) fields.requestId = "Choose a request.";
  if (typeof body.fileName !== "string" || !body.fileName.trim()) fields.fileName = "Enter a file name.";
  if (!EXTENSIONS[body.contentType]) fields.contentType = "Use a JPEG, PNG or WebP image.";
  if (!Number.isInteger(body.sizeBytes) || body.sizeBytes < 1 || body.sizeBytes > MAX_BYTES) fields.sizeBytes = "The photo must be 10 MB or smaller.";
  return Object.keys(fields).length ? fields : null;
}

export function register(route, store) {
  route("POST", "/api/uploads", (req, res, { body }) => {
    const user = authenticate(req, res);
    if (!user) return;
    const fields = validate(body);
    if (fields) return sendError(res, 400, "validation_error", "Check the highlighted fields.", fields);

    const evidence = body.purpose === "delivery_evidence";
    if (!user.roles.includes(evidence ? "volunteer" : "resident")) {
      return sendError(res, 403, "forbidden", `This upload needs the ${evidence ? "volunteer" : "resident"} role.`);
    }
    if (evidence) {
      const request = store.requests.find((item) => item.requestId === body.requestId);
      if (!request) return sendError(res, 404, "not_found", "Request not found.");
      const assigned = store.assignments.some((item) => item.requestId === request.requestId && item.volunteerId === user.uid && !item.endedAt);
      if (request.status !== "Collected" || !assigned) {
        return sendError(res, 403, "forbidden", "Only the volunteer who collected this request can upload evidence.");
      }
    }

    send(res, 200, {
      uploadUrl: "/api/mock-imagekit/upload",
      token: randomUUID(),
      fields: {
        fileName: `${randomUUID()}.${EXTENSIONS[body.contentType]}`,
        folder: evidence ? `mock/delivery-evidence/${user.uid}/${body.requestId}/` : `mock/item-photos/${user.uid}/`,
        isPrivateFile: true,
        useUniqueFileName: false,
        overwriteFile: false,
        checks: `"file.size" <= ${MAX_BYTES} AND "file.mime" IN ["image/jpeg", "image/png", "image/webp"]`,
        transformation: JSON.stringify({ pre: "md-false" }),
      },
      expiresAt: new Date(now().getTime() + 10 * 60 * 1000).toISOString(),
    });
  });

  // Stands in for ImageKit. The file is not read or kept, because Q4, Q9 and Q15 accept any fileId.
  route("POST", "/api/mock-imagekit/upload", (req, res) => {
    const fileId = `mock-${randomUUID()}`;
    send(res, 200, { fileId, filePath: `/mock/uploads/${fileId}.jpg` });
  });
}
