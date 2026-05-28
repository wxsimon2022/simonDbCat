#!/usr/bin/env node
/**
 * Bump version (patch/minor/major) based on the latest GitHub release.
 * Usage: node scripts/bump-version.cjs [patch|minor|major] [--no-tag]
 *
 * Steps:
 *   1. Fetch the latest release version from GitHub (wxsimon2022/simonDbCat)
 *   2. Parse it and increment by the specified type
 *   3. Update package.json with the new version
 *   4. Optionally create a git tag
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const type = process.argv[2] || 'patch';
const skipTag = process.argv.includes('--no-tag');
const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

// ─── 1. Get latest version from GitHub releases ─────────
const REPO = 'wxsimon2022/simonDbCat';
let latestTag = '';

try {
  const raw = execSync(
    `gh release view --repo ${REPO} --json tagName --jq .tagName 2>/dev/null || gh release list --repo ${REPO} --limit 1 --json tagName --jq '.[0].tagName'`,
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
  ).trim();
  if (raw) latestTag = raw.replace(/^v/, '');
} catch {}

// Fallback to local version if no GitHub release found
const baseVersion = latestTag || pkg.version;
console.error(`[bump] Latest release: ${latestTag ? 'v' + latestTag : '(none)'}, using base: v${baseVersion}`);

// ─── 2. Increment version ───────────────────────────────
const parts = baseVersion.split('.').map(Number);
switch (type) {
  case 'major':
    parts[0]++;
    parts[1] = 0;
    parts[2] = 0;
    break;
  case 'minor':
    parts[1]++;
    parts[2] = 0;
    break;
  default:
    parts[2]++;
    break;
}

const newVersion = parts.join('.');
pkg.version = newVersion;

// ─── 3. Write package.json ──────────────────────────────
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// ─── 4. Create git tag (optional) ───────────────────────
if (!skipTag) {
  try {
    execSync(`git add package.json`, { stdio: 'ignore' });
    execSync(`git commit -m "chore: bump to v${newVersion}"`, { stdio: 'ignore' });
    execSync(`git tag -a v${newVersion} -m "release v${newVersion}"`, { stdio: 'ignore' });
    console.log(`v${newVersion} (tag created)`);
  } catch (e) {
    console.log(`v${newVersion} (tag skipped: ${e.message})`);
  }
} else {
  console.log(newVersion);
}
