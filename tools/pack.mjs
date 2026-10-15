// Packs the plugin into release/<uuid>-<tag>.streamDeckPlugin for distribution. Used by
// tools/release.mjs (Marketplace upload) and the Release workflow (GitHub download).
// Release builds drop Nodejs.Debug: dev builds keep the inspector port open, shipped ones must not.
//
//   node tools/pack.mjs <tag>

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const PLUGIN_ID = "de.boriskemper.system-audio-controller";
const manifestPath = path.join(root, `plugin/${PLUGIN_ID}.sdPlugin/manifest.json`);
const outDir = path.join(root, "release");

const tag = process.argv[2];
if (!tag) {
    console.error("Usage: node tools/pack.mjs <tag>");
    process.exit(1);
}

const original = fs.readFileSync(manifestPath, "utf8");
const manifest = JSON.parse(original);
delete manifest.Nodejs?.Debug;
fs.mkdirSync(outDir, { recursive: true });
try {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, "\t") + "\n");
    execSync(`npx streamdeck pack ${PLUGIN_ID}.sdPlugin --force --no-update-check --no-file-list --output "${outDir}"`, {
        cwd: path.join(root, "plugin"),
        stdio: "inherit",
    });
} finally {
    fs.writeFileSync(manifestPath, original); // pack also rewrites the manifest — always restore it
}

const target = path.join(outDir, `${PLUGIN_ID}-${tag}.streamDeckPlugin`);
fs.renameSync(path.join(outDir, `${PLUGIN_ID}.streamDeckPlugin`), target);
console.log(`📦 ${path.relative(root, target)}`);
