import { defineConfig } from "@playwright/test";
import { appUrl, webServer } from "./e2e/servers";

export default defineConfig({
    testDir: "./e2e",
    testMatch: "**/*.pw.ts",
    workers: 2,
    snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
    // Reduced motion, so axe never scans an alert while it is still fading in (that read as low contrast)
    use: { baseURL: appUrl, browserName: "chromium", reducedMotion: "reduce" },
    projects: [320, 375, 768, 1280].map(width => ({
        name: `chromium-${width}`,
        use: { viewport: { width, height: width < 768 ? 667 : 900 } },
    })),
    webServer,
});
