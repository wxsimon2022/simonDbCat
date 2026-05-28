#!/usr/bin/env node
/**
 * Bump package.json version (patch/minor/major) and create git tag.
 * Usage: node scripts/bump-version.cjs [patch|minor|major] [--no-tag]
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const type = process.argv[2] || 'patch';
const skipTag = process.argv.includes('--no-tag');
const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const parts = pkg.version.split('.').map(Number);
switch (type) {
  case 'major': parts[0]++; parts[1] = 0; parts[2] = 0; break;
  case 'minor': parts[1]++; parts[2] = 0; break;
  default: parts[2]++; break;
}

const newVersion = parts.join('.');
const oldVersion = pkg.version;
pkg.version = newVersion;

// Stage package.json first
try { execSync('git add package.json', { stdio: 'ignore' }); } catch {}

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// Create git tag
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
