import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const next = createRequire(import.meta.url).resolve("next/dist/bin/next");
const env = { ...process.env, NEXT_PUBLIC_E2E: "true", E2E_BUILD_CONFIRM: "1" };

function run(args) {
    const result = spawnSync(process.execPath, [next, ...args], { env, stdio: "inherit" });
    if (result.error) throw result.error;
    return result.status ?? 1;
}

// Next can stop its first run to show a security notice, so a failed build gets one more try
let status = run(["build"]);
if (status !== 0) status = run(["build"]);
if (status !== 0) process.exit(status);
process.exit(run(["start", "--hostname", "127.0.0.1", "--port", "3100"]));
