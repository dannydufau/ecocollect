import type { PlaywrightTestConfig } from "@playwright/test";
import { mockNow } from "./fixtures";

export const appUrl = "http://127.0.0.1:3100";
export const mockUrl = "http://127.0.0.1:3101";

// The mock API and the signed-in test build, started by Playwright for `npm run e2e` and `npm run e2e:shots`
export const webServer: PlaywrightTestConfig["webServer"] = [
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
];
