import { now } from "../store.mjs";

// Start with MOCK_TERMS_ID=terms_4 npm run mock to publish a newer terms version.
// resident.mjs seeds the first document and checks Q4 against the latest one, so we read from the store.
export function register(route, store) {
  const newId = process.env.MOCK_TERMS_ID;
  if (newId && store.terms.at(-1)?.termsDocumentId !== newId) {
    store.terms.push({ termsDocumentId: newId, content: "Updated terms for the demo.", publishedAt: now().toISOString() });
  }
  route("GET", "/api/terms", (req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(store.terms.at(-1)));
  });
}
