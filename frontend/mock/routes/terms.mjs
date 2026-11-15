// Start with MOCK_TERMS_ID=terms_4 npm run mock to test a new terms version
export function register(route) {
  route("GET", "/api/terms", (req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" }).end(
      JSON.stringify({
        termsDocumentId: process.env.MOCK_TERMS_ID ?? "terms_3",
        content: "Sample terms for the demo.\n\nBy using EcoCollect you agree to hand over only items you own, and to meet the other person at the agreed time.",
        publishedAt: "2026-11-01T00:00:00.000Z",
      }),
    );
  });
}
