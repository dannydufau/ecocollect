import { defineConfig } from "@playwright/test";
import { mockNow } from "./e2e/fixtures";

const appUrl = "http://127.0.0.1:3100";
const mockUrl = "http://127.0.0.1:3101";

export default defineConfig({
    testDir: "./e2e",
    testMatch: "**/*.pw.ts",
    workers: 2,
    // Reduced motion, so axe never scans an alert while it is still fading in (that read as low contrast)
    use: { baseURL: appUrl, browserName: "chromium", reducedMotion: "reduce" },
    projects: [320, 375, 768, 1280].map(width => ({
        name: `chromium-${width}`,
        use: { viewport: { width, height: width < 768 ? 667 : 900 } },
    })),
    webServer: [
        {
            command: "npm run mock",
            url: `${mockUrl}/api/terms`,
            env: { MOCK_PORT: "3101", MOCK_NOW: mockNow },
        },
        {
            command: "npm run e2e:app",
            url: appUrl,
            timeout: 240_000,
            env: {
                GATEWAY_URL: mockUrl,
                NEXT_PUBLIC_DEMO: "false",
                NEXT_PUBLIC_FIREBASE_API_KEY: "local-test-key",
                NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-ecocollect",
                NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "localhost",
                NEXT_TELEMETRY_DISABLED: "1",
            },
        },
    ],
});
