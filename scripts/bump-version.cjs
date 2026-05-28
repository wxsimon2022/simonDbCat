#!/usr/bin/env node
/**
 * Bump package.json version (patch/minor/major) without git operations.
 * Usage: node scripts/bump-version.cjs [patch|minor|major]
 */
const fs = require('fs');
const path = require('path');

const type = process.argv[2] || 'patch';
const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const parts = pkg.version.split('.').map(Number);
switch (type) {
  case 'major':
    parts[0]++; parts[1] = 0; parts[2] = 0;
    break;
  case 'minor':
    parts[1]++; parts[2] = 0;
    break;
  default: // patch
    parts[2]++;
    break;
}

const newVersion = parts.join('.');
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(newVersion);
