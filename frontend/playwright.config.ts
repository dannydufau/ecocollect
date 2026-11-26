import { defineConfig } from "@playwright/test";
import { appUrl, webServer } from "./e2e/servers";

const browserName = (process.env.E2E_BROWSER ?? "chromium") as "chromium" | "firefox" | "webkit";

export default defineConfig({
    testDir: "./e2e",
    testMatch: "**/*.pw.ts",
    workers: 2,
    // Reduced motion, so axe never scans an alert while it is still fading in (that read as low contrast)
    use: { baseURL: appUrl, browserName, reducedMotion: "reduce" },
    projects: [320, 375, 768, 1280].map(width => ({
        name: `${browserName}-${width}`,
        use: { viewport: { width, height: width < 768 ? 667 : 900 } },
    })),
    webServer,
});
