import { defineConfig } from "@playwright/test";
import { appUrl, webServer } from "./e2e/servers";

// `npm run e2e:shots`: pictures of the screens for pull requests, not checks. The two widths a PR shows.
export default defineConfig({
    testDir: "./e2e",
    testMatch: "**/*.shots.ts",
    workers: 2,
    use: { baseURL: appUrl, browserName: "chromium", reducedMotion: "reduce" },
    projects: [375, 1280].map(width => ({
        name: `chromium-${width}`,
        use: { viewport: { width, height: width < 768 ? 667 : 900 } },
    })),
    webServer,
});
