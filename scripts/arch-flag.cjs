#!/usr/bin/env node
const os = require('os');
process.stdout.write(os.arch() === 'arm64' ? '--arm64' : '--x64');
