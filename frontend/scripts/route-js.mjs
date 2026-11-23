import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const diagnostics = resolve(project, ".next/diagnostics/route-bundle-stats.json");
const baselinePath = resolve(project, "baseline-js.json");
const readJson = async path => JSON.parse(await readFile(path, "utf8"));

async function main() {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 1 || args[0] !== "--write")) {
        throw new Error("Usage: npm run size [-- --write]");
    }
    const rows = await readJson(diagnostics);
    if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error("No route data found. Run npm run build first.");
    }
    const measuredChunks = new Map();
    const sizes = Object.create(null);
    for (const { route, firstLoadChunkPaths } of rows.sort((a, b) => a.route.localeCompare(b.route))) {
        let raw = 0;
        let gzip = 0;
        for (const chunk of new Set(firstLoadChunkPaths)) {
            if (!measuredChunks.has(chunk)) {
                const contents = await readFile(resolve(project, chunk));
                measuredChunks.set(chunk, { raw: contents.length, gzip: gzipSync(contents).length });
            }
            const measured = measuredChunks.get(chunk);
            raw += measured.raw;
            gzip += measured.gzip;
        }
        sizes[route] = { raw, gzip };
    }
    console.table(sizes);

    if (args[0] === "--write") {
        await writeFile(baselinePath, `${JSON.stringify(sizes, null, 2)}\n`);
        return;
    }
    const baseline = await readJson(baselinePath);
    for (const [route, size] of Object.entries(sizes)) {
        const limit = baseline[route];
        if (!limit || size.raw > limit.raw || size.gzip > limit.gzip) {
            console.error(limit
                ? `${route} exceeds its baseline (raw ${size.raw}/${limit.raw}, gzip ${size.gzip}/${limit.gzip} bytes).`
                : `${route} is missing a JavaScript baseline.`);
            process.exitCode = 1;
        }
    }
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
