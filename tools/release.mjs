// Publishes the version tools/bump-version.mjs just tagged: pushes commit + tag and creates the
// GitHub release with the gh CLI (betas as pre-releases). The Release workflow then builds the
// .streamDeckPlugin and attaches it. Stable releases are also packed locally into release/ for
// the manual Elgato Marketplace upload (the Marketplace has no beta channel).
// Ported from sonos-controller (tools/release.mjs); keep both in sync.
//
//   node tools/release.mjs
//
// If only this step fails (network, gh not logged in), fix it and re-run "npm run release" —
// NOT "npm run ship:*", which would bump the version again.

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "plugin/de.boriskemper.system-audio-controller.sdPlugin/manifest.json");
const changelogPath = path.join(root, "CHANGELOG.md");

const run = (cmd, opts = {}) => execSync(cmd, { cwd: root, stdio: "inherit", ...opts });
const out = (cmd) => execSync(cmd, { cwd: root, stdio: "pipe" }).toString().trim();

const [a, b, c, d] = JSON.parse(fs.readFileSync(manifestPath, "utf8")).Version.split(".").map(Number);
const semver = `${a}.${b}.${c}`;
const isBeta = d > 0;
const tag = isBeta ? `v${semver}-beta.${d}` : `v${semver}`;

console.log(`\n🚀 Releasing ${tag}${isBeta ? " (GitHub pre-release)" : ""}\n`);

try {
    out(`git rev-parse ${tag}`);
} catch {
    console.error(`  ❌ Tag ${tag} not found. Run "npm run version:<patch|minor|major|beta>" first.`);
    process.exit(1);
}

// ---- release notes: stable = its CHANGELOG section; beta = commits since the previous tag ----
let notes = "";
if (!isBeta) {
    const content = fs.readFileSync(changelogPath, "utf8").replace(/\r\n/g, "\n");
    const start = content.indexOf(`## [${semver}]`);
    if (start !== -1) {
        const body = content.slice(content.indexOf("\n", start) + 1);
        const end = body.search(/^## \[/m);
        notes = (end === -1 ? body : body.slice(0, end)).trim();
    }
    if (!notes) console.warn(`  ⚠️  No CHANGELOG entry for ${semver}, falling back to the commit list`);
}
if (!notes) {
    const tags = out("git for-each-ref --sort=-creatordate --format=%(refname:short) refs/tags/v*").split("\n").filter(Boolean);
    const prev = tags.find((t) => t !== tag && (isBeta || !t.includes("-beta.")));
    const range = prev ? `${prev}..${tag}` : tag;
    notes = out(`git log ${range} --format=%s --no-merges`)
        .split("\n")
        .filter((l) => l && !l.startsWith("chore: release "))
        .map((l) => `- ${l}`)
        .join("\n");
}
// Curated beta notes (notes/beta-notes.md) replace the commit list and carry their own intro
const betaNotes = path.join(root, "notes", "beta-notes.md");
if (isBeta && fs.existsSync(betaNotes)) {
    notes = fs.readFileSync(betaNotes, "utf8").replace(/\r\n/g, "\n").trim();
    console.log("  ✅ Curated beta notes (notes/beta-notes.md)");
} else if (isBeta) {
    notes = `**Beta build**: for testing. Install the attached \`.streamDeckPlugin\` by double-clicking it; it replaces the Marketplace version until the next stable release.\n\n${notes}`;
}

// ---- push + GitHub release ----
console.log("  📤 Pushing commit and tag…");
run("git push");
run(`git push origin ${tag}`);

const notesFile = path.join(os.tmpdir(), `sac-release-notes-${Date.now()}.md`);
fs.writeFileSync(notesFile, notes || `Release ${tag}`);
try {
    console.log(`  🏷️  Creating GitHub ${isBeta ? "pre-release" : "release"} ${tag}…`);
    run(`gh release create ${tag} --title "${tag}" --notes-file "${notesFile}"${isBeta ? " --prerelease" : " --latest"}`);
} finally {
    fs.rmSync(notesFile, { force: true });
}

// ---- local pack for the Marketplace (stable only) ----
if (!isBeta) {
    console.log("  📦 Packing for the Marketplace upload…");
    run(`node tools/pack.mjs ${tag}`);
}

console.log(`\n✔  ${tag} released. The Release workflow attaches the plugin file in a few minutes.\n`);
