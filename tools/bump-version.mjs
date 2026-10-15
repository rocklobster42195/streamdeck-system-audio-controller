// Bumps the plugin version, rolls CHANGELOG.md (stable only) and creates the commit + git tag.
// Ported from sonos-controller (tools/bump-version.mjs); keep both in sync. Differences: the
// manifest lives in plugin/, and the changelog uses a "## [Unreleased]" section instead of a
// <!-- NEXT --> marker.
//
//   node tools/bump-version.mjs <patch|minor|major|beta> [--dry-run]
//
// manifest.json's Version is the source of truth: four numeric segments A.B.C.D, where D is the
// beta build counter (0 for every stable release).
//   patch/minor/major from stable (D=0): semver bump on A.B.C.
//   patch/minor/major while in beta (D>0): PROMOTES the beta line (D → 0, A.B.C unchanged).
//   beta from stable: next patch with D=1.   beta while in beta: D+1.
// Tags are semver: vA.B.C, or vA.B.C-beta.D for betas.

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "plugin/de.boriskemper.system-audio-controller.sdPlugin/manifest.json");
const pluginPkgPath = path.join(root, "plugin/package.json");
const changelogPath = path.join(root, "CHANGELOG.md");

const bumpType = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!["patch", "minor", "major", "beta"].includes(bumpType)) {
    console.error("Usage: node tools/bump-version.mjs <patch|minor|major|beta> [--dry-run]");
    process.exit(1);
}

const git = (cmd) => execSync(`git ${cmd}`, { cwd: root, stdio: "pipe" }).toString().trim();
const today = () => new Date().toISOString().slice(0, 10);

// Refuse to release uncommitted work — the tag must describe exactly what gets built.
if (!dryRun && git("status --porcelain --untracked-files=no")) {
    console.error("  ❌ Working tree has uncommitted changes. Commit or stash them first.");
    process.exit(1);
}

// ---- 1. new version ----
const manifestRaw = fs.readFileSync(manifestPath, "utf8");
const current = JSON.parse(manifestRaw).Version;
const [a, b, c, d] = current.split(".").map(Number);
let [na, nb, nc, nd] = [a, b, c, d];
const firstRelease = !git("tag --list v*");
if (firstRelease) {
    // Nothing released yet: the manifest's A.B.C is the first target (beta.1 or stable as is)
    nd = bumpType === "beta" ? d + 1 : 0;
} else if (bumpType === "beta") {
    if (d > 0) nd = d + 1;
    else [nc, nd] = [c + 1, 1];
} else if (d > 0) {
    nd = 0; // promote the active beta line
} else if (bumpType === "patch") nc = c + 1;
else if (bumpType === "minor") [nb, nc] = [b + 1, 0];
else [na, nb, nc] = [a + 1, 0, 0];

const version4 = `${na}.${nb}.${nc}.${nd}`;
const semver = `${na}.${nb}.${nc}`;
const isBeta = nd > 0;
const tag = isBeta ? `v${semver}-beta.${nd}` : `v${semver}`;

console.log(`\nBumping ${current} → ${version4} (tag ${tag})${isBeta ? " [beta]" : ""}`);
if (bumpType !== "beta" && d > 0) console.log(`  ↳ promoting ${a}.${b}.${c}-beta.${d} to ${semver}`);
if (git(`tag --list ${tag}`)) {
    console.error(`  ❌ Tag ${tag} already exists.`);
    process.exit(1);
}
if (dryRun) {
    console.log("  (dry run — nothing written)\n");
    process.exit(0);
}

// ---- 2. manifest.json (first "Version" only — Nodejs.Version further down must stay "20") ----
fs.writeFileSync(manifestPath, manifestRaw.replace(/"Version":\s*"[^"]*"/, `"Version": "${version4}"`));
console.log(`  ✅ manifest.json   → ${version4}`);

// plugin/package.json follows the public version (informational only)
const pkgRaw = fs.readFileSync(pluginPkgPath, "utf8");
fs.writeFileSync(pluginPkgPath, pkgRaw.replace(/"version":\s*"[^"]*"/, `"version": "${isBeta ? `${semver}-beta.${nd}` : semver}"`));

// ---- 3. CHANGELOG.md: [Unreleased] becomes the release section (stable only) ----
const files = [manifestPath, pluginPkgPath];
if (!isBeta) {
    const content = fs.readFileSync(changelogPath, "utf8").replace(/\r\n/g, "\n");
    if (!content.includes("\n## [Unreleased]\n")) {
        console.error("  ❌ CHANGELOG.md has no '## [Unreleased]' section — aborting (nothing committed).");
        git("checkout -- plugin");
        process.exit(1);
    }
    fs.writeFileSync(changelogPath, content.replace("\n## [Unreleased]\n", `\n## [Unreleased]\n\n## [${semver}] — ${today()}\n`));
    files.push(changelogPath);
    console.log(`  ✅ CHANGELOG.md    → [${semver}] — ${today()}`);
} else {
    console.log("  ⏭  CHANGELOG.md    → unchanged (beta)");
}

// ---- 4. commit + tag ----
git(`add ${files.map((f) => `"${f}"`).join(" ")}`);
git(`commit -m "chore: release ${tag}"`);
git(`tag -a ${tag} -m ${tag}`);
console.log(`\n✔  ${tag} committed and tagged. Run "npm run release" to publish.\n`);
